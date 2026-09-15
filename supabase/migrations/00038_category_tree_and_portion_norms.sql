-- ============================================================================
-- KOI — The category tree, and what a realistic serving is in each category
--
-- Phase 2.3.
--
-- CATEGORIES. products.category_l1 is whatever a brand typed: "Healthy
-- Snacks", "Farm Foods", "protein_powder". The storefront printed it as the
-- aisle, which put "healthy", a word FSSAI's claims regulations prohibit, on
-- the shelf, and gave rice, honey and saffron one aisle called "Farm Foods".
--
--   food.taxonomy_node  the tree: aisles and their categories, as ltree paths,
--                       with claim-free labels and a crosswalk to Open Food
--                       Facts category tags (used internally, to measure the
--                       classifier; never shown).
--   food.taxonomy_term  the names that place a product in a category, matched
--                       on its name first and the brand's category text only
--                       as a fallback (web/src/lib/food/taxonomy.js).
--   food.sku_taxonomy   where each SKU was placed, by which name, under which
--                       compiled tree version. Written by the screening job
--                       after every publish and daily; nobody assigns by hand.
--
-- PORTIONS. India has no reference serving sizes: FSSAI leaves the serve size
-- to the manufacturer. The US FDA's reference amounts customarily consumed
-- per eating occasion (21 CFR 101.12(b), Table 2) are the published reference
-- used here, marked as such, until an Indian one exists.
--
--   food.portion_norm   one reference amount per category that has one, and a
--                       plausible maximum of twice it. A household measure
--                       ("1 tbsp") is converted to grams by KOI and says so.
--                       Categories whose reference depends on a recipe (drink
--                       mixes: 101.12(c)) or that the table does not list
--                       (protein powders) get no row rather than a guess.
--
-- CLAIMS. claims-v2 judges KOI's per-serving protein floor on a REALISTIC
-- serving: the declared serving, unless it is more than the category's
-- plausible maximum, in which case the reference amount. It is never more
-- than the declared serving, so it is never looser than claims-v1.
--
-- The code reads compiled copies (web/scripts/buildTaxonomy.mjs,
-- web/scripts/buildClaimRules.mjs, each with --check). Public SELECT by grant
-- and policy; written by the service role only.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA extensions;

-- ── The tree ────────────────────────────────────────────────────────────────

CREATE TABLE food.taxonomy_node (
  key            text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  path           extensions.ltree NOT NULL GENERATED ALWAYS AS (extensions.text2ltree(key)) STORED,
  parent_key     text REFERENCES food.taxonomy_node(key),
  label          text NOT NULL CHECK (btrim(label) <> '' AND label !~* 'health|natural|immun|diabet|detox|boost|superfood'),
  off_categories text[] NOT NULL DEFAULT '{}',
  notes          text,
  source         text NOT NULL DEFAULT 'koi_editorial',
  CHECK ((parent_key IS NULL) = (position('.' IN key) = 0)),
  CHECK (parent_key IS NULL OR (left(key, length(parent_key) + 1) = parent_key || '.'
         AND position('.' IN substr(key, length(parent_key) + 2)) = 0))
);
CREATE INDEX taxonomy_node_path ON food.taxonomy_node USING gist (path);

