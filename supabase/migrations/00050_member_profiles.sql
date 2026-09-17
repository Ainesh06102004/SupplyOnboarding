-- ============================================================================
-- 00050_member_profiles
--
-- Plan §9.10.2 (A) and §9.10.1: every household member gets a permanent,
-- editable profile, and adults a goal.
--
-- WHAT A MEMBER NOW HOLDS
--   relation          optional ("wife", "son"); still no names (00044)
--   energy_goal       maintain | lose | gain
--   eating_pattern    balanced | high_protein | low_carb | keto
--   age_years, weight_kg, height_cm
--                     optional, for a Mifflin–St Jeor estimate
--   appetite          small | usual | large
--   meals_from_home   breakfast, tiffin, lunch, dinner, snacks
--   account_profile_id
--                     set on the one member who is the account holder ("Me"),
--                     and only ever to the household owner's own id
--   version           bumped on every save, with a snapshot in
--                     household_member_version
--
-- ADULTS ONLY. A goal other than maintain, a pattern other than balanced, and
-- body data are refused for anyone under 19 by a CHECK, not just by the form:
-- children are growing, a weight goal for a child is for their doctor, and
-- DPDP s.9 asks KOI to hold as little about a child as it can.
--
-- HOW STRICT AN AVOID IS. household_member_avoid.severity:
--   allergy       a refusal, and a reason to keep it out of the house; only an
--                 allergen can be an allergy
--   intolerance   a refusal
--   rule          a refusal by belief or choice (red meat, caffeine, palm oil)
--   dislike       noted, never a refusal
-- Rows without one get it from the avoid's own kind and mode, so existing rows
-- and older code keep their meaning: a hard allergen is an allergy, another
-- hard avoid a rule, a soft one a dislike.
--
-- ONE WAY TO SAVE. public.save_household_member() writes a member, replaces
-- their avoids and records the version in one transaction. SECURITY INVOKER:
-- row-level security still decides, exactly as for a direct write. It changes
-- only the fields it is given, so a form that shows some fields cannot wipe
-- the others.
--
-- TARGETS CAN NOW BE SUGGESTED. 00044 allowed only 'stated' because the
-- ICMR-NIN 2020 tables could not be read. They have been (plan §9.10.1,
-- lib/planner/referenceNeeds.js), so target_source also allows
-- 'icmr_nin_2020' and 'mifflin_st_jeor': a figure KOI suggested and the owner
-- kept.
-- ============================================================================

-- ── The profile ─────────────────────────────────────────────────────────────

ALTER TABLE public.household_member
  ADD COLUMN relation text CHECK (relation IS NULL OR btrim(relation) <> ''),
  ADD COLUMN energy_goal text NOT NULL DEFAULT 'maintain' CHECK (energy_goal IN ('maintain', 'lose', 'gain')),
  ADD COLUMN eating_pattern text NOT NULL DEFAULT 'balanced' CHECK (eating_pattern IN ('balanced', 'high_protein', 'low_carb', 'keto')),
  ADD COLUMN age_years smallint CHECK (age_years IS NULL OR age_years BETWEEN 19 AND 120),
  ADD COLUMN weight_kg numeric(5,1) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 25 AND 300),
  ADD COLUMN height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 100 AND 250),
  ADD COLUMN appetite text CHECK (appetite IN ('small', 'usual', 'large')),
  ADD COLUMN meals_from_home text[] NOT NULL DEFAULT '{}'
    CHECK (meals_from_home <@ ARRAY['breakfast', 'tiffin', 'lunch', 'dinner', 'snacks']::text[]),
  ADD COLUMN account_profile_id text,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE public.household_member
  ADD CONSTRAINT household_member_goals_are_for_adults CHECK (
    age_band IN ('adult_19_59', 'senior_60_plus')
    OR (energy_goal = 'maintain' AND eating_pattern = 'balanced'
        AND age_years IS NULL AND weight_kg IS NULL AND height_cm IS NULL)
  ),
  ADD CONSTRAINT household_member_age_matches_band CHECK (
    age_years IS NULL
    OR (age_band = 'adult_19_59' AND age_years <= 59)
    OR (age_band = 'senior_60_plus' AND age_years >= 60)
  );

