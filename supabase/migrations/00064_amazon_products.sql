-- 00064 — amazon_products: every listing KOI scrapes from amazon.in, first
-- category protein bars. A staging catalogue, separate from the storefront:
-- nothing here is shown to shoppers or copied into public.skus / sku_nutrition.
--
-- Written by web/scripts/amazon/* with the service role (Oxylabs Web Scraper
-- API, pincode 110001). Every raw response is kept in `snapshot` so fields can
-- be re-parsed without scraping again. Label readings from pack photos are
-- stored with both models' outputs; only fields the two readings agree on
-- count as read (`agreed_fields`), same rule as the label engine.
--
-- The schema was created by the user in the dashboard; this migration only
-- adds what lives in it. service_role only, like `engine` (00019).

CREATE SCHEMA IF NOT EXISTS amazon_products;

COMMENT ON SCHEMA amazon_products IS
  'Listings scraped from amazon.in (Oxylabs). Staging only: service_role, never shown to shoppers, never merged into sku_nutrition.';

REVOKE ALL ON SCHEMA amazon_products FROM anon, authenticated, public;
GRANT USAGE ON SCHEMA amazon_products TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA amazon_products
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA amazon_products
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA amazon_products
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- How each ASIN was found: one row per (query, page, position).
CREATE TABLE amazon_products.search_hit (
  id          bigserial PRIMARY KEY,
  query       text NOT NULL,          -- search words, bestsellers node, or "variation of <asin>"
  source      text NOT NULL,          -- amazon_search | amazon_bestsellers | variation
  sort        text,
  page        int,
  position    int,
  asin        text NOT NULL,
  sponsored   boolean NOT NULL DEFAULT false,
  price       numeric,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query, source, sort, page, position, asin)
);
CREATE INDEX search_hit_asin_idx ON amazon_products.search_hit (asin);

-- One row per ASIN, parsed from the product page.
CREATE TABLE amazon_products.listing (
  asin                text PRIMARY KEY,
  parent_asin         text,
  url                 text,
  title               text,
  brand               text,
  manufacturer        text,
  flavour             text,
  size                text,              -- the variation's size dimension, e.g. "12 Bars (Pack of 3)"
  pack_count          int,               -- bars in the listing, read from title/size where stated
  net_quantity        text,              -- as Amazon prints it, e.g. "600.0 Grams"
  net_quantity_g      numeric,
  item_weight         text,
  price               numeric,
  mrp                 numeric,           -- price_strikethrough
  discount_pct        numeric,
  price_per_unit      jsonb,             -- {currency, price, unit}
  price_sns           numeric,           -- subscribe & save
  currency            text,
  pincode             text NOT NULL DEFAULT '110001',
  stock               text,
  delivery            jsonb,
  is_amazon_fulfilled boolean,
  seller              jsonb,             -- featured_merchant
  rating              numeric,
  reviews_count       int,
  rating_distribution jsonb,
  sales_volume        text,
  sales_rank          jsonb,
  protein_bar_rank    int,               -- rank in the Protein Bars best-seller list, where Amazon prints one
  category_path       text[],
  category_node       text,              -- last node id in the breadcrumb
  bullet_points       text[],
  description         text,
  ingredients_text    text,              -- from the page's "Important information", as printed
  important_information jsonb,
  product_details     jsonb,             -- the full key → value table
  product_overview    jsonb,
  country_of_origin   text,
  diet_type           text,
  variations          jsonb,
  store_url           text,
  has_videos          boolean,
  is_protein_bar      boolean,
  protein_bar_reason  text,
  first_seen          timestamptz NOT NULL DEFAULT now(),
  last_scraped        timestamptz
);
CREATE INDEX listing_brand_idx  ON amazon_products.listing (lower(brand));
CREATE INDEX listing_parent_idx ON amazon_products.listing (parent_asin);

-- Every Oxylabs response, whole.
CREATE TABLE amazon_products.snapshot (
  id          bigserial PRIMARY KEY,
  asin        text,
  source      text NOT NULL,
  request     jsonb NOT NULL,
  raw         jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX snapshot_asin_idx ON amazon_products.snapshot (asin, fetched_at DESC);

-- Every image on the listing, copied into the private amazon-products bucket.
CREATE TABLE amazon_products.image (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asin          text NOT NULL REFERENCES amazon_products.listing(asin) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('gallery', 'description')),  -- gallery or A+ content
  position      int NOT NULL,
  amazon_url    text NOT NULL,
  storage_path  text,
  width         int,
  height        int,
  bytes         int,
  sha256        text,
  kind          text CHECK (kind IN ('front', 'nutrition', 'ingredients', 'label', 'barcode', 'lifestyle', 'other')),
  kind_model    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asin, role, position)
);

-- Barcodes, each with where it came from. Nothing is guessed: image_decode is
-- a barcode read off a pack photo, off_match is an Open Food Facts product
-- matched by brand + name (score kept, used only above 0.75).
CREATE TABLE amazon_products.barcode (
  id           bigserial PRIMARY KEY,
  asin         text NOT NULL REFERENCES amazon_products.listing(asin) ON DELETE CASCADE,
  code         text NOT NULL CHECK (code ~ '^[0-9]{8,14}$'),
  format       text,
  source       text NOT NULL CHECK (source IN ('image_decode', 'off_match', 'page')),
  image_id     uuid REFERENCES amazon_products.image(id) ON DELETE SET NULL,
  off_name     text,
  match_score  numeric,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asin, code, source)
);

-- Pack-photo readings: two models read the same image; agreed_fields is what both said.
CREATE TABLE amazon_products.label_reading (
  id             bigserial PRIMARY KEY,
  asin           text NOT NULL REFERENCES amazon_products.listing(asin) ON DELETE CASCADE,
  image_id       uuid NOT NULL REFERENCES amazon_products.image(id) ON DELETE CASCADE,
  model          text NOT NULL,
  verifier_model text,
  reading        jsonb,
  second         jsonb,
  agreed         boolean NOT NULL DEFAULT false,
  agreed_fields  jsonb,          -- {per_100:{…}, per_serving:{…}, serving_g, ingredients_text, allergens}
  disagreements  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (image_id, model)
);

-- The demo table: one row per protein bar.
CREATE VIEW amazon_products.overview AS
SELECT
  l.asin,
  l.brand,
  l.title,
  l.flavour,
  l.size,
  l.pack_count,
  l.net_quantity,
  l.price,
  l.mrp,
  l.discount_pct,
  l.rating,
  l.reviews_count,
  l.protein_bar_rank,
  l.stock,
  (SELECT count(*) FROM amazon_products.image i WHERE i.asin = l.asin)                       AS images,
  (SELECT string_agg(DISTINCT b.code, ', ') FROM amazon_products.barcode b
     WHERE b.asin = l.asin AND (b.source <> 'off_match' OR b.match_score >= 0.75))           AS barcodes,
  (l.ingredients_text IS NOT NULL)                                                           AS has_ingredients,
  r.agreed_fields -> 'per_100' ->> 'protein_g'                                               AS protein_per_100g,
  r.agreed_fields -> 'per_serving' ->> 'protein_g'                                           AS protein_per_serving,
  r.agreed_fields -> 'per_100' ->> 'energy_kcal'                                             AS kcal_per_100g,
  r.agreed_fields -> 'per_100' ->> 'sugars_g'                                                AS sugar_per_100g,
  l.url,
  l.last_scraped
FROM amazon_products.listing l
LEFT JOIN LATERAL (
  SELECT lr.agreed_fields FROM amazon_products.label_reading lr
  WHERE lr.asin = l.asin AND lr.agreed AND lr.agreed_fields ? 'per_100'
  ORDER BY lr.created_at DESC LIMIT 1
) r ON true
WHERE l.is_protein_bar;

-- Open Food Facts candidates for every listing without a decoded barcode.
-- Brand must overlap; score = word similarity of the OFF name inside the title.
CREATE FUNCTION amazon_products.match_off(min_score numeric DEFAULT 0.6)
RETURNS int LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH cand AS (
    SELECT DISTINCT ON (l.asin, o.code)
      l.asin, o.code, o.product_name,
      extensions.word_similarity(lower(o.product_name), lower(l.title))::numeric AS score
    FROM amazon_products.listing l
    JOIN engine.off_products o
      ON o.brand_tags && ARRAY[regexp_replace(lower(l.brand), '[^a-z0-9]+', '-', 'g')]
     AND o.code ~ '^[0-9]{8,14}$'
     AND coalesce(o.product_name, '') <> ''
    WHERE l.is_protein_bar
  ), best AS (
    SELECT DISTINCT ON (asin) * FROM cand WHERE score >= min_score ORDER BY asin, score DESC
  ), ins AS (
    INSERT INTO amazon_products.barcode (asin, code, source, off_name, match_score)
    SELECT asin, code, 'off_match', product_name, round(score, 3) FROM best
    ON CONFLICT (asin, code, source) DO UPDATE SET match_score = excluded.match_score
    RETURNING 1
  )
  SELECT count(*)::int FROM ins;
$$;
REVOKE EXECUTE ON FUNCTION amazon_products.match_off(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION amazon_products.match_off(numeric) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA amazon_products TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA amazon_products TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA amazon_products FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('amazon-products', 'amazon-products', false)
ON CONFLICT (id) DO NOTHING;
