-- ============================================================================
-- KOI — Tree nuts are an allergen a shopper can avoid
--
-- FOODS_AVOID had `peanuts` and no tree-nut key, so a shopper allergic to
-- cashews had nothing to pick, and "no nuts" in search could only be shown as
-- a restriction KOI could not apply. Tree nuts are one of the allergen groups
-- FSSAI's labelling regulations require a pack to declare; KOI detected them
-- (CONTAINS_KEYWORDS.tree_nut) and then gave no way to act on it.
--
-- user_avoided_food.avoid_key has a foreign key to this table, so the key in
-- lib/recommendation/config.js needs this row before a shopper can save it.
-- ============================================================================

INSERT INTO avoided_item (key, label, kind, mode)
VALUES ('tree_nuts', 'Tree Nuts', 'allergen', 'hard')
ON CONFLICT (key) DO NOTHING;
