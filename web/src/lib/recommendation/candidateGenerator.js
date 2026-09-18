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
// Nor is "KOI has not screened it yet" a reason to hide it. It used to be: the
// pool required a score above zero, so 45 of the shop's products could be
// browsed on the shelf and were invisible to every sentence typed at search —
// a shopper could see a thing and be told KOI had nothing like it. An unscreened
// product is a candidate; what it is not is *recommended*, and that is the
// scoring engine's job, not this one's. It carries `screened: false`, earns no
// trust points, can never be called well-screened, sorts below anything scored,
// and is refused outright by any view that asks for a minimum score.
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
      VISIBLE_STATUSES.has(f.status)
    );
}
