-- ============================================================================
-- 00073_more_dishes — a wider week: 94 more dishes and the ingredients they need.
--
-- 00068 gave the Plan page 43 dishes, mostly North Indian. This adds South,
-- West and East Indian dishes, fasting (vrat) dishes, more egg, chicken,
-- mutton, fish and prawn dishes, vegan protein (tofu, soya, lobia), and a few
-- global ones, so a week can vary and a household with rules still has a menu.
-- Same rules as 00068: typical home recipes, no quantities, every line tied to
-- the ingredient graph so allergens and diet flags are derived, never typed.
--
-- New ingredients carry what they are: soy sauce is brewed with wheat, sambar
-- and rasam powders carry dal and (through hing) may carry gluten, spring
-- onion is an onion for a Jain or no onion-garlic kitchen, sweet corn and
-- puffed rice are grains on a fasting day. No mushroom dish: nothing in the
-- graph can mark a fungus for a Jain kitchen yet.
--
-- A shelf line whose shelf KOI does not stock (sago, noodles) shows as "KOI
-- doesn't stock this yet", as a missing staple does today.
-- ============================================================================

-- ── Ingredients ─────────────────────────────────────────────────────────────
INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT v.canonical_name, v.aliases, v.category, 'safe', false, v.notes
FROM (VALUES
  ('Cabbage', '["cabbage","patta gobi","band gobi"]'::jsonb, 'whole_food', 'A vegetable.'),
  ('Capsicum', '["capsicum","bell pepper","shimla mirch","green capsicum"]'::jsonb, 'whole_food', 'A vegetable.'),
  ('French Beans', '["french beans","green beans","string beans","phali"]'::jsonb, 'whole_food', 'A vegetable.'),
  ('Pumpkin', '["pumpkin","kaddu","red pumpkin","yellow pumpkin","kashiphal"]'::jsonb, 'whole_food', 'A vegetable.'),
  ('Bitter Gourd', '["bitter gourd","karela","bitter melon"]'::jsonb, 'whole_food', 'A vegetable.'),
  ('Cucumber', '["cucumber","kheera","kakdi"]'::jsonb, 'whole_food', 'A vegetable.'),
  ('Sweet Corn', '["sweet corn","corn kernels","bhutta","american corn","makai dana"]'::jsonb, 'whole_food', 'Maize, eaten as a vegetable: a grain on a fasting day.'),
  ('Fenugreek', '["fenugreek","methi","kasuri methi","methi leaves","fenugreek leaves","methi dana","fenugreek seeds"]'::jsonb, 'whole_food', 'Leaves, dried leaves and seeds.'),
  ('Mustard Greens', '["mustard greens","sarson ka saag","sarson saag"]'::jsonb, 'whole_food', 'The leaves of the mustard plant.'),
  ('Mint', '["mint","pudina","mint leaves"]'::jsonb, 'whole_food', 'A herb.'),
  ('Tamarind', '["tamarind","imli","tamarind pulp"]'::jsonb, 'whole_food', 'A fruit, used sour.'),
  ('Coconut', '["coconut","grated coconut","desiccated coconut","nariyal","copra","coconut powder"]'::jsonb, 'whole_food', 'The flesh of the coconut.'),
  ('Coconut Water', '["coconut water","nariyal pani","tender coconut water"]'::jsonb, 'whole_food', 'The water of a tender coconut.'),
  ('Mango', '["mango","aam","amchur","dry mango powder","alphonso","raw mango","kairi"]'::jsonb, 'whole_food', 'A fruit, ripe or raw; amchur is dried raw mango.'),
  ('Papaya', '["papaya","papita"]'::jsonb, 'whole_food', 'A fruit.'),
  ('Pomegranate', '["pomegranate","anar","anardana"]'::jsonb, 'whole_food', 'A fruit.'),
  ('Orange', '["orange","santra","mosambi","sweet lime"]'::jsonb, 'whole_food', 'A citrus fruit.'),
  ('Guava', '["guava","amrood"]'::jsonb, 'whole_food', 'A fruit.'),
  ('Raisins', '["raisins","raisin","kishmish","sultanas","munakka"]'::jsonb, 'whole_food', 'Dried grapes: fruit sugar.'),
  ('Spring Onion', '["spring onion","spring onions","scallion","green onion","hara pyaz"]'::jsonb, 'whole_food', 'An onion: kept from a Jain or no onion-garlic kitchen.'),
  ('Black Pepper', '["black pepper","kali mirch","pepper powder","peppercorns"]'::jsonb, 'whole_food', 'A spice.'),
  ('Cardamom', '["cardamom","elaichi","green cardamom"]'::jsonb, 'whole_food', 'A spice.'),
  ('Cinnamon', '["cinnamon","dalchini"]'::jsonb, 'whole_food', 'A spice.'),
  ('Cloves', '["cloves","clove","laung"]'::jsonb, 'whole_food', 'A spice.'),
  ('Bay Leaf', '["bay leaf","bay leaves","tej patta"]'::jsonb, 'whole_food', 'A spice.'),
  ('Fennel', '["fennel","saunf","fennel seeds"]'::jsonb, 'whole_food', 'A spice.'),
  ('Carom', '["carom","ajwain","carom seeds"]'::jsonb, 'whole_food', 'A spice.'),
  ('Coriander Seeds', '["coriander seeds","coriander powder","dhania powder","dhaniya powder"]'::jsonb, 'whole_food', 'A spice: the seed, not the leaf.'),
  ('Sambar Powder', '["sambar powder","sambar masala"]'::jsonb, 'whole_food', 'A blend, usually with roasted toor and chana dal and hing. What is in it varies.'),
  ('Rasam Powder', '["rasam powder"]'::jsonb, 'whole_food', 'A blend, usually with toor dal, pepper, cumin and hing. What is in it varies.'),
  ('Chaat Masala', '["chaat masala"]'::jsonb, 'whole_food', 'A blend: amchur, black salt, cumin and often hing. What is in it varies.'),
  ('Pav Bhaji Masala', '["pav bhaji masala"]'::jsonb, 'whole_food', 'A blend. What is in it varies by brand.'),
  ('Black Salt', '["black salt","kala namak","sanchal"]'::jsonb, 'whole_food', 'A salt.'),
  ('Sago', '["sago","sabudana","tapioca pearls","sabudana pearls"]'::jsonb, 'refined_carb', 'Tapioca starch pearls: eaten on fasting days.'),
  ('Puffed Rice', '["puffed rice","murmura","kurmura","mamra","muri"]'::jsonb, 'refined_carb', 'Rice, puffed.'),
  ('Maize', '["maize","makki","makka","maize flour","makki atta","cornmeal"]'::jsonb, 'whole_food', 'Maize as a grain or flour.'),
  ('Black-eyed Peas', '["black eyed peas","black-eyed peas","lobia","chawli","rongi"]'::jsonb, 'whole_food', 'A pulse.'),
  ('Soy Sauce', '["soy sauce","soya sauce"]'::jsonb, 'whole_food', 'Brewed from soybeans and, usually, wheat.')
) AS v(canonical_name, aliases, category, notes)
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master m WHERE m.canonical_name = v.canonical_name);

