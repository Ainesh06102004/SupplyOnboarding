-- ============================================================================
-- 00074_fasting_meals — lunch and dinner for a fasting (vrat) day.
--
-- After 00073 a fasting member had breakfasts, snacks and drinks, and not one
-- lunch or dinner: every other main is cooked with common salt, a grain, a
-- pulse, or onion and garlic, which a fasting day keeps out. These are the
-- vrat meals most kitchens make: rock salt, potato and pumpkin, and the
-- grains a fast allows (kuttu, rajgira, samak). Samak, barnyard millet, joins
-- the graph as a millet and, like kuttu and rajgira, not as a "grain".
-- ============================================================================

INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT 'Barnyard Millet', '["barnyard millet","samak","sama","samvat","samak rice","sama ke chawal","vrat ke chawal","moraiyo"]'::jsonb, 'whole_food', 'safe', false,
  'A millet eaten on fasting days.'
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master WHERE canonical_name = 'Barnyard Millet');

SELECT food.sync_ingredient_aliases();

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule, source)
SELECT m.id, v.flag, 'tier2', 'koi'
FROM (VALUES ('millet'), ('whole_grain')) AS v(flag)
CROSS JOIN food.ingredients_master m
WHERE m.canonical_name = 'Barnyard Millet'
ON CONFLICT (ingredient_id, flag) DO NOTHING;

INSERT INTO food.taxonomy_term (term, node_key, kind) VALUES
  ('samak', 'staples.millets', 'ingredient'),
  ('barnyard millet', 'staples.millets', 'ingredient')
ON CONFLICT DO NOTHING;

INSERT INTO food.dish (key, name, kind, slots, cuisine, prep_minutes) VALUES
  ('vrat_aloo', 'Vrat wale aloo', 'main', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('vrat_kaddu', 'Vrat ka kaddu', 'main', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('arbi_fry', 'Arbi fry', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('kuttu_roti', 'Kuttu roti', 'base', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('rajgira_roti', 'Rajgira roti', 'base', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('samak_khichdi', 'Samak khichdi', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 25);

-- Same line codes as 00073: f fresh, k kitchen, else the shelf; * any product
-- on it; ? optional.
INSERT INTO food.recipe_line (dish_key, position, ingredient_id, supply, category_key, any_of_shelf, optional, is_blend)
SELECT d.dish, l.ord::smallint, m.id,
  CASE rtrim(l.v->>1, '*?') WHEN 'f' THEN 'fresh' WHEN 'k' THEN 'kitchen' ELSE 'shelf' END,
  CASE WHEN rtrim(l.v->>1, '*?') IN ('f', 'k') THEN NULL ELSE rtrim(l.v->>1, '*?') END,
  position('*' IN l.v->>1) > 0,
  position('?' IN l.v->>1) > 0,
  false
FROM (VALUES
  ('vrat_aloo', '[["Potato","f"],["Cumin","k"],["Chilli","f"],["Coriander Leaves","f?"],["Ghee","fats_oils.ghee*"],["Rock Salt","k"],["Lemon","f?"]]'),
  ('vrat_kaddu', '[["Pumpkin","f"],["Cumin","k"],["Chilli","f"],["Ginger","f?"],["Ghee","fats_oils.ghee*"],["Rock Salt","k"]]'),
  ('arbi_fry', '[["Colocasia","f"],["Carom","k"],["Chilli","f"],["Ghee","fats_oils.ghee*"],["Rock Salt","k"]]'),
  ('kuttu_roti', '[["Buckwheat","staples.flours"],["Potato","f?"],["Rock Salt","k"]]'),
  ('rajgira_roti', '[["Amaranth","staples.millets"],["Potato","f?"],["Rock Salt","k"]]'),
  ('samak_khichdi', '[["Barnyard Millet","staples.millets"],["Potato","f"],["Peanut","k"],["Cumin","k"],["Chilli","f"],["Ghee","fats_oils.ghee*"],["Rock Salt","k"]]')
) AS d(dish, lines)
CROSS JOIN LATERAL jsonb_array_elements(d.lines::jsonb) WITH ORDINALITY AS l(v, ord)
JOIN food.ingredients_master m ON m.canonical_name = l.v->>0;

DO $$
DECLARE found int;
BEGIN
  SELECT count(*) INTO found FROM food.recipe_line r JOIN food.dish d ON d.key = r.dish_key WHERE d.created_at = now();
  IF found <> 31 THEN RAISE EXCEPTION 'expected 31 new recipe lines, found %', found; END IF;
END $$;
