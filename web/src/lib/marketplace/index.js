// ============================================================================
// KOI — Marketplace, public API
//
// SERVER ONLY. The `server-only` import below makes importing this from a
// client component a build error rather than a runtime surprise.
//
// That boundary is a compliance argument as much as an architectural one: the
// browser never receives a provider's raw payload, only availability states
// and prices attached to products KOI already curates. There is no shape in
// which the storefront could leak a catalogue, which matters because bulk
// catalogue export is grounds for credential revocation.
//
// Route handlers under app/api/marketplace/ are the ONLY callers.
// Client components use ./browser.js.
// ============================================================================

import "server-only";

import { ADAPTERS, TTL, BUDGET } from "./config";
import { AVAILABILITY, SERVICEABILITY, SIGNAL_SOURCE } from "./types";
import { NotServiceableError } from "./errors";
import { nullAdapter } from "./adapters/null";
import { createMockAdapter } from "./adapters/mock";
import { readThrough, cacheKey, cacheStats } from "./cache/shelfCache";

let cached = null;

/**
 * The configured supply source.
 *
 * Defaults to NullAdapter when KOI_MARKETPLACE is unset or unrecognised — the
 * honest state, and the one that must ship if configuration is missing. The
 * mock is opt-in precisely so it can never leak into production and invent
 * stock that does not exist.
 *
 * @returns {import('./types').MarketplaceAdapter}
 */
export function getMarketplaceAdapter() {
  if (cached) return cached;

  switch (process.env.KOI_MARKETPLACE) {
    case ADAPTERS.MOCK:
      cached = createMockAdapter();
      break;
    case ADAPTERS.SWIGGY:
      // Not implemented: KOI has no Swiggy credentials. Falling back to null
      // rather than throwing keeps the storefront up and honest.
      console.warn("KOI_MARKETPLACE=swiggy but no Swiggy adapter is available; using null.");
      cached = nullAdapter;
      break;
    default:
      cached = nullAdapter;
  }
  return cached;
}

/**
 * Collapse a pincode to a delivery zone. Cached hard — a pincode's dark store
 * does not move, and caching low-churn data is explicitly endorsed.
 *
 * @param {string} pincode
 * @returns {Promise<import('./types').ZoneResult>}
 */
export async function resolveZone(pincode) {
  if (!pincode) return { zone: null, serviceability: SERVICEABILITY.UNKNOWN };

  const adapter = getMarketplaceAdapter();
  const key = cacheKey("zone", pincode);

  try {
    const { value } = await readThrough(key, () => adapter.resolveZone({ pincode }), {
      ttlMs: TTL.zoneMs,
    });
    return value ?? { zone: null, serviceability: SERVICEABILITY.UNKNOWN };
  } catch (err) {
    if (err instanceof NotServiceableError) {
      // A definite answer, not a failure.
      return { zone: null, serviceability: SERVICEABILITY.NOT_SERVICEABLE };
    }
    return { zone: null, serviceability: SERVICEABILITY.UNKNOWN };
  }
}

/**
 * Render a shelf: ONE provider call returning many products, shared by every
 * shopper looking at the same shelf in the same zone within the TTL window.
 *
 * @param {{ zoneId: string, shelfId: string, query: string, limit?: number }} params
 * @returns {Promise<import('./types').ShelfResult>}
 */
export async function runShelfQuery({ zoneId, shelfId, query, limit }) {
  const adapter = getMarketplaceAdapter();
  const empty = {
    items: [],
    cursor: null,
    fetchedAt: new Date().toISOString(),
    source: SIGNAL_SOURCE.NONE,
    degraded: false,
    zoneId,
  };

  if (!zoneId || !query) return empty;

  try {
    const { value, source, degraded } = await readThrough(
      cacheKey(zoneId, shelfId),
      () => adapter.runShelfQuery({ zoneId, shelfId, query, limit }),
      { ttlMs: TTL.shelfMs }
    );
    if (!value) return { ...empty, degraded };
    // The cache reports how IT answered (live fetch, cache hit, stale). An
    // adapter that asked nobody — NullAdapter — reports `none`, and that must
    // survive: saying "live" would imply a provider actually answered.
    const adapterSource = value.source;
    return {
      ...value,
      source: adapterSource === SIGNAL_SOURCE.NONE ? SIGNAL_SOURCE.NONE : source,
      degraded,
    };
  } catch {
    return { ...empty, degraded: true };
  }
}

/**
 * Verify specific SKUs. Costs a search per item — there is no lookup by id —
 * so it is cached and coalesced exactly like a shelf.
 *
 * @param {{ zoneId: string, items: Array<{koiSkuId: string, externalId?: string|null, matchQuery?: string|null}>, withSubstitutes?: boolean }} params
 * @returns {Promise<Record<string, import('./types').ItemResult>>} keyed by koiSkuId
 */
export async function verifyItems({ zoneId, items = [], withSubstitutes = false }) {
  const adapter = getMarketplaceAdapter();

  const results = await Promise.all(
    items.map(async (it) => {
      const unknown = {
        item: null,
        availability: AVAILABILITY.UNKNOWN,
        substitutes: [],
        checkedAt: new Date().toISOString(),
        source: SIGNAL_SOURCE.NONE,
      };
      if (!zoneId) return [it.koiSkuId, unknown];

      try {
        const { value } = await readThrough(
          cacheKey(zoneId, `item:${it.koiSkuId}`),
          () =>
            adapter.verifyItem({
              zoneId,
              koiSkuId: it.koiSkuId,
              externalId: it.externalId ?? null,
              matchQuery: it.matchQuery ?? null,
              withSubstitutes,
            }),
          { ttlMs: TTL.itemMs }
        );
        return [it.koiSkuId, value ?? unknown];
      } catch {
        return [it.koiSkuId, unknown];
      }
    })
  );

  return Object.fromEntries(results);
}

export { cacheStats, AVAILABILITY, SERVICEABILITY, SIGNAL_SOURCE, TTL, BUDGET };
