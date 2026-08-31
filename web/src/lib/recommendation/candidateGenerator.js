// ============================================================================
// KRE — Step 1: Candidate Generator
// Produces the pool of products that are even eligible to be shown: verified/
// approved, and not known to be out of stock.
//
// Excludes ONLY known-unavailable inventory. Unknown availability is not a
// reason to hide a screened product — it is only a reason to make no claim
// about buying it. Hiding on `unknown` would empty the store, since nothing
// has a supply source yet.
//
// Deterministic; no scoring, no user context.
// ============================================================================

import { extractFacts } from "./productFacts";
import { AVAILABILITY } from "./config";

const VISIBLE_STATUSES = new Set(["approved", "verified", "live"]);

/**
 * @param {Array} products raw products from the inventory/repository
 * @returns {Array} facts[] for products that may be shown
 */
export function generateCandidates(products = []) {
  return products
    .filter((p) => p && p.id)
    .map(extractFacts)
    .filter((f) =>
      f.availability !== AVAILABILITY.UNAVAILABLE &&
      VISIBLE_STATUSES.has(f.status) &&
      f.trust > 0
    );
}