INSERT INTO food.taxonomy_node (key, parent_key, label, off_categories, notes) VALUES
  ('snacks', NULL, 'Snacks', '{en:snacks}', NULL),
  ('snacks.biscuits_cookies', 'snacks', 'Biscuits & cookies', '{en:biscuits,en:chocolate-biscuits,en:wafers}', NULL),
  ('snacks.chips_crisps', 'snacks', 'Chips & crisps', '{en:crisps,en:potato-crisps,en:chips-and-fries}', NULL),
  ('snacks.namkeen', 'snacks', 'Namkeen & mixtures', '{en:namkeen}', NULL),
  ('snacks.puffs', 'snacks', 'Puffs, crispies & makhana', '{}', NULL),
  ('snacks.bars', 'snacks', 'Snack bars', '{en:bars,en:protein-bars}', NULL),
  ('snacks.assortments', 'snacks', 'Assortments & combos', '{}', 'Packs of different products. No reference portion: the contents differ.'),

  ('nuts_seeds', NULL, 'Nuts, seeds & dried fruit', '{}', NULL),
  ('nuts_seeds.nuts', 'nuts_seeds', 'Nuts', '{en:nuts,en:cashew-nuts}', NULL),
  ('nuts_seeds.seeds', 'nuts_seeds', 'Seeds', '{en:sunflower-seeds-and-their-products}', NULL),
  ('nuts_seeds.dried_fruit', 'nuts_seeds', 'Dried fruit', '{en:dried-fruits,en:dates}', NULL),
  ('nuts_seeds.mixes', 'nuts_seeds', 'Nut & dried fruit mixes', '{}', NULL),
  ('nuts_seeds.nut_butters', 'nuts_seeds', 'Nut butters', '{en:peanut-butters,en:nut-butters}', NULL),

  ('sweets', NULL, 'Sweets & chocolate', '{en:confectioneries}', NULL),
  ('sweets.indian_sweets', 'sweets', 'Indian sweets', '{}', NULL),
  ('sweets.chocolate', 'sweets', 'Chocolate', '{en:chocolates}', NULL),

  ('staples', NULL, 'Staples', '{}', NULL),
  ('staples.rice', 'staples', 'Rice & poha', '{en:rices}', NULL),
  ('staples.millets', 'staples', 'Millets & other grains', '{}', NULL),
  ('staples.flours', 'staples', 'Flours & atta', '{en:flours,en:wheat-flours,en:cereal-flours}', NULL),
  ('staples.pulses', 'staples', 'Dals & pulses', '{en:pulses}', NULL),
  ('staples.breakfast_cereals', 'staples', 'Oats & breakfast cereals', '{en:breakfast-cereals,en:mueslis}', NULL),

  ('spices', NULL, 'Spices & condiments', '{en:condiments}', NULL),
  ('spices.spices', 'spices', 'Spices & masalas', '{en:spices,en:herbs-and-spices,en:spice-mix}', NULL),
  ('spices.pickles_sauces', 'spices', 'Pickles, chutneys & sauces', '{en:pickles,en:sauces,en:ketchup}', 'No reference portion: sauces and pickles differ too much.'),

  ('sweeteners', NULL, 'Honey, jaggery & sugar', '{en:sweeteners}', NULL),
  ('sweeteners.honey', 'sweeteners', 'Honey', '{en:honeys}', NULL),
  ('sweeteners.jaggery', 'sweeteners', 'Jaggery', '{}', NULL),
  ('sweeteners.sugar', 'sweeteners', 'Sugar', '{en:sugars}', NULL),

  ('beverages', NULL, 'Drinks', '{en:beverages}', NULL),
  ('beverages.drink_mixes', 'beverages', 'Drink mixes', '{en:beverage-preparations,en:instant-beverages}', 'No reference portion: under 21 CFR 101.12(c) a mix''s reference is the amount that makes one prepared drink, which depends on the recipe.'),
  ('beverages.tea_coffee', 'beverages', 'Tea & coffee', '{en:teas,en:coffees}', 'No reference portion, for the same reason as drink mixes.'),
  ('beverages.ready_to_drink', 'beverages', 'Juices & ready-to-drink', '{en:juices-and-nectars}', NULL),

  ('fats_oils', NULL, 'Oils & ghee', '{en:fats}', NULL),
  ('fats_oils.ghee', 'fats_oils', 'Ghee', '{en:ghee}', NULL),
  ('fats_oils.oils', 'fats_oils', 'Cooking oils', '{en:vegetable-oils}', NULL),

  ('supplements', NULL, 'Protein & supplements', '{en:dietary-supplements}', NULL),
  ('supplements.protein_powder', 'supplements', 'Protein powders', '{en:protein-powders}', 'No reference portion: 21 CFR 101.12 does not list protein powders.');

-- ── The names that place a product ──────────────────────────────────────────

CREATE TABLE food.taxonomy_term (
  term     text PRIMARY KEY CHECK (term = lower(btrim(term)) AND term <> ''),
  node_key text NOT NULL REFERENCES food.taxonomy_node(key) ON DELETE CASCADE,
  source   text NOT NULL DEFAULT 'koi_editorial'
);

