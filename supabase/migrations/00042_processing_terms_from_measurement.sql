-- ============================================================================
-- KOI — Two processing terms corrected by measurement
--
-- Phase 2.4, after running web/scripts/checkNova.mjs over the 4,678 staged
-- Open Food Facts products that carry both an ingredient list and a NOVA
-- group. KOI agreed with them on 91.5%, but group 2 (processed culinary
-- ingredients) recalled only 57%, for two reasons:
--
--   Bottled water, whose list is "Water", got no group at all, because water
--   was recorded as neutral and so the list named nothing. Water is a food:
--   the neutral rows go, and a list of water alone is group 1.
--
--   "Milk Fat" and "Butter Oil" — how ghee is often declared — read as plain
--   foods. They are processed culinary ingredients, like the butter and ghee
--   already recorded.
-- ============================================================================

DELETE FROM food.processing_term WHERE term IN ('water', 'potable water');

INSERT INTO food.processing_term (term, role, rule, source) VALUES
  ('milk fat', 'culinary', 'A processed culinary ingredient (NOVA group 2): how ghee and butterfat are often declared.', 'nova_monteiro_2019'),
  ('milkfat', 'culinary', 'A processed culinary ingredient (NOVA group 2): how ghee and butterfat are often declared.', 'nova_monteiro_2019'),
  ('butter oil', 'culinary', 'A processed culinary ingredient (NOVA group 2): how ghee is often declared.', 'nova_monteiro_2019'),
  ('clarified butter', 'culinary', 'Ghee: a processed culinary ingredient (NOVA group 2).', 'nova_monteiro_2019'),
  ('bee honey', 'culinary', 'Honey: a processed culinary ingredient (NOVA group 2).', 'nova_monteiro_2019');
