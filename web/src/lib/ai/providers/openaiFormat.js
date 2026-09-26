// ============================================================================
// KOI — OpenAI Responses API: request and response shapes
//
// Phase 4. Pure, so it can be tested without a network or a key; the call
// itself lives in ./openai.js, which is server-only.
//
// What every request KOI sends has in common:
//   - `input` is the shopper's own words and nothing else. No catalogue, no
//     profile, no Swiggy data, no nutrition figure (plan §13, rule 4).
//   - `store: false`: OpenAI is asked not to keep the exchange.
//   - Structured output against a strict JSON schema, so the answer is a shape
//     KOI validates again with Zod before anything uses it. A model can only
//     fill fields KOI defined, from vocabularies KOI generated.
// ============================================================================

/**
 * @param {object} input
 * @param {string} input.model
 * @param {string} input.instructions what the model is for, and its vocabulary
 * @param {string} input.text the shopper's words
 * @param {string} input.schemaName
 * @param {object} input.schema a strict JSON schema
 * @param {number} [input.maxOutputTokens]
 * @param {string|null} [input.reasoningEffort] for reasoning models; null leaves it unset
 * @returns {object} a Responses API request body
 */
export function buildStructuredRequest({ model, instructions, text, schemaName, schema, maxOutputTokens = 600, reasoningEffort = null }) {
  return {
    model,
    instructions,
    input: String(text ?? ""),
    store: false,
    max_output_tokens: maxOutputTokens,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
  };
}

/**
 * The structured answer from a Responses API body, parsed.
 *
 * Throws on anything that is not a complete answer — a refusal, a truncated
 * response, missing text or text that is not JSON — because the caller's
 * fallback (the deterministic interpreter) is always better than a guess.
 *
 * @param {object} body
 * @returns {object}
 */
export function readStructuredOutput(body) {
  if (!body || typeof body !== "object") throw new Error("OpenAI returned no body");
  if (body.error) throw new Error(`OpenAI error: ${body.error.code ?? body.error.type ?? "unknown"}`);
  if (body.status && body.status !== "completed") {
    throw new Error(`OpenAI response ${body.status}${body.incomplete_details?.reason ? `: ${body.incomplete_details.reason}` : ""}`);
  }
  const parts = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((c) => c.type === "refusal")) throw new Error("OpenAI refused");
  const text = parts.filter((c) => c.type === "output_text").map((c) => c.text).join("");
  if (!text) throw new Error("OpenAI returned no text");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenAI returned text that is not JSON");
  }
}

// ── Tool calling (KOI Agent Mode) ───────────────────────────────────────────
//
// The agent's loop (lib/agent/loop.js) sends a conversation, not a sentence:
// the shopper's messages, the agent's own earlier tool calls and their results,
// and a short state digest (household labels, gap flags, product names — never
// an age, a diet, an allergy or a target; lib/agent/digest.js). Still
// `store: false`, so OpenAI keeps nothing and every turn resends what the turn
// needs; a reasoning model's thinking comes back encrypted and goes back in
// unread, and only for as long as that turn is open.

/**
 * @param {object} input
 * @param {string} input.model
 * @param {string} input.instructions
 * @param {Array<object>} input.input Responses API input items
 * @param {Array<{name, description, parameters}>} input.tools strict JSON schemas
 * @param {number} [input.maxOutputTokens]
 * @param {string|null} [input.reasoningEffort]
 * @param {"required"|"auto"} [input.toolChoice]
 * @returns {object} a Responses API request body
 */
export function buildToolsRequest({ model, instructions, input, tools, maxOutputTokens = 800, reasoningEffort = null, toolChoice = "required" }) {
  return {
    model,
    instructions,
    input,
    store: false,
    max_output_tokens: maxOutputTokens,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    include: ["reasoning.encrypted_content"],
    tools: tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: true })),
    tool_choice: toolChoice,
    // One call per turn: the loop looks at each result before the next.
    parallel_tool_calls: false,
  };
}

/**
 * The tool call a Responses API body asked for, parsed.
 *
 * @param {object} body
 * @returns {{ call: { callId: string, name: string, args: object, item: object }|null, text: string, carry: Array<object>, usage: object|null }}
 *   `carry` is every output item that must go back into the next request
 *   (reasoning items and the function call itself), in order.
 */
export function readToolCall(body) {
  if (!body || typeof body !== "object") throw new Error("OpenAI returned no body");
  if (body.error) throw new Error(`OpenAI error: ${body.error.code ?? body.error.type ?? "unknown"}`);
  if (body.status && body.status !== "completed") {
    throw new Error(`OpenAI response ${body.status}${body.incomplete_details?.reason ? `: ${body.incomplete_details.reason}` : ""}`);
  }
  const output = Array.isArray(body.output) ? body.output : [];
  const parts = output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((c) => c.type === "refusal")) throw new Error("OpenAI refused");
  const text = parts.filter((c) => c.type === "output_text").map((c) => c.text).join("");
  const calls = output.filter((o) => o.type === "function_call");
  let call = null;
  if (calls.length) {
    const first = calls[0];
    let args;
    try {
      args = JSON.parse(first.arguments || "{}");
    } catch {
      throw new Error(`OpenAI returned arguments for ${first.name} that are not JSON`);
    }
    call = { callId: String(first.call_id), name: String(first.name), args, item: first };
  }
  const carry = output.filter((o) => o.type === "reasoning" || (o.type === "function_call" && o === calls[0]));
  return { call, text, carry, usage: body.usage ?? null };
}

/** A nullable enum for a strict schema: one of `values`, or null. */
export const nullableEnum = (values) => ({ type: ["string", "null"], enum: [...values, null] });

/** A nullable number for a strict schema. */
export const nullableNumber = () => ({ type: ["number", "null"] });

/** An array of enum values for a strict schema. */
export const enumArray = (values) => ({ type: "array", items: { type: "string", enum: [...values] } });

/** A strict object: every property required, nothing else allowed. */
export const strictObject = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
