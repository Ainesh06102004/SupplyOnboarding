-- ============================================================================
-- 00089_member_macro_targets — your own numbers (exact macros, P2).
--
-- household_member already holds all four targets (00044) and the save RPC
-- already writes them (00067); the Plan page simply never sent carbs or fat.
-- What is new is how a person with their own numbers wants them kept:
--
--   target_tolerance_pct  how close each day must land, on calories and every
--                         macro (± this %). 5 unless they choose 3 or 10.
--   carb_cycling          more carbs on training days, fewer on rest days, the
--                         same week in total. Adults only, like every goal.
--
-- Neither changes a target; the portion engine reads them when it sizes a
-- day. save_household_member is restated whole with the two fields; nothing
-- else in it changes.
-- ============================================================================

ALTER TABLE public.household_member
  ADD COLUMN IF NOT EXISTS target_tolerance_pct smallint NOT NULL DEFAULT 5 CHECK (target_tolerance_pct BETWEEN 2 AND 15),
  ADD COLUMN IF NOT EXISTS carb_cycling boolean NOT NULL DEFAULT false;

ALTER TABLE public.household_member DROP CONSTRAINT IF EXISTS household_member_carb_cycling_adults;
ALTER TABLE public.household_member
  ADD CONSTRAINT household_member_carb_cycling_adults
  CHECK (NOT carb_cycling OR age_band IN ('adult_19_59', 'senior_60_plus'));

COMMENT ON COLUMN public.household_member.target_tolerance_pct IS 'How close each planned day lands on calories and each macro, ± %. Read by the portion engine.';
COMMENT ON COLUMN public.household_member.carb_cycling IS 'More carbs on training days, fewer on rest days, same weekly total. Adults only.';

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
  v_favourites text[] := CASE WHEN p_member ? 'favourite_categories'
    THEN ARRAY(SELECT DISTINCT jsonb_array_elements_text(COALESCE(p_member->'favourite_categories', '[]'::jsonb)))
    ELSE NULL END;
  v_holder boolean := CASE WHEN p_member ? 'is_account_holder' THEN COALESCE((p_member->>'is_account_holder')::boolean, false) ELSE NULL END;
BEGIN
  IF koi_uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to change a household.' USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.household_member (
      household_id, label, relation, age_band, sex, activity_level, diet_type,
      energy_goal, eating_pattern, age_years, weight_kg, height_cm, target_weight_kg,
      appetite, spice_tolerance, meals_from_home, favourite_categories,
      target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_source,
      target_tolerance_pct, carb_cycling, account_profile_id
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
      NULLIF(p_member->>'target_weight_kg', '')::numeric,
      NULLIF(p_member->>'appetite', ''),
      NULLIF(p_member->>'spice_tolerance', ''),
      COALESCE(v_meals, '{}'),
      COALESCE(v_favourites, '{}'),
      NULLIF(p_member->>'target_kcal', '')::integer,
      NULLIF(p_member->>'target_protein_g', '')::integer,
      NULLIF(p_member->>'target_carbs_g', '')::integer,
      NULLIF(p_member->>'target_fat_g', '')::integer,
      COALESCE(NULLIF(p_member->>'target_source', ''), 'stated'),
      COALESCE(NULLIF(p_member->>'target_tolerance_pct', '')::smallint, 5),
      COALESCE((p_member->>'carb_cycling')::boolean, false),
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
      target_weight_kg = CASE WHEN p_member ? 'target_weight_kg' THEN NULLIF(p_member->>'target_weight_kg', '')::numeric ELSE m.target_weight_kg END,
      appetite         = CASE WHEN p_member ? 'appetite' THEN NULLIF(p_member->>'appetite', '') ELSE m.appetite END,
      spice_tolerance  = CASE WHEN p_member ? 'spice_tolerance' THEN NULLIF(p_member->>'spice_tolerance', '') ELSE m.spice_tolerance END,
      meals_from_home  = COALESCE(v_meals, m.meals_from_home),
      favourite_categories = COALESCE(v_favourites, m.favourite_categories),
      target_kcal      = CASE WHEN p_member ? 'target_kcal' THEN NULLIF(p_member->>'target_kcal', '')::integer ELSE m.target_kcal END,
      target_protein_g = CASE WHEN p_member ? 'target_protein_g' THEN NULLIF(p_member->>'target_protein_g', '')::integer ELSE m.target_protein_g END,
      target_carbs_g   = CASE WHEN p_member ? 'target_carbs_g' THEN NULLIF(p_member->>'target_carbs_g', '')::integer ELSE m.target_carbs_g END,
      target_fat_g     = CASE WHEN p_member ? 'target_fat_g' THEN NULLIF(p_member->>'target_fat_g', '')::integer ELSE m.target_fat_g END,
      target_source    = CASE WHEN p_member ? 'target_source' THEN COALESCE(NULLIF(p_member->>'target_source', ''), 'stated') ELSE m.target_source END,
      target_tolerance_pct = CASE WHEN p_member ? 'target_tolerance_pct' THEN COALESCE(NULLIF(p_member->>'target_tolerance_pct', '')::smallint, 5) ELSE m.target_tolerance_pct END,
      carb_cycling     = CASE WHEN p_member ? 'carb_cycling' THEN COALESCE((p_member->>'carb_cycling')::boolean, false) ELSE m.carb_cycling END,
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
