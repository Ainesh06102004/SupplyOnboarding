// ============================================================================
// KOI — Availability
// What KOI is entitled to say about whether a product can be bought right now.
//
// There is no supply source wired yet, so today the honest answer for every
// product is `unknown`. The rule that matters:
//
//   The absent thing is the CLAIM, not the product.
//
// An `unknown` product still renders - it is screened, real, and worth showing.
// What disappears is the stock line, the delivery estimate and the live price.
// Hiding the product instead would empty the store; asserting "In stock"
// instead is the availability version of inventing a nutrition value.
//
// Pure. No I/O, no globals, no clock reads except the `now` you pass in.
// Vocabulary lives in lib/recommendation/config.js so the engine, the UI and
// the eventual DB constraint cannot drift apart.
// ============================================================================

import { AVAILABILITY } from "@/lib/recommendation/config";

export { AVAILABILITY };

/**
 * @typedef {'available'|'unavailable'|'unknown'} AvailabilityState
 *
 * @typedef {Object} AvailabilitySignal
 * @property {AvailabilityState} state
 * @property {string|null} observedAt  ISO time the source actually answered;
 *                                     null iff state is 'unknown'
 * @property {number|null} price       live ₹; null unless state is 'available'
 * @property {string|null} source      which supply source answered, if any
 */

/** The default. Constructed explicitly so it can never be inferred by accident. */
export const UNKNOWN = Object.freeze({
  state: AVAILABILITY.UNKNOWN,
  observedAt: null,
  price: null,
  source: null,
});

const VALID = new Set(Object.values(AVAILABILITY));

/**
 * Read a product's availability without ever guessing.
 * Anything absent, malformed or unrecognised resolves to `unknown`.
 *
 * @param {object} product
 * @returns {AvailabilityState}
 */
export function availabilityOf(product) {
  const raw = product?.availability;
  const state = typeof raw === "string" ? raw : raw?.state;
  return VALID.has(state) ? state : AVAILABILITY.UNKNOWN;
}

/** @returns {boolean} true only when a source positively confirmed stock. */
export const isAvailable = (product) => availabilityOf(product) === AVAILABILITY.AVAILABLE;

/** @returns {boolean} true only when a source positively confirmed no stock. */
export const isUnavailable = (product) => availabilityOf(product) === AVAILABILITY.UNAVAILABLE;

/**
 * May the UI show a stock line, a delivery estimate or a live price?
 * Only when something actually told us. This is the single guard every
 * availability-flavoured piece of copy should sit behind.
 *
 * @returns {boolean}
 */
export const canClaimAvailability = (product) =>
  availabilityOf(product) !== AVAILABILITY.UNKNOWN;

/**
 * A stale `available` is not evidence. Past `maxAgeMs` it decays to `unknown`
 * rather than continuing to assert stock nobody has re-checked.
 *
 * `now` is injected so this stays deterministic and testable.
 *
 * @param {AvailabilitySignal} signal
 * @param {number} now epoch ms
 * @param {number} maxAgeMs
 * @returns {AvailabilitySignal}
 */
export function decay(signal, now, maxAgeMs) {
  if (!signal || signal.state === AVAILABILITY.UNKNOWN) return UNKNOWN;
  if (!signal.observedAt) return UNKNOWN;
  const age = now - Date.parse(signal.observedAt);
  if (!Number.isFinite(age) || age > maxAgeMs) return UNKNOWN;
  return signal;
}

/**
 * Stable ordering for a shelf: confirmed stock first, then unverified, then
 * confirmed out-of-stock. Never reorders within a group, so the engine's
 * ranking survives intact.
 *
 * @param {Array} items products or DTOs carrying `availability`
 * @returns {Array}
 */
export function byAvailability(items = []) {
  const rank = { [AVAILABILITY.AVAILABLE]: 0, [AVAILABILITY.UNKNOWN]: 1, [AVAILABILITY.UNAVAILABLE]: 2 };
  return items
    .map((item, i) => ({ item, i, r: rank[availabilityOf(item.product ?? item)] ?? 1 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ item }) => item);
}