INSERT INTO food.taxonomy_term (term, node_key)
SELECT unnest(v.terms), v.node_key
FROM (VALUES
  ('snacks', ARRAY['snack']),
  ('snacks.biscuits_cookies', ARRAY['biscuit', 'cookie', 'cracker', 'rusk', 'wafer']),
  ('snacks.chips_crisps', ARRAY['chip', 'crisp', 'nacho']),
  ('snacks.namkeen', ARRAY['namkeen', 'mixture', 'chivda', 'chiwda', 'bhujia', 'sev', 'mathri', 'khakhra', 'chakli', 'murukku', 'farsan', 'bhakarwadi']),
  ('snacks.puffs', ARRAY['puff', 'crispies', 'makhana', 'fox nut', 'popcorn', 'puffed rice', 'murmura']),
  ('snacks.bars', ARRAY['bar', 'laddu bar', 'laddubar', 'energy bar', 'protein bar', 'granola bar', 'nutrition bar', 'chikki']),
  ('snacks.assortments', ARRAY['combo', 'assorted', 'assortment', 'hamper', 'gift box', 'gift pack', 'variety pack']),

  ('nuts_seeds', ARRAY['dry fruit', 'dryfruit']),
  ('nuts_seeds.nuts', ARRAY['nut', 'almond', 'badam', 'cashew', 'kaju', 'walnut', 'akhrot', 'pistachio', 'pista', 'hazelnut', 'peanut', 'groundnut', 'macadamia', 'pecan', 'brazil nut']),
  ('nuts_seeds.seeds', ARRAY['seed', 'chia seed', 'flax seed', 'flaxseed', 'pumpkin seed', 'sunflower seed', 'sesame seed', 'melon seed', 'sabja']),
  ('nuts_seeds.dried_fruit', ARRAY['date', 'khajur', 'raisin', 'kishmish', 'fig', 'anjeer', 'prune', 'apricot', 'cranberry', 'dried fruit']),
  ('nuts_seeds.mixes', ARRAY['dry fruit mix', 'trail mix', 'nut mix', 'seed mix']),
  ('nuts_seeds.nut_butters', ARRAY['peanut butter', 'almond butter', 'cashew butter', 'nut butter']),

  ('sweets', ARRAY['sweet', 'mithai']),
  ('sweets.indian_sweets', ARRAY['mysore pak', 'laddu', 'ladoo', 'laddoo', 'barfi', 'burfi', 'halwa', 'soan papdi', 'peda', 'gulab jamun', 'rasgulla', 'katli', 'kaju katli', 'gajak']),
  ('sweets.chocolate', ARRAY['chocolate', 'dark chocolate', 'chocolate bar', 'truffle']),

  ('staples.rice', ARRAY['rice', 'basmati', 'poha']),
  ('staples.millets', ARRAY['millet', 'ragi', 'jowar', 'bajra', 'kodo', 'foxtail', 'quinoa', 'amaranth', 'rajgira']),
  ('staples.flours', ARRAY['flour', 'atta', 'maida', 'besan', 'sooji', 'suji', 'rava', 'rice flour']),
  ('staples.pulses', ARRAY['dal', 'daal', 'lentil', 'rajma', 'chana', 'chickpea', 'moong', 'masoor', 'toor', 'urad', 'arhar', 'lobia']),
  ('staples.breakfast_cereals', ARRAY['oat', 'muesli', 'granola', 'cornflake', 'corn flake', 'daliya', 'dalia']),

  ('spices.spices', ARRAY['spice', 'masala', 'garam masala', 'saffron', 'kesar', 'turmeric', 'haldi', 'cumin', 'jeera', 'cardamom', 'elaichi', 'cinnamon', 'clove', 'black pepper', 'chilli powder', 'hing', 'asafoetida']),
  ('spices.pickles_sauces', ARRAY['pickle', 'achar', 'achaar', 'chutney', 'sauce', 'ketchup']),

  ('sweeteners', ARRAY['sweetener', 'stevia']),
  ('sweeteners.honey', ARRAY['honey']),
  ('sweeteners.jaggery', ARRAY['jaggery', 'gur']),
  ('sweeteners.sugar', ARRAY['sugar', 'khand', 'mishri']),

  ('beverages', ARRAY['beverage', 'drink']),
  ('beverages.drink_mixes', ARRAY['milk mix', 'health mix', 'health drink', 'drink mix', 'beverage mix', 'hot chocolate', 'malt drink', 'golden milk', 'latte mix', 'turmeric latte']),
  ('beverages.tea_coffee', ARRAY['tea', 'green tea', 'chai', 'kahwa', 'coffee', 'filter coffee']),
  ('beverages.ready_to_drink', ARRAY['juice', 'coconut water', 'kombucha', 'lemonade', 'iced tea', 'almond milk', 'oat milk', 'soy milk', 'buttermilk', 'lassi']),

  ('fats_oils.ghee', ARRAY['ghee']),
  ('fats_oils.oils', ARRAY['oil']),

  ('supplements', ARRAY['supplement']),
  ('supplements.protein_powder', ARRAY['protein powder', 'whey', 'whey protein', 'plant protein', 'pea protein', 'protein shake'])
) AS v(node_key, terms);

