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
import { createSwiggyAdapter } from "./adapters/swiggy";
import { readThrough, cacheKey, cacheStats } from "./cache/shelfCache";
import { resolveKoiSkusByExternalId } from "./skuMapRepo";
import { SHELVES } from "./shelves";

let cached = null;

/**
 * Dev-only knobs for the mock.
 *
 * The mock decides availability from a hash of (zone, item, TTL window), which
 * is exactly right — deterministic, no Math.random, and cached vs live is
 * observable. But it means the adversarial states are only reachable by
 * waiting for the right 30-second window, so the unavailable-with-substitutes
 * path is nearly impossible to demo or test on purpose.
 *
 * These let a developer pin them:
 *   KOI_MOCK_OUT_OF_STOCK_RATE=1   every item unavailable
 *   KOI_MOCK_UNKNOWN_RATE=1        every item unknown
 *   KOI_MOCK_ERROR_RATE=1          every call fails
 *
 * Only ever read when KOI_MARKETPLACE=mock, which production never sets.
 * Unset variables are omitted entirely rather than passed as undefined, which
 * would clobber the mock's own defaults through the spread.
 */
function mockOptionsFromEnv() {
  const opts = {};
  const rate = (name, key) => {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) opts[key] = n;
  };
  rate("KOI_MOCK_OUT_OF_STOCK_RATE", "outOfStockRate");
  rate("KOI_MOCK_UNKNOWN_RATE", "unknownRate");
  rate("KOI_MOCK_ERROR_RATE", "errorRate");
  return opts;
}

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
export function getMarketplaceAdapter({ profileId = null } = {}) {
  // A per-shopper adapter is NOT cached. The cached instance is the anonymous
  // one — house credential or none — and it exists to avoid re-reading env, not
  // to avoid construction, which is a closure and a few properties.
  //
  // Without this argument the singleton was built once with profileId null, so
  // createSwiggyAdapter() could never reach getCredential() and a shopper's
  // connected account was stored and never read. Any caller acting FOR someone
  // must say who.
  if (profileId) return buildAdapter({ profileId });
  if (cached) return cached;
  cached = buildAdapter({ profileId: null });
  return cached;
}

