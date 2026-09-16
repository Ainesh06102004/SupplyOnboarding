-- ============================================================================
-- KOI — Meal occasions per category, and the last keyword flags as graph facts
--
-- Phase 2.4.
--
-- MEALS. Whether a product suits breakfast or a post-workout snack came from
-- MEAL_MATCH in web/src/lib/recommendation/config.js: category strings plus
-- substrings of the product text ("bar", "nut", "energy"). It now comes from
-- the category tree:
--
--   food.taxonomy_node.meal_role  what a category is in a meal: snack, sweet,
--                                 meal_base, cooking, drink, spread, supplement.
--                                 Set on aisles; a category inherits its aisle's.
--   food.category_occasion        the occasions (the storefront's MEALS keys) a
--                                 category serves. A category with none of its
--                                 own serves its aisle's.
--
-- FLAGS. CONTAINS_KEYWORDS still matched substrings for meat, honey, caffeine,
-- spicy, palm oil and root vegetables. They become facts on ingredients
-- (food.ingredient_flag), with the ingredients they need added, and "spicy",
-- which describes a product rather than an ingredient, gets name-level terms
-- (food.attribute_term). "red_meat" is split from "meat": the Red Meat avoid
-- key used to remove chicken.
-- ============================================================================

-- ── Meal roles and occasions ────────────────────────────────────────────────

ALTER TABLE food.taxonomy_node
  ADD COLUMN meal_role text CHECK (meal_role IN ('snack', 'sweet', 'meal_base', 'cooking', 'drink', 'spread', 'supplement'));

UPDATE food.taxonomy_node n SET meal_role = v.role
FROM (VALUES
  ('snacks', 'snack'), ('nuts_seeds', 'snack'), ('sweets', 'sweet'), ('staples', 'meal_base'),
  ('spices', 'cooking'), ('sweeteners', 'cooking'), ('beverages', 'drink'), ('fats_oils', 'cooking'),
  ('supplements', 'supplement'), ('nuts_seeds.nut_butters', 'spread')
) AS v(key, role)
WHERE n.key = v.key;

CREATE TABLE food.category_occasion (
  node_key text NOT NULL REFERENCES food.taxonomy_node(key) ON DELETE CASCADE,
  occasion text NOT NULL CHECK (occasion IN ('breakfast', 'lunch', 'dinner', 'snacks', 'pre_workout', 'post_workout', 'late_night', 'office_snacks')),
  source   text NOT NULL DEFAULT 'koi_editorial',
  PRIMARY KEY (node_key, occasion)
);

INSERT INTO food.category_occasion (node_key, occasion)
SELECT v.node_key, unnest(v.occasions)
FROM (VALUES
  ('snacks', ARRAY['snacks', 'office_snacks']),
  ('snacks.biscuits_cookies', ARRAY['breakfast', 'snacks', 'office_snacks', 'late_night']),
  ('snacks.chips_crisps', ARRAY['snacks', 'office_snacks']),
  ('snacks.namkeen', ARRAY['snacks', 'office_snacks']),
  ('snacks.puffs', ARRAY['snacks', 'office_snacks']),
  ('snacks.bars', ARRAY['snacks', 'office_snacks', 'pre_workout', 'post_workout']),
  ('snacks.cakes', ARRAY['snacks', 'late_night']),
  ('snacks.assortments', ARRAY['snacks', 'office_snacks']),
  ('nuts_seeds', ARRAY['snacks', 'office_snacks']),
  ('nuts_seeds.nuts', ARRAY['snacks', 'office_snacks', 'late_night', 'post_workout']),
  ('nuts_seeds.seeds', ARRAY['breakfast']),
  ('nuts_seeds.dried_fruit', ARRAY['breakfast', 'snacks', 'pre_workout']),
  ('nuts_seeds.mixes', ARRAY['snacks', 'office_snacks', 'post_workout']),
  ('nuts_seeds.nut_butters', ARRAY['breakfast', 'post_workout']),
  ('sweets', ARRAY['snacks', 'late_night']),
  ('staples', ARRAY['lunch', 'dinner']),
  ('staples.millets', ARRAY['breakfast', 'lunch', 'dinner']),
  ('staples.breakfast_cereals', ARRAY['breakfast']),
  ('spices', ARRAY['lunch', 'dinner']),
  ('sweeteners.honey', ARRAY['breakfast']),
  ('beverages.drink_mixes', ARRAY['breakfast', 'late_night']),
  ('beverages.tea_coffee', ARRAY['breakfast', 'pre_workout']),
  ('beverages.ready_to_drink', ARRAY['snacks']),
  ('fats_oils', ARRAY['lunch', 'dinner']),
  ('supplements.protein_powder', ARRAY['breakfast', 'post_workout'])
) AS v(node_key, occasions);

-- ── Ingredients the flags need ──────────────────────────────────────────────

INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
VALUES
  ('Chicken', '["chicken"]', 'whole_food', 'safe', false, 'Meat.'),
  ('Mutton', '["mutton","goat meat"]', 'whole_food', 'safe', false, 'Red meat.'),
  ('Beef', '["beef"]', 'whole_food', 'safe', false, 'Red meat.'),
  ('Pork', '["pork","bacon","ham"]', 'whole_food', 'safe', false, 'Red meat.'),
  ('Lamb', '["lamb"]', 'whole_food', 'safe', false, 'Red meat.'),
  ('Meat', '["meat","meat extract"]', 'whole_food', 'safe', false, 'Meat of an unnamed animal.'),
  ('Gelatin', '["gelatin","gelatine"]', 'thickener', 'caution', false, 'Made from animal skin and bone: not vegetarian.'),
  ('Chilli', '["chilli","chili","red chilli","green chilli","chilli powder","red chilli powder","chilli flakes","mirchi","lal mirch","kashmiri chilli","cayenne"]', 'whole_food', 'safe', false, 'Makes a product spicy.'),
  ('Coffee', '["coffee","instant coffee","coffee powder","espresso","coffee extract"]', 'whole_food', 'safe', false, 'Contains caffeine.'),
  ('Tea', '["tea","tea leaves","tea powder","green tea","black tea","tea extract","green tea extract"]', 'whole_food', 'safe', false, 'Contains caffeine.'),
  ('Caffeine', '["caffeine","caffeine powder","caffeine anhydrous"]', 'stimulant', 'caution', false, 'Added caffeine.'),
  ('Onion', '["onion","onion powder","dehydrated onion","pyaz","pyaaz","kanda"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Garlic', '["garlic","garlic powder","lahsun","lehsun"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Potato', '["potato","potato powder","potato flakes","dehydrated potato","aloo"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Carrot', '["carrot","gajar"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Beetroot', '["beetroot","chukandar"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Radish', '["radish","mooli"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Turnip', '["turnip","shalgam"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Sweet Potato', '["sweet potato","shakarkandi"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Yam', '["yam","suran","jimikand"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Ginger', '["ginger","dry ginger","ginger powder","adrak","sonth"]', 'whole_food', 'safe', false, 'A rhizome. Some Jains accept it dried; a hard diet rule errs toward excluding.'),
  ('Shallot', '["shallot"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.'),
  ('Colocasia', '["colocasia","arbi","taro"]', 'whole_food', 'safe', false, 'A root vegetable: excluded by a Jain diet.')
ON CONFLICT (canonical_name) DO NOTHING;

SELECT food.sync_ingredient_aliases();

-- ── Flags ───────────────────────────────────────────────────────────────────

ALTER TABLE food.ingredient_flag DROP CONSTRAINT ingredient_flag_flag_check;
ALTER TABLE food.ingredient_flag ADD CONSTRAINT ingredient_flag_flag_check CHECK (flag IN (
  'artificial_colour', 'preservatives', 'artificial_sweetener', 'artificial_flavour',
  'meat', 'red_meat', 'honey', 'caffeine', 'spicy', 'palm_oil', 'root_veg'));

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule)
SELECT m.id, v.flag, v.rule
FROM (VALUES
  ('meat', 'Meat, or made from an animal''s body.', ARRAY['Chicken', 'Mutton', 'Beef', 'Pork', 'Lamb', 'Meat', 'Gelatin']),
  ('red_meat', 'Red meat.', ARRAY['Mutton', 'Beef', 'Pork', 'Lamb']),
  ('honey', 'Honey, which vegan and Jain diets exclude.', ARRAY['Honey']),
  ('caffeine', 'Contains caffeine.', ARRAY['Coffee', 'Tea', 'Caffeine']),
  ('spicy', 'Makes a product spicy.', ARRAY['Chilli']),
  ('palm_oil', 'Palm oil or palmolein.', ARRAY['Palm Oil']),
  ('root_veg', 'Grows underground; a Jain diet excludes it.', ARRAY['Onion', 'Garlic', 'Potato', 'Carrot', 'Beetroot', 'Radish', 'Turnip', 'Sweet Potato', 'Yam', 'Ginger', 'Shallot', 'Colocasia', 'Potato Starch'])
) AS v(flag, rule, names)
CROSS JOIN LATERAL unnest(v.names) AS n(name)
JOIN food.ingredients_master m ON m.canonical_name = n.name;

