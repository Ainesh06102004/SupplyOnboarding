// ============================================================================
// KOI ENGINE — OpenAI vision adapter
//
// SERVER ONLY. Two questions, both asked of one image with strict structured
// output:
//
//   readLabel      transcribe a label (LABEL_JSON_SCHEMA), at high detail.
//                  Not validated here — the pipeline parses it again with Zod,
//                  because the provider's schema promise is not KOI's check.
//   classifyImage  does an image from a brand's store listing carry an
//                  ingredient list, allergen statement or nutrition table? At
//                  low detail: it decides only whether reading is worthwhile
//                  (lib/engine/recheck.js).
//
// What leaves KOI: the image and fixed instructions. No product id, no brand,
// no shopper, nothing from Swiggy. `store: false` asks OpenAI not to retain the
// exchange as a stored completion; zero data retention beyond that is an
// account-level agreement (see the implementation plan, §15).
//
// Both settings are required and fail loudly when absent: OPENAI_API_KEY, and
// KOI_LABEL_MODEL — a vision-capable model id chosen by the evaluation set, not
// a default buried here.
// ============================================================================

import "server-only";

import { LABEL_INSTRUCTIONS, LABEL_JSON_SCHEMA } from "../labelSchema";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 120_000;
const CLASSIFY_TIMEOUT_MS = 30_000;

export class EngineConfigError extends Error {}

function settings(requested) {
  const key = process.env.OPENAI_API_KEY;
  const model = requested || process.env.KOI_LABEL_MODEL;
  if (!key) throw new EngineConfigError("OPENAI_API_KEY is not set. Add it to web/.env.local.");
  if (!model) throw new EngineConfigError("KOI_LABEL_MODEL is not set. Add a vision-capable OpenAI model id to web/.env.local.");
  return { key, model };
}

async function askAboutImage({ model: requested, system, prompt, imageBase64, mimeType, detail, schemaName, schema, timeoutMs }) {
  const { key, model } = settings(requested);
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      store: false,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    }),
  });

  if (!res.ok) {
    // The body names the problem (bad model id, quota, size); the key is never in it.
    throw new Error(`OpenAI returned ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const body = await res.json();
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`The model declined to read this image: ${message.refusal}`);

  let json;
  try {
    json = JSON.parse(message?.content ?? "");
  } catch {
    throw new Error("The model's reply was not JSON.");
  }

  return { json, model: body.model || model, usage: body.usage ?? null, latencyMs: Date.now() - started };
}

/**
 * @param {{ imageBase64: string, mimeType: string, model?: string }} image
 *   model defaults to KOI_LABEL_MODEL; the pipeline passes the verifier model
 *   for the second, independent reading.
 * @returns {Promise<{ json: object, model: string, usage: object|null, latencyMs: number }>}
 */
export function readLabel({ imageBase64, mimeType, model }) {
  return askAboutImage({
    model, imageBase64, mimeType,
    system: LABEL_INSTRUCTIONS,
    prompt: "Transcribe this label.",
    detail: "high",
    schemaName: "label_reading",
    schema: LABEL_JSON_SCHEMA,
    timeoutMs: TIMEOUT_MS,
  });
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

/**
 * @param {{ imageBase64: string, mimeType: string }} image
 * @returns {Promise<{ shows: { ingredient_list, allergen_statement, nutrition_table, printed_product_name }, model: string }>}
 */
export async function classifyImage({ imageBase64, mimeType }) {
  const { json, model } = await askAboutImage({
    imageBase64, mimeType,
    system: PANELS_INSTRUCTIONS,
    prompt: "What does this image show?",
    detail: "low",
    schemaName: "image_panels",
    schema: PANELS_SCHEMA,
    timeoutMs: CLASSIFY_TIMEOUT_MS,
  });
  return {
    model,
    shows: {
      ingredient_list: json?.ingredient_list === true,
      allergen_statement: json?.allergen_statement === true,
      nutrition_table: json?.nutrition_table === true,
      printed_product_name: typeof json?.printed_product_name === "string" ? json.printed_product_name.slice(0, 200) : null,
    },
  };
}
