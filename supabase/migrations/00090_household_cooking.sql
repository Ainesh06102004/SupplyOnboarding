-- ============================================================================
-- 00090_household_cooking — how a household cooks (exact macros, P4).
--
--   cooking_style  fresh        every meal cooked on its day (what KOI did so far)
--                  batch        lunches and dinners cooked on prep days and boxed
--                  batch_lunch  only lunches are batched
--   prep_days      the weekdays the batches are cooked, 0 = Sunday … 6 = Saturday.
--                  Sunday and Wednesday unless the household says otherwise; the
--                  Calendar (P6) will set them from its prep-day events.
--
-- lib/plan/batch.js reads both: a batch is one meal boxed for the days after a
-- prep day, never longer than the meal keeps (food.dish.keeps_days, 00088).
-- The household's own RLS (household_self, 00044) already covers the update.
-- ============================================================================

ALTER TABLE public.household
  ADD COLUMN IF NOT EXISTS cooking_style text NOT NULL DEFAULT 'fresh'
    CHECK (cooking_style IN ('fresh', 'batch', 'batch_lunch')),
  ADD COLUMN IF NOT EXISTS prep_days smallint[] NOT NULL DEFAULT '{0,3}'
    CHECK (prep_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[] AND cardinality(prep_days) BETWEEN 1 AND 4);

COMMENT ON COLUMN public.household.cooking_style IS 'fresh | batch | batch_lunch: whether lunches (and dinners) are cooked on prep days and boxed (lib/plan/batch.js).';
COMMENT ON COLUMN public.household.prep_days IS 'Weekdays the batches are cooked, 0 = Sunday. 1–4 of them.';
