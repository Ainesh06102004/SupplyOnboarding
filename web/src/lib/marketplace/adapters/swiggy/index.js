// ============================================================================
// KOI — Swiggy Instamart adapter
//
// SERVER ONLY. Implements the Phase 3 contract against Swiggy's 19 Instamart
// MCP tools. Nothing above lib/marketplace/ knows this file exists.
//
// UNVERIFIED AGAINST THE LIVE SERVER — KOI has no credentials. The response
// mapping is pure and tested (./mapping.js); the transport framing is a
// documented guess (./client.js). Treat every method here as correct in shape
// and unconfirmed in fact until one read-only call has been made on staging.
//
// THREE PROVIDER FACTS THIS DESIGN IS BUILT AROUND:
//
// 1. There is no anonymous read. `search_products` requires an `addressId`
//    from `get_addresses`, and addresses belong to an authenticated user. So
//    availability for a signed-out shopper is only possible via a KOI house
//    account — an open question with Swiggy, not a capability KOI has.
//
// 2. There is no lookup by id. Verifying one product costs a search, which is
//    why verification is demand-driven and cached rather than swept.
//
// 3. The cart is destructive and singular. One cart per account per server, and
//    `update_cart` REPLACES it wholesale. That is why the hand-off is two
//    phase: prepare reads and is repeatable, commit writes exactly once.
// ============================================================================

import "server-only";

import { AVAILABILITY, SERVICEABILITY, SIGNAL_SOURCE } from "../../types";
import { NotConfiguredError, NotServiceableError } from "../../errors";
import { callTool } from "./client";
import { fromSearchProducts, fromCartUpdate, toMarketplaceItem } from "./mapping";
import { addressRefForZone, resolveZoneByPincode } from "../../zoneRepo";
import { getHouseCredential, getCredential } from "../../credentials";

const MARKETPLACE = "swiggy";

/** @type {import('../../types').MarketplaceCapabilities} */
const capabilities = Object.freeze({
  // No category browse and no id lookup — a search box is the only door in.
  browse: "search_only",
  // Undocumented. Deliberately null so nothing depends on a page size Swiggy
  // never promised.
  maxResultsPerQuery: null,
  supportsPagination: true, // via `nextOffset`
  // One cart per account per server, replaced wholesale by update_cart.
  cartModel: "single_replace",
  // KOI never takes payment. The shopper pays Swiggy, on Swiggy.
  merchantOfRecord: false,
  paymentHandoff: "external_redirect",
  // search_products returns similarProducts — but KOI does not surface them to
  // shoppers, because an unscreened substitute is not something KOI can vouch
  // for. They are used server-side as SKU-map candidates only.
  supportsSubstitutes: true,
  rateBudget: { requestsPerMinute: 70, scope: "per_user" },
});

/**
 * @param {object} [options]
 * @param {string|null} [options.profileId] when acting for a signed-in shopper
 */
