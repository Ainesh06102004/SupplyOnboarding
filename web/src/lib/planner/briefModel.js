// ============================================================================
// KOI PLANNER — Drafting a household, with a model when one is configured
//
// Phase 4.2. SERVER ONLY. The rules reading (brief.js) is always made; a model
// reading is asked for only when KOI_AI_INTERPRETER=openai, and is used only
// after groundModelDraft has held it to the shopper's words. Any failure falls
// back to the rules reading. The message itself is not logged or stored.
// ============================================================================

import "server-only";

import { callStructured } from "@/lib/ai/providers/openai";
import { BRIEF_INSTRUCTIONS, BRIEF_JSON_SCHEMA, BRIEF_SCHEMA_NAME, readBrief, groundModelDraft, draftFrom } from "./brief";

/**
 * @param {string} text the shopper's description of their household
 * @returns {Promise<object>} a draft for the form (brief.js draftFrom)
 */
export async function draftHousehold(text) {
  const local = readBrief(text);
  if (process.env.KOI_AI_INTERPRETER !== "openai") return draftFrom(local);
  try {
    const { output } = await callStructured({
      modelEnv: "KOI_OPENAI_INTERPRETER_MODEL",
      instructions: BRIEF_INSTRUCTIONS,
      text,
      schemaName: BRIEF_SCHEMA_NAME,
      schema: BRIEF_JSON_SCHEMA,
      maxOutputTokens: 1500,
    });
    return draftFrom(local, groundModelDraft(output, text));
  } catch (err) {
    console.error("[plan/brief]", err?.message ?? "failed");
    return draftFrom(local);
  }
}
