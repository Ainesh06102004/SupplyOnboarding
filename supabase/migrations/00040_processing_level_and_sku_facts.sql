-- ============================================================================
-- KOI — How processed a food is, and the facts KOI derives for each SKU
--
-- Phase 2.4.
--
-- PROCESSING. The KOI score has always reserved a processing part and left it
-- empty ("Not scored until NOVA groups exist"). NOVA sorts foods by the extent
-- and purpose of their processing (Monteiro CA et al., "Ultra-processed foods:
-- what they are and how to identify them", Public Health Nutrition 22(5),
-- 2019; FAO, "Ultra-processed foods, diet quality, and health using the NOVA
-- classification system", 2019):
--
--   group 4  ultra-processed: any cosmetic additive (flavours, flavour
--            enhancers, colours, emulsifiers and emulsifying salts, non-sugar
--            sweeteners, thickeners, gelling, glazing, bulking, foaming and
--            carbonating agents) or substance of no or rare culinary use
--            (maltodextrin, glucose syrup, fructose, lactose, casein, whey and
--            milk proteins, protein isolates, hydrolysed proteins, hydrogenated
--            or interesterified fats, isolated fibre)
--   group 3  processed: foods with salt, sugar, oil or other group 2
--            ingredients added, possibly with additives that preserve them
--   group 2  processed culinary ingredients alone: salt, sugar, jaggery,
--            honey, oils, butter, ghee, vinegar, starches
--   group 1  unprocessed or minimally processed foods
--
-- KOI reads it only from a complete ingredient list, and records what decided
-- it. A name or a category is not evidence of how a food was made.
--
--   food.processing_term   label words and what they signal: role
--                          ultra_processed, culinary, processed (additives
--                          that preserve or keep texture), or neutral (water,
--                          fortifying vitamins, words like "roasted").
--   food.processing_names  those terms, plus every name of an ingredient whose
--                          category or additive class decides a role, so
--                          "INS 471" is an emulsifier without being listed
--                          twice. Compiled by web/scripts/buildProcessing.mjs.
--
-- SKU FACTS. food.sku_facts holds what KOI derives per SKU for the planner and
-- the score: the NOVA group and its basis, rupees per gram of protein (from
-- MRP, net weight and declared protein), and the veg mark where both label
-- readings agree on it. Written by the screening pass; nobody enters it.
-- ============================================================================

CREATE TABLE food.processing_term (
  term   text PRIMARY KEY CHECK (term = lower(btrim(term)) AND term <> ''),
  role   text NOT NULL CHECK (role IN ('ultra_processed', 'culinary', 'processed', 'neutral')),
  rule   text NOT NULL,
  source text NOT NULL DEFAULT 'nova_monteiro_2019'
);

INSERT INTO food.processing_term (term, role, rule, source)
SELECT unnest(v.terms), v.role, v.rule, v.source
FROM (VALUES
  ('ultra_processed', 'A cosmetic additive, used to make a product palatable or appealing: a NOVA group 4 marker.', 'nova_monteiro_2019', ARRAY[
    'emulsifier', 'emulsifying agent', 'emulsifying salt', 'colour', 'color', 'added colour', 'food colour',
    'flavour', 'flavor', 'flavouring', 'flavoring', 'added flavour', 'flavour enhancer', 'flavor enhancer',
    'sweetener', 'artificial sweetener', 'thickener', 'thickening agent', 'stabiliser', 'stabilizer',
    'gelling agent', 'glazing agent', 'bulking agent', 'foaming agent', 'antifoaming agent', 'carbonating agent']),
  ('ultra_processed', 'A substance of no or rare culinary use: a NOVA group 4 marker.', 'nova_monteiro_2019', ARRAY[
    'glucose syrup', 'liquid glucose', 'corn syrup', 'invert syrup', 'fructose', 'dextrose', 'lactose',
    'milk protein', 'milk protein concentrate', 'whey protein', 'whey powder', 'casein', 'caseinate',
    'soy protein isolate', 'protein isolate', 'protein concentrate', 'hydrolysed protein', 'hydrolyzed protein',
    'hydrolysed vegetable protein', 'hydrogenated', 'interesterified', 'maltodextrin', 'polydextrose',
    'modified starch', 'soluble fibre', 'inulin']),
  ('culinary', 'A processed culinary ingredient (NOVA group 2). Added to foods, it makes them processed (group 3).', 'nova_monteiro_2019', ARRAY[
    'salt', 'sea salt', 'black salt', 'pink salt', 'iodised salt', 'iodized salt', 'rock salt', 'salted',
    'sugar', 'cane sugar', 'raw cane sugar', 'brown sugar', 'khandsari', 'sweetened', 'jaggery', 'gur', 'honey',
    'oil', 'vegetable oil', 'edible vegetable oil', 'refined oil', 'butter', 'ghee', 'vinegar', 'starch', 'edible starch']),
  ('processed', 'An additive that preserves a food or keeps its texture, as NOVA group 3 foods may contain.', 'nova_monteiro_2019', ARRAY[
    'preservative', 'antioxidant', 'acidity regulator', 'acidulant', 'raising agent', 'leavening agent',
    'anticaking agent', 'anti caking agent', 'firming agent', 'humectant', 'improver', 'flour improver',
    'baking soda', 'baking powder']),
  ('neutral', 'Not evidence of processing either way: water, vitamins or minerals added to fortify, and words that describe a food rather than add to it.', 'koi_editorial', ARRAY[
    'water', 'potable water', 'vitamin', 'mineral', 'iron', 'iodine',
    'refined', 'roasted', 'toasted', 'dried', 'dehydrated', 'organic', 'whole', 'raw', 'pure', 'natural',
    'premium', 'edible', 'cold pressed', 'fresh', 'virgin', 'extra virgin', 'powder', 'flake', 'granule',
    'crushed', 'ground', 'split', 'peeled', 'deshelled', 'kernel', 'piece', 'thin', 'thick', 'fine', 'coarse',
    'instant', 'sprouted', 'puffed', 'flattened', 'contains', 'allergen', 'may contain', 'ingredient'])
) AS v(role, rule, source, terms);

-- Every name that decides a role: the terms above, and the names of
-- ingredients whose category or additive class decides one.
CREATE VIEW food.processing_names WITH (security_invoker = true) AS
  SELECT t.term AS name, t.role, 'term'::text AS origin
  FROM food.processing_term t
  UNION ALL
  SELECT ia.alias, r.role, 'ingredient'::text
  FROM food.ingredient_alias ia
  JOIN food.ingredients_master m ON m.id = ia.ingredient_id
  CROSS JOIN LATERAL (SELECT CASE
    WHEN m.canonical_name IN ('Maltodextrin', 'Modified Starch', 'Dextrose', 'High Fructose Corn Syrup', 'Invert Sugar',
      'Casein', 'Whey', 'Interesterified Fat', 'Partially Hydrogenated Vegetable Oil', 'Industrial Trans Fat',
      'Vanaspati', 'Inulin', 'Brominated Vegetable Oil') THEN 'ultra_processed'
    WHEN m.ingredient_category IN ('colour', 'emulsifier', 'flavour_enhancer', 'flavouring', 'sweetener', 'thickener',
      'stabiliser', 'glazing_agent') THEN 'ultra_processed'
    WHEN m.ingredient_category IN ('preservative', 'antioxidant', 'acidity_regulator', 'raising_agent', 'anticaking',
      'humectant', 'flour_treatment') THEN 'processed'
    WHEN m.ingredient_category IN ('fat_oil', 'sugar')
      OR m.canonical_name IN ('Iodised Salt', 'Rock Salt', 'Corn Starch', 'Potato Starch', 'Tapioca Starch') THEN 'culinary'
  END AS role) r
  WHERE r.role IS NOT NULL;

-- ── Per-SKU facts ───────────────────────────────────────────────────────────

CREATE TABLE food.sku_facts (
  sku_id               uuid PRIMARY KEY REFERENCES public.skus(id) ON DELETE CASCADE,
  nova_group           smallint CHECK (nova_group BETWEEN 1 AND 4),
  nova_basis           jsonb NOT NULL DEFAULT '{}'::jsonb,
  rupees_per_g_protein numeric CHECK (rupees_per_g_protein > 0),
  veg_mark             text CHECK (veg_mark IN ('veg', 'non_veg')),
  facts_version        text NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN food.sku_facts.nova_basis IS
  'What decided the group (markers, culinary ingredients, preserving additives found), or why none was decided (no complete ingredient list).';
COMMENT ON COLUMN food.sku_facts.rupees_per_g_protein IS
  'MRP divided by the grams of protein in the pack, from the declared protein and the net weight. Null when either is missing or their units differ.';
COMMENT ON COLUMN food.sku_facts.veg_mark IS
  'The FSSAI veg or non-veg mark, only where two independent label readings agreed on it.';

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE food.processing_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.sku_facts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food.processing_term, food.sku_facts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.processing_term, food.sku_facts TO service_role;
GRANT SELECT ON food.processing_names TO service_role;

CREATE POLICY "Processing rules are public" ON food.processing_term FOR SELECT USING (true);
CREATE POLICY "SKU facts are public" ON food.sku_facts FOR SELECT USING (true);
