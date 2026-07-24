// ============================================================================
// KRE — Step 1: Candidate Generator
// Produces the pool of products that are even eligible to be shown: available,
// in stock, verified/approved. Never surfaces unavailable inventory.
// Deterministic; no scoring, no user context.
// ============================================================================

import { extractFacts } from "./productFacts";

const VISIBLE_STATUSES = new Set(["approved", "verified", "live"]);

/**
 * @param {Array} products raw products from the inventory/repository
 * @returns {Array} facts[] for available products only
 */
export function generateCandidates(products = []) {
  return products
    .filter((p) => p && p.id)
    .map(extractFacts)
    .filter((f) => f.inStock && VISIBLE_STATUSES.has(f.status) && f.trust > 0);
}
