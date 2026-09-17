-- ============================================================================
-- 00047_household_keep_out
--
-- A household can keep an allergen out of the house entirely.
--
-- Since plan-model-v5 a product one member cannot eat is kept from that member
-- only and can still be bought for the others. For a severe allergy that is
-- not enough: a shared kitchen means a peanut butter jar bought for the adults
-- is a risk to the child. `keep_out` lists avoid keys (public.avoided_item.key,
-- the hard ones) that no product in this household's plans may contain, for
-- anyone.
--
-- Set by the owner from /store/plan, saved when they press "Plan it". Row-level
-- security is unchanged: household_self (00044) covers every column, and the
-- table-level grants to authenticated already include this one.
-- ============================================================================

ALTER TABLE public.household
  ADD COLUMN keep_out text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.household.keep_out IS
  'Hard avoid keys (public.avoided_item.key) kept out of every plan for this household, for every member. lib/planner/model.js keepOutFlags.';