DO $$
DECLARE
  v_counts jsonb := (SELECT jsonb_object_agg(flag, n) FROM (SELECT flag, count(*) n FROM food.ingredient_flag GROUP BY flag) x);
BEGIN
  IF v_counts <> '{"artificial_colour": 11, "preservatives": 16, "artificial_sweetener": 5, "artificial_flavour": 1,
                   "meat": 7, "red_meat": 4, "honey": 1, "caffeine": 3, "spicy": 1, "palm_oil": 1, "root_veg": 13}'::jsonb THEN
    RAISE EXCEPTION 'unexpected flag counts: %', v_counts;
  END IF;
END;
$$;

-- "Spicy" describes a product as often as an ingredient.
CREATE TABLE food.attribute_term (
  term   text PRIMARY KEY CHECK (term = lower(btrim(term)) AND term <> ''),
  flag   text NOT NULL CHECK (flag IN ('spicy')),
  source text NOT NULL DEFAULT 'koi_editorial'
);

INSERT INTO food.attribute_term (term, flag)
SELECT unnest(ARRAY['spicy', 'masala', 'peri peri', 'chatpata', 'teekha', 'mixture', 'chivda', 'bhujia']), 'spicy';

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE food.category_occasion ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.attribute_term ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food.category_occasion, food.attribute_term TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.category_occasion, food.attribute_term TO service_role;

CREATE POLICY "Categories are public" ON food.category_occasion FOR SELECT USING (true);
CREATE POLICY "Food flags are public" ON food.attribute_term FOR SELECT USING (true);
