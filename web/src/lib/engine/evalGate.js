// ============================================================================
// KOI ENGINE — No label is read by a reader that has not passed its evaluation
//
// SERVER ONLY. Phase 1.7. The engine publishes without a person, so it reads a
// label only while the latest evaluation run (engine.eval_runs, written by
// scripts/runEval.mjs) for its exact configuration — prompt version, primary
// model, verifier model and evaluation set — passed. Change any of them and
// reading pauses by itself until a new run passes. Nothing is published in the
// meantime; uploads simply wait.
// ============================================================================

import "server-only";

import { PROMPT_VERSION } from "./labelSchema";
import { EVAL_SET_VERSION } from "./eval/cases";

/** The configuration an evaluation run is recorded against. */
export function evalConfig() {
  const primary = process.env.KOI_LABEL_MODEL || null;
  return {
    setVersion: EVAL_SET_VERSION,
    promptVersion: PROMPT_VERSION,
    primary,
    verifier: process.env.KOI_LABEL_VERIFIER_MODEL || primary,
  };
}

/**
 * @param {object} engine supabase client scoped to the engine schema
 * @returns {Promise<{ open: true, runId: string }|{ open: false, reason: string }>}
 */
export async function evaluationGate(engine) {
  const config = evalConfig();
  if (!config.primary) return { open: false, reason: "KOI_LABEL_MODEL is not set, so no label can be read." };

  const { data, error } = await engine
    .from("eval_runs")
    .select("id, passed, created_at")
    .eq("set_version", config.setVersion)
    .eq("prompt_version", config.promptVersion)
    .eq("primary_model", config.primary)
    .eq("verifier_model", config.verifier)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const setup = `${config.promptVersion} with ${config.primary} and ${config.verifier} (${config.setVersion})`;
  const run = data?.[0];
  if (!run) return { open: false, reason: `Label reading is paused: ${setup} has not been evaluated. Run scripts/runEval.mjs.` };
  if (!run.passed) return { open: false, reason: `Label reading is paused: the latest evaluation of ${setup} failed. Fix it and run scripts/runEval.mjs again.` };
  return { open: true, runId: run.id };
}
