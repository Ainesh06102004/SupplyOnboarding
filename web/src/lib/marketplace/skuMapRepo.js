// ============================================================================
// KOI — Reading the SKU map
//
// SERVER ONLY. Turns KOI SKU ids into "how do I ask the provider about this",
// which is the question `marketplace_sku_map` exists to answer.
//
// Two things a shopper never sees and never supplies:
//   - the provider's externalId (Swiggy's spinId), and
//   - the matchQuery, because there is no lookup-by-id and finding a product
//     costs a search.
//
// Both are resolved here, server-side, from a table the browser cannot read.
// That is what keeps free-text out of a provider's search box.
//
// UNMAPPED IS NOT UNAVAILABLE. A SKU with no row here means KOI has never
// established which provider product corresponds to the thing it screened, so
// the honest answer is `unknown`. Guessing — searching the KOI product name
// and trusting the first hit — would risk reporting stock for a different
// product under a similar name, which is a claim about the wrong food.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { buildSkuIndex, resolveMapping, isTrustedMapping } from "./skuMap";

/**
 * Resolve provider lookup details for a set of KOI SKUs.
 *
 * @param {string} marketplace  adapter id, e.g. 'mock' or 'swiggy'
 * @param {string[]} koiSkuIds
 * @param {{ zoneId?: string, storeRef?: string }} [ctx]
 * @returns {Promise<Record<string, {externalId: string|null, matchQuery: string|null, trusted: boolean}>>}
 */
export async function resolveSkuMappings(marketplace, koiSkuIds = [], ctx = {}) {
  const out = {};
  for (const id of koiSkuIds) {
    out[id] = { externalId: null, matchQuery: null, trusted: false };
  }
  if (!marketplace || !koiSkuIds.length) return out;

  const supabase = getServiceClient();
  // No service key: KOI cannot read its own mappings, so it cannot ask the
  // provider anything. Every SKU stays unmapped and resolves to `unknown`.
  if (!supabase) return out;

  const { data, error } = await supabase
    .from("marketplace_sku_map")
    .select("koi_sku_id, external_id, variant_ref, scope, scope_ref, match_query, confidence, verified_at")
    .eq("marketplace", marketplace)
    .eq("is_active", true)
    .in("koi_sku_id", koiSkuIds);

  if (error) {
    console.error("resolveSkuMappings:", error.message);
    return out;
  }

  const index = buildSkuIndex(
    (data ?? []).map((r) => ({
      koiSkuId: r.koi_sku_id,
      externalId: r.external_id,
      variantRef: r.variant_ref,
      scope: r.scope,
      scopeRef: r.scope_ref,
      matchQuery: r.match_query,
      confidence: r.confidence,
      verifiedAt: r.verified_at,
    }))
  );

  for (const id of koiSkuIds) {
    const mapping = resolveMapping(index, id, ctx);
    if (!mapping) continue;
    const trusted = isTrustedMapping(mapping);
    out[id] = {
      // A weak or unverified match is deliberately NOT passed to the adapter.
      // Asking with it would return a stock state for a product KOI is not
      // confident is the one it screened, and the UI would show that as this
      // product's availability. `unknown` is the correct answer instead.
      externalId: trusted ? mapping.externalId : null,
      matchQuery: mapping.matchQuery,
      trusted,
    };
  }

  return out;
}
