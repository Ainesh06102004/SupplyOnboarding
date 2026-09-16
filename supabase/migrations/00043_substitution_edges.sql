-- ============================================================================
-- KOI — What KOI can offer instead, and why
--
-- Phase 2.5, the last slice of the context graph.
--
-- When a product cannot be bought, the hand-off screen offers KOI's own
-- screened alternatives. Ranking them by category and score is honest but
-- says nothing: the shopper is not told why this one is being offered. These
-- edges record the reason, derived from facts KOI already holds.
--
--   food.substitution_edge  from_sku -> to_sku, one row per reason:
--     same_category           the nearest thing KOI lists: the same category
--     less_sugar              at least 25% less sugar per 100
--     more_protein            at least 25% more protein per 100
--     less_processed          a lower NOVA group, both read from full lists
--     cheaper_per_g_protein   at least 25% less per gram of protein
--     without_allergen        an allergen the first lists and this one does
--                             not — only where BOTH have a complete, current
--                             ingredient list, because otherwise "without" is
--                             a promise KOI cannot keep
--
-- The 25% is not arbitrary. A comparative nutrient claim under the FSS
-- (Advertising and Claims) Regulations, 2018 requires the foods compared to be
-- identifiable and the relative difference in the claimed parameter to be at
-- least 25%. Anything smaller is not a difference KOI may put in words, so it
-- is not an edge either. A 1 g per 100 floor keeps 0.1 g against 0.05 g out.
--
-- `comparability` is how like-for-like the pair is (1.0 same category, 0.6 the
-- same aisle in the same meal role), never how good the alternative is.
--
-- Written by the screening pass (web/src/lib/screening/rescore.js) from
-- web/src/lib/food/substitutions.js. Nobody curates it by hand.
-- ============================================================================

CREATE TABLE food.substitution_edge (
  from_sku      uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  to_sku        uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  reason        text NOT NULL CHECK (reason IN (
                  'same_category', 'less_sugar', 'more_protein', 'less_processed',
                  'cheaper_per_g_protein', 'without_allergen')),
  comparability numeric NOT NULL CHECK (comparability > 0 AND comparability <= 1),
  basis         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source        text NOT NULL DEFAULT 'koi_derived',
  rule_version  text NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_sku, to_sku, reason),
  CHECK (from_sku <> to_sku)
);

CREATE INDEX substitution_edge_from ON food.substitution_edge (from_sku, comparability DESC);

COMMENT ON COLUMN food.substitution_edge.basis IS
  'The figures behind the reason: the two values compared and their difference, or the allergens avoided.';
COMMENT ON COLUMN food.substitution_edge.comparability IS
  'How like-for-like the pair is: 1.0 the same category, 0.6 the same aisle and meal role. Not a verdict on the alternative.';

ALTER TABLE food.substitution_edge ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food.substitution_edge TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.substitution_edge TO service_role;

CREATE POLICY "Substitutes are public" ON food.substitution_edge FOR SELECT USING (true);
