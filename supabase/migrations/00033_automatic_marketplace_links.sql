-- ============================================================================
-- KOI — Automatic marketplace links say what they are
--
-- Phase 1.6. KOI decided on 12 Sep 2026 that nobody manually approves what the
-- engine establishes. A KOI SKU is now linked to a marketplace listing by
-- lib/marketplace/match.js, during a shopper's own request, with no review.
-- The column comment said `name_pack` "needs review"; it now says how such a
-- link earns trust instead, so the taxonomy stays honest:
--
--   - trusted only at confidence >= MATCH.minConfidence (0.8): same brand,
--     name and variant, and the exact pack size;
--   - verified_at stays NULL, because nobody verified it;
--   - external_id NULL with confidence 0 records "searched, no listing found".
-- ============================================================================

COMMENT ON COLUMN marketplace_sku_map.match_method IS
  'How the mapping was established, which is what makes a wrong one auditable. barcode = matched on EAN. name_pack = matched automatically inside a shopper''s own request on brand, name, variant and exact pack size (lib/marketplace/match.js); trusted without review only at confidence >= 0.8, verified_at stays NULL because nobody verified it, and external_id NULL with confidence 0 records a search that found no listing. observed = discovered from a search result; never self-promotes. manual = a person confirmed it. seed = generated so a non-production adapter has something to resolve; nobody confirmed it, and it must never appear on a real provider row.';
