-- ============================================================================
-- 00072_eggs_shelf_is_a_category — a reference portion belongs to a category.
--
-- 00071 put eggs' portion on the "eggs" aisle itself. Every other portion is on
-- a category under an aisle (lib/food/taxonomy.test.js holds the tree to it),
-- so eggs get one: "Hen eggs". The name "egg", the portion and the three dish
-- lines move to it; the aisle keeps its role and its occasions.
-- ============================================================================

INSERT INTO food.taxonomy_node (key, parent_key, label, off_categories, notes, meal_role, food_form, lunchbox_ok, cuisine, prep_minutes) VALUES
  ('eggs.hen_eggs', 'eggs', 'Hen eggs', '{en:chicken-eggs}', NULL, NULL, 'needs_cooking', false, NULL, 10);

UPDATE food.taxonomy_term SET node_key = 'eggs.hen_eggs' WHERE term = 'egg';
UPDATE food.portion_norm  SET node_key = 'eggs.hen_eggs' WHERE node_key = 'eggs';
UPDATE food.taxonomy_node SET food_form = NULL, lunchbox_ok = NULL, prep_minutes = NULL WHERE key = 'eggs';
UPDATE food.recipe_line   SET category_key = 'eggs.hen_eggs' WHERE category_key = 'eggs';
