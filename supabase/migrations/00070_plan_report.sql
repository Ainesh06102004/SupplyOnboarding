-- ============================================================================
-- 00070_plan_report — a plan reopens as it was shown.
--
-- The Plan page kept the plan on screen in memory only, so a reload lost it:
-- `achieved` holds the basket and the per-member totals, not the report the
-- page draws (every line's supplies, who eats what, what is short). The
-- report is stored with the plan, as the planner produced it — a plan is a
-- claim about a moment, so it is not re-worked against today's labels.
--
-- Plans made before this have no report and are not reopened; they still
-- open the form (days, budget, people) as before.
-- ============================================================================

ALTER TABLE public.plan ADD COLUMN IF NOT EXISTS report jsonb;

COMMENT ON COLUMN public.plan.report IS
  'The planner''s report as the shopper was shown it (lib/planner/report.js planReport). Lets the Plan page reopen a plan after a reload. NULL for plans made before 00070.';
