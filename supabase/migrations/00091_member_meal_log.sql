-- ============================================================================
-- 00091_member_meal_log — Track holds meals too (exact macros, P5).
--
-- Decided with the user (23 Oct 2026): Track keeps what a person ate, beside
-- their weigh-ins (00077), on the same terms:
--   * only the member who IS the signed-in account holder logs, for themselves,
--     and only as an adult (DPDP Act 2023 s.9; 00022 has no parental consent);
--   * kept until deleted: /store/profile/data deletes every meal at once, and a
--     member's meals go with the member.
--
-- One row per meal of a day. A meal is eaten as planned, partly, skipped, or
-- something else; "something else" carries what it was and KOI's estimate of
-- it (web/src/lib/food/estimate.js): a range, never a figure the model wrote.
-- source says who logged it: the Track page, KOI (the agent's log_meal, after
-- the person approved its card) or, later, a WhatsApp reply.
--
-- A Take 2 (web/src/lib/plan/rebalance.js) — the week's answer to a meal that
-- wasn't the plan — is the person's choice for that week, so it is kept with
-- the week's picks on plan_week (00078), each one undoable.
--
-- Eaten-out dishes (chole bhature, a pizza) are ordinary dishes with a context
-- (where they are usually eaten). food.dish gets the column now; the editorial
-- source is web/src/lib/food/recipes/eatenOut.js, mirrored here once every line
-- is matched to the ingredient graph.
-- ============================================================================

CREATE TABLE public.member_meal_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.household_member(id) ON DELETE CASCADE,
  eaten_on    date NOT NULL CHECK (eaten_on >= DATE '2026-01-01'),
  slot        text NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'snack', 'dinner', 'drinks')),
  status      text NOT NULL CHECK (status IN ('ate', 'partial', 'skipped', 'other')),
  -- What the plan had there: { plan_id, cell, dishes: [dish_key], nutrition }.
  planned     jsonb CHECK (planned IS NULL OR jsonb_typeof(planned) = 'object'),
  -- Something else: { items: [{ dish_key | text, portion, count }], setting }; partly: { share }.
  other       jsonb CHECK (other IS NULL OR jsonb_typeof(other) = 'object'),
  -- KOI's estimate: { point, low, high, basis[] } from lib/food/estimate.js.
  estimate    jsonb CHECK (estimate IS NULL OR jsonb_typeof(estimate) = 'object'),
  source      text NOT NULL DEFAULT 'track' CHECK (source IN ('track', 'koi', 'whatsapp')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- One entry a meal: logging it again replaces it (upsert).
  CONSTRAINT member_meal_log_one_a_meal UNIQUE (member_id, eaten_on, slot),
  CONSTRAINT member_meal_log_other_is_estimated CHECK (status <> 'other' OR (other IS NOT NULL AND estimate IS NOT NULL))
);

CREATE INDEX member_meal_log_member ON public.member_meal_log (member_id, eaten_on DESC);

COMMENT ON TABLE public.member_meal_log IS
  'Track: what the account holder ate, meal by meal, entered by them (or by KOI on their approval). Adults only (DPDP s.9). Kept until the person deletes it. Estimates are lib/food/estimate.js ranges.';

ALTER TABLE public.member_meal_log ENABLE ROW LEVEL SECURITY;
-- public's default ACL grants anon everything on a new table: take it back.
REVOKE ALL ON public.member_meal_log FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_meal_log TO authenticated;

-- Read and delete your own; write only as an adult. The same seam as 00077.
CREATE POLICY member_meal_log_own ON public.member_meal_log FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.household_member m
    WHERE m.id = member_id AND m.account_profile_id = koi_uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.household_member m
    WHERE m.id = member_id AND m.account_profile_id = koi_uid()
      AND m.age_band IN ('adult_19_59', 'senior_60_plus')
  ));

-- A week's Take 2s: [{ id, at, on, slot, numbers, meal, title, effect, picksBefore, undone }].
ALTER TABLE public.plan_week
  ADD COLUMN IF NOT EXISTS adjustments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(adjustments) = 'array');

COMMENT ON COLUMN public.plan_week.adjustments IS
  'Take 2s the shopper chose after a meal off the plan (lib/plan/rebalance.js): resized days, swapped plates, dishes moved to next week. Each is undoable (undone: true); the plan rows stay as they were solved.';

-- Where a dish is usually eaten. Home dishes plan the week; the rest are for estimating meals out.
ALTER TABLE food.dish
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'home' CHECK (context IN ('home', 'canteen', 'restaurant', 'street'));
