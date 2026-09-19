// ============================================================================
// KOI PLANNER — Reading a follow-up, with a model when one is configured
//
// Phase 4.3. SERVER ONLY. Rules always read the message (followup.js); a model
// reading is asked for only when KOI_AI_INTERPRETER=openai, is given the
// message plus two lists — who is eating, and the kinds of food KOI shelves —
// so it can answer in ids rather than guess at names it has never been shown.
// Its reading is used only after groundFollowUp, which holds words to the
// sentence and ids to those lists. Any failure falls back to the rules reading.
// ============================================================================

import "server-only";

import { callStructured } from "@/lib/ai/providers/openai";
import { contextInstructions, FOLLOWUP_INSTRUCTIONS, FOLLOWUP_JSON_SCHEMA, FOLLOWUP_SCHEMA_NAME, readFollowUp, groundFollowUp, mergeFollowUps } from "./followup";

/** @param {string} text @returns {Promise<object>} a follow-up reading */
export async function readFollowUpWithModel(text, context = {}) {
  const local = readFollowUp(text);
  if (process.env.KOI_AI_INTERPRETER !== "openai") return local;
  try {
    const { output } = await callStructured({
      modelEnv: "KOI_OPENAI_INTERPRETER_MODEL",
      // Who is eating and what the shop shelves, so the model can answer in
      // ids instead of guessing at KOI's words (followup.js contextInstructions).
      instructions: `${FOLLOWUP_INSTRUCTIONS}\n${contextInstructions(context)}`,
      text,
      schemaName: FOLLOWUP_SCHEMA_NAME,
      schema: FOLLOWUP_JSON_SCHEMA,
      maxOutputTokens: 1000,
    });
    return mergeFollowUps(local, groundFollowUp(output, text, context));
  } catch (err) {
    console.error("[plan/followup]", err?.message ?? "failed");
    return local;
  }
}
