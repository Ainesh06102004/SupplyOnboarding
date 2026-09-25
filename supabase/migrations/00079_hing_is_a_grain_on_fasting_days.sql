-- ============================================================================
-- 00079_hing_is_a_grain_on_fasting_days
--
-- 00056 meant hing to be kept out on a fasting day and did it with the allium
-- flag, which 00068 took back: allium now also backs the no-onion-garlic avoid,
-- and hing is what such a kitchen cooks with instead. The fact that keeps hing
-- off a vrat day is a different one: hing is sold compounded, cut with wheat or
-- rice flour (00068 already records it may carry gluten). That is a grain, and
-- `grain` is what the fasting diet excludes — and only the fasting diet, so a
-- Jain or no-onion-garlic kitchen keeps its hing.
-- ============================================================================

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule, source)
SELECT id, 'grain', 'Compounded hing is cut with wheat or rice flour: a grain on a fasting day.', 'koi_editorial'
FROM food.ingredients_master WHERE canonical_name = 'Asafoetida'
ON CONFLICT (ingredient_id, flag) DO NOTHING;