-- Words existing ingredients also answer to.
UPDATE food.ingredients_master SET aliases = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(aliases || '["dalia","daliya","broken wheat","lapsi"]'::jsonb) x), updated_at = now() WHERE canonical_name = 'Wheat';
UPDATE food.ingredients_master SET aliases = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(aliases || '["noodles","hakka noodles","pav","pav bread"]'::jsonb) x), updated_at = now() WHERE canonical_name = 'Refined Wheat Flour';
UPDATE food.ingredients_master SET aliases = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(aliases || '["kala chana","black chana","chole","sattu","roasted gram","bengal gram"]'::jsonb) x), updated_at = now() WHERE canonical_name = 'Chickpea';
UPDATE food.ingredients_master SET aliases = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(aliases || '["lassi","shrikhand"]'::jsonb) x), updated_at = now() WHERE canonical_name = 'Milk';

SELECT food.sync_ingredient_aliases();

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule, source)
SELECT m.id, v.flag, v.rule, v.source
FROM (VALUES
  ('Sweet Corn', 'grain', 'fasting', 'koi'),
  ('Raisins', 'sweetened_fruit', 'tier2', 'koi'),
  ('Spring Onion', 'allium', 'An onion: a Jain or no onion-garlic kitchen excludes it.', 'koi_editorial'),
  ('Spring Onion', 'root_veg', 'Grows underground; a Jain diet excludes it.', 'koi_editorial'),
  ('Sambar Powder', 'pulse', 'fasting', 'koi'),
  ('Rasam Powder', 'pulse', 'fasting', 'koi'),
  ('Puffed Rice', 'grain', 'fasting', 'koi'),
  ('Maize', 'grain', 'fasting', 'koi'),
  ('Maize', 'whole_grain', 'tier2', 'koi'),
  ('Black-eyed Peas', 'pulse', 'fasting', 'koi')
) AS v(canonical, flag, rule, source)
JOIN food.ingredients_master m ON m.canonical_name = v.canonical
ON CONFLICT (ingredient_id, flag) DO NOTHING;

INSERT INTO food.ingredient_allergen (ingredient_id, allergen_key, relation, confidence, notes, source_ref)
SELECT m.id, v.allergen, v.relation, v.confidence, v.notes, 'KOI editorial; check the pack'
FROM (VALUES
  ('Mustard Greens', 'mustard', 'may_contain', 0.5, 'The leaves of the plant whose seeds are the allergen; kept from a mustard allergy to be safe.'),
  ('Sambar Powder', 'gluten', 'may_contain', 0.5, 'Most blends carry hing, which is usually cut with wheat flour.'),
  ('Rasam Powder', 'gluten', 'may_contain', 0.5, 'Most blends carry hing, which is usually cut with wheat flour.'),
  ('Chaat Masala', 'gluten', 'may_contain', 0.4, 'Often carries hing, which is usually cut with wheat flour.'),
  ('Soy Sauce', 'soy', 'contains', 1, 'Made from soybeans.'),
  ('Soy Sauce', 'gluten', 'contains', 0.9, 'Brewed with wheat unless the bottle says tamari or gluten-free.')
) AS v(canonical, allergen, relation, confidence, notes)
JOIN food.ingredients_master m ON m.canonical_name = v.canonical
ON CONFLICT DO NOTHING;

