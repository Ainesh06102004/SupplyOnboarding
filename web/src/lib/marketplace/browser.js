// ============================================================================
// KOI — Marketplace, browser side
//
// The client's only route to supply data. Deliberately does NOT import
// ./index.js — that module is server-only and pulls in adapter code, provider
// credentials and raw payloads, none of which belong in a bundle.
//
// Every function here fails soft. A supply source being unreachable must
// degrade the page to "we don't know", never break it: `unknown` is a state the
// UI already renders correctly, so a failure lands somewhere safe.
// ============================================================================

import { AVAILABILITY } from "@/lib/recommendation/config";

async function post(path, body, signal) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

/**
 * What the configured supply source can do.
 *
 * The storefront branches on capabilities, never on the adapter's name. On
 * failure this returns the honest floor — a source that can do nothing — so a
 * network blip can never invite a shopper into a hand-off that cannot happen.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<{adapter: string, capabilities: object}>}
 */
export async function fetchCapabilities(signal) {
  const floor = {
    adapter: "null",
    capabilities: {
      browse: "search_only",
      cartModel: "none",
      merchantOfRecord: false,
      paymentHandoff: "none",
      supportsSubstitutes: false,
    },
  };
  try {
    const res = await fetch("/api/marketplace/capabilities", { signal });
    if (!res.ok) return floor;
    return await res.json();
  } catch {
    return floor;
  }
}

/**
 * Resolve a pincode to an opaque zone id.
 *
 * @param {string} pincode
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ zoneId: string|null, serviceability: string, label: string|null }>}
 */
export async function fetchZone(pincode, signal) {
  try {
    const data = await post("/api/marketplace/zone", { pincode }, signal);
    return {
      zoneId: data.zone?.zoneId ?? null,
      label: data.zone?.label ?? null,
      serviceability: data.serviceability,
    };
  } catch {
    return { zoneId: null, label: null, serviceability: "unknown" };
  }
}

/**
 * Availability and price for one shelf, keyed by the provider's opaque id.
 *
 * Returns an empty map on failure rather than throwing, so a caller merging
 * this into products gets `unknown` everywhere — which is true, and which the
 * UI already handles.
 *
 * @param {string} zoneId
 * @param {string} shelfId
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ items: Record<string, object>, degraded: boolean, source: string }>}
 */
export async function fetchShelfSupply(zoneId, shelfId, signal) {
  if (!zoneId || !shelfId) return { items: {}, degraded: false, source: "none" };

  try {
    const data = await post("/api/marketplace/shelf", { zoneId, shelfId }, signal);
    const items = {};
    for (const i of data.items || []) items[i.externalId] = i;
    return { items, degraded: !!data.degraded, source: data.source };
  } catch {
    return { items: {}, degraded: true, source: "none" };
  }
}

/**
 * Ask the provider about specific KOI SKUs.
 *
 * The demand-driven half of the design: this costs one provider search PER
 * SKU and serves one shopper, so it fires when someone opens a product — never
 * on render, and never in a loop over a grid.
 *
 * Fails soft to an empty map, which resolves every id to `unknown` at the call
 * site. That is true, and it is a state the UI already renders.
 *
 * @param {string} zoneId
 * @param {string[]} koiSkuIds  at most 5; the route rejects more
 * @param {AbortSignal} [signal]
 * @returns {Promise<Record<string, object>>} keyed by KOI SKU id
 */
export async function verifySupply(zoneId, koiSkuIds = [], signal) {
  if (!zoneId || !koiSkuIds.length) return {};
  try {
    const data = await post("/api/marketplace/verify", { zoneId, koiSkuIds }, signal);
    return data.items || {};
  } catch {
    return {};
  }
}

/**
 * Ask what the delivery partner would accept for this basket.
 *
 * READ-ONLY and repeatable — nothing is reserved, nothing is bought, and the
 * shopper's provider cart is untouched. Safe to call again whenever they change
 * something.
 *
 * @param {string} zoneId
 * @param {Array<{koiSkuId: string, quantity: number}>} lines
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ok: boolean, plan: object|null, code: string|null}>}
 */
export async function prepareHandoff(zoneId, lines, signal) {
  try {
    const plan = await post("/api/marketplace/handoff/prepare", { zoneId, lines }, signal);
    return { ok: true, plan, code: null };
  } catch (err) {
    // The distinction matters to the UI: "nothing is connected" is a normal
    // state to explain, while a transport failure is worth retrying.
    const code = /503/.test(String(err?.message)) ? "NOT_CONFIGURED" : "ERROR";
    return { ok: false, plan: null, code };
  }
}

/**
 * Commit the plan. THE DESTRUCTIVE ONE.
 *
 * The provider's cart is singular and gets REPLACED, so this must be reachable
 * only from an explicit confirmation — never on mount, never on a retry timer.
 *
 * @param {string} planId
 * @param {AbortSignal} [signal]
 */
export async function commitHandoff(planId, signal) {
  try {
    const result = await post("/api/marketplace/handoff/commit", { planId }, signal);
    return { ok: result.status === "committed", result, code: null };
  } catch (err) {
    const m = String(err?.message);
    const code = /401/.test(m) ? "REAUTH" : /429/.test(m) ? "RATE_LIMITED" : /503/.test(m) ? "NOT_CONFIGURED" : "ERROR";
    return { ok: false, result: null, code };
  }
}

/**
 * Attach supply signals to KOI products.
 *
 * Pure, one pass, Map lookup — never a `.find()` inside the loop.
 *
 * A product with no matching signal keeps `unknown`: absence of a signal is
 * absence of knowledge, never evidence of stock.
 *
 * @param {Array} products
 * @param {Record<string, object>} supplyByExternalId
 * @returns {Array} products with availability, price and deliveryEta attached
 */
export function attachSupply(products = [], supplyByExternalId = {}) {
  const supply = new Map(Object.entries(supplyByExternalId));
  if (!supply.size) return products;

  return products.map((p) => {
    const signal = p.externalId ? supply.get(p.externalId) : null;
    if (!signal) return p;
    return {
      ...p,
      availability: signal.availability ?? AVAILABILITY.UNKNOWN,
      // Live price only when the item is actually purchasable; otherwise keep
      // KOI's own MRP, which is a fact about the product rather than a claim
      // about buying it right now.
      price: signal.availability === AVAILABILITY.AVAILABLE && signal.price != null ? signal.price : p.price,
      deliveryEta: signal.deliveryEta ?? null,
    };
  });
}
