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
