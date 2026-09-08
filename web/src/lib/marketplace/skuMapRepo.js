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

/** Postgres uuid form. See the note in resolveSkuMappings before relaxing it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // `marketplace_sku_map.koi_sku_id` is a uuid column, and Postgres rejects the
  // WHOLE `IN` list if any element will not parse as one (22P02). The error was
  // caught below and every id returned unmapped — so ONE malformed id in a
  // basket silently converted every other line, correctly mapped or not, into
  // "KOI hasn't confirmed which product this is". A basket containing a dev
  // fixture (id "os-dfm") did exactly that to two real, verified SKUs.
  //
  // A non-uuid can never match a uuid column, so dropping it here loses nothing
  // and it keeps its unmapped default from the loop above. Failing honestly for
  // one line must not mean failing honestly for all of them.
  const queryable = koiSkuIds.filter((id) => UUID.test(String(id)));
  if (!queryable.length) return out;

  const { data, error } = await supabase
    .from("marketplace_sku_map")
    .select("koi_sku_id, external_id, variant_ref, scope, scope_ref, match_query, confidence, verified_at")
    .eq("marketplace", marketplace)
    .eq("is_active", true)
    .in("koi_sku_id", queryable);

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

/**
 * The reverse direction: which KOI SKUs do these provider ids correspond to?
 *
 * A shelf query returns the provider's catalogue, most of which KOI has never
 * screened. This is how the few that ARE KOI products are recognised, so a
 * grid can show real availability without spending a search per card.
 *
 * TRUST IS ENFORCED IN THIS DIRECTION TOO, and it matters more here. Forward,
 * an untrusted mapping means KOI asks about the wrong product. Backward, it
 * means a provider's stock line is pinned onto a KOI product card — a claim
 * about a specific screened food, made from a match nobody confirmed. Rows
 * that are neither verified nor confident enough are dropped, and those SKUs
 * simply stay `unknown`.
 *
 * `scope` is deliberately not consulted. A store-scoped row still names the
 * same provider product; which zone it was recorded for does not change what
 * `external_id` identifies. Forward resolution needs scope to pick BETWEEN
 * candidate rows; here there is nothing to pick between.
 *
 * @param {string} marketplace  adapter id, e.g. 'mock' or 'swiggy'
 * @param {string[]} externalIds  provider ids, typically from a shelf result
 * @returns {Promise<Record<string, string>>} externalId → koiSkuId, trusted only
 */
export async function resolveKoiSkusByExternalId(marketplace, externalIds = []) {
  const out = {};
  if (!marketplace || !externalIds.length) return out;

  const supabase = getServiceClient();
  if (!supabase) return out;

  // `external_id` is text, so there is no 22P02 hazard in this direction — but
  // the list is still deduped and bounded, because it is built from whatever a
  // provider chose to return.
  const ids = [...new Set(externalIds.map(String).filter(Boolean))];
  if (!ids.length) return out;

  const { data, error } = await supabase
    .from("marketplace_sku_map")
    .select("koi_sku_id, external_id, confidence, verified_at")
    .eq("marketplace", marketplace)
    .eq("is_active", true)
    .in("external_id", ids);

  if (error) {
    console.error("resolveKoiSkusByExternalId:", error.message);
    return out;
  }

  for (const r of data ?? []) {
    const trusted = isTrustedMapping({
      externalId: r.external_id,
      confidence: r.confidence,
      verifiedAt: r.verified_at,
    });
    if (!trusted) continue;
    // First trusted row wins. Two KOI SKUs claiming one provider id is a data
    // fault, not something to resolve by guessing which pack was meant.
    if (out[r.external_id]) continue;
    out[r.external_id] = r.koi_sku_id;
  }

  return out;
}
