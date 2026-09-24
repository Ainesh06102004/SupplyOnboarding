-- ============================================================================
-- 00071_dairy_eggs_vegetable_shelves — the kitchen staples KOI had no shelf for.
--
-- The Plan page's week asks for milk, curd, paneer and eggs in eighteen dish
-- lines, and the category tree had nowhere to put any of them: a product
-- called "Malai Paneer" was placed nowhere, so the planner could not portion
-- it and the menu could not find it. This adds the shelves, their names, their
-- reference portions (21 CFR 101.12(b) Table 2, like every other shelf) and
-- their meal occasions, and fixes two recipe lines that pointed at the wrong
-- shelf.
--
-- Names are chosen so they cannot capture another shelf's products (the tree
-- places a product by the last known name in it; a form beats an ingredient):
--   * no bare "milk": "Dairy Milk" is chocolate and "Milk Bikis" a biscuit.
--     Only the kinds of milk a carton says (toned, full cream, skimmed...).
--   * "paneer" and "egg" are ingredients, so "Paneer Tikka Masala Mix" stays a
--     spice mix and an "Egg Mayonnaise" a sauce (mayonnaise is added as one).
--   * frozen vegetables by their frozen names, never "pea" or "corn" alone.
-- ============================================================================

INSERT INTO food.taxonomy_node (key, parent_key, label, off_categories, notes, meal_role, food_form, lunchbox_ok, cuisine, prep_minutes) VALUES
  ('dairy',            NULL,         'Milk, curd & paneer', '{en:dairies}', NULL, 'meal_base', NULL, NULL, NULL, NULL),
  ('dairy.milk',       'dairy',      'Milk',                '{en:milks}', 'Packaged milk: pouches, cartons and UHT.', 'drink', 'ready_to_eat', false, NULL, 0),
  ('dairy.curd',       'dairy',      'Curd & yogurt',       '{en:yogurts}', 'Dahi, set curd, yogurt, greek yogurt.', NULL, 'ready_to_eat', true, NULL, 0),
  ('dairy.paneer',     'dairy',      'Paneer',              '{en:paneer}', NULL, NULL, 'needs_cooking', false, NULL, 15),
  ('eggs',             NULL,         'Eggs',                '{en:eggs}', NULL, 'meal_base', 'needs_cooking', false, NULL, 10),
  ('vegetables',       NULL,         'Vegetables',          '{en:vegetables}', 'Packed vegetables only. Fresh produce is bought fresh and is not a KOI shelf.', 'meal_base', NULL, NULL, NULL, NULL),
  ('vegetables.frozen','vegetables', 'Frozen vegetables',   '{en:frozen-vegetables}', NULL, NULL, 'needs_cooking', false, NULL, 15);

INSERT INTO food.taxonomy_term (term, node_key, kind) VALUES
  ('toned milk',            'dairy.milk',   'form'),
  ('double toned milk',     'dairy.milk',   'form'),
  ('full cream milk',       'dairy.milk',   'form'),
  ('skimmed milk',          'dairy.milk',   'form'),
  ('skim milk',             'dairy.milk',   'form'),
  ('standardised milk',     'dairy.milk',   'form'),
  ('uht milk',              'dairy.milk',   'form'),
  ('cow milk',              'dairy.milk',   'form'),
  ('buffalo milk',          'dairy.milk',   'form'),
  ('a2 milk',               'dairy.milk',   'form'),
  ('curd',                  'dairy.curd',   'form'),
  ('dahi',                  'dairy.curd',   'form'),
  ('yogurt',                'dairy.curd',   'form'),
  ('yoghurt',               'dairy.curd',   'form'),
  ('greek yogurt',          'dairy.curd',   'form'),
  ('paneer',                'dairy.paneer', 'ingredient'),
  ('cottage cheese',        'dairy.paneer', 'ingredient'),
  ('egg',                   'eggs',         'ingredient'),
  ('mayonnaise',            'spices.pickles_sauces', 'form'),
  ('mayo',                  'spices.pickles_sauces', 'form'),
  ('frozen green pea',      'vegetables.frozen', 'form'),
  ('frozen pea',            'vegetables.frozen', 'form'),
  ('frozen mixed vegetable','vegetables.frozen', 'form'),
  ('frozen vegetable',      'vegetables.frozen', 'form'),
  ('frozen sweet corn',     'vegetables.frozen', 'form'),
  ('frozen corn',           'vegetables.frozen', 'form');

