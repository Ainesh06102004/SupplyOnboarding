// ============================================================================
// KOI — MockAdapter
//
// Development supply source. Deliberately ADVERSARIAL, because a friendly mock
// produces code that breaks on first contact with a real provider.
//
// It therefore:
//   • returns products KOI has never heard of, so matching code is exercised
//     rather than trivially satisfied;
//   • produces all three availability states, including `unknown` in-band;
//   • injects latency, errors, rate limits and non-serviceable areas, so every
//     failure screen gets designed now instead of discovered in production;
//   • enforces the real cart constraint — one cart, replaced wholesale — so the
//     hand-off is built against the semantics that actually apply.
//
// Everything is seeded from a hash, so a given zone and query yield the same
// result within a TTL window and change at the boundary. That makes the cache
// visible in development, and makes any bug reproducible.
//
// It CANNOT express nutrition: the item type has no field for it.
// ============================================================================

import { AVAILABILITY, SERVICEABILITY, SIGNAL_SOURCE } from "../../types";
import { TTL } from "../../config";
import { NotServiceableError, RateLimitError, UpstreamError } from "../../errors";
import { hash32, hashFloat, hashInt } from "./seededHash";
import { FIXTURE_POOL, NOT_SERVICEABLE_PINCODES } from "./fixtures";
import { getCredential } from "../../credentials";

/** @type {import('../../types').MarketplaceCapabilities} */
const capabilities = Object.freeze({
  browse: "search_only",
  // Swiggy documents no page size, so the mock picks one and the code must not
  // depend on the number.
  maxResultsPerQuery: 20,
  supportsPagination: true,
  cartModel: "single_replace",
  merchantOfRecord: false,
  paymentHandoff: "external_redirect",
  supportsSubstitutes: true,
  rateBudget: { requestsPerMinute: 70, scope: "per_credential" },
});

const DEFAULTS = Object.freeze({
  latencyMs: [80, 400],
  errorRate: 0.04,
  rateLimitEvery: 0, // 0 = never; set to N to throw on every Nth call
  outOfStockRate: 0.2,
  unknownRate: 0.08,
});

/** Which TTL window we are in — makes cached vs live observable in dev. */
const windowOf = (now, ms) => Math.floor(now / ms);

function zoneIdFor(pincode) {
  // Collapse pincode to a coarse zone, mirroring the real many-to-one shape:
  // neighbouring pincodes share a dark store.
  return `mock-zone-${String(pincode).slice(0, 4)}`;
}

