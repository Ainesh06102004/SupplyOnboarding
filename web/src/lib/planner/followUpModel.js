// ============================================================================
// KOI PLANNER — Reading a follow-up, with a model when one is configured
//
// Phase 4.3. SERVER ONLY. Rules always read the message (followup.js); a model
// reading is asked for only when KOI_AI_INTERPRETER=openai, is given the
// message and nothing else — not the household, not the basket — and is used
// only after groundFollowUp. Any failure falls back to the rules reading.
// ============================================================================

import "server-only";

import { callStructured } from "@/lib/ai/providers/openai";
import { FOLLOWUP_INSTRUCTIONS, FOLLOWUP_JSON_SCHEMA, FOLLOWUP_SCHEMA_NAME, readFollowUp, groundFollowUp, mergeFollowUps } from "./followup";

/** @param {string} text @returns {Promise<object>} a follow-up reading */
export async function readFollowUpWithModel(text) {
  const local = readFollowUp(text);
  if (process.env.KOI_AI_INTERPRETER !== "openai") return local;
  try {
    const { output } = await callStructured({
      modelEnv: "KOI_OPENAI_INTERPRETER_MODEL",
      instructions: FOLLOWUP_INSTRUCTIONS,
      text,
      schemaName: FOLLOWUP_SCHEMA_NAME,
      schema: FOLLOWUP_JSON_SCHEMA,
      maxOutputTokens: 1000,
    });
    return mergeFollowUps(local, groundFollowUp(output, text));
  } catch (err) {
    console.error("[plan/followup]", err?.message ?? "failed");
    return local;
  }
}
