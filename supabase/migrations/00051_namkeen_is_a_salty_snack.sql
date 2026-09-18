-- ============================================================================
-- 00051_namkeen_is_a_salty_snack
--
-- Plan §11.2, action 4. The category reference is crosswalked to Open Food
-- Facts by food.taxonomy_node.off_categories, and namkeen was mapped to
-- "en:namkeen" alone: 13 of the Indian products staged in engine.off_products
-- carry that tag with nutrition figures, which is under the 30 a comparison
-- needs. So Madras Mixture and Chivda Mix had no reference of their own, and
-- (until now) fell back to the whole snacks aisle — a savoury namkeen compared
-- with biscuits and chocolate.
--
-- "en:salty-snacks" is the tag Open Food Facts actually files them under: 79
-- Indian products with figures. It covers chips too, which KOI keeps as its own
-- category (snacks.chips_crisps, with its own reference), so a bag of chips is
-- still compared with chips; namkeen now has a reference of savoury snacks
-- rather than of everything in the aisle.
--
-- The reference is rebuilt after this (scripts/buildCategoryReference.mjs), and
-- a build is always a new dated reference_version, so nothing already shown
-- changes retrospectively.
-- ============================================================================

UPDATE food.taxonomy_node
SET off_categories = ARRAY['en:namkeen', 'en:salty-snacks']
WHERE key = 'snacks.namkeen';
