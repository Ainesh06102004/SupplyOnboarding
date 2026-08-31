// ============================================================================
// KOI — Marketplace contract
//
// The seam between KOI's curated, screened catalogue and a live supply source
// (Swiggy Instamart first; the shape is deliberately provider-agnostic).
//
// It carries THREE things and nothing else: identity, price, availability.
//
// It deliberately CANNOT express nutrition, ingredients, allergens, claims or
// scores — not "we ignore those fields", there is no field. A supply source
// tells KOI what is buyable and for how much. It is not an evidence source
// about what is in the food. That is the health-data-integrity rule enforced by
// the type rather than by discipline.
//
// It also does not decide what to show. Eligibility and ranking stay in the KRE
// (lib/recommendation), which must never learn that a marketplace exists.
//
// Documentation only — no runtime exports beyond the frozen enums.
// ============================================================================

import { AVAILABILITY } from "@/lib/recommendation/config";

export { AVAILABILITY };

/** Whether a zone can be served at all. Distinct from stock. */
export const SERVICEABILITY = Object.freeze({
  SERVICEABLE: "serviceable",
  NOT_SERVICEABLE: "not_serviceable",
  UNKNOWN: "unknown",
});

/** Where an answer came from. `none` means nothing was asked or nothing replied. */
export const SIGNAL_SOURCE = Object.freeze({
  LIVE: "live",
  CACHE: "cache",
  STALE: "stale",
  NONE: "none",
});

/**
 * What a supply source can and cannot do.
 *
 * The UI branches on THIS, never on the adapter's name. That is what stops
 * `if (marketplace === 'swiggy')` appearing in a component and what lets a
 * second supply partner drop in without touching the storefront.
 *
 * @typedef {Object} MarketplaceCapabilities
 * @property {'search_only'|'catalogue'} browse
 *   Swiggy is `search_only`: there is no category browse and no lookup by id.
 * @property {number|null} maxResultsPerQuery  null when undocumented.
 * @property {boolean} supportsPagination
 * @property {'single_replace'|'multi'|'none'} cartModel
 *   Swiggy is `single_replace`: one cart per account per server, and
 *   update_cart REPLACES it. This is why the hand-off is two-phase.
 * @property {boolean} merchantOfRecord  false for Swiggy — KOI cannot take payment.
 * @property {'external_redirect'|'inline'|'none'} paymentHandoff
 * @property {boolean} supportsSubstitutes
 * @property {{ requestsPerMinute: number, scope: 'per_credential'|'per_user' }} rateBudget
 */

/**
 * A delivery zone: the unit availability is actually decided in.
 *
 * NOT a pincode. India has ~19,000 pincodes and a city's dark-store catchments
 * number in the dozens, so caching per pincode would multiply cost by three
 * orders of magnitude for no extra precision. resolveZone() exists to collapse
 * pincode → zone, and the cache is keyed on the zone.
 *
 * @typedef {Object} Zone
 * @property {string} zoneId          Opaque, KOI-owned. NOT a provider id.
 * @property {string} marketplace
 * @property {string} pincode         What the shopper gave us.
 * @property {'serviceable'|'not_serviceable'|'unknown'} serviceability
 * @property {string|null} addressRef
 *   Opaque, credential-scoped handle the provider needs to answer a query
 *   (Swiggy's addressId). Never leaves the server, and deliberately NOT named
 *   `addressId` — the concept has to survive a provider whose zoning is a store
 *   id or a polygon.
 * @property {'house'|'user'} credentialScope
 *   Which credential pool answered. Logged-out browse and a shopper's own
 *   checkout have different quotas and different failure modes.
 * @property {string} label           Human-readable: "Instamart · Koramangala"
 * @property {string} resolvedAt      ISO
 * @property {number} ttlSeconds
 *
 * @typedef {Object} ZoneQuery
 * @property {string} pincode
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {AbortSignal} [signal]
 *
 * @typedef {{ zone: Zone|null, serviceability: string }} ZoneResult
 */

/**
 * One buyable thing at a provider.
 *
 * Note what is absent: no nutrition, no claims, no score. `rawName` and
 * `rawBrand` exist ONLY as matching input — they are never rendered as a KOI
 * product name, which comes from KOI's own catalogue.
 *
 * @typedef {Object} MarketplaceItem
 * @property {string} marketplace
 * @property {string} externalId       Swiggy's spinId. Opaque; never parsed.
 * @property {string|null} variantRef  Secondary discriminator (skuId) when the
 *                                     provider splits identity below product.
 * @property {string} rawName          MATCHING INPUT ONLY.
 * @property {string|null} rawBrand    MATCHING INPUT ONLY.
 * @property {string|null} rawPackSize
 * @property {number|null} price       ₹ live. null unless availability is 'available'.
 * @property {number|null} mrp
 * @property {'available'|'unavailable'|'unknown'} availability
 * @property {string|null} deliveryEta Provider's own estimate, or null.
 * @property {string} observedAt       ISO — when the provider ACTUALLY answered.
 */