ALTER TABLE public.household_member DROP CONSTRAINT household_member_target_source_check;
ALTER TABLE public.household_member
  ADD CONSTRAINT household_member_target_source_check
  CHECK (target_source IN ('stated', 'icmr_nin_2020', 'mifflin_st_jeor'));

COMMENT ON COLUMN public.household_member.target_source IS
  'How the targets got here: stated by the owner, or suggested by KOI from ICMR-NIN 2020 reference needs or a Mifflin–St Jeor estimate and kept by the owner (lib/planner/goals.js).';
COMMENT ON COLUMN public.household_member.account_profile_id IS
  'The owner''s own koi_uid() on the one member who is the account holder ("Me"); NULL on everyone else. Never anyone else''s id (household_member_account_is_owner).';

-- One account holder per household, and only the owner.
CREATE UNIQUE INDEX household_member_one_account_holder
  ON public.household_member (household_id) WHERE account_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.household_member_account_is_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.household h
    WHERE h.id = NEW.household_id AND h.owner_id = NEW.account_profile_id
  ) THEN
    RAISE EXCEPTION 'Only the household''s owner can be linked to their account.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER household_member_account_is_owner
  BEFORE INSERT OR UPDATE OF account_profile_id, household_id ON public.household_member
  FOR EACH ROW EXECUTE FUNCTION public.household_member_account_is_owner();

-- ── How strict each avoid is ────────────────────────────────────────────────

ALTER TABLE public.household_member_avoid ADD COLUMN severity text;

UPDATE public.household_member_avoid hma
SET severity = CASE
  WHEN a.mode = 'soft' THEN 'dislike'
  WHEN a.kind = 'allergen' THEN 'allergy'
  ELSE 'rule'
END
FROM public.avoided_item a
WHERE a.key = hma.avoid_key;

ALTER TABLE public.household_member_avoid
  ALTER COLUMN severity SET NOT NULL,
  ADD CONSTRAINT household_member_avoid_severity_check
    CHECK (severity IN ('allergy', 'intolerance', 'rule', 'dislike'));

CREATE OR REPLACE FUNCTION public.household_member_avoid_severity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  item public.avoided_item;
BEGIN
  SELECT * INTO item FROM public.avoided_item WHERE key = NEW.avoid_key;
  IF NEW.severity IS NULL THEN
    NEW.severity := CASE
      WHEN item.mode = 'soft' THEN 'dislike'
      WHEN item.kind = 'allergen' THEN 'allergy'
      ELSE 'rule'
    END;
  END IF;
  IF NEW.severity = 'allergy' AND item.kind IS DISTINCT FROM 'allergen' THEN
    RAISE EXCEPTION 'Only an allergen can be an allergy: % is a %.', NEW.avoid_key, item.kind USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER household_member_avoid_severity
  BEFORE INSERT OR UPDATE ON public.household_member_avoid
  FOR EACH ROW EXECUTE FUNCTION public.household_member_avoid_severity();

-- ── Every save, kept ────────────────────────────────────────────────────────

CREATE TABLE public.household_member_version (
  member_id  uuid NOT NULL REFERENCES public.household_member(id) ON DELETE CASCADE,
  version    integer NOT NULL CHECK (version > 0),
  -- The member row and their avoids as saved.
  snapshot   jsonb NOT NULL,
  -- Taken from the verified session, never from a request body.
  changed_by text NOT NULL DEFAULT koi_uid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, version)
);

COMMENT ON TABLE public.household_member_version IS
  'Each saved version of a household member''s profile, written by save_household_member(). A plan records the version it was made from. Deleted with the member.';

ALTER TABLE public.household_member_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_member_version FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.household_member_version TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_member_version TO service_role;

CREATE POLICY household_member_version_read ON public.household_member_version FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.household_member m
    JOIN public.household h ON h.id = m.household_id
    WHERE m.id = member_id AND h.owner_id = koi_uid()));

CREATE POLICY household_member_version_write ON public.household_member_version FOR INSERT
  WITH CHECK (changed_by = koi_uid() AND EXISTS (
    SELECT 1 FROM public.household_member m
    JOIN public.household h ON h.id = m.household_id
    WHERE m.id = member_id AND h.owner_id = koi_uid()));

