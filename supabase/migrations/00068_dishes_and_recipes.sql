-- ============================================================================
-- 00068_dishes_and_recipes — Phase 2 of the Plan page: dishes.
--
-- The planner buys packs of products; the founder's design shows a week of
-- dishes. This is the layer between them: a dish is a typical home recipe,
-- written as the ingredients it is made of, each tied to the ingredient graph
-- (food.ingredients_master) so its allergens and diet flags are DERIVED, never
-- typed. A recipe line says where the ingredient comes from:
--
--   shelf    a kind of product KOI stocks (category_key), so the basket can
--            supply it — `any_of_shelf` when any product there will do (rice),
--            otherwise the product's name has to name the ingredient (moong)
--   fresh    bought fresh: vegetables, milk and curd, eggs, meat, herbs, fruit
--   kitchen  what a kitchen keeps: salt, oil, whole spices
--
-- There are no quantities, on purpose. A recipe's grams are not KOI's to
-- invent, and they are not needed: the amounts the Plan page shows are the
-- planner's own per-person shares of the basket, spread over the meals that
-- use them. `is_blend` marks a line whose contents vary (garam masala,
-- compounded hing): a dish with one cannot be verified free of anything.
--
-- These are editorial: "a typical recipe". Households cook differently, and
-- the page says so wherever it shows what a dish contains.
--
-- Also here: the ingredients the dishes need that the graph lacked, and the
-- pulse flag chickpea never got (00056 named canonical names that did not
-- exist, so besan and chana passed a fasting diet).
-- ============================================================================

-- ── Ingredients the dishes need ──────────────────────────────────────────────
INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT v.canonical_name, v.aliases, 'whole_food', 'safe', false, v.notes
FROM (VALUES
  ('Tomato', '["tomato","tomatoes","tamatar","tomato puree","tomato paste"]'::jsonb, 'A vegetable.'),
  ('Spinach', '["spinach","palak"]'::jsonb, 'A leafy vegetable.'),
  ('Green Peas', '["green peas","peas","matar","mutter"]'::jsonb, 'A legume: excluded on a fasting day.'),
  ('Cauliflower', '["cauliflower","gobi","phool gobi"]'::jsonb, 'A vegetable.'),
  ('Okra', '["okra","bhindi","ladyfinger","lady finger"]'::jsonb, 'A vegetable.'),
  ('Brinjal', '["brinjal","baingan","eggplant","aubergine"]'::jsonb, 'A vegetable.'),
  ('Bottle Gourd', '["bottle gourd","lauki","doodhi","ghiya"]'::jsonb, 'A vegetable.'),
  ('Coriander Leaves', '["coriander leaves","coriander","dhania","cilantro","hara dhania"]'::jsonb, 'A herb.'),
  ('Curry Leaves', '["curry leaves","kadi patta","kadhi patta"]'::jsonb, 'A herb.'),
  ('Cumin', '["cumin","jeera","cumin seeds","cumin powder"]'::jsonb, 'A spice.'),
  ('Asafoetida', '["asafoetida","hing","heeng"]'::jsonb, 'Sold compounded, usually with wheat or rice flour: it can carry gluten.'),
  ('Garam Masala', '["garam masala"]'::jsonb, 'A blend. What is in it varies by brand and kitchen.'),
  ('Flattened Rice', '["flattened rice","poha","pohe","aval","chivda","chiwda","beaten rice"]'::jsonb, 'Rice, flattened.'),
  ('Kidney Beans', '["kidney beans","rajma","red kidney beans"]'::jsonb, 'A pulse.'),
  ('Banana', '["banana","kela"]'::jsonb, 'A fruit.'),
  ('Apple', '["apple","seb"]'::jsonb, 'A fruit.'),
  ('Lemon', '["lemon","lime","nimbu","lemon juice"]'::jsonb, 'A fruit.')
) AS v(canonical_name, aliases, notes)
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master m WHERE m.canonical_name = v.canonical_name);

SELECT food.sync_ingredient_aliases();

