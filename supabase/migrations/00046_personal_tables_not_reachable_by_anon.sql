-- ============================================================================
-- KOI — The same revoke, for the personal tables that predate the planner
--
-- Phase 3.1, after 00045. Checking the planner's grants turned up the same
-- thing on the shopper's own profile tables: they inherit this project's
-- default grant to `anon`, and nothing ever revoked it. Row-level security is
-- what has been protecting them — every policy is `profile_id = koi_uid()`,
-- which is null for an anonymous caller — but the anon key ships in every
-- browser bundle and sits in this repo's git history, so a grant that only
-- RLS stands behind is one mistake from being a leak. 00020 and 00025 took
-- the same view of TRUNCATE and of the catalogue.
--
-- Nothing legitimate loses access. A signed-in shopper reads and writes these
-- as `authenticated`, which keeps its grants; a guest keeps their goals in
-- localStorage and writes nothing (lib/supabase/goalProfileService.js returns
-- early without a session).
-- ============================================================================

REVOKE ALL ON TABLE
  public.user_health_profile,
  public.user_diet_type,
  public.user_budget_preference,
  public.user_cooking_preference,
  public.user_food_preference,
  public.user_avoided_food,
  public.user_meal_preference
FROM anon;
