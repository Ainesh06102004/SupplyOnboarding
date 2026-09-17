// ============================================================================
// KOI — Intent adapter: OpenAI
//
// Phase 4.1. Selected with KOI_AI_INTERPRETER=openai; the model is
// KOI_OPENAI_INTERPRETER_MODEL. Server-only, through adapter.js.
//
// It sends the query text and nothing else, and returns an intent-shaped
// suggestion with no authority of its own — see adapter.js and modelSchema.js
// for everything that happens to it before a shopper sees it.
// ============================================================================

import "server-only";

import { callStructured } from "@/lib/ai/providers/openai";
import { INTENT_INSTRUCTIONS, INTENT_JSON_SCHEMA, INTENT_SCHEMA_NAME, intentFromModel } from "../modelSchema";

export const OpenAIAdapter = Object.freeze({
  name: "openai",
  /** @param {string} text @returns {Promise<object>} */
  async interpret(text) {
    const { output } = await callStructured({
      modelEnv: "KOI_OPENAI_INTERPRETER_MODEL",
      instructions: INTENT_INSTRUCTIONS,
      text,
      schemaName: INTENT_SCHEMA_NAME,
      schema: INTENT_JSON_SCHEMA,
      maxOutputTokens: 1200,
    });
    return intentFromModel(output);
  },
});
