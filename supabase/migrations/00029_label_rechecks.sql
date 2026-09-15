-- ============================================================================
-- KOI — Label re-checks: when a label was last seen, and where to look again
--
-- Phase 1.4. Recipes change without notice, and a label reading is only as
-- current as the pack it came from. Nobody is asked for anything:
--
--   1. Every label fact carries `confirmed_at`: when KOI last saw the pack
--      that says it. A trigger stamps it from the photo behind the reading
--      (the upload's time — re-reading an old photo does not make it new), and
--      the daily re-check moves it forward while the same label image is still
--      on the brand's own store listing (engine.reconfirm_labels).
--   2. engine.label_sources: each SKU's listing on its brand's online store,
--      matched automatically by name and pack size (lib/engine/storeMatch.js).
--      No confident match, no source.
--   3. engine.source_images: every image seen on that listing, by content
--      hash, and what a model saw in it. A new label image becomes an upload,
--      which the scheduled reader reads twice and publishes as it always has.
--   4. After 365 days without confirmation the storefront stops treating the
--      ingredient list as complete and stops making nutrient claims from the
--      figures (lib/recommendation/verification.js#isLabelCurrent).
--
-- engine tables: service_role only, RLS on with no policies.
-- ============================================================================

-- ── 1. confirmed_at ─────────────────────────────────────────────────────────

ALTER TABLE food.sku_ingredients ADD COLUMN confirmed_at timestamptz;
ALTER TABLE public.sku_nutrition ADD COLUMN confirmed_at timestamptz;

COMMENT ON COLUMN food.sku_ingredients.confirmed_at IS
  'When KOI last saw the pack this list was read from. Older than a year: no longer treated as the complete list.';
COMMENT ON COLUMN public.sku_nutrition.confirmed_at IS
  'When KOI last saw the pack (or the brand declared) these figures. Older than a year: no nutrient claims are made from them.';

-- Backfill from the photo behind each reading, else when the row was
-- verified or declared. The updated_at triggers are paused so the backfill
-- does not make every row look edited today.
ALTER TABLE food.sku_ingredients DISABLE TRIGGER set_sku_ingredients_updated_at;
ALTER TABLE public.sku_nutrition DISABLE TRIGGER set_sku_nutrition_updated_at;

UPDATE food.sku_ingredients si
SET confirmed_at = COALESCE(
  (SELECT u.uploaded_at FROM engine.extraction_outputs o JOIN public.uploads u ON u.id = o.upload_id WHERE o.id::text = si.source_ref),
  si.verified_at, si.created_at);

UPDATE public.sku_nutrition sn
SET confirmed_at = COALESCE(
  (SELECT u.uploaded_at FROM engine.extraction_outputs o JOIN public.uploads u ON u.id = o.upload_id WHERE o.id::text = sn.source_ref),
  sn.verified_at, sn.created_at);

ALTER TABLE food.sku_ingredients ENABLE TRIGGER set_sku_ingredients_updated_at;
ALTER TABLE public.sku_nutrition ENABLE TRIGGER set_sku_nutrition_updated_at;

CREATE FUNCTION food.stamp_label_confirmed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_seen timestamptz;
  v_new_source boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_source := true;
  ELSE
    v_new_source := NEW.source_ref IS DISTINCT FROM OLD.source_ref OR NEW.verified_at IS DISTINCT FROM OLD.verified_at;
  END IF;

  IF v_new_source THEN
    SELECT u.uploaded_at INTO v_seen
    FROM engine.extraction_outputs o JOIN public.uploads u ON u.id = o.upload_id
    WHERE o.id::text = NEW.source_ref;
    NEW.confirmed_at := COALESCE(v_seen, NEW.verified_at, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION food.stamp_label_confirmed_at() FROM PUBLIC;

CREATE TRIGGER stamp_label_confirmed_at BEFORE INSERT OR UPDATE ON food.sku_ingredients
  FOR EACH ROW EXECUTE FUNCTION food.stamp_label_confirmed_at();
CREATE TRIGGER stamp_label_confirmed_at BEFORE INSERT OR UPDATE ON public.sku_nutrition
  FOR EACH ROW EXECUTE FUNCTION food.stamp_label_confirmed_at();

-- The storefront's read of published labels gains the date. Column appended,
-- so CREATE OR REPLACE keeps every existing grant and dependent query.
CREATE OR REPLACE VIEW public.sku_label_facts WITH (security_invoker = true) AS
  SELECT sku_id, raw_ingredient_text, allergens, manually_verified, updated_at, may_contain, evidence, confirmed_at
  FROM food.sku_ingredients
  WHERE evidence IS NOT NULL;

-- ── 2. Where each SKU is listed ─────────────────────────────────────────────

CREATE TABLE engine.label_sources (
  sku_id        uuid PRIMARY KEY REFERENCES public.skus(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'shopify' CHECK (kind IN ('shopify')),
  store_domain  text NOT NULL,
  status        text NOT NULL CHECK (status IN ('matched', 'no_match', 'ambiguous', 'unreachable', 'gone')),
  handle        text,
  listing_title text,
  reason        text,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 3. What was on the listing ──────────────────────────────────────────────

CREATE TABLE engine.source_images (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id           uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  source_url       text NOT NULL,
  sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size        integer NOT NULL CHECK (byte_size > 0),
  mime_type        text NOT NULL,
  shows            jsonb,
  classifier_model text,
  upload_id        uuid REFERENCES public.uploads(id),
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  gone_at          timestamptz,
  UNIQUE (sku_id, sha256)
);
CREATE INDEX source_images_upload_idx ON engine.source_images (upload_id) WHERE upload_id IS NOT NULL;

ALTER TABLE engine.label_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.source_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.label_sources, engine.source_images FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.label_sources, engine.source_images TO service_role;

-- ── Re-confirmation ─────────────────────────────────────────────────────────

-- The label images behind these uploads are still on the brand's listing, so
-- whatever was published from them is confirmed as of now. source_ref and
-- verified_at are untouched, so the stamp trigger leaves this date alone.
CREATE FUNCTION engine.reconfirm_labels(p_sku_id uuid, p_upload_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ingredients integer;
  v_nutrition integer;
BEGIN
  UPDATE food.sku_ingredients SET confirmed_at = now()
  WHERE sku_id = p_sku_id
    AND source_ref IN (SELECT o.id::text FROM engine.extraction_outputs o WHERE o.upload_id = ANY (p_upload_ids));
  GET DIAGNOSTICS v_ingredients = ROW_COUNT;

  UPDATE public.sku_nutrition SET confirmed_at = now()
  WHERE sku_id = p_sku_id
    AND source_ref IN (SELECT o.id::text FROM engine.extraction_outputs o WHERE o.upload_id = ANY (p_upload_ids));
  GET DIAGNOSTICS v_nutrition = ROW_COUNT;

  RETURN jsonb_build_object('ingredients', v_ingredients, 'nutrition', v_nutrition);
END;
$$;

REVOKE EXECUTE ON FUNCTION engine.reconfirm_labels(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.reconfirm_labels(uuid, uuid[]) TO service_role;

-- ── The brands' own stores ──────────────────────────────────────────────────
-- Found on 15 Sep 2026 by checking which store's public product feed lists the
-- products KOI sells under each brand. Filled only where empty, so what a
-- brand gives at onboarding always wins. The Healthy Binge's domain is parked,
-- so it has no store to check.
UPDATE public.brands SET website = 'https://troovyfoods.com'     WHERE brand_name = 'Troovy'             AND website IS NULL;
UPDATE public.brands SET website = 'https://sweetkaramcoffee.in' WHERE brand_name = 'Sweet Karam Coffee' AND website IS NULL;
UPDATE public.brands SET website = 'https://opensecret.in'       WHERE brand_name = 'Open Secret'        AND website IS NULL;
UPDATE public.brands SET website = 'https://kisaansay.com'       WHERE brand_name = 'KisaanSay'          AND website IS NULL;
UPDATE public.brands SET website = 'https://mamanourish.in'      WHERE brand_name = 'Mama Nourish'       AND website IS NULL;
