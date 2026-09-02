// ============================================================================
// KOI — Swiggy Instamart response mapping
//
// Pure functions turning Swiggy's shapes into KOI's contract. Kept separate
// from the transport so the risky part — the part where a field name being
// wrong silently produces a confident lie about stock — is testable without a
// network, a credential, or an approved partner account.
//
// TWO THINGS THAT DECIDE THE WHOLE DESIGN:
//
// 1. IDENTITY LIVES ON THE VARIATION, NOT THE PRODUCT.
//    A SearchProduct carries `productId` and a `variations[]` array; each
//    variation has its own `spinId` AND `skuId`, and update_cart requires BOTH.
//    So KOI's externalId is the spinId and variantRef is the skuId, and a
//    "product" in Swiggy's sense is not the thing you can buy — a pack size is.
//    This is why availability is resolved per KOI SKU rather than per product.
//
// 2. THERE ARE TWO STOCK FLAGS AT TWO LEVELS, AND THEY DISAGREE.
//    The product carries `inStock` and `isAvail`; the variation carries
//    `isInStockAndAvailable`. The variation flag is the one that matters,
//    because it is the thing with a spinId that can enter a cart. A product
//    flagged inStock whose only variation is unavailable is not purchasable.
//    See availabilityOfVariation for how disagreement is resolved: toward
//    `unknown`, never toward a confident yes.
// ============================================================================

import { AVAILABILITY } from "../../types";

/** Number, or null. Never coerces a missing value to 0. */
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** A non-empty trimmed string, or null. */
const str = (v) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};

/**
 * Availability for one variation.
 *
 * `isInStockAndAvailable` is authoritative when present, because it is the
 * flag attached to the thing that has a spinId. When it is absent we fall back
 * to the product-level flags — and require BOTH `inStock` and `isAvail`,
 * because they mean different things (stocked vs serviceable here) and either
 * being false makes the item unbuyable.
 *
 * Absent entirely resolves to `unknown`, not to unavailable: a missing field
 * is a gap in what Swiggy told us, not a statement that the shelf is empty.
 *
 * @param {object} variation
 * @param {object} [product] the parent SearchProduct
 */
export function availabilityOfVariation(variation, product = {}) {
  const v = variation?.isInStockAndAvailable;
  if (v === true) return AVAILABILITY.AVAILABLE;
  if (v === false) return AVAILABILITY.UNAVAILABLE;

  const inStock = product?.inStock;
  const isAvail = product?.isAvail;
  if (inStock === false || isAvail === false) return AVAILABILITY.UNAVAILABLE;
  if (inStock === true && isAvail === true) return AVAILABILITY.AVAILABLE;

  return AVAILABILITY.UNKNOWN;
}

/**
 * Price for a variation, in rupees.
 *
 * Swiggy's `price` carries `mrp`, `offerPrice` and `unitLevelPrice`. What a
 * shopper pays is the offer price when there is one, else the MRP — but ONLY
 * when the item is actually purchasable. An unavailable item's price is null
 * by contract, because a price for something you cannot buy is not a price,
 * and rendering it invites "₹99 — out of stock" which reads as a promise.
 *
 * `unitLevelPrice` (₹ per 100 g and so on) is deliberately dropped: it is a
 * derived display string, and KOI computes its own comparisons from label data.
 */
export function priceOfVariation(variation, availability) {
  const p = variation?.price ?? {};
  const mrp = num(p.mrp);
  const offer = num(p.offerPrice);
  const payable = offer ?? mrp;
  return {
    price: availability === AVAILABILITY.AVAILABLE ? payable : null,
    mrp,
  };
}

/**
 * One Swiggy variation → one MarketplaceItem.
 *
 * rawName / rawBrand / rawPackSize are MATCHING INPUT ONLY — they exist so the
 * SKU map can be built and audited server-side, and the API routes strip them
 * before anything reaches a browser. See app/api/marketplace/*.
 *
 * @param {object} variation
 * @param {object} product   parent SearchProduct
 * @param {string} observedAt ISO timestamp of when Swiggy actually answered
 * @returns {import('../../types').MarketplaceItem|null}
 */
export function toMarketplaceItem(variation, product = {}, observedAt = new Date().toISOString()) {
  const spinId = str(variation?.spinId);
  // No spinId means nothing that can be put in a cart, so there is no item.
  if (!spinId) return null;

  const availability = availabilityOfVariation(variation, product);
  const { price, mrp } = priceOfVariation(variation, availability);

  return {
    marketplace: "swiggy",
    externalId: spinId,
    // update_cart requires skuId alongside spinId, so this is not optional
    // decoration — a mapping without it cannot be added to a cart.
    variantRef: str(variation?.skuId),
    rawName: str(variation?.displayName) ?? str(product?.displayName) ?? "",
    rawBrand: str(variation?.brandName) ?? str(product?.brand),
    rawPackSize: str(variation?.quantityDescription),
    price,
    mrp,
    availability,
    // `sla` is Swiggy's own delivery estimate. Passed through untouched when
    // present and null otherwise — KOI never computes a delivery time.
    deliveryEta: str(variation?.sla),
    observedAt,
  };
}

