// ============================================================================
// KOI — SKU identity mapping
//
// Resolves a KOI SKU to a provider's identifier (Swiggy's spinId).
//
// There is an open question KOI cannot answer without credentials: is a spinId
// stable per product, or does it vary per dark store? This module is built so
// that either answer is a DATA change, not a schema or code change.
//
// Every mapping carries (scope, scope_ref), defaulting to ('global', '*').
// Resolution is most-specific-wins: store, then zone, then global. If spinId
// turns out to be per-store, you INSERT rows with scope='store' and nothing
// here or downstream changes.
//
// Pure. The index is built once by the caller and passed in — never a lookup
// inside a loop.
// ============================================================================

import { MATCH } from "./config";

/**
 * @typedef {Object} SkuMapping
 * @property {string} marketplace
 * @property {string} koiSkuId
 * @property {string|null} externalId  null = known to be unmapped
 * @property {string|null} variantRef
 * @property {'global'|'zone'|'store'} scope
 * @property {string} scopeRef         '*' for global
 * @property {string|null} matchQuery  how to FIND it — there is no id lookup
 * @property {number} confidence       0..1
 * @property {string|null} verifiedAt  null = never confirmed by a human
 */

const keyOf = (scope, scopeRef, koiSkuId) => `${scope}:${scopeRef}:${koiSkuId}`;

/**
 * Build the lookup index once, outside any loop.
 *
 * @param {SkuMapping[]} mappings
 * @returns {Map<string, SkuMapping>}
 */
export function buildSkuIndex(mappings = []) {
  const index = new Map();
  for (const m of mappings) {
    if (!m?.koiSkuId) continue;
    index.set(keyOf(m.scope || "global", m.scopeRef || "*", m.koiSkuId), m);
  }
  return index;
}

/**
 * Most-specific-wins resolution.
 *
 * @param {Map<string, SkuMapping>} index
 * @param {string} koiSkuId
 * @param {{ zoneId?: string, storeRef?: string }} [ctx]
 * @returns {SkuMapping|null}
 */
export function resolveMapping(index, koiSkuId, ctx = {}) {
  const { zoneId, storeRef } = ctx;
  return (
    (storeRef && index.get(keyOf("store", storeRef, koiSkuId))) ||
    (zoneId && index.get(keyOf("zone", zoneId, koiSkuId))) ||
    index.get(keyOf("global", "*", koiSkuId)) ||
    null
  );
}

/**
 * May this mapping be trusted enough to report availability?
 *
 * A weak match means we do not know that the in-stock thing at the provider is
 * the thing KOI screened. Reporting it as available would be a claim about the
 * wrong product — so a sub-threshold or unverified match resolves to `unknown`
 * rather than to a stock state.
 *
 * @param {SkuMapping|null} mapping
 * @returns {boolean}
 */
export function isTrustedMapping(mapping) {
  if (!mapping?.externalId) return false;
  if (mapping.verifiedAt) return true;
  return Number(mapping.confidence) >= MATCH.minConfidence;
}

/**
 * Normalise a product name for matching. Lowercase, strip punctuation, drop
 * pack sizes and collapse whitespace — provider names carry pack size inline
 * ("Amul Masti Dahi 400 g") where KOI keeps it as a separate field.
 *
 * @param {string} s
 * @returns {string}
 */
export function normaliseName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\d+(\.\d+)?\s*(g|kg|ml|l|gm|gms|grams?|litres?|liters?|pcs?|pack)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
