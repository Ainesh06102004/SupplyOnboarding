-- ============================================================================
-- KOI — Seeding the SKU map (example)
--
-- Availability lookups need two things, and until BOTH exist every product on
-- the storefront correctly reports `unknown`:
--
--   1. SUPABASE_SERVICE_ROLE_KEY in web/.env.local
--      `marketplace_sku_map` is service-role only — it holds provider-derived
--      integration keys the browser has no business reading — so the verify
--      route cannot read it with the anon key. Without this variable the
--      server logs a warning and every SKU stays unmapped.
--
--   2. Rows in this table
--      A row answers "how do I ask the provider about this KOI product". With
--      no row, KOI has never established which provider product corresponds to
--      the thing it screened, and `unknown` is the honest answer. KOI must NOT
--      fall back to searching the product name and trusting the first hit:
--      that risks reporting stock for different food under a similar name.
--
-- This file is an EXAMPLE, not a migration. Nothing here runs automatically.
-- ============================================================================


-- ── Against the mock adapter (KOI_MARKETPLACE=mock) ─────────────────────────
-- The mock's fixture pool uses ids of the form SPN1000N. Any non-null
-- external_id exercises the full path, because the mock hashes an unrecognised
-- id onto a fixture deterministically.
--
-- confidence 1.00 + verified_at set = a trusted mapping. Below the threshold in
-- web/src/lib/marketplace/config.js (0.8), or with verified_at null and a low
-- confidence, the mapping is treated as untrusted and availability resolves to
-- `unknown` rather than to a stock state — because an unconfirmed match means
-- we do not know the in-stock thing is the thing KOI screened.

INSERT INTO marketplace_sku_map
  (marketplace, koi_sku_id, external_id, match_query, match_method, confidence, verified_at)
SELECT
  'mock',
  s.id,
  'SPN' || (10000 + row_number() OVER (ORDER BY s.id))::text,
  p.product_name,
  'manual',
  1.00,
  now()
FROM skus s
JOIN products p ON p.id = s.product_id
WHERE p.status = 'approved'
ON CONFLICT (marketplace, koi_sku_id, scope, scope_ref) DO NOTHING;


-- ── Against Swiggy (KOI_MARKETPLACE=swiggy) ─────────────────────────────────
-- Real spinIds only, and only from an observed match. `match_method` records
-- HOW the mapping was established, which is what makes a wrong one auditable:
--
--   'barcode'   matched on EAN. The only genuinely reliable method.
--   'name_pack' matched on normalised name + pack size. Needs review.
--   'observed'  discovered from a search result. NEVER self-promotes to
--               trusted — a human sets verified_at or it stays unknown.
--   'manual'    a person confirmed it.
--
-- Leave external_id NULL to record "we looked and there is no match", which is
-- a real and useful answer, distinct from never having looked.
--
-- INSERT INTO marketplace_sku_map
--   (marketplace, koi_sku_id, external_id, match_query, match_method, confidence, verified_at)
-- VALUES
--   ('swiggy', '<koi sku uuid>', '<spinId>', '<search terms>', 'barcode', 1.00, now());


-- ── If spinId turns out to be per-dark-store ────────────────────────────────
-- No DDL and no resolver change: insert scope='store' rows and they win over
-- the global one automatically (most-specific-wins: store, then zone, then
-- global). This is the whole reason (scope, scope_ref) exists from day one.
--
-- INSERT INTO marketplace_sku_map
--   (marketplace, koi_sku_id, external_id, scope, scope_ref, match_method, confidence, verified_at)
-- VALUES
--   ('swiggy', '<koi sku uuid>', '<store-specific spinId>', 'store', '<storeRef>', 'observed', 1.00, now());


-- ── Check what is mapped ────────────────────────────────────────────────────
-- SELECT m.marketplace, p.product_name, m.external_id, m.scope, m.scope_ref,
--        m.confidence, m.verified_at IS NOT NULL AS human_verified
-- FROM marketplace_sku_map m
-- JOIN skus s     ON s.id = m.koi_sku_id
-- JOIN products p ON p.id = s.product_id
-- WHERE m.is_active
-- ORDER BY p.product_name;