INSERT INTO food.portion_norm (node_key, reference_amount, unit, plausible_max, household_measure, conversion, authority, source_ref, notes) VALUES
  ('dairy.milk',        240, 'ml', 480, '1 cup', 'KOI: 1 cup is 240 ml.', 'us_fda_racc', '21 CFR 101.12(b), Table 2: Milk, milk-based drinks: 240 mL', NULL),
  ('dairy.curd',        170, 'g',  340, NULL, NULL, 'us_fda_racc', '21 CFR 101.12(b), Table 2: Yogurt: 170 g', NULL),
  ('dairy.paneer',       55, 'g',  110, NULL, NULL, 'us_fda_racc', '21 CFR 101.12(b), Table 2: Cheese used primarily as ingredients, e.g., dry cottage cheese, ricotta cheese: 55 g', 'Paneer is a fresh, unripened cheese cooked into a dish.'),
  ('eggs',               50, 'g',  100, '1 egg', 'KOI: one large egg is about 50 g without the shell.', 'us_fda_racc', '21 CFR 101.12(b), Table 2: Eggs (except egg substitutes), fresh: 50 g', NULL),
  ('vegetables.frozen',  85, 'g',  170, NULL, NULL, 'us_fda_racc', '21 CFR 101.12(b), Table 2: All other vegetables without sauce, fresh, canned or frozen: 85 g for fresh or frozen', NULL);

INSERT INTO food.category_occasion (node_key, occasion) VALUES
  ('dairy.milk',   'breakfast'),
  ('dairy.milk',   'late_night'),
  ('dairy.curd',   'lunch'),
  ('dairy.curd',   'dinner'),
  ('dairy.curd',   'snacks'),
  ('dairy.paneer', 'lunch'),
  ('dairy.paneer', 'dinner'),
  ('dairy.paneer', 'post_workout'),
  ('eggs',         'breakfast'),
  ('eggs',         'post_workout'),
  ('vegetables',   'lunch'),
  ('vegetables',   'dinner');

-- ── Recipe lines ────────────────────────────────────────────────────────────
-- Poha is on the rice shelf ("Rice & poha"), not breakfast cereals, and ragi
-- is bought as a flour: the menu looked on the wrong shelf and said "buy it
-- fresh" for both.
UPDATE food.recipe_line SET category_key = 'staples.rice'   WHERE dish_key = 'kanda_poha'     AND position = 1;
UPDATE food.recipe_line SET category_key = 'staples.flours' WHERE dish_key = 'ragi_porridge'  AND position = 1;

-- Dairy and eggs now have shelves, so the week can buy them. Each "Milk" line
-- names the shelf the dish actually uses: curd for curd rice, paneer for palak
-- paneer, milk for chai.
UPDATE food.recipe_line r SET supply = 'shelf', category_key = v.category
FROM (VALUES
  ('chaas', 1, 'dairy.curd'), ('curd_rice', 2, 'dairy.curd'), ('muesli_curd', 2, 'dairy.curd'),
  ('filter_coffee', 2, 'dairy.milk'), ('haldi_doodh', 1, 'dairy.milk'), ('masala_chai', 2, 'dairy.milk'),
  ('oats_porridge', 2, 'dairy.milk'), ('ragi_porridge', 2, 'dairy.milk'),
  ('palak_paneer', 2, 'dairy.paneer'), ('paneer_bhurji', 1, 'dairy.paneer'),
  ('egg_bhurji', 1, 'eggs'), ('egg_curry', 1, 'eggs'), ('masala_omelette', 1, 'eggs')
) AS v(dish, pos, category)
WHERE r.dish_key = v.dish AND r.position = v.pos;