function buildAdapter({ profileId }) {
  switch (process.env.KOI_MARKETPLACE) {
    case ADAPTERS.MOCK:
      return createMockAdapter({ ...mockOptionsFromEnv(), profileId });
    case ADAPTERS.SWIGGY:
      // Implemented, but UNVERIFIED against the live server — the transport
      // framing in adapters/swiggy/client.js is a documented guess. It stays
      // safe to select: with no credential every method returns `unknown`,
      // which is exactly what the null adapter would have said, so selecting it
      // early costs nothing and lets the wiring be exercised.
      return createSwiggyAdapter({ profileId });
    default:
      return nullAdapter;
  }
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
 * WHOSE answer a cached entry is.
 *
 * A connected shopper is asked about at THEIR address, so their result is not
 * interchangeable with anyone else's and must not share a cache entry with
 * them. Adapters that cannot vary by shopper report "house" and share one
 * entry per zone, which is what makes house-credential browse affordable.
 *
 * @param {object} adapter
 * @param {string} zoneId
 * @returns {Promise<string>}
 */
async function audienceFor(adapter, zoneId) {
  return typeof adapter.audienceKey === "function"
    ? await adapter.audienceKey({ zoneId })
    : "house";
}

/**
 * Render a shelf: ONE provider call returning many products, shared by every
 * shopper looking at the same shelf in the same zone within the TTL window.
 *
 * @param {{ zoneId: string, shelfId: string, query: string, limit?: number }} params
 * @returns {Promise<import('./types').ShelfResult>}
 */
export async function runShelfQuery({ zoneId, shelfId, query, limit, profileId = null }) {
  const adapter = getMarketplaceAdapter({ profileId });
  const empty = {
    items: [],
    cursor: null,
    fetchedAt: new Date().toISOString(),
    source: SIGNAL_SOURCE.NONE,
    degraded: false,
    zoneId,
  };

  if (!zoneId || !query) return empty;

  // Audience-scoped for the same reason verifyItems is: once shoppers connect
  // their own accounts a shelf is answered at THEIR address, and an unscoped
  // key would serve one shopper's stock states to another. This was latent
  // rather than harmless — nothing had ever called a shelf from the UI.
  const audience = await audienceFor(adapter, zoneId);

  try {
    const { value, source, degraded } = await readThrough(
      cacheKey(zoneId, shelfId, audience),
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
export async function verifyItems({ zoneId, items = [], withSubstitutes = false, profileId = null }) {
  const adapter = getMarketplaceAdapter({ profileId });

  // WHOSE answer this is. A connected shopper is asked about at THEIR address,
  // so their result is not interchangeable with anyone else's — see the note on
  // cacheKey. Adapters that cannot vary by shopper report "house" and share one
  // cache entry per zone, which is the behaviour this had before and the reason
  // house-credential browse is affordable at all.
  const audience = await audienceFor(adapter, zoneId);

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
          cacheKey(zoneId, `item:${it.koiSkuId}`, audience),
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

/**
 * Availability for KOI's catalogue in one zone, for a grid.
 *
 * WHY THIS IS NOT verifyItems OVER THE VISIBLE PRODUCTS. A verify costs one
 * provider search PER SKU, because there is no lookup by id. Running that
 * across a grid is the single most expensive thing this layer could do, and it
 * scales with how many products a shopper scrolls past — which is why
 * useProductSupply is documented as never running from a grid.
 *
 * So the grid rides the shelf path instead. The shelf set is closed and
 * already priced in: N queries per zone per TTL window, ONE provider call
 * each, coalesced across every shopper looking at that zone. Scrolling costs
 * nothing extra, and adding a product to KOI's catalogue costs nothing extra.
 *
 * WHAT IT CANNOT DO, honestly: a shelf answers with the provider's catalogue,
 * so a KOI product no shelf query surfaced gets no signal and stays `unknown`.
 * That is a real limit, not a bug — the alternative is a search per card. The
 * product page still verifies precisely, on engagement, where one call is
 * warranted.
 *
 * @param {{ zoneId: string, profileId?: string|null }} params
 * @returns {Promise<{items: Record<string, object>, degraded: boolean, source: string}>}
 *   items keyed by KOI SKU id
 */
export async function catalogueSupply({ zoneId, profileId = null }) {
  const empty = { items: {}, degraded: false, source: SIGNAL_SOURCE.NONE };
  if (!zoneId) return empty;

  const results = await Promise.all(
    SHELVES.map((shelf) =>
      runShelfQuery({
        zoneId,
        shelfId: shelf.id,
        query: shelf.query,
        limit: shelf.limit,
        profileId,
      })
    )
  );

  // Collapse the shelves into one view of each provider product. The same item
  // legitimately appears on several shelves, and the states can disagree —
  // they were fetched at different moments.
  const byExternalId = new Map();
  let degraded = false;
  let answered = false;

  for (const r of results) {
    if (r.degraded) degraded = true;
    if (r.source !== SIGNAL_SOURCE.NONE) answered = true;

    for (const item of r.items ?? []) {
      if (!item?.externalId) continue;
      const prev = byExternalId.get(item.externalId);
      if (!prev || preferSignal(item, prev) === item) byExternalId.set(item.externalId, item);
    }
  }

  const mapped = await resolveKoiSkusByExternalId(getMarketplaceAdapter().id, [...byExternalId.keys()]);

  const items = {};
  for (const [externalId, koiSkuId] of Object.entries(mapped)) {
    const signal = byExternalId.get(externalId);
    if (!signal) continue;
    items[koiSkuId] = {
      availability: signal.availability ?? AVAILABILITY.UNKNOWN,
      price: signal.price ?? null,
      mrp: signal.mrp ?? null,
      deliveryEta: signal.deliveryEta ?? null,
      observedAt: signal.observedAt ?? null,
    };
  }

  return {
    items,
    degraded,
    // `none` has to survive an adapter that asked nobody. Reporting a source
    // when the NullAdapter answered would imply a provider was consulted.
    source: answered ? SIGNAL_SOURCE.CACHE : SIGNAL_SOURCE.NONE,
  };
}

/**
 * Which of two signals for the same provider product to keep.
 *
 * A definite answer beats `unknown` — one shelf not covering an item is not
 * evidence against another shelf that did. Between two definite answers the
 * more recent observation wins, because both were true when observed and only
 * one still is.
 *
 * @returns {object} whichever argument to keep
 */
function preferSignal(a, b) {
  const defA = a?.availability && a.availability !== AVAILABILITY.UNKNOWN;
  const defB = b?.availability && b.availability !== AVAILABILITY.UNKNOWN;
  if (defA !== defB) return defA ? a : b;
  return String(a?.observedAt ?? "") >= String(b?.observedAt ?? "") ? a : b;
}

export { cacheStats, AVAILABILITY, SERVICEABILITY, SIGNAL_SOURCE, TTL, BUDGET };
