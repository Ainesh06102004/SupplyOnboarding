-- ============================================================================
-- KOI — Labels publish automatically when two readings agree
--
-- 00023 made a person the only path from a model's reading to the storefront.
-- There is no one to be that person: KOI will not staff a review queue. So the
-- gate becomes mechanical. A label is read TWICE, independently; it publishes
-- on its own only when the two readings agree field by field and every
-- arithmetic check passes. Anything else stays unpublished — the storefront
-- keeps calling it unverified — and waits for a better photo or, optionally,
-- someone who chooses to fix it.
--
-- What a machine reading may claim is weaker than what a person's check may,
-- and the data says which it is:
--
--   evidence = 'verified'      a person (or, later, the brand) confirmed it
--   evidence = 'machine_read'  two agreeing readings, checks passed
--
-- `evidence` is GENERATED from columns that already decide it, so it cannot be
-- set wrongly by a writer. The storefront words the two differently: a
-- verified list may say "No ingredients you avoid"; a machine-read one says
-- what the pack lists — "No peanuts listed on the pack".
--
-- A person's verification always wins: the automatic path never overwrites a
-- manually verified row.
-- ============================================================================

-- ── Which kind of fact a row is ─────────────────────────────────────────────
ALTER TABLE food.sku_ingredients
  ADD COLUMN evidence text GENERATED ALWAYS AS (
    CASE WHEN manually_verified THEN 'verified'
         WHEN source = 'model_extraction' THEN 'machine_read' END
  ) STORED;

ALTER TABLE public.sku_nutrition
  ADD COLUMN evidence text GENERATED ALWAYS AS (
    CASE WHEN manually_verified THEN 'verified'
         WHEN source = 'model_extraction' THEN 'machine_read' END
  ) STORED;

-- ── The second reading and its verdict ──────────────────────────────────────
ALTER TABLE engine.extraction_outputs
  ADD COLUMN second_read jsonb,
  ADD COLUMN second_model text,
  ADD COLUMN agreement   jsonb,                           -- per group: { ok, differences }
  ADD COLUMN published   text[] NOT NULL DEFAULT '{}',    -- groups the automatic path wrote
  ADD COLUMN blocked     jsonb  NOT NULL DEFAULT '[]'::jsonb;  -- [{ group, reason }]

-- ── Automatic publishes have no reviewer ────────────────────────────────────
ALTER TABLE engine.publish_log ALTER COLUMN reviewer DROP NOT NULL;
ALTER TABLE engine.publish_log
  ADD COLUMN method text NOT NULL DEFAULT 'human' CHECK (method IN ('human', 'automatic')),
  ADD CONSTRAINT publish_log_human_has_reviewer CHECK (method = 'automatic' OR reviewer IS NOT NULL);

-- ── The storefront reads both kinds, and is told which ──────────────────────
DROP POLICY IF EXISTS "Verified labels are public" ON food.sku_ingredients;
CREATE POLICY "Published labels are public"
  ON food.sku_ingredients FOR SELECT TO anon, authenticated
  USING (evidence IS NOT NULL);

CREATE OR REPLACE VIEW public.sku_label_facts
  WITH (security_invoker = true)
AS
  SELECT sku_id, raw_ingredient_text, allergens, manually_verified, updated_at, may_contain, evidence
    FROM food.sku_ingredients
   WHERE evidence IS NOT NULL;

