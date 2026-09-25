-- ============================================================================
-- 00080_sattu_is_not_besan
--
-- 00073 made "sattu" an alias of Chickpea, so a pack of besan (raw gram flour,
-- on the flours shelf) was what the week's sattu sharbat asked for: a drink of
-- raw besan, 80–170 g at a time. Sattu is roasted gram flour, eaten uncooked;
-- besan is not. Sattu becomes its own ingredient, still a pulse on a fasting
-- day, and the sharbat asks for it by name.
-- ============================================================================

INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT 'Sattu', '["sattu","roasted gram flour","bhuna chana atta","sattu atta"]'::jsonb, 'whole_food', 'safe', false,
  'Roasted gram flour, eaten uncooked. Not besan, which is raw.'
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master WHERE canonical_name = 'Sattu');

UPDATE food.ingredients_master
SET aliases = (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(aliases) x WHERE x <> 'sattu'), updated_at = now()
WHERE canonical_name = 'Chickpea';

SELECT food.sync_ingredient_aliases();
-- The alias table keeps rows sync does not remove: take "sattu" off Chickpea there too.
DELETE FROM food.ingredient_alias a USING food.ingredients_master m
WHERE a.ingredient_id = m.id AND m.canonical_name = 'Chickpea' AND a.normalised = 'sattu';

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule, source)
SELECT id, 'pulse', 'fasting', 'koi' FROM food.ingredients_master WHERE canonical_name = 'Sattu'
ON CONFLICT (ingredient_id, flag) DO NOTHING;

UPDATE food.recipe_line r SET ingredient_id = m.id
FROM food.ingredients_master m
WHERE m.canonical_name = 'Sattu' AND r.dish_key = 'sattu_sharbat' AND r.position = 1;
