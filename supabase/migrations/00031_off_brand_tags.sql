-- ============================================================================
-- KOI — One form for Open Food Facts brand tags, and each maker counted once
--
-- Phase 1.5, found on the first load. The CSV export writes brand tags as
-- "xx:pintola"; product documents (the daily deltas) write "pintola". Rows
-- loaded from the export could not be matched to a brand, so the cross-check
-- could find nothing. lib/off/record.js now stores one form; this corrects the
-- rows already loaded.
--
-- off_candidates grouped makers by the printed brand, so "Dr. Oetker" and
-- "Dr.Oetker" counted as two. It now groups by brand tag and shows a printed
-- name for it.
-- ============================================================================

UPDATE engine.off_products
SET brand_tags = ARRAY(SELECT DISTINCT regexp_replace(t, '^[a-z]{2}:', '') FROM unnest(brand_tags) AS t)
WHERE EXISTS (SELECT 1 FROM unnest(brand_tags) AS t WHERE t ~ '^[a-z]{2}:');

CREATE OR REPLACE FUNCTION engine.off_candidates(p_terms text[], p_per_term integer DEFAULT 3)
RETURNS TABLE (term text, brand text, products integer, example text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT t.term, b.brand, b.products, b.example
  FROM unnest(p_terms) AS t(term)
  CROSS JOIN LATERAL (
    SELECT min(btrim(split_part(o.brands, ',', 1))) AS brand, count(*)::integer AS products, min(o.product_name) AS example
    FROM engine.off_products o
    WHERE char_length(t.term) >= 3
      AND cardinality(o.brand_tags) > 0
      AND btrim(split_part(COALESCE(o.brands, ''), ',', 1)) <> ''
      AND (o.product_name ILIKE '%' || t.term || '%'
           OR array_to_string(o.categories_tags, ' ') ILIKE '%' || replace(t.term, ' ', '-') || '%')
    GROUP BY o.brand_tags[1]
    ORDER BY count(*) DESC, 1
    LIMIT GREATEST(1, LEAST(p_per_term, 10))
  ) AS b;
$$;