-- ── Publishing without a person ─────────────────────────────────────────────
-- Re-checks, from what the pipeline stored, that this output earned it: the
-- groups agree across both readings, no check in them failed, and the photo
-- was not flagged as a different product. The pipeline decides first; this is
-- the database refusing to take its word for it.
CREATE FUNCTION engine.publish_machine_read(p_output_id uuid, p_ingredients jsonb, p_nutrition jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_out      engine.extraction_outputs%ROWTYPE;
  v_done     text[] := '{}';
  v_kept     text[] := '{}';
  v_prev_i   jsonb;
  v_prev_n   jsonb;
BEGIN
  SELECT * INTO v_out FROM engine.extraction_outputs WHERE id = p_output_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extraction output % not found', p_output_id; END IF;
  IF v_out.agreement IS NULL THEN RAISE EXCEPTION 'output % has no second reading', p_output_id; END IF;
  IF COALESCE((v_out.agreement->'identity'->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'output % was not confirmed as this product', p_output_id;
  END IF;

  IF p_ingredients IS NOT NULL THEN
    IF COALESCE((v_out.agreement->'ingredients'->>'ok')::boolean, false) IS NOT TRUE
       OR COALESCE((v_out.agreement->'allergens'->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'the two readings of the ingredient list or allergens disagree';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out.checks) c
                WHERE c->>'group' IN ('ingredients', 'allergens') AND c->>'ok' = 'false') THEN
      RAISE EXCEPTION 'an ingredient or allergen check failed';
    END IF;

    SELECT to_jsonb(si.*) INTO v_prev_i FROM food.sku_ingredients si WHERE si.sku_id = v_out.sku_id;
    IF COALESCE((v_prev_i->>'manually_verified')::boolean, false) THEN
      v_kept := v_kept || 'ingredients';
    ELSE
      INSERT INTO food.sku_ingredients AS si (sku_id, raw_ingredient_text, parsed_ingredients, additive_codes, allergens,
        may_contain, is_ai_extracted, ai_confidence, manually_verified, source, source_ref, label_version)
      VALUES (v_out.sku_id, p_ingredients->>'raw_ingredient_text',
        COALESCE(p_ingredients->'parsed_ingredients', '[]'::jsonb), COALESCE(p_ingredients->'additive_codes', '[]'::jsonb),
        COALESCE(p_ingredients->'allergens', '[]'::jsonb), COALESCE(p_ingredients->'may_contain', '[]'::jsonb),
        true, v_out.confidence, false, 'model_extraction', v_out.id::text, 1)
      ON CONFLICT (sku_id) DO UPDATE SET
        raw_ingredient_text = EXCLUDED.raw_ingredient_text, parsed_ingredients = EXCLUDED.parsed_ingredients,
        additive_codes = EXCLUDED.additive_codes, allergens = EXCLUDED.allergens, may_contain = EXCLUDED.may_contain,
        is_ai_extracted = true, ai_confidence = EXCLUDED.ai_confidence, manually_verified = false,
        source = 'model_extraction', source_ref = EXCLUDED.source_ref, verified_by = NULL, verified_at = NULL,
        label_version = si.label_version + 1;
      v_done := v_done || 'ingredients';
    END IF;
  END IF;

  IF p_nutrition IS NOT NULL THEN
    IF COALESCE((v_out.agreement->'nutrition'->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'the two readings of the nutrition table disagree';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out.checks) c
                WHERE c->>'group' = 'nutrition' AND c->>'ok' = 'false') THEN
      RAISE EXCEPTION 'a nutrition check failed';
    END IF;

    SELECT to_jsonb(sn.*) INTO v_prev_n FROM public.sku_nutrition sn WHERE sn.sku_id = v_out.sku_id;
    IF COALESCE((v_prev_n->>'manually_verified')::boolean, false) THEN
      v_kept := v_kept || 'nutrition';
    ELSE
      INSERT INTO public.sku_nutrition AS sn (sku_id, measurement_basis, serving_size, servings_per_pack,
        energy_kcal, protein_g, carbs_g, sugars_g, added_sugar_g, fibre_g, total_fat_g, saturated_fat_g, trans_fat_g, sodium_mg, cholesterol_mg,
        kcal_per_100g, protein_per_100g, carbs_per_100g, sugars_per_100g, fibre_per_100g, fat_per_100g,
        kcal_per_serving, protein_per_serving, carbs_per_serving, sugars_per_serving, fibre_per_serving, fat_per_serving,
        is_ai_extracted, ai_confidence, manually_verified, source, source_ref)
      VALUES (v_out.sku_id, p_nutrition->>'measurement_basis', p_nutrition->>'serving_size', (p_nutrition->>'servings_per_pack')::numeric,
        (p_nutrition->>'energy_kcal')::numeric, (p_nutrition->>'protein_g')::numeric, (p_nutrition->>'carbs_g')::numeric,
        (p_nutrition->>'sugars_g')::numeric, (p_nutrition->>'added_sugar_g')::numeric, (p_nutrition->>'fibre_g')::numeric,
        (p_nutrition->>'total_fat_g')::numeric, (p_nutrition->>'saturated_fat_g')::numeric, (p_nutrition->>'trans_fat_g')::numeric,
        (p_nutrition->>'sodium_mg')::numeric, (p_nutrition->>'cholesterol_mg')::numeric,
        (p_nutrition->>'kcal_per_100g')::numeric, (p_nutrition->>'protein_per_100g')::numeric, (p_nutrition->>'carbs_per_100g')::numeric,
        (p_nutrition->>'sugars_per_100g')::numeric, (p_nutrition->>'fibre_per_100g')::numeric, (p_nutrition->>'fat_per_100g')::numeric,
        (p_nutrition->>'kcal_per_serving')::numeric, (p_nutrition->>'protein_per_serving')::numeric, (p_nutrition->>'carbs_per_serving')::numeric,
        (p_nutrition->>'sugars_per_serving')::numeric, (p_nutrition->>'fibre_per_serving')::numeric, (p_nutrition->>'fat_per_serving')::numeric,
        true, v_out.confidence, false, 'model_extraction', v_out.id::text)
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
        is_ai_extracted = true, ai_confidence = EXCLUDED.ai_confidence, manually_verified = false,
        source = 'model_extraction', source_ref = EXCLUDED.source_ref, verified_by = NULL, verified_at = NULL, updated_at = now();
      v_done := v_done || 'nutrition';
    END IF;
  END IF;

  IF cardinality(v_done) > 0 THEN
    INSERT INTO engine.publish_log (sku_id, output_id, reviewer, method, previous_ingredients, previous_nutrition)
    VALUES (v_out.sku_id, v_out.id, NULL, 'automatic', v_prev_i, v_prev_n);
  END IF;
  UPDATE engine.extraction_outputs SET published = v_done WHERE id = v_out.id;

  RETURN jsonb_build_object('sku_id', v_out.sku_id, 'published', to_jsonb(v_done), 'kept_verified', to_jsonb(v_kept));
END;
$$;

REVOKE EXECUTE ON FUNCTION engine.publish_machine_read(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.publish_machine_read(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION engine.publish_machine_read(uuid, jsonb, jsonb) IS
  'The automatic path: publishes a reading only if its two readings agree, its checks passed and the photo matched the product. Never overwrites a manually verified row. Rows it writes read as evidence = machine_read.';
