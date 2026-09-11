-- ============================================================================
-- KOI — A health profile is for adults
--
-- user_health_profile accepted ages 10 to 100. Under India's Digital Personal
-- Data Protection Act, 2023, s.9, KOI may not track or behaviourally monitor a
-- child — anyone under 18 — or target them, and may process a child's data at
-- all only with verifiable parental consent, which KOI has no mechanism for. A
-- health profile that drives personalised recommendations is exactly that
-- processing. So the table stops accepting it.
--
-- The table held 0 rows when this ran (11 Sep 2026), so no existing profile
-- is invalidated. The goal form's age slider now starts at 18, and
-- goalProfileService declines to save a profile below it.
-- ============================================================================

ALTER TABLE user_health_profile DROP CONSTRAINT IF EXISTS user_health_profile_age_check;

ALTER TABLE user_health_profile
  ADD CONSTRAINT user_health_profile_age_check CHECK (age BETWEEN 18 AND 100);

COMMENT ON COLUMN user_health_profile.age IS
  'Adults only (18-100). DPDP Act 2023 s.9 bars tracking or profiling anyone under 18; KOI has no verifiable parental consent flow.';
