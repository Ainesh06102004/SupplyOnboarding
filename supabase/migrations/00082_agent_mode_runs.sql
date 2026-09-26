-- ============================================================================
-- 00082_agent_mode_runs — what KOI Agent Mode did.
--
-- Agent Mode (docs/agent-mode/PLAN.md) is a loop: the model picks a tool, sees
-- its result, picks the next, and pauses when it needs the shopper — a
-- question, or an approval before anything is saved to the household or put
-- in the cart. One row per request segment (a message, an answer, an approval,
-- or an automatic continuation), tied together by run_key.
--
-- Still never the shopper's words (00069): the tools used, whether each
-- worked and how long it took, how many times KOI asked and what was decided
-- on each approval, how the segment ended, which model, and which kind of
-- page the dock was on. The words stay in the shopper's tab.
-- ============================================================================

ALTER TABLE public.plan_run DROP CONSTRAINT plan_run_source_check;
ALTER TABLE public.plan_run ADD CONSTRAINT plan_run_source_check
  CHECK (source IN ('model', 'rules', 'agent', 'agent_rules'));

ALTER TABLE public.plan_run DROP CONSTRAINT plan_run_steps_check;
ALTER TABLE public.plan_run ADD CONSTRAINT plan_run_steps_check
  CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 24);

ALTER TABLE public.plan_run
  ADD COLUMN run_key   uuid,
  ADD COLUMN segment   smallint CHECK (segment BETWEEN 1 AND 50),
  ADD COLUMN turns     smallint CHECK (turns BETWEEN 0 AND 50),
  ADD COLUMN asks      smallint CHECK (asks BETWEEN 0 AND 50),
  -- [{tool, decision: 'allow'|'decline'}] — what was decided, never what was in it.
  ADD COLUMN approvals jsonb CHECK (approvals IS NULL OR jsonb_typeof(approvals) = 'array'),
  ADD COLUMN outcome   text CHECK (outcome IN ('done', 'nothing_to_do', 'cannot_do', 'needs_shopper', 'paused', 'stopped', 'capped', 'error')),
  ADD COLUMN model     text CHECK (model IS NULL OR length(model) <= 64),
  ADD COLUMN route     text CHECK (route IS NULL OR route IN ('plan', 'product', 'shop', 'cart', 'household', 'home', 'other'));

CREATE INDEX plan_run_run_key_idx ON public.plan_run (run_key) WHERE run_key IS NOT NULL;

COMMENT ON TABLE public.plan_run IS
  'KOI''s agent runs (Plan page Phase 3, and Agent Mode per request segment): tools used, outcomes, counts, the plan left on screen. Never the shopper''s words.';