-- ── The one save path ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_household_member(
  p_household_id uuid,
  p_member jsonb,
  p_avoids jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p_member->>'id', '')::uuid;
  v_row public.household_member;
  v_avoids jsonb;
  v_meals text[] := CASE WHEN p_member ? 'meals_from_home'
    THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_member->'meals_from_home', '[]'::jsonb)))
    ELSE NULL END;
  v_holder boolean := CASE WHEN p_member ? 'is_account_holder' THEN COALESCE((p_member->>'is_account_holder')::boolean, false) ELSE NULL END;
BEGIN
  IF koi_uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to change a household.' USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.household_member (
      household_id, label, relation, age_band, sex, activity_level, diet_type,
      energy_goal, eating_pattern, age_years, weight_kg, height_cm, appetite, meals_from_home,
      target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_source, account_profile_id
    ) VALUES (
      p_household_id,
      p_member->>'label',
      NULLIF(p_member->>'relation', ''),
      COALESCE(NULLIF(p_member->>'age_band', ''), 'adult_19_59'),
      NULLIF(p_member->>'sex', ''),
      NULLIF(p_member->>'activity_level', ''),
      NULLIF(p_member->>'diet_type', ''),
      COALESCE(NULLIF(p_member->>'energy_goal', ''), 'maintain'),
      COALESCE(NULLIF(p_member->>'eating_pattern', ''), 'balanced'),
      NULLIF(p_member->>'age_years', '')::smallint,
      NULLIF(p_member->>'weight_kg', '')::numeric,
      NULLIF(p_member->>'height_cm', '')::numeric,
      NULLIF(p_member->>'appetite', ''),
      COALESCE(v_meals, '{}'),
      NULLIF(p_member->>'target_kcal', '')::integer,
      NULLIF(p_member->>'target_protein_g', '')::integer,
      NULLIF(p_member->>'target_carbs_g', '')::integer,
      NULLIF(p_member->>'target_fat_g', '')::integer,
      COALESCE(NULLIF(p_member->>'target_source', ''), 'stated'),
      CASE WHEN v_holder THEN koi_uid() END
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.household_member m SET
      label            = CASE WHEN p_member ? 'label' THEN p_member->>'label' ELSE m.label END,
      relation         = CASE WHEN p_member ? 'relation' THEN NULLIF(p_member->>'relation', '') ELSE m.relation END,
      age_band         = CASE WHEN p_member ? 'age_band' THEN p_member->>'age_band' ELSE m.age_band END,
      sex              = CASE WHEN p_member ? 'sex' THEN NULLIF(p_member->>'sex', '') ELSE m.sex END,
      activity_level   = CASE WHEN p_member ? 'activity_level' THEN NULLIF(p_member->>'activity_level', '') ELSE m.activity_level END,
      diet_type        = CASE WHEN p_member ? 'diet_type' THEN NULLIF(p_member->>'diet_type', '') ELSE m.diet_type END,
      energy_goal      = CASE WHEN p_member ? 'energy_goal' THEN COALESCE(NULLIF(p_member->>'energy_goal', ''), 'maintain') ELSE m.energy_goal END,
      eating_pattern   = CASE WHEN p_member ? 'eating_pattern' THEN COALESCE(NULLIF(p_member->>'eating_pattern', ''), 'balanced') ELSE m.eating_pattern END,
      age_years        = CASE WHEN p_member ? 'age_years' THEN NULLIF(p_member->>'age_years', '')::smallint ELSE m.age_years END,
      weight_kg        = CASE WHEN p_member ? 'weight_kg' THEN NULLIF(p_member->>'weight_kg', '')::numeric ELSE m.weight_kg END,
      height_cm        = CASE WHEN p_member ? 'height_cm' THEN NULLIF(p_member->>'height_cm', '')::numeric ELSE m.height_cm END,
      appetite         = CASE WHEN p_member ? 'appetite' THEN NULLIF(p_member->>'appetite', '') ELSE m.appetite END,
      meals_from_home  = COALESCE(v_meals, m.meals_from_home),
      target_kcal      = CASE WHEN p_member ? 'target_kcal' THEN NULLIF(p_member->>'target_kcal', '')::integer ELSE m.target_kcal END,
      target_protein_g = CASE WHEN p_member ? 'target_protein_g' THEN NULLIF(p_member->>'target_protein_g', '')::integer ELSE m.target_protein_g END,
      target_carbs_g   = CASE WHEN p_member ? 'target_carbs_g' THEN NULLIF(p_member->>'target_carbs_g', '')::integer ELSE m.target_carbs_g END,
      target_fat_g     = CASE WHEN p_member ? 'target_fat_g' THEN NULLIF(p_member->>'target_fat_g', '')::integer ELSE m.target_fat_g END,
      target_source    = CASE WHEN p_member ? 'target_source' THEN COALESCE(NULLIF(p_member->>'target_source', ''), 'stated') ELSE m.target_source END,
      account_profile_id = CASE WHEN v_holder IS NULL THEN m.account_profile_id WHEN v_holder THEN koi_uid() ELSE NULL END,
      version          = m.version + 1
    WHERE m.id = v_id AND m.household_id = p_household_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No such member in this household.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Avoids, when given, are replaced. A key already held keeps its severity
  -- unless a new one is given, so a form that does not show severity cannot
  -- reset it.
  IF p_avoids IS NOT NULL THEN
    WITH wanted AS (
      SELECT DISTINCT ON (key) key, NULLIF(severity, '') AS severity
      FROM (
        SELECT COALESCE(e->>'key', e #>> '{}') AS key, e->>'severity' AS severity
        FROM jsonb_array_elements(p_avoids) AS e
      ) listed
      WHERE key IS NOT NULL AND key <> ''
      ORDER BY key, severity NULLS LAST
    ), removed AS (
      DELETE FROM public.household_member_avoid a
      WHERE a.member_id = v_row.id AND a.avoid_key NOT IN (SELECT key FROM wanted)
    ), updated AS (
      UPDATE public.household_member_avoid a SET severity = w.severity
      FROM wanted w
      WHERE a.member_id = v_row.id AND a.avoid_key = w.key AND w.severity IS NOT NULL AND a.severity <> w.severity
    )
    INSERT INTO public.household_member_avoid (member_id, avoid_key, severity)
    SELECT v_row.id, w.key, w.severity
    FROM wanted w
    WHERE NOT EXISTS (
      SELECT 1 FROM public.household_member_avoid a WHERE a.member_id = v_row.id AND a.avoid_key = w.key
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', a.avoid_key, 'severity', a.severity) ORDER BY a.avoid_key), '[]'::jsonb)
  INTO v_avoids
  FROM public.household_member_avoid a
  WHERE a.member_id = v_row.id;

  INSERT INTO public.household_member_version (member_id, version, snapshot)
  VALUES (v_row.id, v_row.version, (to_jsonb(v_row) - 'created_at' - 'updated_at') || jsonb_build_object('avoids', v_avoids));

  RETURN jsonb_build_object('id', v_row.id, 'version', v_row.version);
END;
$$;

COMMENT ON FUNCTION public.save_household_member(uuid, jsonb, jsonb) IS
  'Save one household member: only the fields given, their avoids replaced when given (severity kept unless changed), and the version recorded. SECURITY INVOKER: RLS applies.';

REVOKE ALL ON FUNCTION public.save_household_member(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_household_member(uuid, jsonb, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.household_member_account_is_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_member_avoid_severity() FROM PUBLIC, anon, authenticated;

-- The members that exist are version 1, as they stand.
INSERT INTO public.household_member_version (member_id, version, snapshot, changed_by, changed_at)
SELECT m.id, m.version,
  (to_jsonb(m) - 'created_at' - 'updated_at') || jsonb_build_object('avoids', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', a.avoid_key, 'severity', a.severity) ORDER BY a.avoid_key)
    FROM public.household_member_avoid a WHERE a.member_id = m.id), '[]'::jsonb)),
  h.owner_id, m.updated_at
FROM public.household_member m
JOIN public.household h ON h.id = m.household_id;