/**
 * A whole search_products response → flat MarketplaceItem[].
 *
 * Flattened across variations because a variation is the purchasable unit.
 * Order is preserved: Swiggy's relevance ranking is the only relevance signal
 * available here, and re-sorting it would discard information without adding
 * any.
 *
 * @param {object} data the `data` object from search_products
 * @param {string} [observedAt]
 * @returns {{ items: import('../../types').MarketplaceItem[], cursor: string|null }}
 */
export function fromSearchProducts(data, observedAt = new Date().toISOString()) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const items = [];

  for (const product of products) {
    const variations = Array.isArray(product?.variations) ? product.variations : [];
    for (const variation of variations) {
      const item = toMarketplaceItem(variation, product, observedAt);
      if (item) items.push(item);
    }
  }

  return {
    items,
    // nextOffset is documented as a string; normalise to string|null and never
    // parse it — it is the provider's opaque pagination token.
    cursor: str(data?.nextOffset),
  };
}

/**
 * `similarProducts` from a search response → MarketplaceItem[].
 *
 * Exposed because the contract has a place for it, and NOT surfaced to
 * shoppers: KOI's substitutes come from KOI's own screened catalogue. See
 * lib/recommendation/substitutes.js for why. These are useful server-side only
 * — as candidates for building the SKU map, where a human confirms the match.
 */
export function fromSimilarProducts(data, observedAt = new Date().toISOString()) {
  const similar = Array.isArray(data?.similarProducts) ? data.similarProducts : [];
  const items = [];
  for (const product of similar) {
    const variations = Array.isArray(product?.variations) ? product.variations : [];
    for (const variation of variations) {
      const item = toMarketplaceItem(variation, product, observedAt);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * get_addresses → KOI zones.
 *
 * A Swiggy address IS the unit availability is decided against: search_products
 * requires an addressId, so an address is not merely a delivery destination —
 * it is the query key for the whole catalogue. `addressLine` and `phoneNumber`
 * are personal data and stay server-side; only the opaque id crosses into a
 * KOI zone as `addressRef`.
 *
 * @param {object} data the `data` object from get_addresses
 */
export function fromAddresses(data) {
  const rows = Array.isArray(data?.addresses) ? data.addresses : [];
  return rows.map((a) => ({
    addressRef: str(a?.id),
    // A label for KOI's own operators, never shown to another shopper.
    label: str(a?.addressTag) ?? str(a?.addressCategory) ?? "Saved address",
  })).filter((a) => a.addressRef);
}

/**
 * update_cart response → per-line outcomes.
 *
 * Swiggy reports what it did to the cart, and KOI must record it rather than
 * assume the cart it asked for is the cart that exists:
 *   · removedOutOfStockItems  lines silently dropped
 *   · reducedQuantityItems    lines capped, with a reason
 *
 * Both map onto fulfilment_intent_items.handoff_outcome. A line Swiggy did not
 * mention is 'added'; a line it removed is 'unavailable'. Anything KOI cannot
 * account for stays 'unknown' rather than being assumed successful.
 *
 * @param {object} data the `data` object from update_cart
 * @param {Array<{koiSkuId: string, externalId: string}>} requested
 */
export function fromCartUpdate(data, requested = []) {
  const removed = new Set(
    (Array.isArray(data?.removedOutOfStockItems) ? data.removedOutOfStockItems : [])
      .map((i) => str(i?.spinId))
      .filter(Boolean)
  );

  const capped = new Map();
  for (const r of Array.isArray(data?.reducedQuantityItems) ? data.reducedQuantityItems : []) {
    const id = str(r?.spinId);
    if (id) {
      capped.set(id, {
        requestedQuantity: num(r?.requestedQuantity),
        cappedQuantity: num(r?.cappedQuantity),
        reason: str(r?.reason) ?? str(r?.itemName),
      });
    }
  }

  return requested.map((line) => {
    if (removed.has(line.externalId)) {
      return { koiSkuId: line.koiSkuId, outcome: "unavailable", cappedQuantity: 0, reason: "Out of stock at Swiggy" };
    }
    const cap = capped.get(line.externalId);
    if (cap) {
      return {
        koiSkuId: line.koiSkuId,
        outcome: "added",
        cappedQuantity: cap.cappedQuantity,
        reason: cap.reason ?? "Quantity limited by Swiggy",
      };
    }
    return { koiSkuId: line.koiSkuId, outcome: "added", cappedQuantity: null, reason: null };
  });
}
