-- ============================================================================
-- KOI — The label reader is trusted only as far as it has been measured
--
-- Phase 1.7. The engine publishes what it reads with nobody looking, so every
-- combination of prompt version, primary model and verifier model is run
-- against the evaluation set by scripts/runEval.mjs, and the result is
-- recorded here. The set (lib/engine/eval/cases.js) is labels whose contents
-- are known — rendered from facts, including the ways a real label hides an
-- allergen — so nobody has to type packs in by hand.
--
-- THE GATE (lib/engine/evalGate.js): the engine reads no label photo unless
-- the latest run for its current prompt version, models and evaluation set
-- passed (lib/engine/evaluation.js#EVAL_THRESHOLDS):
--   - not one allergen missed in anything the engine would publish;
--   - published nutrition figures right, field by field;
--   - enough coverage that "blocks everything" cannot pass;
--   - no case that failed to run.
-- Change a model or the prompt and reading pauses until a new run passes.
-- Nobody approves anything; the measurement does.
--
-- service_role only; RLS on with no policies.
-- ============================================================================

CREATE TABLE engine.eval_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_version    text NOT NULL,
  prompt_version text NOT NULL,
  primary_model  text NOT NULL,
  verifier_model text NOT NULL,
  cases          integer NOT NULL CHECK (cases > 0),
  passed         boolean NOT NULL,
  metrics        jsonb NOT NULL,
  failures       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eval_runs_config_idx
  ON engine.eval_runs (prompt_version, primary_model, verifier_model, set_version, created_at DESC);

ALTER TABLE engine.eval_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.eval_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.eval_runs TO service_role;

COMMENT ON TABLE engine.eval_runs IS
  'Each run of the label-reading evaluation set, per prompt version and model pair. The engine reads labels only while the latest run for its configuration passed.';
