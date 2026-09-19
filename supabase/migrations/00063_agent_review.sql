-- ============================================================================
-- 00063_agent_review
--
-- An agent may work the review queue. It may not pretend to be a person.
--
-- WHY THIS EXISTS. 22 items sat pending because every one routes to a human by
-- design, and the founder asked KOI's agent to work them. The agent can do the
-- reading — it can open the back-of-pack photo and compare it against both
-- machine readings, which is exactly what the reviewer does. What it must not
-- do is publish through a path that stamps `manually_verified = true`, because
-- that flag is what the storefront, the planner and the score all read as "a
-- person checked this".
--
-- WHAT CHANGES. publish_label takes an optional p_agent. When it is given:
--   * manually_verified stays FALSE and verified_by stays NULL, so nothing
--     claims a human signed it off;
--   * source is 'model_extraction', which the generated `evidence` column
--     already turns into 'machine_read' — a tier this codebase has had since
--     Phase 0 and has never until now had a way to write;
--   * the agent's name is recorded on the queue item and in the publish log, so
--     "who decided this" always has an answer.
-- Either a reviewer or an agent must be named. Neither, and it raises.
--
-- WHAT AN AGENT READING IS WORTH: agreement, not authority. One reading of a
-- photograph is one opinion, whoever holds it, and the founder's rule is the
-- right one — several readers reaching the SAME outcome is what makes it safe
-- to act on, and that is a stronger test than one person glancing once.
--
-- So a published list records `read_agreement`: how many independent readings
-- agreed on exactly this allergen set. The pipeline already reads every label
-- twice (extraction_outputs.second_read) and routes the disagreements here; an
-- agent's reading is a third. Enforced in lib/recommendation/verification.js:
--
--   verified                        a person signed it off. Clears everything.
--   machine_read, agreement >= 2    several readers, one answer. Clears a hard
--                                   allergen avoid too.
--   machine_read, agreement < 2     a complete list, so it still proves what is
--                                   IN the product, but it cannot say an
--                                   allergen is absent.
--
-- A tie broken by one more reader is the point: two readings that differ are
-- not evidence, and three readings where two agree are.
-- ============================================================================

alter table food.sku_ingredients
  add column if not exists read_agreement smallint;

comment on column food.sku_ingredients.read_agreement is
  'How many independent readings agreed on exactly this allergen set. 2 or more lets a machine_read list say an allergen is absent.';

alter table engine.review_queue
  add column if not exists decided_by_agent text;

comment on column engine.review_queue.decided_by_agent is
  'The agent that decided this item, when no person did. reviewed_by stays null in that case.';

alter table engine.publish_log
  add column if not exists agent text;

comment on column engine.publish_log.agent is
  'The agent that published, when no person did. `reviewer` stays null in that case.';

create or replace function engine.publish_label(
  p_output_id uuid,
  p_reviewer uuid,
  p_ingredients jsonb,
  p_nutrition jsonb,
  p_agent text default null,
  p_agreement smallint default null
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_out engine.extraction_outputs%ROWTYPE;
  v_version integer;
  v_prev_i jsonb;
  v_prev_n jsonb;
  -- An agent's reading is never a human verification.
  v_manual boolean := p_agent IS NULL;
  v_source text := CASE WHEN p_agent IS NULL THEN 'brand_label' ELSE 'model_extraction' END;
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

  INSERT INTO engine.publish_log (sku_id, output_id, reviewer, agent, previous_ingredients, previous_nutrition)
  VALUES (v_out.sku_id, v_out.id, p_reviewer, p_agent, v_prev_i, v_prev_n);
  UPDATE engine.ai_extraction_jobs SET status = 'completed', completed_at = COALESCE(completed_at, now()) WHERE id = v_out.job_id;
  RETURN jsonb_build_object('sku_id', v_out.sku_id, 'ingredients', p_ingredients IS NOT NULL,
    'nutrition', p_nutrition IS NOT NULL, 'label_version', v_version, 'verified', v_manual, 'agreement', p_agreement);
END;
$function$;
