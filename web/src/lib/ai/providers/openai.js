// ============================================================================
// KOI — OpenAI, structured output
//
// Phase 4. SERVER ONLY: the key never reaches a browser bundle.
//
// One call shape for every model use in the conversation phase — query
// refinement, household briefs, follow-ups. Each caller names the env var that
// holds its model, so a model is chosen by configuration and measured by
// scripts/evalInterpreter.mjs, never pinned in code.
//
// Configuration, read on every call and failing loudly when absent:
//   OPENAI_API_KEY
//   the caller's model variable, e.g. KOI_OPENAI_INTERPRETER_MODEL
//   KOI_OPENAI_REASONING_EFFORT (optional; for reasoning models)
//
// A failure throws. Every caller has a deterministic answer already, and falls
// back to it; the throw is what gets logged.
// ============================================================================

import "server-only";

import { buildStructuredRequest, readStructuredOutput, buildToolsRequest, readToolCall } from "./openaiFormat";

// The Responses API endpoint. A fixed provider address, not a fallback for a
// missing setting: there is no other value it could take.
const RESPONSES_URL = "https://api.openai.com/v1/responses";

/** A sentence from a shopper waiting on screen: past this, the deterministic answer stands. */
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {object} input
 * @param {string} input.modelEnv the env var naming the model
 * @param {string} input.instructions
 * @param {string} input.text the shopper's words, and nothing else
 * @param {string} input.schemaName
 * @param {object} input.schema a strict JSON schema
 * @param {number} [input.maxOutputTokens]
 * @param {number} [input.timeoutMs]
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{ output: object, model: string, ms: number }>}
 */
export async function callStructured({ modelEnv, instructions, text, schemaName, schema, maxOutputTokens, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env[modelEnv];
  if (!model) throw new Error(`${modelEnv} is not set`);

  const body = buildStructuredRequest({
    model,
    instructions,
    text,
    schemaName,
    schema,
    maxOutputTokens,
    reasoningEffort: process.env.KOI_OPENAI_REASONING_EFFORT || null,
  });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${json?.error?.code ?? json?.error?.type ?? "error"}`);
    return { output: readStructuredOutput(json), model, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** One turn of the agent's loop: longer than a sentence read, because the loop is the whole job. */
export const AGENT_TIMEOUT_MS = 12000;

/**
 * One turn of KOI's agent loop: the conversation so far in, one tool call out.
 *
 * A model call has no side effects, so a 5xx or a dropped connection is tried
 * once more. A timeout or the shopper's stop is not.
 *
 * @param {object} input
 * @param {string} input.modelEnv the env var naming the model (KOI_OPENAI_AGENT_MODEL)
 * @param {string} [input.effortEnv] the env var naming the reasoning effort
 * @param {string} input.instructions
 * @param {Array<object>} input.input Responses API input items
 * @param {Array<object>} input.tools
 * @param {number} [input.maxOutputTokens]
 * @param {number} [input.timeoutMs]
 * @param {number} [input.retries]
 * @param {AbortSignal|null} [input.signal] the shopper's stop
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{ call, text, carry, usage, model: string, ms: number }>}
 */
export async function callTools({ modelEnv, effortEnv = null, instructions, input, tools, maxOutputTokens, timeoutMs = AGENT_TIMEOUT_MS, retries = 1, signal = null, fetchImpl = fetch }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env[modelEnv];
  if (!model) throw new Error(`${modelEnv} is not set`);
  const body = buildToolsRequest({
    model,
    instructions,
    input,
    tools,
    maxOutputTokens,
    reasoningEffort: (effortEnv && process.env[effortEnv]) || process.env.KOI_OPENAI_REASONING_EFFORT || null,
  });

  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onStop = () => controller.abort();
    signal?.addEventListener?.("abort", onStop);
    try {
      if (signal?.aborted) throw new Error("stopped");
      const response = await fetchImpl(RESPONSES_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await response.json().catch(() => null);
      if (response.status >= 500 && attempt < retries) continue;
      if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${json?.error?.code ?? json?.error?.type ?? "error"}`);
      return { ...readToolCall(json), model, ms: Date.now() - started };
    } catch (err) {
      const aborted = controller.signal.aborted || signal?.aborted;
      if (!aborted && attempt < retries && /fetch failed|ECONNRESET|socket/i.test(String(err?.message))) continue;
      throw aborted && signal?.aborted ? new Error("stopped") : err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onStop);
    }
  }
}
