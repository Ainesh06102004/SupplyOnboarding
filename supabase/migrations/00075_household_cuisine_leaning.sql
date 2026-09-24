-- ============================================================================
-- 00075_household_cuisine_leaning — recorded late.
--
-- Applied to KOI-PLATFORM on 19 Sep 2026 as `household_cuisine_leaning`,
-- between 00061 (category_form_and_cuisine) and 00062, straight through the
-- MCP tool, and never written to the repo: the planner reads the column
-- (lib/planner/plan.js, kitchen rules) and a fresh database built from these
-- files did not have it. This is that change, idempotent, so it does nothing
-- where it was already applied.
-- ============================================================================

ALTER TABLE public.household ADD COLUMN IF NOT EXISTS cuisine_leaning text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.household'::regclass AND conname = 'household_cuisine_leaning_check') THEN
    ALTER TABLE public.household ADD CONSTRAINT household_cuisine_leaning_check
      CHECK (cuisine_leaning IS NULL OR cuisine_leaning = ANY (ARRAY['indian', 'global']));
  END IF;
END $$;

COMMENT ON COLUMN public.household.cuisine_leaning IS
  'Which kitchen this household leans towards. A nudge between shelves that belong to one, never a refusal. Null means no leaning.';