/**
 * A shelf is a stored QUERY STRING, not a stored product list.
 *
 * This is the whole cost model: rendering a shelf is one provider call that
 * returns many products, so cost scales with (zones × shelves) per TTL window
 * rather than with traffic or catalogue size.
 *
 * @typedef {Object} ShelfQuery
 * @property {string} zoneId
 * @property {string} shelfId   KOI's shelf identity — the second cache dimension.
 * @property {string} query     The stored query string. THE shelf definition.
 * @property {number} [limit]
 * @property {string|null} [cursor]  Opaque. Never expose a provider's offset.
 * @property {AbortSignal} [signal]
 *
 * @typedef {Object} ShelfResult
 * @property {MarketplaceItem[]} items
 * @property {string|null} cursor
 * @property {string} fetchedAt
 * @property {'live'|'cache'|'stale'|'none'} source
 * @property {boolean} degraded   true when serving stale or partial data.
 * @property {string} zoneId
 */

/**
 * Verifying one item costs a SEARCH — there is no lookup-by-id — so it must be
 * cached and coalesced exactly like a shelf, and batched where callers ask
 * about several SKUs at once.
 *
 * @typedef {Object} ItemQuery
 * @property {string} zoneId
 * @property {string} koiSkuId
 * @property {string|null} externalId  From the SKU map; null means unmapped.
 * @property {string|null} matchQuery  How to FIND it, given no id lookup.
 * @property {boolean} [withSubstitutes]
 *
 * @typedef {Object} ItemResult
 * @property {MarketplaceItem|null} item
 * @property {'available'|'unavailable'|'unknown'} availability
 * @property {MarketplaceItem[]} substitutes
 * @property {string} checkedAt
 * @property {'live'|'cache'|'stale'|'none'} source
 */

/**
 * The hand-off is two-phase because the provider's cart is destructive.
 *
 * Swiggy holds ONE Instamart cart per account and update_cart REPLACES it
 * wholesale. So prepare is read-only and idempotent; commit is the only
 * destructive call in the system, guarded by a persisted plan so a double
 * submit cannot double-replace.
 *
 * @typedef {Object} HandoffRequest
 * @property {string} zoneId
 * @property {string} profileId
 * @property {Array<{ koiSkuId: string, quantity: number }>} lines
 *
 * @typedef {Object} HandoffPlan
 * @property {string} planId
 * @property {'redirect'|'replace_cart'|'unsupported'} mode
 * @property {Array<{ koiSkuId: string, externalId: string, quantity: number, unitPrice: number|null }>} accepted
 * @property {Array<{ koiSkuId: string, reason: 'unavailable'|'unmapped'|'unknown'|'quantity_capped', substitutes: MarketplaceItem[] }>} rejected
 * @property {{ subtotal: number|null, currency: 'INR', complete: boolean }} totals
 *   `complete` is false when any line is unknown — and then NO total is shown.
 *   A total containing a guessed line is a fabricated number.
 * @property {Array<{ code: 'CART_REPLACED'|'PARTIAL_FULFILMENT'|'PRICE_CHANGED', message: string }>} warnings
 * @property {string} expiresAt
 *
 * @typedef {{ planId: string, profileId: string, idempotencyKey: string }} CommitRequest
 *
 * @typedef {Object} HandoffResult
 * @property {'committed'|'expired'|'rejected'} status
 * @property {string|null} handoffUrl       External checkout — KOI is not MoR.
 * @property {string|null} externalCartRef
 * @property {string} intentId              KOI's own fulfilment intent.
 */

/**
 * Every adapter implements exactly this. Nothing else in the system knows
 * which one is in use.
 *
 * @typedef {Object} MarketplaceAdapter
 * @property {string} id
 * @property {MarketplaceCapabilities} capabilities
 * @property {(q: ZoneQuery) => Promise<ZoneResult>} resolveZone
 * @property {(q: ShelfQuery) => Promise<ShelfResult>} runShelfQuery
 * @property {(q: ItemQuery) => Promise<ItemResult>} verifyItem
 * @property {(r: HandoffRequest) => Promise<HandoffPlan>} prepareHandoff
 * @property {(c: CommitRequest) => Promise<HandoffResult>} commitHandoff
 */

/** An item nothing is known about. Constructed, never inferred. */
export function unknownItem(marketplace, externalId, partial = {}) {
  return {
    marketplace,
    externalId,
    variantRef: null,
    rawName: "",
    rawBrand: null,
    rawPackSize: null,
    price: null,
    mrp: null,
    availability: AVAILABILITY.UNKNOWN,
    deliveryEta: null,
    observedAt: new Date().toISOString(),
    ...partial,
  };
}
