-- ============================================================================
-- KOI — Open Food Facts, staged beside KOI's knowledge and never inside it
--
-- Phase 1.5. Open Food Facts is a community database of packaged foods, about
-- ten thousand of them Indian, under the Open Database Licence (ODbL). KOI uses
-- it for two things, both internal:
--   - naming who makes what shoppers search for and KOI does not stock
--     (engine.off_candidates, shown to staff on /staff/demand);
--   - cross-checking the figures KOI read from a pack against the community's
--     (engine.off_matches), as a signal, never as a correction.
--
-- THE RULE: nothing from Open Food Facts reaches the storefront or KOI's own
-- tables. It is volunteer-entered, often incomplete, and share-alike: a KOI
-- database built from it would have to be released under the same licence.
-- So it lives in `engine` (service role only), and the CHECKs below refuse any
-- row in food.sku_ingredients or public.sku_nutrition whose source names it.
-- Loosening that would take a migration, an attribution design, and a decision.
--
-- It is also never used to find stores to check: those are onboarded brands
-- only (lib/engine/storeMatch.js#storeCheckEligibility).
--
-- Loaded once from the daily CSV export (web/scripts/importOpenFoodFacts.mjs)
-- and kept current from the daily delta files (/api/engine/off-sync). A row is
-- replaced only by a version at least as new as the one held.
-- ============================================================================

CREATE TABLE engine.off_products (
  code                  text PRIMARY KEY CHECK (code ~ '^[0-9]{4,20}$'),
  product_name          text,
  brands                text,
  brand_tags            text[] NOT NULL DEFAULT '{}',
  quantity              text,
  categories_tags       text[] NOT NULL DEFAULT '{}',
  ingredients_text      text,
  allergens_tags        text[] NOT NULL DEFAULT '{}',
  traces_tags           text[] NOT NULL DEFAULT '{}',
  nova_group            smallint CHECK (nova_group BETWEEN 1 AND 4),
  nutrients_per_100     jsonb NOT NULL DEFAULT '{}',
  image_front_url       text,
  image_ingredients_url text,
  image_nutrition_url   text,
  completeness          numeric,
  off_last_modified     timestamptz NOT NULL,
  imported_from         text NOT NULL,
  imported_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX off_products_brand_tags_idx ON engine.off_products USING gin (brand_tags);

COMMENT ON TABLE engine.off_products IS
  'Indian products from Open Food Facts (openfoodfacts.org, ODbL). Staging only: never shown to shoppers, never copied into food or public.';
COMMENT ON COLUMN engine.off_products.nutrients_per_100 IS
  'Per 100 g/ml, under KOI''s field names (energy_kcal, protein_g, carbs_g, sugars_g, fibre_g, total_fat_g, saturated_fat_g, sodium_mg).';

CREATE TABLE engine.off_sync_files (
  file         text PRIMARY KEY,
  lines        integer NOT NULL,
  indian       integer NOT NULL,
  stored       integer NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE engine.off_matches (
  sku_id        uuid PRIMARY KEY REFERENCES public.skus(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('matched', 'no_match', 'ambiguous')),
  off_code      text REFERENCES engine.off_products(code) ON DELETE SET NULL,
  method        text CHECK (method IN ('barcode', 'name')),
  reason        text,
  comparison    jsonb,
  disagreements text[] NOT NULL DEFAULT '{}',
  checked_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engine.off_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.off_sync_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine.off_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.off_products, engine.off_sync_files, engine.off_matches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.off_products, engine.off_sync_files, engine.off_matches TO service_role;

-- ── Loading ─────────────────────────────────────────────────────────────────

-- Up to a batch of normalised rows (lib/off/record.js). A row replaces the one
-- held only when it is at least as new, so a late delta cannot roll back a
-- fresher export.
CREATE FUNCTION engine.upsert_off_products(p_rows jsonb)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH incoming AS (
    SELECT DISTINCT ON (r->>'code') r
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_rows) = 'array' THEN p_rows ELSE '[]'::jsonb END) AS r
    WHERE r->>'code' ~ '^[0-9]{4,20}$' AND r->>'off_last_modified' IS NOT NULL AND r->>'imported_from' IS NOT NULL
    ORDER BY r->>'code', (r->>'off_last_modified')::timestamptz DESC
  ), upserted AS (
    INSERT INTO engine.off_products AS o (
      code, product_name, brands, brand_tags, quantity, categories_tags, ingredients_text, allergens_tags,
      traces_tags, nova_group, nutrients_per_100, image_front_url, image_ingredients_url, image_nutrition_url,
      completeness, off_last_modified, imported_from, imported_at)
    SELECT
      r->>'code', r->>'product_name', r->>'brands',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'brand_tags', '[]'::jsonb))),
      r->>'quantity',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'categories_tags', '[]'::jsonb))),
      r->>'ingredients_text',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'allergens_tags', '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'traces_tags', '[]'::jsonb))),
      (r->>'nova_group')::smallint,
      COALESCE(r->'nutrients_per_100', '{}'::jsonb),
      r->>'image_front_url', r->>'image_ingredients_url', r->>'image_nutrition_url',
      (r->>'completeness')::numeric,
      (r->>'off_last_modified')::timestamptz,
      r->>'imported_from',
      now()
    FROM incoming
    ON CONFLICT (code) DO UPDATE SET
      product_name = EXCLUDED.product_name, brands = EXCLUDED.brands, brand_tags = EXCLUDED.brand_tags,
      quantity = EXCLUDED.quantity, categories_tags = EXCLUDED.categories_tags,
      ingredients_text = EXCLUDED.ingredients_text, allergens_tags = EXCLUDED.allergens_tags,
      traces_tags = EXCLUDED.traces_tags, nova_group = EXCLUDED.nova_group,
      nutrients_per_100 = EXCLUDED.nutrients_per_100, image_front_url = EXCLUDED.image_front_url,
      image_ingredients_url = EXCLUDED.image_ingredients_url, image_nutrition_url = EXCLUDED.image_nutrition_url,
      completeness = EXCLUDED.completeness, off_last_modified = EXCLUDED.off_last_modified,
      imported_from = EXCLUDED.imported_from, imported_at = now()
    WHERE o.off_last_modified <= EXCLUDED.off_last_modified
    RETURNING 1
  )
  SELECT count(*)::integer FROM upserted;
