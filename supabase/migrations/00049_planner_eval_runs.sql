-- ============================================================================
-- KOI — The planner is trusted only as far as it has been measured
--
-- Plan §9.10.4, C8. Every run of the reference-household suite
-- (web/scripts/evalPlanner.mjs, lib/planner/eval/) is recorded here against
-- the rule versions it measured, so a change to the model, the age rules or
-- the catalogue can be compared with the last run that passed.
--
-- A run passes when no household, reference or random, was planned anything
-- unsafe or self-contradictory (safety and integrity findings), and every
-- reference household got a usable plan that fed every member.
--
-- engine.eval_runs is the label reader's (prompt and model columns); the
-- planner's runs have different versions to record, so they have their own.
--
-- service_role only; RLS on with no policies.
-- ============================================================================

CREATE TABLE engine.planner_eval_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version       text NOT NULL,
  age_safety_version  text NOT NULL,
  properties_version  text NOT NULL,
  households_version  text NOT NULL,
  reference_cases     integer NOT NULL CHECK (reference_cases > 0),
  random_cases        integer NOT NULL CHECK (random_cases >= 0),
  random_seed         bigint,
  catalogue           jsonb NOT NULL,
  passed              boolean NOT NULL,
  metrics             jsonb NOT NULL,
  failures            jsonb NOT NULL DEFAULT '[]'::jsonb,
  cases               jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX planner_eval_runs_version_idx
  ON engine.planner_eval_runs (model_version, age_safety_version, created_at DESC);

ALTER TABLE engine.planner_eval_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.planner_eval_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.planner_eval_runs TO service_role;

COMMENT ON TABLE engine.planner_eval_runs IS
  'Each run of the planner''s reference-household suite, per model and rule version: safety, integrity and quality findings, and how well targets were met.';
