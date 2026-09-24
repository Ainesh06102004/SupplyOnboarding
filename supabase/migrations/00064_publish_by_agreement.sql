-- ============================================================================
-- 00064  A publish records the authority it was made on, and agreement is one
--
-- engine.publish_log has always answered "who published this label". It knew
-- two answers: a person ('human'), and the pipeline publishing a reading both
-- of its readers already agreed about ('automatic'). Working the queue by
-- agreement adds a third, and until now it had nowhere to go: 00063 gave
-- publish_log an `agent` column but left `method` defaulting to 'human', so
-- every agent publish tripped publish_log_human_has_reviewer — a check that a
-- human publish names the human. The check was right. The method was wrong.
--
-- 'agreement' is its own authority, and it names the agent instead of a person.
-- The constraint now holds all three to the same rule: a publish always says
-- who or what stands behind it, and never nothing.
--
-- This also drops the four-argument publish_label. It is unreachable — nothing
-- in the database calls it and review.js always passes six — and it hardcodes
-- manually_verified = true, the strongest claim KOI can make about a label.
-- An unreachable overload that certifies a label as human-verified is a trap
-- waiting for a caller, so it goes.
-- ============================================================================

alter table engine.publish_log drop constraint if exists publish_log_method_check;
alter table engine.publish_log add constraint publish_log_method_check
  check (method in ('human', 'automatic', 'agreement'));

alter table engine.publish_log drop constraint if exists publish_log_human_has_reviewer;
alter table engine.publish_log add constraint publish_log_names_its_authority check (
  (method = 'human' and reviewer is not null)
  or (method = 'agreement' and agent is not null)
  or method = 'automatic'
);

comment on constraint publish_log_names_its_authority on engine.publish_log is
  'Every publish names what stands behind it: a person, an agent, or the pipeline''s own agreed reading.';

comment on column engine.publish_log.method is
  'human = a person decided; agreement = independent readers agreed and an agent recorded it; automatic = the pipeline''s two readings already matched.';

drop function if exists engine.publish_label(uuid, uuid, jsonb, jsonb);

-- Same body as 00063, with the one line it was missing: the method.
create or replace function engine.publish_label(
  p_output_id uuid, p_reviewer uuid, p_ingredients jsonb, p_nutrition jsonb,
  p_agent text default null, p_agreement smallint default null
) returns jsonb
language plpgsql
set search_path to ''
as $function$
DECLARE
  v_out engine.extraction_outputs%ROWTYPE;
  v_version integer;
  v_prev_i jsonb;
  v_prev_n jsonb;
  v_manual boolean := p_agent IS NULL;
  v_source text := CASE WHEN p_agent IS NULL THEN 'brand_label' ELSE 'model_extraction' END;
  v_method text := CASE WHEN p_agent IS NULL THEN 'human' ELSE 'agreement' END;