-- The fasting flags 00056 meant to set. Asafoetida is deliberately NOT given
-- 00056's allium flag: allium now also backs the "no onion-garlic" avoid
-- (00067), and hing is what a no-onion-garlic kitchen cooks with instead.
INSERT INTO food.ingredient_flag (ingredient_id, flag, rule, source)
SELECT m.id, v.flag, 'fasting', 'koi'
FROM (VALUES
  ('Chickpea', 'pulse'),
  ('Green Peas', 'pulse'),
  ('Kidney Beans', 'pulse'),
  ('Flattened Rice', 'grain')
) AS v(canonical, flag)
JOIN food.ingredients_master m ON m.canonical_name = v.canonical
ON CONFLICT (ingredient_id, flag) DO NOTHING;

INSERT INTO food.ingredient_allergen (ingredient_id, allergen_key, relation, confidence, notes, source_ref)
SELECT m.id, 'gluten', 'may_contain', 0.7, 'Compounded hing is usually cut with wheat flour.', 'Common trade practice; check the pack'
FROM food.ingredients_master m WHERE m.canonical_name = 'Asafoetida'
ON CONFLICT DO NOTHING;

-- ── Dishes ─────────────────────────────────────────────────────────────────
CREATE TABLE food.dish (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  name         text NOT NULL CHECK (btrim(name) <> ''),
  -- What it is in a meal. Lunch and dinner are a base with a main, or one pot.
  kind         text NOT NULL CHECK (kind IN ('breakfast', 'base', 'main', 'one_pot', 'snack', 'drink')),
  slots        text[] NOT NULL CHECK (slots <@ ARRAY['breakfast', 'lunch', 'snack', 'dinner', 'drinks']::text[] AND cardinality(slots) > 0),
  cuisine      text CHECK (cuisine IN ('indian', 'global')),
  prep_minutes smallint CHECK (prep_minutes IS NULL OR prep_minutes BETWEEN 1 AND 240),
  source       text NOT NULL DEFAULT 'koi_editorial' CHECK (source IN ('koi_editorial')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE food.recipe_line (
  dish_key      text NOT NULL REFERENCES food.dish(key) ON DELETE CASCADE,
  position      smallint NOT NULL CHECK (position > 0),
  ingredient_id uuid NOT NULL REFERENCES food.ingredients_master(id),
  supply        text NOT NULL CHECK (supply IN ('shelf', 'fresh', 'kitchen')),
  category_key  text REFERENCES food.taxonomy_node(key),
  any_of_shelf  boolean NOT NULL DEFAULT false,
  optional      boolean NOT NULL DEFAULT false,
  is_blend      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (dish_key, position),
  CONSTRAINT recipe_line_shelf_names_a_shelf CHECK ((supply = 'shelf') = (category_key IS NOT NULL))
);

COMMENT ON TABLE food.dish IS 'Typical home recipes for the Plan page week (Phase 2). Editorial: allergens and flags are derived from recipe_line through the ingredient graph, never stored.';
COMMENT ON TABLE food.recipe_line IS 'What a dish is made of, and where each ingredient comes from (a KOI shelf, fresh, or the kitchen). No quantities: amounts come from the planner.';

-- food is written by service_role; nothing here is read by a shopper directly
-- (web/scripts/buildDishes.mjs compiles it into lib/food/dishData.js).
ALTER TABLE food.dish ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.recipe_line ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON food.dish, food.recipe_line FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.dish, food.recipe_line TO service_role;

INSERT INTO food.dish (key, name, kind, slots, cuisine, prep_minutes) VALUES
  ('kanda_poha',        'Kanda poha',               'breakfast', ARRAY['breakfast'], 'indian', 20),
  ('rava_upma',         'Rava upma',                'breakfast', ARRAY['breakfast'], 'indian', 20),
  ('oats_porridge',     'Oats porridge',            'breakfast', ARRAY['breakfast'], 'global', 10),
  ('muesli_curd',       'Muesli with curd',         'breakfast', ARRAY['breakfast'], 'global', 5),
  ('besan_chilla',      'Besan chilla',             'breakfast', ARRAY['breakfast', 'dinner'], 'indian', 20),
  ('moong_chilla',      'Moong dal chilla',         'breakfast', ARRAY['breakfast'], 'indian', 25),
  ('aloo_paratha',      'Aloo paratha',             'breakfast', ARRAY['breakfast'], 'indian', 35),
  ('ragi_porridge',     'Ragi porridge',            'breakfast', ARRAY['breakfast'], 'indian', 15),
  ('egg_bhurji',        'Egg bhurji',               'breakfast', ARRAY['breakfast', 'dinner'], 'indian', 15),
  ('masala_omelette',   'Masala omelette',          'breakfast', ARRAY['breakfast'], 'indian', 10),
  ('sprouts_chaat',     'Moong sprouts chaat',      'breakfast', ARRAY['breakfast', 'snack'], 'indian', 10),
  ('steamed_rice',      'Steamed rice',             'base',      ARRAY['lunch', 'dinner'], NULL, 20),
  ('jeera_rice',        'Jeera rice',               'base',      ARRAY['lunch', 'dinner'], 'indian', 25),
  ('phulka',            'Phulka',                   'base',      ARRAY['lunch', 'dinner'], 'indian', 20),
  ('millet_roti',       'Millet roti',              'base',      ARRAY['lunch', 'dinner'], 'indian', 25),
  ('dal_tadka',         'Dal tadka',                'main',      ARRAY['lunch', 'dinner'], 'indian', 35),
  ('jain_moong_dal',    'Moong dal (no onion-garlic)', 'main',   ARRAY['lunch', 'dinner'], 'indian', 30),
  ('chana_masala',      'Chana masala',             'main',      ARRAY['lunch', 'dinner'], 'indian', 40),
  ('rajma',             'Rajma',                    'main',      ARRAY['lunch', 'dinner'], 'indian', 45),
  ('palak_paneer',      'Palak paneer',             'main',      ARRAY['lunch', 'dinner'], 'indian', 35),
  ('paneer_bhurji',     'Paneer bhurji',            'main',      ARRAY['lunch', 'dinner'], 'indian', 20),
  ('mixed_veg',         'Mixed vegetable sabzi',    'main',      ARRAY['lunch', 'dinner'], 'indian', 30),
  ('bhindi_masala',     'Bhindi masala',            'main',      ARRAY['lunch', 'dinner'], 'indian', 25),
  ('aloo_gobi',         'Aloo gobi',                'main',      ARRAY['lunch', 'dinner'], 'indian', 30),
  ('baingan_bharta',    'Baingan bharta',           'main',      ARRAY['lunch', 'dinner'], 'indian', 35),
  ('lauki_sabzi',       'Lauki sabzi',              'main',      ARRAY['lunch', 'dinner'], 'indian', 25),
  ('chicken_curry',     'Chicken curry',            'main',      ARRAY['lunch', 'dinner'], 'indian', 45),
  ('egg_curry',         'Egg curry',                'main',      ARRAY['lunch', 'dinner'], 'indian', 30),
  ('fish_curry',        'Fish curry',               'main',      ARRAY['lunch', 'dinner'], 'indian', 35),
  ('soya_curry',        'Soya chunk curry',         'main',      ARRAY['lunch', 'dinner'], 'indian', 30),
  ('moong_khichdi',     'Moong dal khichdi',        'one_pot',   ARRAY['lunch', 'dinner'], 'indian', 30),
  ('curd_rice',         'Curd rice',                'one_pot',   ARRAY['lunch', 'dinner'], 'indian', 15),
  ('veg_pulao',         'Vegetable pulao',          'one_pot',   ARRAY['lunch', 'dinner'], 'indian', 35),
  ('roasted_chana',     'Roasted chana',            'snack',     ARRAY['snack'], 'indian', 1),
  ('roasted_makhana',   'Roasted makhana',          'snack',     ARRAY['snack'], 'indian', 10),
  ('handful_nuts',      'A handful of nuts',        'snack',     ARRAY['snack'], NULL, 1),
  ('dates_and_nuts',    'Dates with nuts',          'snack',     ARRAY['snack'], NULL, 1),
  ('fruit_bowl',        'Fruit bowl',               'snack',     ARRAY['snack', 'breakfast'], NULL, 5),
  ('masala_chai',       'Masala chai',              'drink',     ARRAY['drinks'], 'indian', 10),
  ('filter_coffee',     'Filter coffee',            'drink',     ARRAY['drinks'], 'indian', 10),
  ('chaas',             'Chaas',                    'drink',     ARRAY['drinks'], 'indian', 5),
  ('nimbu_pani',        'Nimbu pani',               'drink',     ARRAY['drinks'], 'indian', 5),
  ('haldi_doodh',       'Haldi doodh',              'drink',     ARRAY['drinks'], 'indian', 10);

-- (dish, position, ingredient, supply, category, any_of_shelf, optional, is_blend)
INSERT INTO food.recipe_line (dish_key, position, ingredient_id, supply, category_key, any_of_shelf, optional, is_blend)
SELECT v.dish, v.pos, m.id, v.supply, v.category, v.any_of, v.opt, v.blend
FROM (VALUES
  ('kanda_poha', 1, 'Flattened Rice', 'shelf', 'staples.breakfast_cereals', false, false, false),
  ('kanda_poha', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('kanda_poha', 3, 'Mustard', 'kitchen', NULL, false, false, false),
  ('kanda_poha', 4, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('kanda_poha', 5, 'Curry Leaves', 'fresh', NULL, false, false, false),
  ('kanda_poha', 6, 'Chilli', 'fresh', NULL, false, false, false),
  ('kanda_poha', 7, 'Peanut', 'kitchen', NULL, false, true, false),
  ('kanda_poha', 8, 'Lemon', 'fresh', NULL, false, true, false),
  ('kanda_poha', 9, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('kanda_poha', 10, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('rava_upma', 1, 'Wheat', 'shelf', 'staples.flours', false, false, false),
  ('rava_upma', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('rava_upma', 3, 'Mustard', 'kitchen', NULL, false, false, false),
  ('rava_upma', 4, 'Curry Leaves', 'fresh', NULL, false, false, false),
  ('rava_upma', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('rava_upma', 6, 'Chilli', 'fresh', NULL, false, false, false),
  ('rava_upma', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('rava_upma', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('oats_porridge', 1, 'Oats', 'shelf', 'staples.breakfast_cereals', false, false, false),
  ('oats_porridge', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('oats_porridge', 3, 'Banana', 'fresh', NULL, false, true, false),
  ('oats_porridge', 4, 'Honey', 'shelf', 'sweeteners.honey', true, true, false),

  ('muesli_curd', 1, 'Oats', 'shelf', 'staples.breakfast_cereals', true, false, false),
  ('muesli_curd', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('muesli_curd', 3, 'Banana', 'fresh', NULL, false, true, false),

  ('besan_chilla', 1, 'Chickpea', 'shelf', 'staples.flours', false, false, false),
  ('besan_chilla', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('besan_chilla', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('besan_chilla', 4, 'Coriander Leaves', 'fresh', NULL, false, false, false),
  ('besan_chilla', 5, 'Chilli', 'fresh', NULL, false, false, false),
  ('besan_chilla', 6, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('besan_chilla', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('besan_chilla', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('moong_chilla', 1, 'Lentils', 'shelf', 'staples.pulses', false, false, false),
  ('moong_chilla', 2, 'Ginger', 'fresh', NULL, false, false, false),
  ('moong_chilla', 3, 'Chilli', 'fresh', NULL, false, false, false),
  ('moong_chilla', 4, 'Coriander Leaves', 'fresh', NULL, false, false, false),
  ('moong_chilla', 5, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('moong_chilla', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('aloo_paratha', 1, 'Whole Wheat Flour', 'shelf', 'staples.flours', false, false, false),
  ('aloo_paratha', 2, 'Potato', 'fresh', NULL, false, false, false),
  ('aloo_paratha', 3, 'Chilli', 'fresh', NULL, false, false, false),
  ('aloo_paratha', 4, 'Coriander Leaves', 'fresh', NULL, false, false, false),
  ('aloo_paratha', 5, 'Ghee', 'shelf', 'fats_oils.ghee', true, false, false),
  ('aloo_paratha', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('ragi_porridge', 1, 'Ragi', 'shelf', 'staples.millets', false, false, false),
  ('ragi_porridge', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('ragi_porridge', 3, 'Jaggery', 'shelf', 'sweeteners.jaggery', true, true, false),

  ('egg_bhurji', 1, 'Egg', 'fresh', NULL, false, false, false),
  ('egg_bhurji', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('egg_bhurji', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('egg_bhurji', 4, 'Chilli', 'fresh', NULL, false, false, false),
  ('egg_bhurji', 5, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('egg_bhurji', 6, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('egg_bhurji', 7, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('masala_omelette', 1, 'Egg', 'fresh', NULL, false, false, false),
  ('masala_omelette', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('masala_omelette', 3, 'Chilli', 'fresh', NULL, false, false, false),
  ('masala_omelette', 4, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('masala_omelette', 5, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('sprouts_chaat', 1, 'Lentils', 'shelf', 'staples.pulses', false, false, false),
  ('sprouts_chaat', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('sprouts_chaat', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('sprouts_chaat', 4, 'Lemon', 'fresh', NULL, false, false, false),
  ('sprouts_chaat', 5, 'Chilli', 'fresh', NULL, false, false, false),
  ('sprouts_chaat', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('steamed_rice', 1, 'Polished Rice', 'shelf', 'staples.rice', true, false, false),
  ('jeera_rice', 1, 'Polished Rice', 'shelf', 'staples.rice', true, false, false),
  ('jeera_rice', 2, 'Cumin', 'kitchen', NULL, false, false, false),
  ('jeera_rice', 3, 'Ghee', 'shelf', 'fats_oils.ghee', true, false, false),
  ('jeera_rice', 4, 'Iodised Salt', 'kitchen', NULL, false, false, false),
  ('phulka', 1, 'Whole Wheat Flour', 'shelf', 'staples.flours', false, false, false),
  ('millet_roti', 1, 'Jowar', 'shelf', 'staples.millets', true, false, false),
  ('millet_roti', 2, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('dal_tadka', 1, 'Lentils', 'shelf', 'staples.pulses', false, false, false),
  ('dal_tadka', 2, 'Ghee', 'shelf', 'fats_oils.ghee', true, false, false),
  ('dal_tadka', 3, 'Cumin', 'kitchen', NULL, false, false, false),
  ('dal_tadka', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('dal_tadka', 5, 'Onion', 'fresh', NULL, false, false, false),
  ('dal_tadka', 6, 'Tomato', 'fresh', NULL, false, false, false),
  ('dal_tadka', 7, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('dal_tadka', 8, 'Chilli', 'fresh', NULL, false, false, false),
  ('dal_tadka', 9, 'Asafoetida', 'kitchen', NULL, false, false, true),
  ('dal_tadka', 10, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('jain_moong_dal', 1, 'Lentils', 'shelf', 'staples.pulses', false, false, false),
  ('jain_moong_dal', 2, 'Ghee', 'shelf', 'fats_oils.ghee', true, false, false),
  ('jain_moong_dal', 3, 'Cumin', 'kitchen', NULL, false, false, false),
  ('jain_moong_dal', 4, 'Tomato', 'fresh', NULL, false, false, false),
  ('jain_moong_dal', 5, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('jain_moong_dal', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('chana_masala', 1, 'Chickpea', 'shelf', 'staples.pulses', false, false, false),
  ('chana_masala', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('chana_masala', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('chana_masala', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('chana_masala', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('chana_masala', 6, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('chana_masala', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('chana_masala', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('rajma', 1, 'Kidney Beans', 'shelf', 'staples.pulses', false, false, false),
  ('rajma', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('rajma', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('rajma', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('rajma', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('rajma', 6, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('rajma', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('rajma', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('palak_paneer', 1, 'Spinach', 'fresh', NULL, false, false, false),
  ('palak_paneer', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('palak_paneer', 3, 'Onion', 'fresh', NULL, false, false, false),
  ('palak_paneer', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('palak_paneer', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('palak_paneer', 6, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('palak_paneer', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('palak_paneer', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('paneer_bhurji', 1, 'Milk', 'fresh', NULL, false, false, false),
  ('paneer_bhurji', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('paneer_bhurji', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('paneer_bhurji', 4, 'Chilli', 'fresh', NULL, false, false, false),
  ('paneer_bhurji', 5, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('paneer_bhurji', 6, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('paneer_bhurji', 7, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('mixed_veg', 1, 'Potato', 'fresh', NULL, false, false, false),
  ('mixed_veg', 2, 'Cauliflower', 'fresh', NULL, false, false, false),
  ('mixed_veg', 3, 'Green Peas', 'fresh', NULL, false, false, false),
  ('mixed_veg', 4, 'Carrot', 'fresh', NULL, false, false, false),
  ('mixed_veg', 5, 'Onion', 'fresh', NULL, false, false, false),
  ('mixed_veg', 6, 'Tomato', 'fresh', NULL, false, false, false),
  ('mixed_veg', 7, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('mixed_veg', 8, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('mixed_veg', 9, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('bhindi_masala', 1, 'Okra', 'fresh', NULL, false, false, false),
  ('bhindi_masala', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('bhindi_masala', 3, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('bhindi_masala', 4, 'Chilli', 'fresh', NULL, false, false, false),
  ('bhindi_masala', 5, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('bhindi_masala', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('aloo_gobi', 1, 'Potato', 'fresh', NULL, false, false, false),
  ('aloo_gobi', 2, 'Cauliflower', 'fresh', NULL, false, false, false),
  ('aloo_gobi', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('aloo_gobi', 4, 'Cumin', 'kitchen', NULL, false, false, false),
  ('aloo_gobi', 5, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('aloo_gobi', 6, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('aloo_gobi', 7, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('baingan_bharta', 1, 'Brinjal', 'fresh', NULL, false, false, false),
  ('baingan_bharta', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('baingan_bharta', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('baingan_bharta', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('baingan_bharta', 5, 'Chilli', 'fresh', NULL, false, false, false),
  ('baingan_bharta', 6, 'Mustard Oil', 'kitchen', NULL, false, false, false),
  ('baingan_bharta', 7, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('lauki_sabzi', 1, 'Bottle Gourd', 'fresh', NULL, false, false, false),
  ('lauki_sabzi', 2, 'Tomato', 'fresh', NULL, false, false, false),
  ('lauki_sabzi', 3, 'Cumin', 'kitchen', NULL, false, false, false),
  ('lauki_sabzi', 4, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('lauki_sabzi', 5, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('lauki_sabzi', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('chicken_curry', 1, 'Chicken', 'fresh', NULL, false, false, false),
  ('chicken_curry', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('chicken_curry', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('chicken_curry', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('chicken_curry', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('chicken_curry', 6, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('chicken_curry', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('chicken_curry', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('egg_curry', 1, 'Egg', 'fresh', NULL, false, false, false),
  ('egg_curry', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('egg_curry', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('egg_curry', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('egg_curry', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('egg_curry', 6, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('egg_curry', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('egg_curry', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('fish_curry', 1, 'Fish', 'fresh', NULL, false, false, false),
  ('fish_curry', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('fish_curry', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('fish_curry', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('fish_curry', 5, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('fish_curry', 6, 'Chilli', 'fresh', NULL, false, false, false),
  ('fish_curry', 7, 'Mustard Oil', 'kitchen', NULL, false, false, false),
  ('fish_curry', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('soya_curry', 1, 'Soya', 'shelf', 'staples.pulses', false, false, false),
  ('soya_curry', 2, 'Onion', 'fresh', NULL, false, false, false),
  ('soya_curry', 3, 'Tomato', 'fresh', NULL, false, false, false),
  ('soya_curry', 4, 'Garlic', 'fresh', NULL, false, false, false),
  ('soya_curry', 5, 'Ginger', 'fresh', NULL, false, false, false),
  ('soya_curry', 6, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('soya_curry', 7, 'Sunflower Oil', 'kitchen', NULL, false, false, false),
  ('soya_curry', 8, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('moong_khichdi', 1, 'Polished Rice', 'shelf', 'staples.rice', true, false, false),
  ('moong_khichdi', 2, 'Lentils', 'shelf', 'staples.pulses', false, false, false),
  ('moong_khichdi', 3, 'Ghee', 'shelf', 'fats_oils.ghee', true, false, false),
  ('moong_khichdi', 4, 'Cumin', 'kitchen', NULL, false, false, false),
  ('moong_khichdi', 5, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('moong_khichdi', 6, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('curd_rice', 1, 'Polished Rice', 'shelf', 'staples.rice', true, false, false),
  ('curd_rice', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('curd_rice', 3, 'Mustard', 'kitchen', NULL, false, false, false),
  ('curd_rice', 4, 'Curry Leaves', 'fresh', NULL, false, false, false),
  ('curd_rice', 5, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('veg_pulao', 1, 'Polished Rice', 'shelf', 'staples.rice', true, false, false),
  ('veg_pulao', 2, 'Green Peas', 'fresh', NULL, false, false, false),
  ('veg_pulao', 3, 'Carrot', 'fresh', NULL, false, false, false),
  ('veg_pulao', 4, 'Onion', 'fresh', NULL, false, false, false),
  ('veg_pulao', 5, 'Garam Masala', 'kitchen', NULL, false, false, true),
  ('veg_pulao', 6, 'Ghee', 'shelf', 'fats_oils.ghee', true, false, false),
  ('veg_pulao', 7, 'Iodised Salt', 'kitchen', NULL, false, false, false),

  ('roasted_chana', 1, 'Chickpea', 'shelf', 'staples.pulses', false, false, false),
  ('roasted_makhana', 1, 'Makhana', 'shelf', 'snacks.puffs', false, false, false),
  ('roasted_makhana', 2, 'Ghee', 'shelf', 'fats_oils.ghee', true, true, false),
  ('handful_nuts', 1, 'Tree Nuts', 'shelf', 'nuts_seeds.nuts', true, false, false),
  ('dates_and_nuts', 1, 'Dates', 'shelf', 'nuts_seeds.dried_fruit', false, false, false),
  ('dates_and_nuts', 2, 'Tree Nuts', 'shelf', 'nuts_seeds.nuts', true, false, false),
  ('fruit_bowl', 1, 'Banana', 'fresh', NULL, false, false, false),
  ('fruit_bowl', 2, 'Apple', 'fresh', NULL, false, false, false),

  ('masala_chai', 1, 'Tea', 'shelf', 'beverages.tea_coffee', false, false, false),
  ('masala_chai', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('masala_chai', 3, 'Ginger', 'fresh', NULL, false, false, false),
  ('masala_chai', 4, 'Refined Sugar', 'shelf', 'sweeteners.sugar', true, true, false),
  ('filter_coffee', 1, 'Coffee', 'shelf', 'beverages.tea_coffee', false, false, false),
  ('filter_coffee', 2, 'Milk', 'fresh', NULL, false, false, false),
  ('filter_coffee', 3, 'Refined Sugar', 'shelf', 'sweeteners.sugar', true, true, false),
  ('chaas', 1, 'Milk', 'fresh', NULL, false, false, false),
  ('chaas', 2, 'Cumin', 'kitchen', NULL, false, false, false),
  ('chaas', 3, 'Iodised Salt', 'kitchen', NULL, false, false, false),
  ('nimbu_pani', 1, 'Lemon', 'fresh', NULL, false, false, false),
  ('nimbu_pani', 2, 'Refined Sugar', 'shelf', 'sweeteners.sugar', true, true, false),
  ('nimbu_pani', 3, 'Iodised Salt', 'kitchen', NULL, false, false, false),
  ('haldi_doodh', 1, 'Milk', 'fresh', NULL, false, false, false),
  ('haldi_doodh', 2, 'Turmeric', 'kitchen', NULL, false, false, false),
  ('haldi_doodh', 3, 'Jaggery', 'shelf', 'sweeteners.jaggery', true, true, false)
) AS v(dish, pos, ingredient, supply, category, any_of, opt, blend)
JOIN food.ingredients_master m ON m.canonical_name = v.ingredient;

-- Every line must have found its ingredient: a silent drop would publish a
-- dish without, say, its peanuts.
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing FROM food.dish d
  WHERE NOT EXISTS (SELECT 1 FROM food.recipe_line r WHERE r.dish_key = d.key);
  IF missing > 0 THEN RAISE EXCEPTION '% dishes have no recipe lines', missing; END IF;
  IF (SELECT count(*) FROM food.recipe_line) <> 230 THEN
    RAISE EXCEPTION 'expected 230 recipe lines, found %', (SELECT count(*) FROM food.recipe_line);
  END IF;
END $$;