-- ── Dishes ─────────────────────────────────────────────────────────────────
INSERT INTO food.dish (key, name, kind, slots, cuisine, prep_minutes) VALUES
  ('idli', 'Idli', 'breakfast', ARRAY['breakfast'], 'indian', 25),
  ('masala_dosa', 'Masala dosa', 'breakfast', ARRAY['breakfast'], 'indian', 40),
  ('uttapam', 'Onion uttapam', 'breakfast', ARRAY['breakfast'], 'indian', 25),
  ('pesarattu', 'Pesarattu', 'breakfast', ARRAY['breakfast'], 'indian', 25),
  ('medu_vada', 'Medu vada', 'breakfast', ARRAY['breakfast', 'snack'], 'indian', 40),
  ('ragi_dosa', 'Ragi dosa', 'breakfast', ARRAY['breakfast'], 'indian', 20),
  ('ven_pongal', 'Ven pongal', 'breakfast', ARRAY['breakfast'], 'indian', 30),
  ('thepla', 'Methi thepla', 'breakfast', ARRAY['breakfast', 'snack'], 'indian', 30),
  ('gobi_paratha', 'Gobi paratha', 'breakfast', ARRAY['breakfast'], 'indian', 35),
  ('paneer_paratha', 'Paneer paratha', 'breakfast', ARRAY['breakfast'], 'indian', 35),
  ('veg_dalia', 'Vegetable dalia', 'breakfast', ARRAY['breakfast', 'dinner'], 'indian', 25),
  ('masala_oats', 'Masala oats', 'breakfast', ARRAY['breakfast'], 'indian', 15),
  ('overnight_oats', 'Overnight oats', 'breakfast', ARRAY['breakfast'], 'global', 5),
  ('curd_fruit_bowl', 'Curd bowl with fruit and nuts', 'breakfast', ARRAY['breakfast', 'snack'], 'global', 5),
  ('sabudana_khichdi', 'Sabudana khichdi', 'breakfast', ARRAY['breakfast', 'snack'], 'indian', 25),
  ('rajgira_porridge', 'Rajgira porridge', 'breakfast', ARRAY['breakfast'], 'indian', 15),
  ('kuttu_chilla', 'Kuttu chilla', 'breakfast', ARRAY['breakfast'], 'indian', 20),
  ('boiled_eggs', 'Boiled eggs', 'breakfast', ARRAY['breakfast', 'snack'], NULL, 12),
  ('bread_omelette', 'Bread omelette', 'breakfast', ARRAY['breakfast'], 'indian', 10),
  ('peanut_butter_toast', 'Peanut butter toast', 'breakfast', ARRAY['breakfast', 'snack'], 'global', 5),
  ('misal_pav', 'Misal pav', 'breakfast', ARRAY['breakfast'], 'indian', 40),
  ('brown_rice', 'Brown rice', 'base', ARRAY['lunch', 'dinner'], NULL, 35),
  ('plain_paratha', 'Plain paratha', 'base', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('bajra_roti', 'Bajra roti', 'base', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('makki_roti', 'Makki ki roti', 'base', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('missi_roti', 'Missi roti', 'base', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('ragi_mudde', 'Ragi mudde', 'base', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('sambar', 'Sambar', 'main', ARRAY['lunch', 'dinner'], 'indian', 40),
  ('rasam', 'Tomato rasam', 'main', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('kadhi', 'Kadhi', 'main', ARRAY['lunch', 'dinner'], 'indian', 35),
  ('dal_makhani', 'Dal makhani', 'main', ARRAY['lunch', 'dinner'], 'indian', 60),
  ('masoor_dal', 'Masoor dal', 'main', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('dal_palak', 'Dal palak', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('chana_dal_fry', 'Chana dal fry', 'main', ARRAY['lunch', 'dinner'], 'indian', 40),
  ('kala_chana_curry', 'Kala chana curry', 'main', ARRAY['lunch', 'dinner'], 'indian', 45),
  ('lobia_curry', 'Lobia curry', 'main', ARRAY['lunch', 'dinner'], 'indian', 45),
  ('soya_keema', 'Soya keema', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('tofu_bhurji', 'Tofu bhurji', 'main', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('gatte_ki_sabzi', 'Gatte ki sabzi', 'main', ARRAY['lunch', 'dinner'], 'indian', 50),
  ('matar_paneer', 'Matar paneer', 'main', ARRAY['lunch', 'dinner'], 'indian', 35),
  ('kadai_paneer', 'Kadai paneer', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('paneer_butter_masala', 'Paneer butter masala', 'main', ARRAY['lunch', 'dinner'], 'indian', 40),
  ('aloo_matar', 'Aloo matar', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('jeera_aloo', 'Jeera aloo', 'main', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('methi_aloo', 'Aloo methi', 'main', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('dum_aloo', 'Dum aloo', 'main', ARRAY['lunch', 'dinner'], 'indian', 40),
  ('cabbage_poriyal', 'Cabbage poriyal', 'main', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('beans_poriyal', 'Beans poriyal', 'main', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('avial', 'Avial', 'main', ARRAY['lunch', 'dinner'], 'indian', 35),
  ('sarson_ka_saag', 'Sarson ka saag', 'main', ARRAY['lunch', 'dinner'], 'indian', 50),
  ('kaddu_sabzi', 'Khatta meetha kaddu', 'main', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('karela_sabzi', 'Karela sabzi', 'main', ARRAY['lunch', 'dinner'], 'indian', 30),
  ('veg_korma', 'Vegetable korma', 'main', ARRAY['lunch', 'dinner'], 'indian', 40),
  ('butter_chicken', 'Butter chicken', 'main', ARRAY['lunch', 'dinner'], 'indian', 50),
  ('tandoori_chicken', 'Tandoori chicken', 'main', ARRAY['lunch', 'dinner'], 'indian', 45),
  ('chicken_stew', 'Kerala chicken stew', 'main', ARRAY['lunch', 'dinner'], 'indian', 45),
  ('grilled_chicken_salad', 'Grilled chicken salad', 'main', ARRAY['lunch', 'dinner'], 'global', 25),
  ('mutton_curry', 'Mutton curry', 'main', ARRAY['lunch', 'dinner'], 'indian', 90),
  ('keema_matar', 'Keema matar', 'main', ARRAY['lunch', 'dinner'], 'indian', 45),
  ('prawn_curry', 'Prawn curry', 'main', ARRAY['lunch', 'dinner'], 'indian', 35),
  ('fish_fry', 'Fish fry', 'main', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('tofu_stir_fry', 'Tofu stir-fry', 'main', ARRAY['lunch', 'dinner'], 'global', 20),
  ('lemon_rice', 'Lemon rice', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('tomato_rice', 'Tomato rice', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 25),
  ('coconut_rice', 'Coconut rice', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 20),
  ('veg_biryani', 'Vegetable biryani', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 60),
  ('bisi_bele_bath', 'Bisi bele bath', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 50),
  ('veg_khichdi', 'Vegetable khichdi', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 35),
  ('quinoa_pulao', 'Quinoa pulao', 'one_pot', ARRAY['lunch', 'dinner'], 'global', 25),
  ('pav_bhaji', 'Pav bhaji', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 40),
  ('chicken_biryani', 'Chicken biryani', 'one_pot', ARRAY['lunch', 'dinner'], 'indian', 75),
  ('egg_fried_rice', 'Egg fried rice', 'one_pot', ARRAY['lunch', 'dinner'], 'global', 20),
  ('veg_fried_rice', 'Vegetable fried rice', 'one_pot', ARRAY['lunch', 'dinner'], 'global', 25),
  ('hakka_noodles', 'Veg hakka noodles', 'one_pot', ARRAY['lunch', 'dinner'], 'global', 25),
  ('bhel_puri', 'Bhel puri', 'snack', ARRAY['snack'], 'indian', 10),
  ('sundal', 'Chana sundal', 'snack', ARRAY['snack'], 'indian', 15),
  ('dhokla', 'Khaman dhokla', 'snack', ARRAY['snack', 'breakfast'], 'indian', 30),
  ('chana_salad', 'Chana salad', 'snack', ARRAY['snack'], 'indian', 15),
  ('paneer_tikka', 'Paneer tikka', 'snack', ARRAY['snack'], 'indian', 30),
  ('fruit_chaat', 'Fruit chaat', 'snack', ARRAY['snack'], 'indian', 10),
  ('masala_peanuts', 'Peanut chaat', 'snack', ARRAY['snack'], 'indian', 10),
  ('corn_chaat', 'Corn chaat', 'snack', ARRAY['snack'], 'indian', 10),
  ('sweet_potato_chaat', 'Shakarkandi chaat', 'snack', ARRAY['snack'], 'indian', 25),
  ('banana_peanut_butter', 'Banana with peanut butter', 'snack', ARRAY['snack'], 'global', 2),
  ('hummus', 'Hummus with cucumber', 'snack', ARRAY['snack'], 'global', 15),
  ('sweet_lassi', 'Sweet lassi', 'drink', ARRAY['drinks'], 'indian', 5),
  ('banana_smoothie', 'Banana smoothie', 'drink', ARRAY['drinks'], 'global', 5),
  ('badam_milk', 'Badam milk', 'drink', ARRAY['drinks'], 'indian', 10),
  ('cold_coffee', 'Cold coffee', 'drink', ARRAY['drinks'], 'global', 5),
  ('green_tea', 'Green tea', 'drink', ARRAY['drinks'], NULL, 3),
  ('coconut_water', 'Coconut water', 'drink', ARRAY['drinks'], NULL, 1),
  ('jaljeera', 'Jaljeera', 'drink', ARRAY['drinks'], 'indian', 5),
  ('sattu_sharbat', 'Sattu sharbat', 'drink', ARRAY['drinks'], 'indian', 5),
  ('aam_panna', 'Aam panna', 'drink', ARRAY['drinks'], 'indian', 20);

-- Each dish's lines, in order: [ingredient, code]. code is f (fresh), k
-- (kitchen) or the shelf's category key; a trailing * means any product on
-- that shelf will do, ? that the line is optional. Blends are marked by name.
INSERT INTO food.recipe_line (dish_key, position, ingredient_id, supply, category_key, any_of_shelf, optional, is_blend)
SELECT d.dish, l.ord::smallint, m.id,
  CASE rtrim(l.v->>1, '*?') WHEN 'f' THEN 'fresh' WHEN 'k' THEN 'kitchen' ELSE 'shelf' END,
  CASE WHEN rtrim(l.v->>1, '*?') IN ('f', 'k') THEN NULL ELSE rtrim(l.v->>1, '*?') END,
  position('*' IN l.v->>1) > 0,
  position('?' IN l.v->>1) > 0,
  l.v->>0 IN ('Garam Masala', 'Asafoetida', 'Sambar Powder', 'Rasam Powder', 'Chaat Masala', 'Pav Bhaji Masala')
FROM (VALUES
  ('idli', '[["Polished Rice","staples.rice*"],["Lentils","staples.pulses"],["Fenugreek","k"],["Iodised Salt","k"]]'),
  ('masala_dosa', '[["Polished Rice","staples.rice*"],["Lentils","staples.pulses"],["Fenugreek","k"],["Potato","f"],["Onion","f"],["Mustard","k"],["Curry Leaves","f"],["Turmeric","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('uttapam', '[["Polished Rice","staples.rice*"],["Lentils","staples.pulses"],["Onion","f"],["Tomato","f"],["Chilli","f"],["Coriander Leaves","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('pesarattu', '[["Lentils","staples.pulses"],["Ginger","f"],["Chilli","f"],["Onion","f?"],["Cumin","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('medu_vada', '[["Lentils","staples.pulses"],["Chilli","f"],["Curry Leaves","f"],["Black Pepper","k"],["Ginger","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('ragi_dosa', '[["Ragi","staples.flours"],["Rice Flour","staples.flours"],["Onion","f"],["Chilli","f"],["Cumin","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('ven_pongal', '[["Polished Rice","staples.rice*"],["Lentils","staples.pulses"],["Black Pepper","k"],["Cumin","k"],["Ginger","f"],["Curry Leaves","f"],["Tree Nuts","nuts_seeds.nuts*?"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('thepla', '[["Whole Wheat Flour","staples.flours"],["Fenugreek","f"],["Milk","dairy.curd?"],["Turmeric","k"],["Chilli","f"],["Carom","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('gobi_paratha', '[["Whole Wheat Flour","staples.flours"],["Cauliflower","f"],["Chilli","f"],["Coriander Leaves","f"],["Carom","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('paneer_paratha', '[["Whole Wheat Flour","staples.flours"],["Milk","dairy.paneer"],["Chilli","f"],["Coriander Leaves","f"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('veg_dalia', '[["Wheat","staples.breakfast_cereals"],["Carrot","f"],["Green Peas","f"],["Onion","f"],["Cumin","k"],["Turmeric","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('masala_oats', '[["Oats","staples.breakfast_cereals"],["Onion","f"],["Tomato","f"],["Carrot","f"],["Green Peas","f?"],["Turmeric","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('overnight_oats', '[["Oats","staples.breakfast_cereals"],["Milk","dairy.milk"],["Chia Seeds","nuts_seeds.seeds?"],["Banana","f?"],["Honey","sweeteners.honey*?"]]'),
  ('curd_fruit_bowl', '[["Milk","dairy.curd"],["Banana","f"],["Pomegranate","f?"],["Tree Nuts","nuts_seeds.nuts*?"],["Honey","sweeteners.honey*?"]]'),
  ('sabudana_khichdi', '[["Sago","staples"],["Peanut","k"],["Potato","f"],["Chilli","f"],["Cumin","k"],["Ghee","fats_oils.ghee*"],["Rock Salt","k"],["Lemon","f?"]]'),
  ('rajgira_porridge', '[["Amaranth","staples.millets"],["Milk","dairy.milk"],["Jaggery","sweeteners.jaggery*?"],["Cardamom","k?"]]'),
  ('kuttu_chilla', '[["Buckwheat","staples.flours"],["Potato","f"],["Chilli","f"],["Coriander Leaves","f"],["Ghee","fats_oils.ghee*"],["Rock Salt","k"]]'),
  ('boiled_eggs', '[["Egg","eggs.hen_eggs"],["Black Pepper","k"],["Iodised Salt","k"]]'),
  ('bread_omelette', '[["Egg","eggs.hen_eggs"],["Wheat","f"],["Onion","f"],["Chilli","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('peanut_butter_toast', '[["Wheat","f"],["Peanut","nuts_seeds.nut_butters"],["Banana","f?"]]'),
  ('misal_pav', '[["Lentils","staples.pulses"],["Onion","f"],["Tomato","f"],["Garlic","f"],["Ginger","f"],["Chilli","f"],["Coconut","f?"],["Garam Masala","k"],["Refined Wheat Flour","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('brown_rice', '[["Brown Rice","staples.rice"]]'),
  ('plain_paratha', '[["Whole Wheat Flour","staples.flours"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('bajra_roti', '[["Bajra","staples.millets"],["Iodised Salt","k"]]'),
  ('makki_roti', '[["Maize","staples.flours"],["Ghee","fats_oils.ghee*?"],["Iodised Salt","k"]]'),
  ('missi_roti', '[["Chickpea","staples.flours"],["Whole Wheat Flour","staples.flours"],["Onion","f?"],["Chilli","f"],["Carom","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('ragi_mudde', '[["Ragi","staples.flours"],["Iodised Salt","k"]]'),
  ('sambar', '[["Lentils","staples.pulses"],["Tamarind","k"],["Sambar Powder","k"],["Brinjal","f"],["Carrot","f?"],["Tomato","f"],["Shallot","f?"],["Mustard","k"],["Curry Leaves","f"],["Asafoetida","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('rasam', '[["Tomato","f"],["Tamarind","k"],["Rasam Powder","k"],["Black Pepper","k"],["Cumin","k"],["Garlic","f?"],["Mustard","k"],["Curry Leaves","f"],["Asafoetida","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('kadhi', '[["Milk","dairy.curd"],["Chickpea","staples.flours"],["Fenugreek","k"],["Cumin","k"],["Turmeric","k"],["Curry Leaves","f"],["Chilli","f"],["Asafoetida","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('dal_makhani', '[["Lentils","staples.pulses"],["Kidney Beans","staples.pulses"],["Milk","f"],["Onion","f"],["Tomato","f"],["Garlic","f"],["Ginger","f"],["Garam Masala","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('masoor_dal', '[["Lentils","staples.pulses"],["Onion","f"],["Tomato","f"],["Garlic","f"],["Cumin","k"],["Turmeric","k"],["Chilli","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('dal_palak', '[["Lentils","staples.pulses"],["Spinach","f"],["Garlic","f"],["Tomato","f"],["Cumin","k"],["Turmeric","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('chana_dal_fry', '[["Chickpea","staples.pulses"],["Onion","f"],["Tomato","f"],["Garlic","f"],["Cumin","k"],["Turmeric","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('kala_chana_curry', '[["Chickpea","staples.pulses"],["Onion","f"],["Tomato","f"],["Ginger","f"],["Garlic","f"],["Coriander Seeds","k"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('lobia_curry', '[["Black-eyed Peas","staples.pulses"],["Onion","f"],["Tomato","f"],["Garlic","f"],["Ginger","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('soya_keema', '[["Soya","staples.pulses"],["Onion","f"],["Tomato","f"],["Green Peas","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('tofu_bhurji', '[["Soya","f"],["Onion","f"],["Tomato","f"],["Capsicum","f"],["Turmeric","k"],["Chilli","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('gatte_ki_sabzi', '[["Chickpea","staples.flours"],["Milk","dairy.curd"],["Carom","k"],["Turmeric","k"],["Chilli","f"],["Cumin","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('matar_paneer', '[["Milk","dairy.paneer"],["Green Peas","f"],["Onion","f"],["Tomato","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('kadai_paneer', '[["Milk","dairy.paneer"],["Capsicum","f"],["Onion","f"],["Tomato","f"],["Coriander Seeds","k"],["Chilli","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('paneer_butter_masala', '[["Milk","dairy.paneer"],["Tomato","f"],["Onion","f"],["Tree Nuts","nuts_seeds.nuts*"],["Milk","f"],["Fenugreek","k"],["Garam Masala","k"],["Iodised Salt","k"]]'),
  ('aloo_matar', '[["Potato","f"],["Green Peas","f"],["Onion","f"],["Tomato","f"],["Ginger","f"],["Cumin","k"],["Turmeric","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('jeera_aloo', '[["Potato","f"],["Cumin","k"],["Turmeric","k"],["Chilli","f"],["Coriander Leaves","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('methi_aloo', '[["Potato","f"],["Fenugreek","f"],["Cumin","k"],["Turmeric","k"],["Chilli","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('dum_aloo', '[["Potato","f"],["Milk","dairy.curd"],["Tomato","f"],["Onion","f"],["Ginger","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('cabbage_poriyal', '[["Cabbage","f"],["Coconut","f?"],["Mustard","k"],["Lentils","k?"],["Curry Leaves","f"],["Chilli","f"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('beans_poriyal', '[["French Beans","f"],["Coconut","f"],["Mustard","k"],["Curry Leaves","f"],["Chilli","f"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('avial', '[["Carrot","f"],["French Beans","f"],["Pumpkin","f"],["Yam","f?"],["Coconut","f"],["Milk","dairy.curd"],["Curry Leaves","f"],["Cumin","k"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('sarson_ka_saag', '[["Mustard Greens","f"],["Spinach","f"],["Maize","staples.flours?"],["Garlic","f"],["Ginger","f"],["Onion","f"],["Chilli","f"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('kaddu_sabzi', '[["Pumpkin","f"],["Fenugreek","k"],["Jaggery","sweeteners.jaggery*?"],["Mango","k"],["Chilli","f"],["Mustard Oil","k"],["Iodised Salt","k"]]'),
  ('karela_sabzi', '[["Bitter Gourd","f"],["Onion","f"],["Turmeric","k"],["Chilli","f"],["Mango","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('veg_korma', '[["Carrot","f"],["French Beans","f"],["Green Peas","f"],["Potato","f"],["Tree Nuts","nuts_seeds.nuts*"],["Milk","dairy.curd"],["Onion","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('butter_chicken', '[["Chicken","f"],["Milk","f"],["Tomato","f"],["Onion","f"],["Ginger","f"],["Garlic","f"],["Tree Nuts","nuts_seeds.nuts*?"],["Fenugreek","k"],["Garam Masala","k"],["Iodised Salt","k"]]'),
  ('tandoori_chicken', '[["Chicken","f"],["Milk","dairy.curd"],["Ginger","f"],["Garlic","f"],["Lemon","f"],["Chilli","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('chicken_stew', '[["Chicken","f"],["Coconut Milk","f"],["Potato","f"],["Onion","f"],["Ginger","f"],["Black Pepper","k"],["Cinnamon","k"],["Cloves","k"],["Curry Leaves","f"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('grilled_chicken_salad', '[["Chicken","f"],["Cucumber","f"],["Tomato","f"],["Onion","f?"],["Lemon","f"],["Black Pepper","k"],["Olive Oil","k"],["Iodised Salt","k"]]'),
  ('mutton_curry', '[["Mutton","f"],["Onion","f"],["Tomato","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('keema_matar', '[["Mutton","f"],["Green Peas","f"],["Onion","f"],["Tomato","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('prawn_curry', '[["Crustacean Shellfish","f"],["Coconut Milk","f"],["Onion","f"],["Tomato","f"],["Garlic","f"],["Turmeric","k"],["Chilli","f"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('fish_fry', '[["Fish","f"],["Turmeric","k"],["Chilli","f"],["Lemon","f"],["Rice Flour","k?"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('tofu_stir_fry', '[["Soya","f"],["Capsicum","f"],["Carrot","f"],["Cabbage","f"],["Garlic","f"],["Ginger","f"],["Soy Sauce","k"],["Sesame Oil","k"],["Iodised Salt","k"]]'),
  ('lemon_rice', '[["Polished Rice","staples.rice*"],["Lemon","f"],["Mustard","k"],["Curry Leaves","f"],["Peanut","k?"],["Turmeric","k"],["Chilli","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('tomato_rice', '[["Polished Rice","staples.rice*"],["Tomato","f"],["Onion","f"],["Ginger","f"],["Garlic","f"],["Garam Masala","k"],["Mustard","k"],["Curry Leaves","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('coconut_rice', '[["Polished Rice","staples.rice*"],["Coconut","f"],["Mustard","k"],["Curry Leaves","f"],["Lentils","k?"],["Tree Nuts","nuts_seeds.nuts*?"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('veg_biryani', '[["Polished Rice","staples.rice*"],["Carrot","f"],["French Beans","f"],["Green Peas","f"],["Potato","f"],["Onion","f"],["Milk","dairy.curd"],["Mint","f"],["Garam Masala","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('bisi_bele_bath', '[["Polished Rice","staples.rice*"],["Lentils","staples.pulses"],["Tamarind","k"],["Sambar Powder","k"],["Carrot","f"],["French Beans","f"],["Green Peas","f?"],["Mustard","k"],["Curry Leaves","f"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('veg_khichdi', '[["Polished Rice","staples.rice*"],["Lentils","staples.pulses"],["Carrot","f"],["Green Peas","f"],["Potato","f?"],["Cumin","k"],["Turmeric","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('quinoa_pulao', '[["Quinoa","staples.millets"],["Onion","f"],["Carrot","f"],["Green Peas","f"],["Cumin","k"],["Olive Oil","k"],["Iodised Salt","k"]]'),
  ('pav_bhaji', '[["Potato","f"],["Cauliflower","f"],["Green Peas","f"],["Capsicum","f"],["Tomato","f"],["Onion","f"],["Milk","f"],["Pav Bhaji Masala","k"],["Refined Wheat Flour","f"],["Lemon","f?"],["Iodised Salt","k"]]'),
  ('chicken_biryani', '[["Polished Rice","staples.rice*"],["Chicken","f"],["Milk","dairy.curd"],["Onion","f"],["Ginger","f"],["Garlic","f"],["Mint","f"],["Garam Masala","k"],["Ghee","fats_oils.ghee*"],["Iodised Salt","k"]]'),
  ('egg_fried_rice', '[["Polished Rice","staples.rice*"],["Egg","eggs.hen_eggs"],["Spring Onion","f"],["Carrot","f"],["Capsicum","f?"],["Garlic","f"],["Soy Sauce","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('veg_fried_rice', '[["Polished Rice","staples.rice*"],["Carrot","f"],["French Beans","f"],["Capsicum","f"],["Cabbage","f"],["Spring Onion","f"],["Garlic","f"],["Soy Sauce","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('hakka_noodles', '[["Refined Wheat Flour","staples"],["Cabbage","f"],["Carrot","f"],["Capsicum","f"],["Spring Onion","f"],["Garlic","f"],["Soy Sauce","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('bhel_puri', '[["Puffed Rice","snacks.puffs"],["Onion","f"],["Tomato","f"],["Potato","f?"],["Tamarind","k"],["Chickpea","k?"],["Chaat Masala","k"],["Coriander Leaves","f"],["Lemon","f"]]'),
  ('sundal', '[["Chickpea","staples.pulses"],["Coconut","f"],["Mustard","k"],["Curry Leaves","f"],["Chilli","f"],["Coconut Oil","k"],["Iodised Salt","k"]]'),
  ('dhokla', '[["Chickpea","staples.flours"],["Milk","dairy.curd"],["Ginger","f"],["Chilli","f"],["Mustard","k"],["Curry Leaves","f"],["Refined Sugar","sweeteners.sugar*?"],["Lemon","f"],["Sodium Bicarbonate","k"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('chana_salad', '[["Chickpea","staples.pulses"],["Cucumber","f"],["Tomato","f"],["Onion","f"],["Lemon","f"],["Chaat Masala","k"],["Coriander Leaves","f"],["Iodised Salt","k"]]'),
  ('paneer_tikka', '[["Milk","dairy.paneer"],["Milk","dairy.curd"],["Capsicum","f"],["Onion","f"],["Chilli","f"],["Garam Masala","k"],["Lemon","f"],["Sunflower Oil","k"],["Iodised Salt","k"]]'),
  ('fruit_chaat', '[["Banana","f"],["Apple","f"],["Papaya","f"],["Pomegranate","f"],["Guava","f?"],["Chaat Masala","k"],["Lemon","f"]]'),
  ('masala_peanuts', '[["Peanut","nuts_seeds.nuts"],["Onion","f"],["Tomato","f"],["Lemon","f"],["Chaat Masala","k"],["Coriander Leaves","f"]]'),
  ('corn_chaat', '[["Sweet Corn","f"],["Onion","f"],["Tomato","f"],["Lemon","f"],["Chaat Masala","k"],["Milk","f?"],["Iodised Salt","k"]]'),
  ('sweet_potato_chaat', '[["Sweet Potato","f"],["Lemon","f"],["Black Salt","k"],["Cumin","k"],["Coriander Leaves","f"]]'),
  ('banana_peanut_butter', '[["Banana","f"],["Peanut","nuts_seeds.nut_butters"]]'),
  ('hummus', '[["Chickpea","staples.pulses"],["Sesame","k"],["Lemon","f"],["Garlic","f"],["Olive Oil","k"],["Cucumber","f"],["Iodised Salt","k"]]'),
  ('sweet_lassi', '[["Milk","dairy.curd"],["Refined Sugar","sweeteners.sugar*?"],["Cardamom","k?"]]'),
  ('banana_smoothie', '[["Milk","dairy.milk"],["Banana","f"],["Oats","staples.breakfast_cereals?"],["Honey","sweeteners.honey*?"]]'),
  ('badam_milk', '[["Milk","dairy.milk"],["Tree Nuts","nuts_seeds.nuts*"],["Cardamom","k"],["Refined Sugar","sweeteners.sugar*?"]]'),
  ('cold_coffee', '[["Coffee","beverages.tea_coffee"],["Milk","dairy.milk"],["Refined Sugar","sweeteners.sugar*?"]]'),
  ('green_tea', '[["Tea","beverages.tea_coffee"],["Lemon","f?"],["Honey","sweeteners.honey*?"]]'),
  ('coconut_water', '[["Coconut Water","f"]]'),
  ('jaljeera', '[["Cumin","k"],["Mint","f"],["Lemon","f"],["Black Salt","k"],["Tamarind","k?"]]'),
  ('sattu_sharbat', '[["Chickpea","staples.flours"],["Lemon","f"],["Cumin","k"],["Black Salt","k"],["Mint","f?"]]'),
  ('aam_panna', '[["Mango","f"],["Jaggery","sweeteners.jaggery*"],["Cumin","k"],["Black Salt","k"],["Mint","f?"]]')
) AS d(dish, lines)
CROSS JOIN LATERAL jsonb_array_elements(d.lines::jsonb) WITH ORDINALITY AS l(v, ord)
JOIN food.ingredients_master m ON m.canonical_name = l.v->>0;

-- Every line must have found its ingredient: a silent drop would publish a
-- dish without, say, its prawns.
-- (This migration's dishes are the ones created in this transaction.)
DO $$
DECLARE found int;
BEGIN
  SELECT count(*) INTO found FROM food.recipe_line r JOIN food.dish d ON d.key = r.dish_key WHERE d.created_at = now();
  IF found <> 690 THEN RAISE EXCEPTION 'expected 690 new recipe lines, found %', found; END IF;
  IF (SELECT count(*) FROM food.dish WHERE created_at = now()) <> 94 THEN RAISE EXCEPTION 'expected 94 new dishes'; END IF;
END $$;