-- ── Reference portions ──────────────────────────────────────────────────────

CREATE TABLE food.portion_norm (
  node_key          text PRIMARY KEY REFERENCES food.taxonomy_node(key) ON DELETE CASCADE,
  reference_amount  numeric NOT NULL CHECK (reference_amount > 0),
  unit              text NOT NULL CHECK (unit IN ('g', 'ml')),
  household_measure text,
  plausible_max     numeric NOT NULL,
  authority         text NOT NULL CHECK (authority IN ('us_fda_racc')),
  source_ref        text NOT NULL,
  conversion        text,
  notes             text,
  CHECK (plausible_max >= reference_amount),
  CHECK ((household_measure IS NULL) = (conversion IS NULL))
);

COMMENT ON COLUMN food.portion_norm.plausible_max IS
  'KOI rule: twice the reference amount. A declared serving above it is not read as a realistic serving.';

INSERT INTO food.portion_norm (node_key, reference_amount, unit, household_measure, plausible_max, authority, source_ref, conversion, notes)
SELECT v.node_key, v.amount, v.unit, v.measure, v.amount * 2, 'us_fda_racc', '21 CFR 101.12(b), Table 2: ' || v.row_text, v.conversion, v.notes
FROM (VALUES
  ('snacks.biscuits_cookies', 30::numeric, 'g', NULL, 'Cookies: 30 g', NULL, NULL),
  ('snacks.chips_crisps', 30, 'g', NULL, 'Snacks (chips, pretzels, popcorn, extruded snacks, fruit and vegetable-based snacks, grain-based snack mixes): 30 g', NULL, NULL),
  ('snacks.namkeen', 30, 'g', NULL, 'Snacks (chips, pretzels, popcorn, extruded snacks, fruit and vegetable-based snacks, grain-based snack mixes): 30 g', NULL, NULL),
  ('snacks.puffs', 30, 'g', NULL, 'Snacks (chips, pretzels, popcorn, extruded snacks, fruit and vegetable-based snacks, grain-based snack mixes): 30 g', NULL, NULL),
  ('snacks.bars', 40, 'g', NULL, 'Grain-based bars with or without filling or coating: 40 g', NULL, NULL),
  ('nuts_seeds.nuts', 30, 'g', NULL, 'Nuts, seeds and mixtures, all types: 30 g', NULL, NULL),
  ('nuts_seeds.seeds', 30, 'g', NULL, 'Nuts, seeds and mixtures, all types: 30 g', NULL, NULL),
  ('nuts_seeds.mixes', 30, 'g', NULL, 'Nuts, seeds and mixtures, all types: 30 g', NULL, NULL),
  ('nuts_seeds.dried_fruit', 40, 'g', NULL, 'Dried fruits: 40 g', NULL, NULL),
  ('nuts_seeds.nut_butters', 32, 'g', '2 tbsp', 'Nut and seed butters, pastes, or creams: 2 tbsp', 'KOI: 2 tbsp of peanut butter weighs about 32 g.', NULL),
  ('sweets.indian_sweets', 30, 'g', NULL, 'All other candies: 30 g', NULL, 'Mithai has no category of its own in the table; candy is the nearest.'),
  ('sweets.chocolate', 30, 'g', NULL, 'All other candies: 30 g', NULL, NULL),
  ('staples.rice', 45, 'g', NULL, 'Grains, e.g., rice, barley, plain: 140 g prepared; 45 g dry', NULL, 'Dry weight, as sold.'),
  ('staples.millets', 45, 'g', NULL, 'Grains, e.g., rice, barley, plain: 140 g prepared; 45 g dry', NULL, 'Dry weight, as sold.'),
  ('staples.flours', 30, 'g', NULL, 'Flours or cornmeal: 30 g', NULL, NULL),
  ('staples.pulses', 35, 'g', NULL, 'Beans, plain or in sauce: 90 g for others prepared; 35 g dry', NULL, 'Dry weight, as sold.'),
  ('staples.breakfast_cereals', 40, 'g', NULL, 'Breakfast cereals (hot cereal type): 1 cup prepared; 40 g plain dry cereal; 55 g flavored, sweetened cereal', NULL, 'The plain figure, the smaller of the two.'),
  ('spices.spices', 0.5, 'g', NULL, 'Spices, herbs: 1/4 tsp or 0.5 g if not measurable by teaspoon', NULL, NULL),
  ('sweeteners.honey', 21, 'g', '1 tbsp', 'Honey, jams, jellies, fruit butter, molasses, fruit pastes, fruit chutneys: 1 tbsp', 'KOI: 1 tbsp of honey weighs about 21 g.', NULL),
  ('sweeteners.jaggery', 8, 'g', NULL, 'Sugar: 8 g', NULL, 'Jaggery is an unrefined sugar; the table has no separate row.'),
  ('sweeteners.sugar', 8, 'g', NULL, 'Sugar: 8 g', NULL, NULL),
  ('beverages.ready_to_drink', 240, 'ml', NULL, 'Juices, nectars, fruit drinks: 240 mL', NULL, NULL),
  ('fats_oils.ghee', 13, 'g', '1 tbsp', 'Butter, margarine, oil, shortening: 1 tbsp', 'KOI: 1 tbsp of ghee weighs about 13 g.', NULL),
  ('fats_oils.oils', 14, 'g', '1 tbsp', 'Butter, margarine, oil, shortening: 1 tbsp', 'KOI: 1 tbsp of oil weighs about 14 g.', NULL)
) AS v(node_key, amount, unit, measure, row_text, conversion, notes);

