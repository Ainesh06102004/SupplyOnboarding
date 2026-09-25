-- ============================================================================
-- 00078_plan_week_picks — the dishes a shopper picked for a week, kept with it.
--
-- The Plan page's week grid lets a shopper swap and drag dishes. Those picks
-- lived in one browser's localStorage, so another device (or a cleared browser)
-- lost them, and they were not tied to the plan they were picked for. They are
-- the shopper's choices, not the planner's claim, so they are not written onto
-- the plan row (which stays as it was solved): they get a row of their own,
-- keyed by the week's FIRST plan — the one before any change — because a
-- change keeps the week's picks and a new plan starts a new week.
-- ============================================================================

CREATE TABLE public.plan_week (
  plan_id     uuid PRIMARY KEY REFERENCES public.plan(id) ON DELETE CASCADE,
  -- { "<day>:<slot>": ["dish_key", ...] }, as lib/plan/schedule.js reads it.
  picks       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(picks) = 'object'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_week IS
  'A shopper''s own dish picks for a week, keyed by the week''s first plan. Choices, not facts: the plan row stays as it was solved.';

ALTER TABLE public.plan_week ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_week FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_week TO authenticated;

CREATE POLICY plan_week_self ON public.plan_week FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plan p JOIN public.household h ON h.id = p.household_id
                 WHERE p.id = plan_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.plan p JOIN public.household h ON h.id = p.household_id
                      WHERE p.id = plan_id AND h.owner_id = koi_uid()));