BEGIN
  IF p_reviewer IS NULL AND p_agent IS NULL THEN
    RAISE EXCEPTION 'publish_label needs the reviewer or the agent who approved it';
  END IF;
  IF p_ingredients IS NULL AND p_nutrition IS NULL THEN RAISE EXCEPTION 'nothing to publish'; END IF;
  SELECT * INTO v_out FROM engine.extraction_outputs WHERE id = p_output_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extraction output % not found', p_output_id; END IF;

  IF p_ingredients IS NOT NULL THEN
    IF (SELECT count(*) FROM engine.review_queue WHERE output_id = p_output_id
          AND field_group IN ('ingredients', 'allergens') AND status IN ('accepted', 'corrected')) < 2 THEN
      RAISE EXCEPTION 'ingredients and allergens must both be reviewed before they are published';
    END IF;
    SELECT to_jsonb(si.*) INTO v_prev_i FROM food.sku_ingredients si WHERE si.sku_id = v_out.sku_id;
    INSERT INTO food.sku_ingredients AS si (sku_id, raw_ingredient_text, parsed_ingredients, additive_codes, allergens, may_contain,
      is_ai_extracted, ai_confidence, manually_verified, source, source_ref, verified_by, verified_at, confirmed_at, read_agreement, label_version)
    VALUES (v_out.sku_id, p_ingredients->>'raw_ingredient_text',
      COALESCE(p_ingredients->'parsed_ingredients', '[]'::jsonb), COALESCE(p_ingredients->'additive_codes', '[]'::jsonb),
      COALESCE(p_ingredients->'allergens', '[]'::jsonb), COALESCE(p_ingredients->'may_contain', '[]'::jsonb),
      true, v_out.confidence, v_manual, v_source, v_out.id::text, p_reviewer, now(), now(), p_agreement, 1)
    ON CONFLICT (sku_id) DO UPDATE SET
      raw_ingredient_text = EXCLUDED.raw_ingredient_text, parsed_ingredients = EXCLUDED.parsed_ingredients,
      additive_codes = EXCLUDED.additive_codes, allergens = EXCLUDED.allergens, may_contain = EXCLUDED.may_contain,
      is_ai_extracted = true, ai_confidence = EXCLUDED.ai_confidence, manually_verified = EXCLUDED.manually_verified,
      source = EXCLUDED.source, source_ref = EXCLUDED.source_ref, verified_by = EXCLUDED.verified_by,
      verified_at = EXCLUDED.verified_at, confirmed_at = EXCLUDED.confirmed_at,
      read_agreement = EXCLUDED.read_agreement,
      label_version = si.label_version + 1
    RETURNING si.label_version INTO v_version;
  END IF;

  IF p_nutrition IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM engine.review_queue WHERE output_id = p_output_id
          AND field_group = 'nutrition' AND status IN ('accepted', 'corrected')) THEN
      RAISE EXCEPTION 'nutrition must be reviewed before it is published';
    END IF;
    SELECT to_jsonb(sn.*) INTO v_prev_n FROM public.sku_nutrition sn WHERE sn.sku_id = v_out.sku_id;
    INSERT INTO public.sku_nutrition AS sn (sku_id, measurement_basis, serving_size, servings_per_pack,
      energy_kcal, protein_g, carbs_g, sugars_g, added_sugar_g, fibre_g, total_fat_g, saturated_fat_g, trans_fat_g, sodium_mg, cholesterol_mg,
      kcal_per_100g, protein_per_100g, carbs_per_100g, sugars_per_100g, fibre_per_100g, fat_per_100g,
      kcal_per_serving, protein_per_serving, carbs_per_serving, sugars_per_serving, fibre_per_serving, fat_per_serving,
      is_ai_extracted, ai_confidence, manually_verified, source, source_ref, verified_by, verified_at)
    VALUES (v_out.sku_id, p_nutrition->>'measurement_basis', p_nutrition->>'serving_size', (p_nutrition->>'servings_per_pack')::numeric,
      (p_nutrition->>'energy_kcal')::numeric, (p_nutrition->>'protein_g')::numeric, (p_nutrition->>'carbs_g')::numeric,
      (p_nutrition->>'sugars_g')::numeric, (p_nutrition->>'added_sugar_g')::numeric, (p_nutrition->>'fibre_g')::numeric,
      (p_nutrition->>'total_fat_g')::numeric, (p_nutrition->>'saturated_fat_g')::numeric, (p_nutrition->>'trans_fat_g')::numeric,
      (p_nutrition->>'sodium_mg')::numeric, (p_nutrition->>'cholesterol_mg')::numeric,
      (p_nutrition->>'kcal_per_100g')::numeric, (p_nutrition->>'protein_per_100g')::numeric, (p_nutrition->>'carbs_per_100g')::numeric,
      (p_nutrition->>'sugars_per_100g')::numeric, (p_nutrition->>'fibre_per_100g')::numeric, (p_nutrition->>'fat_per_100g')::numeric,
      (p_nutrition->>'kcal_per_serving')::numeric, (p_nutrition->>'protein_per_serving')::numeric, (p_nutrition->>'carbs_per_serving')::numeric,
      (p_nutrition->>'sugars_per_serving')::numeric, (p_nutrition->>'fibre_per_serving')::numeric, (p_nutrition->>'fat_per_serving')::numeric,
      true, v_out.confidence, v_manual, v_source, v_out.id::text, p_reviewer, now())
    ON CONFLICT (sku_id) DO UPDATE SET
      measurement_basis = EXCLUDED.measurement_basis, serving_size = EXCLUDED.serving_size, servings_per_pack = EXCLUDED.servings_per_pack,
      energy_kcal = EXCLUDED.energy_kcal, protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g, sugars_g = EXCLUDED.sugars_g,
      added_sugar_g = EXCLUDED.added_sugar_g, fibre_g = EXCLUDED.fibre_g, total_fat_g = EXCLUDED.total_fat_g,
      saturated_fat_g = EXCLUDED.saturated_fat_g, trans_fat_g = EXCLUDED.trans_fat_g, sodium_mg = EXCLUDED.sodium_mg,
      cholesterol_mg = EXCLUDED.cholesterol_mg,
      kcal_per_100g = EXCLUDED.kcal_per_100g, protein_per_100g = EXCLUDED.protein_per_100g, carbs_per_100g = EXCLUDED.carbs_per_100g,
      sugars_per_100g = EXCLUDED.sugars_per_100g, fibre_per_100g = EXCLUDED.fibre_per_100g, fat_per_100g = EXCLUDED.fat_per_100g,
      kcal_per_serving = EXCLUDED.kcal_per_serving, protein_per_serving = EXCLUDED.protein_per_serving,
      carbs_per_serving = EXCLUDED.carbs_per_serving, sugars_per_serving = EXCLUDED.sugars_per_serving,
      fibre_per_serving = EXCLUDED.fibre_per_serving, fat_per_serving = EXCLUDED.fat_per_serving,
      is_ai_extracted = true, ai_confidence = EXCLUDED.ai_confidence, manually_verified = EXCLUDED.manually_verified,
      source = EXCLUDED.source, source_ref = EXCLUDED.source_ref, verified_by = EXCLUDED.verified_by,
      verified_at = EXCLUDED.verified_at, updated_at = now();
  END IF;

  INSERT INTO engine.publish_log (sku_id, output_id, reviewer, agent, method, previous_ingredients, previous_nutrition)
  VALUES (v_out.sku_id, v_out.id, p_reviewer, p_agent, v_method, v_prev_i, v_prev_n);
  UPDATE engine.ai_extraction_jobs SET status = 'completed', completed_at = COALESCE(completed_at, now()) WHERE id = v_out.job_id;
  RETURN jsonb_build_object('sku_id', v_out.sku_id, 'ingredients', p_ingredients IS NOT NULL,
    'nutrition', p_nutrition IS NOT NULL, 'label_version', v_version, 'verified', v_manual, 'agreement', p_agreement);
END;
$function$;

revoke execute on function engine.publish_label(uuid, uuid, jsonb, jsonb, text, smallint) from public;
grant execute on function engine.publish_label(uuid, uuid, jsonb, jsonb, text, smallint) to service_role;
