// ============================================================================
// KOI ENGINE — OpenAI vision adapter for label reading
//
// SERVER ONLY. Sends one pack photo and the transcription instructions, asks
// for LABEL_JSON_SCHEMA as strict structured output, and returns the parsed
// JSON with the usage the provider reported. It does not validate the reading —
// the pipeline parses it again with Zod, because the provider's schema promise
// is not KOI's check.
//
// What leaves KOI: the image and the fixed instructions. No product id, no
// brand, no shopper, nothing from Swiggy. `store: false` asks OpenAI not to
// retain the exchange as a stored completion; zero data retention beyond that
// is an account-level agreement (see the implementation plan, §15).
//
// Both settings are required and fail loudly when absent: OPENAI_API_KEY, and
// KOI_LABEL_MODEL — a vision-capable model id chosen by the evaluation set, not
// a default buried here.
// ============================================================================

import "server-only";

import { LABEL_INSTRUCTIONS, LABEL_JSON_SCHEMA } from "../labelSchema";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 120_000;

export class EngineConfigError extends Error {}

/**
 * @param {{ imageBase64: string, mimeType: string, model?: string }} image
 *   model defaults to KOI_LABEL_MODEL; the pipeline passes the verifier model
 *   for the second, independent reading.
 * @returns {Promise<{ json: object, model: string, usage: object|null, latencyMs: number }>}
 */
export async function readLabel({ imageBase64, mimeType, model: requested }) {
  const key = process.env.OPENAI_API_KEY;
  const model = requested || process.env.KOI_LABEL_MODEL;
  if (!key) throw new EngineConfigError("OPENAI_API_KEY is not set. Add it to web/.env.local.");
  if (!model) throw new EngineConfigError("KOI_LABEL_MODEL is not set. Add a vision-capable OpenAI model id to web/.env.local.");

  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      store: false,
      messages: [
        { role: "system", content: LABEL_INSTRUCTIONS },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this label." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "label_reading", strict: true, schema: LABEL_JSON_SCHEMA },
      },
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
