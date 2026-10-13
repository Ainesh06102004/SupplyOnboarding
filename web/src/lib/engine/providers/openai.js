// ============================================================================
// KOI ENGINE — Vision adapter (OpenAI, and anything that speaks its dialect)
//
// SERVER ONLY. Two questions, both asked of one image with strict structured
// output, of whichever reader the setting names — an OpenAI model, an open
// model hosted on OpenRouter, or one on KOI's own GPU (providers/readers.js
// says how a name becomes an address):
//
//   readLabel      transcribe a label (LABEL_JSON_SCHEMA), at high detail.
//                  Not validated here — the pipeline parses it again with Zod,
//                  because the provider's schema promise is not KOI's check.
//   classifyImage  does an image from a brand's store listing carry an
//                  ingredient list, allergen statement or nutrition table? At
//                  low detail: it decides only whether reading is worthwhile
//                  (lib/engine/recheck.js). KOI_CLASSIFY_MODEL may name a
//                  cheaper model for this; empty means KOI_LABEL_MODEL.
//
// What leaves KOI: the image and fixed instructions. No product id, no brand,
// no shopper, nothing from Swiggy. `store: false` asks OpenAI not to retain the
// exchange as a stored completion; zero data retention beyond that is an
// account-level agreement (see the implementation plan, §15). OpenRouter is
// asked the same (`data_collection: "deny"`), and a local reader sends nothing
// anywhere.
//
// The settings are required and fail loudly when absent: KOI_LABEL_MODEL — a
// vision-capable model chosen by the evaluation set, not a default buried here
// — and the key of whichever provider it names (OPENAI_API_KEY,
// OPENROUTER_API_KEY), or KOI_LOCAL_VISION_URL for a local one.
// ============================================================================

import "server-only";

import { LABEL_INSTRUCTIONS, LABEL_JSON_SCHEMA } from "../labelSchema";
import { EngineConfigError, chatBody, readerFor, replyJson } from "./readers";

export { EngineConfigError };

const TIMEOUT_MS = 120_000;
const CLASSIFY_TIMEOUT_MS = 30_000;

const LABEL_QUESTION = Object.freeze({
  system: LABEL_INSTRUCTIONS, prompt: "Transcribe this label.", detail: "high", schemaName: "label_reading", schema: LABEL_JSON_SCHEMA,
});

/**
 * The body for OpenAI's Batch API (half the price, back within 24 h). Batching
 * is OpenAI's service, not a dialect: an open reader named here would be sent
 * to a queue that cannot run it, so it is refused rather than lost.
 */
export function imageRequestBody({ model, ...question }) {
  const reader = readerFor(model || process.env.KOI_LABEL_MODEL);
  if (reader.provider !== "openai") {
    throw new EngineConfigError(`The Batch API is OpenAI's; ${reader.name} cannot go through it. Read it live instead.`);
  }
  return chatBody(reader, question);
}

/** A label transcription request, exactly as readLabel sends it, for the Batch API. */
export const labelRequestBody = ({ imageBase64, mimeType, model }) =>
  imageRequestBody({ model, imageBase64, mimeType, ...LABEL_QUESTION });

/**
 * A chat-completions reply → { json, model, usage, host }. Throws on a refusal
 * or non-JSON. `host` is the company OpenRouter routed the call to (it serves
 * the same weights at different precisions, and a 4-bit host can misread small
 * print that an 8-bit one reads); null for everyone else.
 */
export function parseImageReply(body, requestedModel = null) {
  const message = body?.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`The model declined to read this image: ${message.refusal}`);
  let json;
  try {
    json = replyJson(message?.content);
  } catch {
    throw new Error("The model's reply was not JSON.");
  }
  return { json, model: body?.model || requestedModel, usage: body?.usage ?? null, host: body?.provider ?? null };
}

