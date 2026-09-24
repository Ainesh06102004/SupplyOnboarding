-- ============================================================================
-- 00077_member_checkin — the Track step: a weekly weight, entered by the
-- person themselves.
--
-- Decided with the user (24 Sep 2026):
--   * weight only — one number, the one KOI's energy-balance arithmetic can
--     use; nothing else about a body is kept;
--   * KOI may PROPOSE a new calorie target from the trend, and nothing changes
--     until the person accepts it (the page saves it as their own, 'stated');
--   * kept until deleted: /store/profile/data deletes every check-in in one go,
--     and a member's check-ins go with the member.
--
-- Who may check in: only the member who IS the signed-in account holder
-- (household_member.account_profile_id = koi_uid(), 00050), so a check-in is
-- always the person's own entry, never someone weighing in on a spouse. And
-- only an adult age band (19 and over): DPDP Act 2023 s.9 bars tracking anyone
-- under 18, and KOI has no verifiable parental consent (00022).
-- ============================================================================

CREATE TABLE public.member_checkin (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.household_member(id) ON DELETE CASCADE,
  checked_on  date NOT NULL DEFAULT current_date CHECK (checked_on >= DATE '2026-01-01'),
  weight_kg   numeric(5, 2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 250),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One a day: a second entry the same day replaces the first (upsert).
  CONSTRAINT member_checkin_one_a_day UNIQUE (member_id, checked_on)
);

CREATE INDEX member_checkin_member ON public.member_checkin (member_id, checked_on DESC);

COMMENT ON TABLE public.member_checkin IS
  'Track: a weight the account holder entered for themselves, one a day at most. Adults only (DPDP s.9). Kept until the person deletes it. Nothing else about a body is stored here.';

ALTER TABLE public.member_checkin ENABLE ROW LEVEL SECURITY;
-- public's default ACL grants anon everything on a new table: take it back.
REVOKE ALL ON public.member_checkin FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_checkin TO authenticated;

-- Read and delete your own; write only as an adult.
CREATE POLICY member_checkin_own ON public.member_checkin FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.household_member m
    WHERE m.id = member_id AND m.account_profile_id = koi_uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.household_member m
    WHERE m.id = member_id AND m.account_profile_id = koi_uid()
      AND m.age_band IN ('adult_19_59', 'senior_60_plus')
  ));
