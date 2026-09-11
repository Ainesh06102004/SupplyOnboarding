-- ============================================================================
-- KOI — The extraction spine: a label photo becomes a verified fact only
-- through a person
--
-- Phase 1 of the implementation plan. A pack photo is read by a model into
-- engine.extraction_outputs, deterministic checks set its confidence (never
-- the model's own estimate), and each field group lands in engine.review_queue.
-- Allergens always go to a person. Nothing reaches the storefront until
-- engine.publish_label() is called for a reviewed output, which writes
-- food.sku_ingredients and public.sku_nutrition in ONE transaction and logs
-- what it replaced.
--
-- WHY A DATABASE FUNCTION FOR PUBLISHING:
-- A verified label is two writes — the ingredient list with its allergens, and
-- the nutrition panel — plus a job update and an audit row. Done as separate
-- PostgREST calls, a failure between them leaves a product whose nutrition is
-- verified and whose allergens are not, which the storefront would read as a
-- verified product. The function also re-checks that the review actually
-- happened, so no caller can publish an allergen list nobody looked at.
--
-- Everything here is in `engine` or `food`, so service_role only (00019's
-- defaults); the function's EXECUTE is revoked from PUBLIC explicitly.
-- ============================================================================

-- ── What a model read ───────────────────────────────────────────────────────
CREATE TABLE engine.extraction_outputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES engine.ai_extraction_jobs(id) ON DELETE CASCADE,
  upload_id       uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  sku_id          uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  extracted       jsonb NOT NULL,              -- the transcription, schema-validated
  checks          jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence      numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  usage           jsonb,                       -- tokens as the provider reported them
  latency_ms      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_extraction_outputs_sku ON engine.extraction_outputs (sku_id, created_at DESC);
ALTER TABLE engine.extraction_outputs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE engine.extraction_outputs IS
  'Every model reading of a label, kept even when superseded, so a better model or prompt can be re-run and compared. confidence comes from deterministic checks, not the model.';

-- ── What a person has to decide ─────────────────────────────────────────────
CREATE TABLE engine.review_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id     uuid NOT NULL REFERENCES engine.extraction_outputs(id) ON DELETE CASCADE,
  sku_id        uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  field_group   text NOT NULL CHECK (field_group IN ('identity', 'ingredients', 'allergens', 'nutrition')),
  proposed      jsonb NOT NULL,
  route         text NOT NULL CHECK (route IN ('human', 'auto_eligible')),
  route_reason  text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'corrected', 'rejected', 'superseded')),
  decision      jsonb,                         -- what the reviewer accepted or corrected it to
  reviewed_by   uuid,                          -- auth.users id, from the verified session only
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (output_id, field_group),
  CONSTRAINT review_decided_has_reviewer
    CHECK (status IN ('pending', 'superseded') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX idx_review_queue_open ON engine.review_queue (status, created_at) WHERE status = 'pending';
ALTER TABLE engine.review_queue ENABLE ROW LEVEL SECURITY;

-- ── What was replaced ───────────────────────────────────────────────────────
CREATE TABLE engine.publish_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id                uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  output_id             uuid NOT NULL REFERENCES engine.extraction_outputs(id) ON DELETE CASCADE,
  reviewer              uuid NOT NULL,
  previous_ingredients  jsonb,
  previous_nutrition    jsonb,
  published_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE engine.publish_log ENABLE ROW LEVEL SECURITY;

-- ── Provenance on the facts themselves ──────────────────────────────────────
ALTER TABLE food.sku_ingredients
  ADD COLUMN source         text CHECK (source IN ('brand_label', 'brand_submission', 'off', 'koi_editorial', 'model_extraction')),
  ADD COLUMN source_ref     text,
  ADD COLUMN may_contain    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- precautionary "may contain" flags
  ADD COLUMN verified_by    uuid,
  ADD COLUMN verified_at    timestamptz,
  ADD COLUMN label_version  integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT sku_ingredients_verified_has_provenance
    CHECK (NOT manually_verified OR (source IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL));

ALTER TABLE public.sku_nutrition
  ADD COLUMN source       text CHECK (source IN ('brand_label', 'brand_submission', 'off', 'koi_editorial', 'model_extraction')),
  ADD COLUMN source_ref   text,
  ADD COLUMN verified_by  uuid,
  ADD COLUMN verified_at  timestamptz,
  ADD CONSTRAINT sku_nutrition_verified_has_provenance
    CHECK (NOT manually_verified OR (source IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL));

-- The storefront treats a "may contain" as present for an allergen it must
-- rule out, so the read model carries it. New columns go last (OR REPLACE).
CREATE OR REPLACE VIEW public.sku_label_facts
  WITH (security_invoker = true)
AS
  SELECT sku_id, raw_ingredient_text, allergens, manually_verified, updated_at, may_contain
    FROM food.sku_ingredients
   WHERE manually_verified;

-- ── Publishing ──────────────────────────────────────────────────────────────
CREATE FUNCTION engine.publish_label(
  p_output_id    uuid,
  p_reviewer     uuid,
  p_ingredients  jsonb,   -- raw_ingredient_text, parsed_ingredients, additive_codes, allergens, may_contain; NULL to skip
  p_nutrition    jsonb    -- sku_nutrition columns, raw and normalized (computed in JS by lib/nutrition/basis.js); NULL to skip
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_out      engine.extraction_outputs%ROWTYPE;
  v_version  integer;
  v_prev_i   jsonb;
  v_prev_n   jsonb;
BEGIN
  IF p_reviewer IS NULL THEN
    RAISE EXCEPTION 'publish_label needs the reviewer who approved it';
  END IF;
  IF p_ingredients IS NULL AND p_nutrition IS NULL THEN
    RAISE EXCEPTION 'nothing to publish';
  END IF;

  SELECT * INTO v_out FROM engine.extraction_outputs WHERE id = p_output_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extraction output % not found', p_output_id;
  END IF;

  IF p_ingredients IS NOT NULL THEN
    -- An allergen list is only as good as the ingredient list it came from,
    -- so both must have been decided by a person.
    IF (SELECT count(*) FROM engine.review_queue
         WHERE output_id = p_output_id AND field_group IN ('ingredients', 'allergens')
           AND status IN ('accepted', 'corrected')) < 2 THEN
      RAISE EXCEPTION 'ingredients and allergens must both be reviewed before they are published';
    END IF;

    SELECT to_jsonb(si.*) INTO v_prev_i FROM food.sku_ingredients si WHERE si.sku_id = v_out.sku_id;

    INSERT INTO food.sku_ingredients AS si (
      sku_id, raw_ingredient_text, parsed_ingredients, additive_codes, allergens, may_contain,
      is_ai_extracted, ai_confidence, manually_verified, source, source_ref, verified_by, verified_at, label_version
    ) VALUES (
      v_out.sku_id,
      p_ingredients->>'raw_ingredient_text',
      COALESCE(p_ingredients->'parsed_ingredients', '[]'::jsonb),
      COALESCE(p_ingredients->'additive_codes', '[]'::jsonb),
      COALESCE(p_ingredients->'allergens', '[]'::jsonb),
      COALESCE(p_ingredients->'may_contain', '[]'::jsonb),
      true, v_out.confidence, true, 'brand_label', v_out.id::text, p_reviewer, now(), 1
    )
    ON CONFLICT (sku_id) DO UPDATE SET
      raw_ingredient_text = EXCLUDED.raw_ingredient_text,
      parsed_ingredients  = EXCLUDED.parsed_ingredients,
      additive_codes      = EXCLUDED.additive_codes,
      allergens           = EXCLUDED.allergens,
      may_contain         = EXCLUDED.may_contain,
      is_ai_extracted     = true,
      ai_confidence       = EXCLUDED.ai_confidence,
      manually_verified   = true,
      source              = 'brand_label',
      source_ref          = EXCLUDED.source_ref,
      verified_by         = EXCLUDED.verified_by,
      verified_at         = EXCLUDED.verified_at,
      label_version       = si.label_version + 1
    RETURNING si.label_version INTO v_version;
  END IF;

  IF p_nutrition IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM engine.review_queue
                    WHERE output_id = p_output_id AND field_group = 'nutrition'
                      AND status IN ('accepted', 'corrected')) THEN
      RAISE EXCEPTION 'nutrition must be reviewed before it is published';
    END IF;

    SELECT to_jsonb(sn.*) INTO v_prev_n FROM public.sku_nutrition sn WHERE sn.sku_id = v_out.sku_id;

    INSERT INTO public.sku_nutrition AS sn (
      sku_id, measurement_basis, serving_size, servings_per_pack,
      energy_kcal, protein_g, carbs_g, sugars_g, added_sugar_g, fibre_g,
      total_fat_g, saturated_fat_g, trans_fat_g, sodium_mg, cholesterol_mg,
      kcal_per_100g, protein_per_100g, carbs_per_100g, sugars_per_100g, fibre_per_100g, fat_per_100g,
      kcal_per_serving, protein_per_serving, carbs_per_serving, sugars_per_serving, fibre_per_serving, fat_per_serving,
      is_ai_extracted, ai_confidence, manually_verified, source, source_ref, verified_by, verified_at
    ) VALUES (
      v_out.sku_id,
      p_nutrition->>'measurement_basis',
      p_nutrition->>'serving_size',
      (p_nutrition->>'servings_per_pack')::numeric,
      (p_nutrition->>'energy_kcal')::numeric,
      (p_nutrition->>'protein_g')::numeric,
      (p_nutrition->>'carbs_g')::numeric,
      (p_nutrition->>'sugars_g')::numeric,
      (p_nutrition->>'added_sugar_g')::numeric,
      (p_nutrition->>'fibre_g')::numeric,
      (p_nutrition->>'total_fat_g')::numeric,
      (p_nutrition->>'saturated_fat_g')::numeric,
      (p_nutrition->>'trans_fat_g')::numeric,
      (p_nutrition->>'sodium_mg')::numeric,
      (p_nutrition->>'cholesterol_mg')::numeric,
      (p_nutrition->>'kcal_per_100g')::numeric,
      (p_nutrition->>'protein_per_100g')::numeric,
      (p_nutrition->>'carbs_per_100g')::numeric,
      (p_nutrition->>'sugars_per_100g')::numeric,
      (p_nutrition->>'fibre_per_100g')::numeric,
      (p_nutrition->>'fat_per_100g')::numeric,
      (p_nutrition->>'kcal_per_serving')::numeric,
      (p_nutrition->>'protein_per_serving')::numeric,
      (p_nutrition->>'carbs_per_serving')::numeric,
      (p_nutrition->>'sugars_per_serving')::numeric,
      (p_nutrition->>'fibre_per_serving')::numeric,
      (p_nutrition->>'fat_per_serving')::numeric,
      true, v_out.confidence, true, 'brand_label', v_out.id::text, p_reviewer, now()
    )
    ON CONFLICT (sku_id) DO UPDATE SET
      measurement_basis   = EXCLUDED.measurement_basis,
      serving_size        = EXCLUDED.serving_size,
      servings_per_pack   = EXCLUDED.servings_per_pack,
      energy_kcal         = EXCLUDED.energy_kcal,
      protein_g           = EXCLUDED.protein_g,
      carbs_g             = EXCLUDED.carbs_g,
      sugars_g            = EXCLUDED.sugars_g,
      added_sugar_g       = EXCLUDED.added_sugar_g,
      fibre_g             = EXCLUDED.fibre_g,
      total_fat_g         = EXCLUDED.total_fat_g,
      saturated_fat_g     = EXCLUDED.saturated_fat_g,
      trans_fat_g         = EXCLUDED.trans_fat_g,
      sodium_mg           = EXCLUDED.sodium_mg,
      cholesterol_mg      = EXCLUDED.cholesterol_mg,
      kcal_per_100g       = EXCLUDED.kcal_per_100g,
      protein_per_100g    = EXCLUDED.protein_per_100g,
      carbs_per_100g      = EXCLUDED.carbs_per_100g,
      sugars_per_100g     = EXCLUDED.sugars_per_100g,
      fibre_per_100g      = EXCLUDED.fibre_per_100g,
      fat_per_100g        = EXCLUDED.fat_per_100g,
      kcal_per_serving    = EXCLUDED.kcal_per_serving,
      protein_per_serving = EXCLUDED.protein_per_serving,
      carbs_per_serving   = EXCLUDED.carbs_per_serving,
      sugars_per_serving  = EXCLUDED.sugars_per_serving,
      fibre_per_serving   = EXCLUDED.fibre_per_serving,
      fat_per_serving     = EXCLUDED.fat_per_serving,
      is_ai_extracted     = true,
      ai_confidence       = EXCLUDED.ai_confidence,
      manually_verified   = true,
      source              = 'brand_label',
      source_ref          = EXCLUDED.source_ref,
      verified_by         = EXCLUDED.verified_by,
      verified_at         = EXCLUDED.verified_at,
      updated_at          = now();
  END IF;

  INSERT INTO engine.publish_log (sku_id, output_id, reviewer, previous_ingredients, previous_nutrition)
  VALUES (v_out.sku_id, v_out.id, p_reviewer, v_prev_i, v_prev_n);

  UPDATE engine.ai_extraction_jobs
     SET status = 'completed', completed_at = COALESCE(completed_at, now())
   WHERE id = v_out.job_id;

  RETURN jsonb_build_object(
    'sku_id', v_out.sku_id,
    'ingredients', p_ingredients IS NOT NULL,
    'nutrition', p_nutrition IS NOT NULL,
    'label_version', v_version
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION engine.publish_label(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.publish_label(uuid, uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION engine.publish_label(uuid, uuid, jsonb, jsonb) IS
  'The only path from a model reading to a storefront fact. Refuses unless the matching review_queue groups were accepted or corrected by a person; writes food.sku_ingredients and public.sku_nutrition atomically and logs what it replaced.';
