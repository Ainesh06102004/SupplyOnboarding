-- ============================================================================
-- 00048_category_reference
--
-- Plan §11.2, category-relative comparisons. What a KOI product is compared
-- against: for each KOI category and each measure, the distribution of that
-- measure across the Indian products Open Food Facts lists in the category
-- (engine.off_products, crosswalked through food.taxonomy_node.off_categories).
--
-- Stored as 101 cut points (the 0th to 100th percentile), not as the products,
-- and built by lib/screening/categoryReference.js. Every row carries the
-- reference version and when it was built, so a comparison shown on the
-- storefront can say which reference it used, and a product's position never
-- changes silently when the baseline moves (§11.2 condition 4).
--
-- Internal, like everything in `engine`: service_role only. The distribution is
-- a derivative of Open Food Facts (ODbL); only a Produced Work — a sentence on a
-- product page, with attribution — leaves this schema (§11.2 condition 3).
-- ============================================================================

CREATE TABLE engine.category_reference (
  reference_version text NOT NULL,
  node_key          text NOT NULL REFERENCES food.taxonomy_node (key),
  metric            text NOT NULL CHECK (metric IN (
                      'nutrition_rating', 'sugars_g', 'protein_g', 'fibre_g', 'saturated_fat_g', 'sodium_mg', 'energy_kcal')),
  unit              text NOT NULL CHECK (unit IN ('g', 'ml')),
  n                 integer NOT NULL CHECK (n > 0),
  cuts              numeric[] NOT NULL CHECK (cardinality(cuts) = 101),
  rubric_version    text,
  source            text NOT NULL DEFAULT 'open_food_facts',
  off_data_through  timestamptz,
  built_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reference_version, node_key, metric)
);

COMMENT ON TABLE engine.category_reference IS
  'Per KOI category and measure, 101 percentile cut points over Open Food Facts'' Indian products. Versioned and dated; internal (ODbL derivative). Plan §11.2.';
COMMENT ON COLUMN engine.category_reference.cuts IS
  'The 0th..100th percentile of the measure in this category, per 100 of `unit`.';
COMMENT ON COLUMN engine.category_reference.rubric_version IS
  'For nutrition_rating: the lib/screening/score.js rubric that rated both sides.';

ALTER TABLE engine.category_reference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.category_reference FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.category_reference TO service_role;
