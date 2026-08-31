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
  const now = () => (cfg.clock ? cfg.clock() : Date.now());
  let callCount = 0;

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

  function itemFor(fixture, seed) {
    const roll = hashFloat(`${seed}:${fixture.externalId}:stock`);
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
      // Seeded on the TTL window so results are stable within it and change at
      // the boundary — the cache becomes observable rather than invisible.
      const seed = `${zoneId}:${query}:${windowOf(now(), TTL.shelfMs)}`;
      await simulateCall(seed);

      const start = hashInt(`${seed}:offset`, Math.max(1, FIXTURE_POOL.length - limit));
      const picked = FIXTURE_POOL.slice(start, start + Math.min(limit, capabilities.maxResultsPerQuery));

      return {
        items: picked.map((f) => itemFor(f, seed)),
        cursor: null,
        fetchedAt: new Date(now()).toISOString(),
        source: SIGNAL_SOURCE.LIVE,
        degraded: false,
        zoneId,
        shelfId,
      };
    },

    async verifyItem({ zoneId, koiSkuId, externalId, matchQuery, withSubstitutes = false }) {
      if (!externalId) {
        // Unmapped: we cannot even ask. Not the same as out of stock.
        return {
          item: null,
          availability: AVAILABILITY.UNKNOWN,
          substitutes: [],
          checkedAt: new Date(now()).toISOString(),
          source: SIGNAL_SOURCE.NONE,
        };
      }

      const seed = `${zoneId}:${externalId}:${windowOf(now(), TTL.itemMs)}`;
      await simulateCall(seed);

      const fixture =
        FIXTURE_POOL.find((f) => f.externalId === externalId) ||
        FIXTURE_POOL[hashInt(`${koiSkuId}:${matchQuery}`, FIXTURE_POOL.length)];

      const item = itemFor(fixture, seed);

      // Substitutes only matter when the thing asked for cannot be bought.
      const substitutes =
        withSubstitutes && item.availability !== AVAILABILITY.AVAILABLE
          ? FIXTURE_POOL.filter((f) => f.externalId !== fixture.externalId)
              .slice(0, 3)
              .map((f) => itemFor(f, `${seed}:sub`))
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
        expiresAt: new Date(now() + TTL.itemMs).toISOString(),
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
