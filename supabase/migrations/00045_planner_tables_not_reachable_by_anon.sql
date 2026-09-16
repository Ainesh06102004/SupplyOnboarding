-- ============================================================================
-- KOI — The anon key has no business with a household
--
-- Phase 3.1, immediately after 00044. That migration granted the planner
-- tables to `authenticated` and `service_role`, but new tables in `public`
-- also inherit this project's default grant to `anon`, and nothing revoked
-- it. Row-level security was still doing its job — every policy requires
-- `koi_uid()`, which is null for an anonymous caller, so no row could be read
-- or written — but a grant that only RLS stands behind is one mistake away
-- from being a leak, and the anon key ships in every browser bundle.
--
-- Households, members, their avoided foods and their plans are personal data.
-- A signed-out visitor has no household, so anon needs no privilege at all.
-- ============================================================================

REVOKE ALL ON TABLE
  public.household,
  public.household_member,
  public.household_member_avoid,
  public.plan,
  public.plan_item
FROM anon;