export function createSwiggyAdapter(options = {}) {
  const { profileId = null } = options;

  /**
   * The credential this call runs on.
   *
   * A signed-in shopper's own token when there is one; otherwise the house
   * credential, which KOI does not currently have. Returning null makes every
   * method degrade to `unknown` — the honest state, and the one that must hold
   * until Swiggy answers the house-account question.
   */
  async function token() {
    if (profileId) {
      const own = await getCredential(profileId, MARKETPLACE);
      if (own) return own;
    }
    return getHouseCredential(MARKETPLACE);
  }

  /** The provider address a zone is queried against. */
  async function addressFor(zoneId, cred) {
    const fromZone = await addressRefForZone(MARKETPLACE, zoneId);
    // A user-scoped credential carries its own selected address; a house
    // credential's comes from the zone table.
    return fromZone ?? cred?.externalAccountRef ?? null;
  }

  return {
    id: MARKETPLACE,
    capabilities,

    /**
     * Pincode → zone. Resolved entirely from KOI's own tables: Swiggy has no
     * pincode endpoint, and `address_ref` is what makes the zone queryable.
     */
    async resolveZone({ pincode }) {
      const zone = await resolveZoneByPincode(MARKETPLACE, pincode);
      if (!zone) {
        // KOI has not mapped this pincode. NOT "Swiggy does not deliver here" —
        // that is a claim about Swiggy which this absence cannot support.
        return { zone: null, serviceability: SERVICEABILITY.UNKNOWN };
      }
      if (zone.serviceability === SERVICEABILITY.NOT_SERVICEABLE) {
        throw new NotServiceableError(`Zone ${zone.zoneId} is not serviceable`);
      }
      return {
        zone: { zoneId: zone.zoneId, label: zone.label, addressRef: zone.addressRef },
        serviceability: zone.serviceability,
      };
    },

    /**
     * One shelf = one search. The query comes from KOI's closed shelf registry,
     * never from shopper input.
     */
    async runShelfQuery({ zoneId, shelfId, query, limit }) {
      const cred = await token();
      const now = new Date().toISOString();
      const empty = {
        items: [], cursor: null, fetchedAt: now,
        source: SIGNAL_SOURCE.NONE, degraded: false, zoneId,
      };

      if (!cred) return empty;
      const addressId = await addressFor(zoneId, cred);
      if (!addressId) return empty;

      const { data } = await callTool({
        tool: "search_products",
        args: { addressId, query },
        accessToken: cred.accessToken,
      });
      if (!data) return { ...empty, degraded: true };

      const { items, cursor } = fromSearchProducts(data, new Date().toISOString());
      return {
        // `limit` is KOI's own cap. Swiggy documents no page size, so this
        // trims locally rather than pretending to have asked for it.
        items: typeof limit === "number" ? items.slice(0, limit) : items,
        cursor,
        fetchedAt: new Date().toISOString(),
        source: SIGNAL_SOURCE.LIVE,
        degraded: false,
        zoneId,
      };
    },

    /**
     * Verify one KOI SKU.
     *
     * Costs a search, because there is no lookup by id: KOI asks for the
     * mapped product by its stored match query and then picks the variation
     * whose spinId matches the mapping. A search hit whose spinId does NOT
     * match resolves to `unknown` rather than to that hit's stock state — the
     * top result for "greek yogurt" is not evidence about the specific tub KOI
     * screened.
     */
    async verifyItem({ zoneId, externalId, matchQuery, withSubstitutes = false }) {
      const cred = await token();
      const now = new Date().toISOString();
      const unknown = {
        item: null, availability: AVAILABILITY.UNKNOWN, substitutes: [],
        checkedAt: now, source: SIGNAL_SOURCE.NONE,
      };

      // Unmapped, unconfigured, or no address: three different reasons to not
      // know, all of which are `unknown` rather than out of stock.
      if (!cred || !externalId || !matchQuery) return unknown;
      const addressId = await addressFor(zoneId, cred);
      if (!addressId) return unknown;

      const { data } = await callTool({
        tool: "search_products",
        args: { addressId, query: matchQuery },
        accessToken: cred.accessToken,
      });
      if (!data) return unknown;

      const observedAt = new Date().toISOString();
      let match = null;
      for (const product of Array.isArray(data.products) ? data.products : []) {
        for (const variation of Array.isArray(product.variations) ? product.variations : []) {
          if (String(variation?.spinId) === String(externalId)) {
            match = toMarketplaceItem(variation, product, observedAt);
            break;
          }
        }
        if (match) break;
      }

      // Searched and did not find it. That is genuinely ambiguous — delisted,
      // out of catchment, or simply not surfaced by this query — so it stays
      // `unknown`. Reading absence from a search as "out of stock" would put a
      // definite claim on an indefinite result.
      if (!match) return { ...unknown, checkedAt: observedAt, source: SIGNAL_SOURCE.LIVE };

      return {
        item: match,
        availability: match.availability,
        // Never surfaced to shoppers. See capabilities.supportsSubstitutes.
        substitutes: [],
        checkedAt: observedAt,
        source: SIGNAL_SOURCE.LIVE,
      };
    },

    /**
     * PREPARE — read-only and repeatable.
     *
     * Establishes what Swiggy would accept, without touching the cart. Safe to
     * call as many times as the shopper reloads the reconciliation screen.
     */
    async prepareHandoff({ zoneId, lines = [] }) {
      const cred = await token();
      if (!cred) throw new NotConfiguredError("No Swiggy credential for this shopper");
      const addressId = await addressFor(zoneId, cred);
      if (!addressId) throw new NotConfiguredError("No Swiggy address for this zone");

      const accepted = [];
      const rejected = [];

      for (const line of lines) {
        const verified = await this.verifyItem({
          zoneId,
          koiSkuId: line.koiSkuId,
          externalId: line.externalId ?? null,
          matchQuery: line.matchQuery ?? null,
        });

        if (verified.availability === AVAILABILITY.AVAILABLE && verified.item) {
          accepted.push({
            koiSkuId: line.koiSkuId,
            externalId: verified.item.externalId,
            variantRef: verified.item.variantRef,
            quantity: line.quantity,
            unitPrice: verified.item.price,
          });
        } else {
          rejected.push({
            koiSkuId: line.koiSkuId,
            reason: verified.availability === AVAILABILITY.UNAVAILABLE ? "unavailable" : "unknown",
            substitutes: [],
          });
        }
      }

      return {
        planId: `swiggy_${zoneId}_${Date.now()}`,
        addressId,
        accepted,
        rejected,
        // Stated every time, because it drives a confirmation the shopper must
        // see: committing REPLACES whatever is in their Swiggy cart.
        warnings: accepted.length ? ["CART_REPLACED"] : [],
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
    },

    /**
     * COMMIT — the only destructive call in the system.
     *
     * `update_cart` replaces the shopper's entire Swiggy cart. It is called
     * exactly once per plan; the plan's committed_at in
     * marketplace_handoff_plan is what enforces that, not this function.
     *
     * Deliberately stops at the cart. `checkout` is NOT called here: KOI is not
     * merchant of record, the shopper confirms and pays on Swiggy, and
     * Swiggy's own docs require explicit user confirmation before checkout.
     * KOI's last act is handing over a filled cart.
     */
    async commitHandoff({ addressId, accepted = [] }) {
      const cred = await token();
      if (!cred) throw new NotConfiguredError("No Swiggy credential for this shopper");
      if (!addressId) throw new NotConfiguredError("No Swiggy address for this hand-off");

      const items = accepted.map((a) => ({
        spinId: a.externalId,
        skuId: a.variantRef,
        quantity: a.quantity,
      }));

      const { data } = await callTool({
        tool: "update_cart",
        args: { selectedAddressId: addressId, items },
        accessToken: cred.accessToken,
      });

      // Swiggy reports what it actually did — lines dropped as out of stock,
      // lines capped by quantity. KOI records that rather than assuming the
      // cart it asked for is the cart that now exists.
      const outcomes = fromCartUpdate(data ?? {}, accepted);

      return {
        committedAt: new Date().toISOString(),
        outcomes,
        // No order id: nothing has been ordered. The shopper checks out on
        // Swiggy, and KOI learns nothing further unless they tell us.
        externalOrderRef: null,
      };
    },
  };
}
