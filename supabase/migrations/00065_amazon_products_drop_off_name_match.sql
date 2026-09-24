-- 00065 — drop Open Food Facts name matching from amazon_products.
--
-- 00064's match_off() matched listings to engine.off_products by brand +
-- word_similarity of the OFF name inside the Amazon title. On the first run it
-- was wrong far more often than right: short OFF names ("Protein bar",
-- "Peanut butter") score 1.0 against any title of that brand, so one code was
-- given to many different flavours (294 of 315 matches shared a code), and of
-- the 88 listings that also had a barcode decoded from a pack photo, only 7
-- agreed. A barcode KOI shows must be read, not guessed, so the matches are
-- deleted and the function removed. Barcodes now come only from pack photos
-- (image_decode) or a code printed on the page (page).

DELETE FROM amazon_products.barcode WHERE source = 'off_match';
DROP FUNCTION IF EXISTS amazon_products.match_off(numeric);

ALTER TABLE amazon_products.barcode DROP CONSTRAINT IF EXISTS barcode_source_check;
ALTER TABLE amazon_products.barcode
  ADD CONSTRAINT barcode_source_check CHECK (source IN ('image_decode', 'page'));

CREATE OR REPLACE VIEW amazon_products.overview AS
SELECT
  l.asin, l.brand, l.title, l.flavour, l.size, l.pack_count, l.net_quantity,
  l.price, l.mrp, l.discount_pct, l.rating, l.reviews_count, l.protein_bar_rank, l.stock,
  (SELECT count(*) FROM amazon_products.image i WHERE i.asin = l.asin) AS images,
  (SELECT string_agg(DISTINCT b.code, ', ') FROM amazon_products.barcode b WHERE b.asin = l.asin) AS barcodes,
  (l.ingredients_text IS NOT NULL) AS has_ingredients,
  r.agreed_fields -> 'per_100' ->> 'protein_g' AS protein_per_100g,
  r.agreed_fields -> 'per_serving' ->> 'protein_g' AS protein_per_serving,
  r.agreed_fields -> 'per_100' ->> 'energy_kcal' AS kcal_per_100g,
  r.agreed_fields -> 'per_100' ->> 'sugars_g' AS sugar_per_100g,
  l.url, l.last_scraped
FROM amazon_products.listing l
LEFT JOIN LATERAL (
  SELECT lr.agreed_fields FROM amazon_products.label_reading lr
  WHERE lr.asin = l.asin AND lr.agreed AND lr.agreed_fields ? 'per_100'
  ORDER BY lr.created_at DESC LIMIT 1
) r ON true
WHERE l.is_protein_bar;