export function createMockAdapter(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const profileId = options.profileId ?? null;
  const now = () => (cfg.clock ? cfg.clock() : Date.now());
  let callCount = 0;

  /**
   * Has this shopper connected their (mock) marketplace account?
   *
   * The mock models this because the REAL provider does. search_products needs
   * an addressId and addresses belong to an authenticated user, so an
   * unconnected visitor cannot be told anything about stock. A mock that
   * answered anyway would make development disagree with production in exactly
   * the dimension the product is built around, and the disagreement would only
   * surface on the day credentials arrived.
   *
   * `unknown` for the unconnected is not a degraded mode. It is the storefront
   * working correctly: KOI's screened catalogue is shown to everyone, and
   * availability is shown to whoever has given KOI a way to ask.
   */
  async function connected() {
    if (!profileId) return false;
    try {
      return Boolean(await getCredential(profileId, "mock"));
    } catch {
      return false;
    }
  }

  async function simulateCall(seed) {
    callCount += 1;

    if (cfg.rateLimitEvery > 0 && callCount % cfg.rateLimitEvery === 0) {
      throw new RateLimitError("Mock rate limit reached", 30_000);
    }

    const [lo, hi] = cfg.latencyMs;
    const delay = lo + hashInt(`${seed}:latency`, Math.max(1, hi - lo));
    await new Promise((r) => setTimeout(r, delay));

    if (hashFloat(`${seed}:err:${windowOf(now(), TTL.shelfMs)}`) < cfg.errorRate) {
      throw new UpstreamError("Mock upstream failure");
    }
  }

  /**
   * One fixture as the provider would report it, in one zone, right now.
   *
   * THE STOCK ROLL IS KEYED ON (zone, product, time) AND NOTHING ELSE. It used
   * to be keyed on the caller's seed, which differed per path: a shelf seeded
   * on (zone, query, shelfWindow), a verify on (zone, externalId, itemWindow),
   * substitutes on the verify seed plus ":sub". Those are independent hashes,
   * so one product had several unrelated stock states at the same instant —
   * the grid could say available while the reconciliation screen said no, at
   * roughly the out-of-stock rate, as an artefact of which code asked. A
   * product sitting on eight shelves even got eight rolls.
   *
   * A real provider has ONE stock state per product per zone per moment, and
   * a search and a lookup at the same instant agree. Now so does this.
   *
   * Drift between paths is still reachable, and should be: the stock window is
   * TTL.shelfMs, so a shelf answer cached across a boundary can be staler than
   * a fresh verify. That is genuine cache staleness — exactly what the
   * reconciliation screen exists to catch — rather than two random processes.
   */
  function itemFor(fixture, zoneId) {
    const roll = hashFloat(`${zoneId}:${fixture.externalId}:${windowOf(now(), TTL.shelfMs)}:stock`);
    let availability = AVAILABILITY.AVAILABLE;
    if (roll < cfg.outOfStockRate) availability = AVAILABILITY.UNAVAILABLE;
    else if (roll < cfg.outOfStockRate + cfg.unknownRate) availability = AVAILABILITY.UNKNOWN;

    const available = availability === AVAILABILITY.AVAILABLE;
    return {
      marketplace: "mock",
      externalId: fixture.externalId,
      variantRef: fixture.variantRef ?? null,
      rawName: fixture.rawName,
      rawBrand: fixture.rawBrand ?? null,
      rawPackSize: fixture.rawPackSize ?? null,
      // Price only when the item is actually purchasable.
      price: available ? fixture.price : null,
      mrp: fixture.mrp ?? fixture.price,
      availability,
      deliveryEta: available ? "Today, 30–45 min" : null,
      observedAt: new Date(now()).toISOString(),
    };
  }

  return {
    id: "mock",

    /**
     * Whose answer this is. The mock varies by shopper exactly as the real
     * adapter does, so that a cache bug which would leak one shopper's
     * availability to another shows up in development rather than in
     * production. See the note on cacheKey.
     */
    async audienceKey() {
      return (await connected()) ? `user:${hash32(String(profileId))}` : "house";
    },
    capabilities,

    async resolveZone({ pincode }) {
      if (!pincode) return { zone: null, serviceability: SERVICEABILITY.UNKNOWN };

      await simulateCall(`zone:${pincode}`);

      if (NOT_SERVICEABLE_PINCODES.includes(String(pincode))) {
        // A designed answer, not a failure: some areas genuinely are not served.
        throw new NotServiceableError(`Mock does not serve ${pincode}`);
      }

      const zoneId = zoneIdFor(pincode);
      return {
        serviceability: SERVICEABILITY.SERVICEABLE,
        zone: {
          zoneId,
          marketplace: "mock",
          pincode: String(pincode),
          serviceability: SERVICEABILITY.SERVICEABLE,
          addressRef: `mock-addr-${hash32(zoneId)}`,
          credentialScope: "house",
          label: `Mock · zone ${String(pincode).slice(0, 4)}`,
          resolvedAt: new Date(now()).toISOString(),
          ttlSeconds: Math.floor(TTL.zoneMs / 1000),
        },
      };
    },

    async runShelfQuery({ zoneId, shelfId, query, limit = 20 }) {
      const nothingKnown = {
        items: [],
        cursor: null,
        fetchedAt: new Date(now()).toISOString(),
        source: SIGNAL_SOURCE.NONE,
        degraded: false,
        zoneId,
        shelfId,
      };

      // Same gate as verifyItem, and it was missing here. `connected()` was
      // consulted only for the cache key, so the mock answered shelf queries
      // for visitors it had no way to ask on behalf of — while the real
      // adapter needs an addressId, and an addressId belongs to an
      // authenticated user. Harmless while nothing called shelves; the moment
      // a grid did, it made connected and disconnected look identical there
      // and would have gone on doing so until credentials arrived.
      if (!(await connected())) return nothingKnown;

      // Seeded on the TTL window so results are stable within it and change at
      // the boundary — the cache becomes observable rather than invisible.
      const seed = `${zoneId}:${query}:${windowOf(now(), TTL.shelfMs)}`;
      await simulateCall(seed);

      const start = hashInt(`${seed}:offset`, Math.max(1, FIXTURE_POOL.length - limit));
      const picked = FIXTURE_POOL.slice(start, start + Math.min(limit, capabilities.maxResultsPerQuery));

      return {
        items: picked.map((f) => itemFor(f, zoneId)),
        cursor: null,
        fetchedAt: new Date(now()).toISOString(),
        source: SIGNAL_SOURCE.LIVE,
        degraded: false,
        zoneId,
        shelfId,
      };
    },

    async verifyItem({ zoneId, koiSkuId, externalId, matchQuery, withSubstitutes = false }) {
      const nothingKnown = {
        item: null,
        availability: AVAILABILITY.UNKNOWN,
        substitutes: [],
        checkedAt: new Date(now()).toISOString(),
        source: SIGNAL_SOURCE.NONE,
      };

      // Unmapped: we cannot even ask. Not the same as out of stock.
      if (!externalId) return nothingKnown;

      // Nobody has given KOI a way to ask on this shopper's behalf. Same shape
      // as unmapped and for the same reason — an absent answer, not a negative
      // one. See connected() above.
      if (!(await connected())) return nothingKnown;

      const seed = `${zoneId}:${externalId}:${windowOf(now(), TTL.itemMs)}`;
      await simulateCall(seed);

      const fixture =
        FIXTURE_POOL.find((f) => f.externalId === externalId) ||
        FIXTURE_POOL[hashInt(`${koiSkuId}:${matchQuery}`, FIXTURE_POOL.length)];

      const item = itemFor(fixture, zoneId);

      // Substitutes only matter when the thing asked for cannot be bought.
      const substitutes =
        withSubstitutes && item.availability !== AVAILABILITY.AVAILABLE
          ? FIXTURE_POOL.filter((f) => f.externalId !== fixture.externalId)
              .slice(0, 3)
              .map((f) => itemFor(f, zoneId))
              .filter((s) => s.availability === AVAILABILITY.AVAILABLE)
          : [];

      return {
        item,
        availability: item.availability,
        substitutes,
        checkedAt: new Date(now()).toISOString(),
        source: SIGNAL_SOURCE.LIVE,
      };
    },

    async prepareHandoff({ zoneId, profileId, lines = [] }) {
      const seed = `${zoneId}:${profileId}:plan`;
      await simulateCall(seed);

      const accepted = [];
      const rejected = [];

      for (const line of lines) {
        const verified = await this.verifyItem({
          zoneId,
          koiSkuId: line.koiSkuId,
          externalId: line.externalId ?? null,
          matchQuery: line.matchQuery ?? line.koiSkuId,
          withSubstitutes: true,
        });

        if (verified.availability === AVAILABILITY.AVAILABLE) {
          accepted.push({
            koiSkuId: line.koiSkuId,
            externalId: verified.item.externalId,
            quantity: line.quantity,
            unitPrice: verified.item.price,
          });
        } else {
          rejected.push({
            koiSkuId: line.koiSkuId,
            reason: verified.availability === AVAILABILITY.UNAVAILABLE ? "unavailable" : "unknown",
            substitutes: verified.substitutes,
          });
        }
      }

      // A total is only shown when every line is priced. Anything else would
      // be a number KOI cannot stand behind.
      const complete = rejected.length === 0;
      const subtotal = complete
        ? accepted.reduce((s, a) => s + (a.unitPrice || 0) * a.quantity, 0)
        : null;

      const warnings = [];
      if (capabilities.cartModel === "single_replace") {
        warnings.push({
          code: "CART_REPLACED",
          message: "Continuing replaces whatever is currently in your marketplace cart.",
        });
      }
      if (rejected.length) {
        warnings.push({
          code: "PARTIAL_FULFILMENT",
          message: `${rejected.length} item(s) can't be fulfilled from this basket.`,
        });
      }

      return {
        planId: `mock-plan-${hash32(seed + lines.length)}`,
        mode: "replace_cart",
        accepted,
        rejected,
        totals: { subtotal, currency: "INR", complete },
        warnings,
        // TTL.planMs, not itemMs: a plan is how long a person has to decide,
        // not how long an availability answer stays fresh.
        expiresAt: new Date(now() + TTL.planMs).toISOString(),
      };
    },

    async commitHandoff({ planId }) {
      await simulateCall(`commit:${planId}`);
      return {
        status: "committed",
        handoffUrl: "https://example.invalid/mock-checkout",
        externalCartRef: `mock-cart-${hash32(planId)}`,
        intentId: `mock-intent-${hash32(planId)}`,
      };
    },
  };
}

export default createMockAdapter;
