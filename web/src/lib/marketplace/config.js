// ============================================================================
// KOI — Marketplace tunables
// Frozen, in the KRE's style: behaviour changes by editing config, never code.
//
// The numbers here are a capacity model, not preferences. Read TTL and BUDGET
// together — they are the two halves of one constraint.
// ============================================================================

/**
 * How long an answer stays usable.
 *
 * Stock is the churny thing, so shelves are short. Zone lookup is low-churn —
 * a pincode's dark store does not move — and the provider's own docs endorse
 * caching that kind of data.
 *
 * `staleMaxMs` is the honesty limit: past it, a stale answer stops being
 * evidence and the layer reports `unknown` rather than keep asserting stock
 * nobody has re-checked.
 */
export const TTL = Object.freeze({
  shelfMs: 60_000,
  itemMs: 30_000,
  zoneMs: 86_400_000,
  staleMaxMs: 900_000,
});

/**
 * The request ceiling, and why it is this tight.
 *
 * Logged-out browse runs on ONE house credential, so the provider's per-user
 * limit is the ENTIRE storefront's browse budget — not a per-shopper
 * allowance. The cache is therefore not an optimisation; it is the only reason
 * browse is possible at all.
 *
 * Capacity is: distinct live keys <= requestsPerMinute × (TTL.shelfMs / 60s).
 * At 60 req/min and a 60s shelf TTL that is ~60 distinct (zone, shelf) pairs
 * live at once. Exceeding it must DEGRADE (serve stale, else unknown), never
 * queue — a queue turns a quota problem into a latency problem and still
 * breaches the quota.
 *
 * Swiggy's documented ceiling is 70/min per authenticated user; 60 leaves
 * headroom for item verification and the hand-off.
 */
export const BUDGET = Object.freeze({
  houseRequestsPerMinute: 60,
  userRequestsPerMinute: 20,
  maxLiveKeys: 60,
});

/** Identity-match confidence below which availability resolves to `unknown`. */
export const MATCH = Object.freeze({
  // Claiming that the in-stock thing at the provider IS the thing KOI screened
  // is a claim about a specific product. Below this, we do not make it.
  minConfidence: 0.8,
});

/** Which adapter backs live supply. `null` is the honest default. */
export const ADAPTERS = Object.freeze({
  NULL: "null",
  MOCK: "mock",
  SWIGGY: "swiggy",
});