async function askAboutImage({ model: requested, timeoutMs, ...question }) {
  const reader = readerFor(requested || process.env.KOI_LABEL_MODEL);
  const started = Date.now();
  const res = await fetch(reader.endpoint, {
    method: "POST",
    headers: { ...(reader.key ? { Authorization: `Bearer ${reader.key}` } : {}), "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(chatBody(reader, question)),
  });

  if (!res.ok) {
    // The body names the problem (bad model id, quota, size); the key is never in it.
    throw new Error(`${reader.provider} returned ${res.status} for ${reader.name}: ${(await res.text()).slice(0, 400)}`);
  }

  const reply = parseImageReply(await res.json(), reader.model);
  // OpenAI's own dated id is kept as it always was. Anything else is recorded
  // under the name it was asked by, so the consensus protocol can tell a hosted
  // reader from the same weights on KOI's GPU.
  const model = reader.provider === "openai" ? reply.model : reader.name;
  return { ...reply, model, latencyMs: Date.now() - started };
}

/**
 * @param {{ imageBase64: string, mimeType: string, model?: string }} image
 *   model defaults to KOI_LABEL_MODEL; the pipeline passes the verifier model
 *   for the second, independent reading.
 * @returns {Promise<{ json: object, model: string, usage: object|null, latencyMs: number }>}
 */
export function readLabel({ imageBase64, mimeType, model }) {
  return askAboutImage({ model, imageBase64, mimeType, ...LABEL_QUESTION, timeoutMs: TIMEOUT_MS });
}

const PANELS_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    ingredient_list: { type: "boolean" },
    allergen_statement: { type: "boolean" },
    nutrition_table: { type: "boolean" },
    printed_product_name: { type: ["string", "null"] },
  },
  required: ["ingredient_list", "allergen_statement", "nutrition_table", "printed_product_name"],
  additionalProperties: false,
});

const PANELS_INSTRUCTIONS = [
  "You look at one image from a food brand's online store and say only what is printed in it.",
  "ingredient_list: true if a printed list of ingredients is visible.",
  "allergen_statement: true if an allergen declaration (for example \"Contains: milk\") is visible.",
  "nutrition_table: true if a nutrition information table with figures is visible.",
  "printed_product_name: the product name printed on a pack in the image, or null.",
  "Front-of-pack shots, lifestyle photos and marketing graphics without those panels are false. Do not guess what the back of a pack says.",
].join("\n");

const PANELS_QUESTION = Object.freeze({
  system: PANELS_INSTRUCTIONS, prompt: "What does this image show?", detail: "low", schemaName: "image_panels", schema: PANELS_SCHEMA,
});

// Sorting only decides whether a photo is worth reading, so it may run on a
// cheaper model than reading does (KOI_CLASSIFY_MODEL; empty → KOI_LABEL_MODEL).
const classifyModel = (requested) => requested || process.env.KOI_CLASSIFY_MODEL || undefined;

/** The sorting request, exactly as classifyImage sends it (for the Batch API). */
export const classifyRequestBody = ({ imageBase64, mimeType, model }) =>
  imageRequestBody({ model: classifyModel(model) || process.env.KOI_LABEL_MODEL, imageBase64, mimeType, ...PANELS_QUESTION });

/** A sorting reply's JSON → what the image shows. */
export function panelsFrom(json) {
  return {
    ingredient_list: json?.ingredient_list === true,
    allergen_statement: json?.allergen_statement === true,
    nutrition_table: json?.nutrition_table === true,
    printed_product_name: typeof json?.printed_product_name === "string" ? json.printed_product_name.slice(0, 200) : null,
  };
}

/**
 * @param {{ imageBase64: string, mimeType: string, model?: string }} image
 * @returns {Promise<{ shows: { ingredient_list, allergen_statement, nutrition_table, printed_product_name }, model: string, usage: object|null }>}
 */
export async function classifyImage({ imageBase64, mimeType, model: requested }) {
  const { json, model, usage } = await askAboutImage({
    model: classifyModel(requested), imageBase64, mimeType, ...PANELS_QUESTION, timeoutMs: CLASSIFY_TIMEOUT_MS,
  });
  return { model, usage, shows: panelsFrom(json) };
}
