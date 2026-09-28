-- ============================================================================
-- 00083_agent_run_costs — what an Agent Mode segment cost, so it can be capped
-- and watched (/staff/agent). Counts only: model tokens in and out, and wall
-- time. Still never the shopper's words.
-- ============================================================================

ALTER TABLE public.plan_run
  ADD COLUMN tokens_in  integer CHECK (tokens_in IS NULL OR tokens_in >= 0),
  ADD COLUMN tokens_out integer CHECK (tokens_out IS NULL OR tokens_out >= 0),
  ADD COLUMN ms         integer CHECK (ms IS NULL OR ms >= 0);

-- The daily cap counts a household's segments in the last 24 hours.
CREATE INDEX plan_run_agent_recent_idx ON public.plan_run (household_id, created_at DESC) WHERE source IN ('agent', 'agent_rules');
