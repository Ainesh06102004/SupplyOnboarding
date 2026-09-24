-- ============================================================================
-- 00069_plan_run — what KOI's agent did (Plan page, Phase 3).
--
-- One row per message the agent ran: which tools, in what order, whether
-- each worked, and the plan it left on screen. Not the shopper's words — the
-- same rule as follow-ups (4.3): what was asked stays in the browser; what was
-- done is kept, so a run can be traced to the plans it made.
-- ============================================================================

CREATE TABLE public.plan_run (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.household(id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('model', 'rules')),
  steps        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 5),
  plan_id      uuid REFERENCES public.plan(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plan_run_household_idx ON public.plan_run (household_id, created_at DESC);

ALTER TABLE public.plan_run ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_run FROM anon;
GRANT SELECT, INSERT, DELETE ON public.plan_run TO authenticated;

CREATE POLICY plan_run_self ON public.plan_run FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()));

COMMENT ON TABLE public.plan_run IS 'The Plan page agent''s runs: tools used and the plan left on screen. Never the shopper''s words.';