-- ── Where each SKU was placed ───────────────────────────────────────────────

CREATE TABLE food.sku_taxonomy (
  sku_id           uuid PRIMARY KEY REFERENCES public.skus(id) ON DELETE CASCADE,
  node_key         text NOT NULL REFERENCES food.taxonomy_node(key),
  matched_on       text NOT NULL CHECK (matched_on IN ('name', 'category_l2', 'category_l1')),
  term             text NOT NULL,
  taxonomy_version text NOT NULL,
  classified_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sku_taxonomy_node ON food.sku_taxonomy (node_key);

-- ── claims-v2: the protein floor in a realistic serving ─────────────────────

ALTER TABLE food.claim_rule DROP CONSTRAINT claim_rule_basis_check;
ALTER TABLE food.claim_rule ADD CONSTRAINT claim_rule_basis_check
  CHECK (basis IN ('per_100', 'per_100kcal', 'per_serving', 'per_realistic_serving'));

INSERT INTO food.claim_rule_set (rule_version, active, notes) VALUES
  ('claims-v2', false, 'claims-v1, with KOI''s per-serving protein floor judged on a realistic serving (Phase 2.3).');

INSERT INTO food.claim_rule (rule_version, claim_key, clause_group, nutrient, basis, form, comparator, threshold, authority, source_ref, notes)
SELECT 'claims-v2', claim_key, clause_group, nutrient,
  CASE WHEN basis = 'per_serving' THEN 'per_realistic_serving' ELSE basis END,
  form, comparator, threshold, authority, source_ref,
  CASE WHEN basis = 'per_serving'
    THEN 'In a realistic serving: the declared one, or the category''s reference amount (food.portion_norm) when the declared serving is above its plausible maximum. Never more than the declared serving.'
    ELSE notes END
FROM food.claim_rule
WHERE rule_version = 'claims-v1';

UPDATE food.claim_rule_set SET active = false WHERE rule_version = 'claims-v1';
UPDATE food.claim_rule_set SET active = true WHERE rule_version = 'claims-v2';

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE food.taxonomy_node ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.taxonomy_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.portion_norm ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.sku_taxonomy ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food.taxonomy_node, food.taxonomy_term, food.portion_norm, food.sku_taxonomy TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.taxonomy_node, food.taxonomy_term, food.portion_norm, food.sku_taxonomy TO service_role;

CREATE POLICY "Categories are public" ON food.taxonomy_node FOR SELECT USING (true);
CREATE POLICY "Categories are public" ON food.taxonomy_term FOR SELECT USING (true);
CREATE POLICY "Portions are public" ON food.portion_norm FOR SELECT USING (true);
CREATE POLICY "Categories are public" ON food.sku_taxonomy FOR SELECT USING (true);
