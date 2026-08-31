// ============================================================================
// KOI — NullAdapter
//
// The DEFAULT, and the honest description of production today: KOI has no
// supply source, so nothing is known about stock, price or delivery.
//
// This is not a stub to be replaced by "the real one" — it is the correct
// implementation for the no-supply case, and it must stay correct forever.
// If the environment is misconfigured, this is what runs, and it makes no
// claims at all. The mock must never be able to leak into production and
// pretend stock exists.
//
// Every method returns the same shape a real adapter returns, so the whole
// storefront can be built and exercised against it.
// ============================================================================

import { AVAILABILITY, SERVICEABILITY, SIGNAL_SOURCE } from "../../types";

/** @type {import('../../types').MarketplaceCapabilities} */
const capabilities = Object.freeze({
  browse: "search_only",
  maxResultsPerQuery: null,
  supportsPagination: false,
  cartModel: "none",
  merchantOfRecord: false,
  paymentHandoff: "none",
  supportsSubstitutes: false,
  rateBudget: { requestsPerMinute: 0, scope: "per_credential" },
});

/** @type {import('../../types').MarketplaceAdapter} */
export const nullAdapter = {
  id: "null",
  capabilities,

  async resolveZone() {
    // Not "not serviceable" — that would assert the provider does not deliver
    // here, which is also something we do not know.
    return { zone: null, serviceability: SERVICEABILITY.UNKNOWN };
  },

  async runShelfQuery({ zoneId }) {
    return {
      items: [],
      cursor: null,
      fetchedAt: new Date().toISOString(),
      source: SIGNAL_SOURCE.NONE,
      degraded: false,
      zoneId,
    };
  },

  async verifyItem() {
    return {
      item: null,
      availability: AVAILABILITY.UNKNOWN,
      substitutes: [],
      checkedAt: new Date().toISOString(),
      source: SIGNAL_SOURCE.NONE,
    };
  },

  async prepareHandoff({ lines = [] }) {
    // Everything is rejected as `unknown`, not as `unavailable`: KOI cannot
    // fulfil, but it also cannot say these products are out of stock.
    return {
      planId: null,
      mode: "unsupported",
      accepted: [],
      rejected: lines.map((l) => ({
        koiSkuId: l.koiSkuId,
        reason: "unknown",
        substitutes: [],
      })),
      totals: { subtotal: null, currency: "INR", complete: false },
      warnings: [],
      expiresAt: new Date().toISOString(),
    };
  },

  async commitHandoff() {
    return {
      status: "rejected",
      handoffUrl: null,
      externalCartRef: null,
      intentId: null,
    };
  },
};

export default nullAdapter;