$$;

REVOKE EXECUTE ON FUNCTION engine.upsert_off_products(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.upsert_off_products(jsonb) TO service_role;

-- ── Who makes what shoppers asked for ───────────────────────────────────────

-- For each demand term, the brands with the most Open Food Facts products
-- whose name or category carries it. Terms reach here already cleaned to
-- letters and spaces (lib/demand/terms.js).
CREATE FUNCTION engine.off_candidates(p_terms text[], p_per_term integer DEFAULT 3)
RETURNS TABLE (term text, brand text, products integer, example text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT t.term, b.brand, b.products, b.example
  FROM unnest(p_terms) AS t(term)
  CROSS JOIN LATERAL (
    SELECT btrim(split_part(o.brands, ',', 1)) AS brand, count(*)::integer AS products, min(o.product_name) AS example
    FROM engine.off_products o
    WHERE char_length(t.term) >= 3
      AND btrim(split_part(COALESCE(o.brands, ''), ',', 1)) <> ''
      AND (o.product_name ILIKE '%' || t.term || '%'
           OR array_to_string(o.categories_tags, ' ') ILIKE '%' || replace(t.term, ' ', '-') || '%')
    GROUP BY 1
    ORDER BY count(*) DESC, 1
    LIMIT GREATEST(1, LEAST(p_per_term, 10))
  ) AS b;
$$;

REVOKE EXECUTE ON FUNCTION engine.off_candidates(text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.off_candidates(text[], integer) TO service_role;

-- ── The rule, enforced ──────────────────────────────────────────────────────

ALTER TABLE food.sku_ingredients ADD CONSTRAINT sku_ingredients_not_from_open_food_facts
  CHECK (source IS NULL OR source !~* '(^off$|open.?food.?facts)');
ALTER TABLE public.sku_nutrition ADD CONSTRAINT sku_nutrition_not_from_open_food_facts
  CHECK (source IS NULL OR source !~* '(^off$|open.?food.?facts)');
