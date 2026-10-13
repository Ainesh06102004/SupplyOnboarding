// ============================================================================
// KOI ENGINE — Who reads a label, and where the question goes
//
// A reader is named in the environment (KOI_LABEL_MODEL,
// KOI_LABEL_VERIFIER_MODEL, KOI_LABEL_THIRD_MODEL, KOI_CLASSIFY_MODEL) as
// `provider:model`:
//
//   gpt-5.4-mini                                OpenAI — no prefix, as before
//   openrouter:qwen/qwen3-vl-30b-a3b-instruct   an open model, hosted
//   local:qwen3-vl:4b                           an open model on a machine KOI
//                                               runs (Ollama, vLLM, LM Studio)
//
// All three speak the same chat-completions dialect, so the question asked is
// the same; only the address, the key and a few provider-only fields differ. A
// name whose prefix is not a provider listed here is an OpenAI model id, so
// every setting written before this file — and OpenAI's own `ft:` ids — keeps
// meaning what it meant.
//
// Why more than one provider. The consensus protocol counts one vote per
// MODEL, and two OpenAI models share more of their mistakes than an OpenAI
// model and a Qwen or a Gemma do. And at catalogue scale the open models read
// a label for a fraction of the price (Personal-research/
// koi-label-reading-costs.md). Neither is a reason to trust one before it has
// been measured: scripts/amazon/measureReaders.mjs is that measurement.
//
// Pure: no network and no server-only, so the tests can hold it as it is.
// ============================================================================

export class EngineConfigError extends Error {}

const PROVIDERS = Object.freeze({
  openai: {
    endpoint: () => "https://api.openai.com/v1/chat/completions",
    keyVar: "OPENAI_API_KEY",
  },
  openrouter: {
    endpoint: () => "https://openrouter.ai/api/v1/chat/completions",
    keyVar: "OPENROUTER_API_KEY",
  },
  local: {
    // No default address. A local server is wherever it was started, and
    // guessing localhost would hand a label to whatever happens to listen there.
    endpoint: (env) => {
      const base = String(env.KOI_LOCAL_VISION_URL ?? "").trim();
      if (!base) {
        throw new EngineConfigError("KOI_LOCAL_VISION_URL is not set. Point it at the local server's OpenAI-compatible base URL (Ollama's ends in /v1).");
      }
      return `${base.replace(/\/+$/, "")}/chat/completions`;
    },
    keyVar: null,
  },
});

export const PROVIDER_NAMES = Object.freeze(Object.keys(PROVIDERS));

/**
 * Where a named reader's questions go.
 *
 * @param {string} name e.g. "gpt-5.4-mini" or "openrouter:qwen/qwen3-vl-30b-a3b-instruct"
 * @param {object} [env] process.env by default
 * @returns {{ name: string, provider: string, model: string, endpoint: string, key: string|null }}
 *   `name` is how the reading records who read it. It keeps the provider for
 *   everything but OpenAI, because "qwen/qwen3-vl-8b" hosted by OpenRouter and
 *   the same weights on KOI's own GPU are the same model but not the same
 *   reader: one may be quantized and the other not.
 */
export function readerFor(name, env = process.env) {
  const text = String(name ?? "").trim();
  if (!text) {
    throw new EngineConfigError("No reader is named. Set KOI_LABEL_MODEL to a vision model in web/.env.local (gpt-5.4-mini, or openrouter:<model>, or local:<model>).");
  }
  const at = text.indexOf(":");
  const prefix = at > 0 ? text.slice(0, at) : "";
  const provider = Object.hasOwn(PROVIDERS, prefix) ? prefix : "openai";
  const model = provider === prefix ? text.slice(at + 1).trim() : text;
  if (!model) throw new EngineConfigError(`"${text}" names a provider but no model.`);

  const { keyVar, endpoint } = PROVIDERS[provider];
  const key = keyVar ? String(env[keyVar] ?? "").trim() : null;
  if (keyVar && !key) throw new EngineConfigError(`${keyVar} is not set. Add it to web/.env.local to read labels with ${text}.`);

  return {
    name: provider === "openai" ? model : `${provider}:${model}`,
    provider,
    model,
    endpoint: endpoint(env),
    key,
  };
}

/**
 * The chat-completions body for one question about one image, in the dialect
 * of the reader's provider.
 *
 * @param {{ provider: string, model: string }} reader from readerFor
 * @param {{ system, prompt, imageBase64, mimeType, detail, schemaName, schema }} question
 */
export function chatBody(reader, { system, prompt, imageBase64, mimeType, detail, schemaName, schema }) {
  const image = { url: `data:${mimeType};base64,${imageBase64}` };
  // `detail` is OpenAI's own resolution switch, and what it charges by. The
  // others size the image themselves.
  if (reader.provider === "openai" && detail) image.detail = detail;

  const body = {
    model: reader.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: image }] },
    ],
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
  };

  if (reader.provider === "openai") body.store = false;

  if (reader.provider === "openrouter") {
    // OpenRouter routes each request to one of several hosts. Only a host that
    // honours the schema may answer — one that ignored it would hand back prose
    // and the reading would be lost — and only one that does not keep the
    // request to train on, which is the same promise `store: false` asks of
    // OpenAI.
    body.provider = { require_parameters: true, data_collection: "deny" };
    // The reply then says what the call actually cost, rather than KOI
    // estimating it from a price list that is out of date the day it is typed.
    body.usage = { include: true };
  }

  return body;
}

/**
 * The JSON a reply carries. A schema-bound reply is bare JSON; a few hosts
 * still wrap it in a code fence or put the model's thinking in front of it, and
 * neither is a reason to throw a correct reading away.
 */
export function replyJson(content) {
  const text = String(content ?? "")
    .replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(text);
}
