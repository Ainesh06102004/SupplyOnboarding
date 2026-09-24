-- ============================================================================
-- 00076_fungi_and_mushroom_dishes — a Jain kitchen keeps out mushrooms too.
--
-- Jainism excludes fungi as well as root vegetables, and the graph had no way
-- to say so: a mushroom would have been served to a Jain household as a plain
-- vegetable. 00073 left mushroom dishes out for that reason. `fungi` is now a
-- flag (the Jain diet excludes it, lib/recommendation/config.js), Mushroom
-- carries it, and three mushroom dishes join the week.
-- ============================================================================

ALTER TABLE food.ingredient_flag DROP CONSTRAINT ingredient_flag_flag_check;
ALTER TABLE food.ingredient_flag ADD CONSTRAINT ingredient_flag_flag_check CHECK (flag = ANY (ARRAY[
  'artificial_colour', 'preservatives', 'artificial_sweetener', 'artificial_flavour', 'meat', 'red_meat',
  'honey', 'caffeine', 'spicy', 'palm_oil', 'root_veg', 'grain', 'pulse', 'common_salt', 'allium',
  'sweetened_sugar', 'sweetened_jaggery', 'sweetened_fruit', 'millet', 'whole_grain', 'fungi'
]));

INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT 'Mushroom', '["mushroom","mushrooms","khumb","khumbi","button mushroom","oyster mushroom","shiitake"]'::jsonb, 'whole_food', 'safe', false,
  'A fungus: a Jain kitchen excludes it.'
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master WHERE canonical_name = 'Mushroom');

SELECT food.sync_ingredient_aliases();

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule, source)
SELECT id, 'fungi', 'A fungus; a Jain diet excludes it.', 'koi_editorial'
FROM food.ingredients_master WHERE canonical_name = 'Mushroom'
ON CONFLICT (ingredient_id, flag) DO NOTHING;

INSERT INTO food.dish (key, name, kind, slots, cuisine, prep_minutes) VALUES
  ('mushroom_matar', 'Mushroom matar', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('mushroom_pepper_fry', 'Mushroom pepper fry', 'main', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('mushroom_omelette', 'Mushroom omelette', 'breakfast', ARRAY['breakfast'], NULL, 12);

-- Line codes as in 00073: f fresh, k kitchen, else the shelf; * any product on it; ? optional.
INSERT INTO food.recipe_line (dish_key, position, ingredient_id, supply, category_key, any_of_shelf, optional, is_blend)
SELECT d.dish, l.ord::smallint, m.id,
  CASE rtrim(l.v->>1, '*?') WHEN 'f' THEN 'fresh' WHEN 'k' THEN 'kitchen' ELSE 'shelf' END,
  CASE WHEN rtrim(l.v->>1, '*?') IN ('f', 'k') THEN NULL ELSE rtrim(l.v->>1, '*?') END,
  position('*' IN l.v->>1) > 0,
  position('?' IN l.v->>1) > 0,
  l.v->>0 IN ('Garam Masala')
FROM (VALUES
  ('mushroom_matar', '[["Mushroom","f"],["Green Peas","f"],["Onion","f"],["Tomato","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('mushroom_pepper_fry', '[["Mushroom","f"],["Capsicum","f"],["Onion","f"],["Garlic","f"],["Black Pepper","k"],["Curry Leaves","f?"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('mushroom_omelette', '[["Egg","eggs.hen_eggs"],["Mushroom","f"],["Onion","f?"],["Black Pepper","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]')
) AS d(dish, lines)
CROSS JOIN LATERAL jsonb_array_elements(d.lines::jsonb) WITH ORDINALITY AS l(v, ord)
JOIN food.ingredients_master m ON m.canonical_name = l.v->>0;

DO $$
DECLARE found int;
BEGIN
  SELECT count(*) INTO found FROM food.recipe_line r JOIN food.dish d ON d.key = r.dish_key WHERE d.created_at = now();
  IF found <> 23 THEN RAISE EXCEPTION 'expected 23 new recipe lines, found %', found; END IF;
END $$;
