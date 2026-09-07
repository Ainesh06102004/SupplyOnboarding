// ============================================================================
// KOI — Demand-driven coalescing cache
//
// Logged-out browse runs on ONE house credential, so the provider's per-user
// rate limit is the ENTIRE storefront's browse budget. This layer is not an
// optimisation — it is the only reason browse is possible at all.
//
// Three mechanisms, in order:
//   1. single-flight  — concurrent callers wanting the same key await ONE call
//   2. read-through   — a fresh entry answers without touching the provider
//   3. degrade        — out of budget or upstream down, serve stale, else
//                       `unknown`. NEVER queue: a queue turns a quota problem
//                       into a latency problem and still breaches the quota.
//
// Keyed on (zoneId, shelfId), NOT (pincode, shelfId). India has ~19,000
// pincodes and a city's dark-store catchments number in the dozens, so keying
// on pincode would multiply cardinality by three orders of magnitude for no
// extra precision.
//
// DEMAND-DRIVEN BY CONSTRUCTION. There is deliberately no warm(), sweep(),
// refreshAll() or prefetch() in this module, and adding one would be a
// credential-revocation risk rather than a performance improvement: a
// background sweep across zones is bulk catalogue export, which providers
// treat as abuse regardless of what it is called. Every fetch here is caused
// by a shopper who is looking at the result. Expiry is lazy, checked on read,
// so there is no reaper either.
// ============================================================================

import { TTL, BUDGET } from "../config";
import { SIGNAL_SOURCE } from "../types";
import { RateLimitError } from "../errors";

/** Concurrent callers for one key share a single in-flight promise. */
const inflight = new Map();

/** Cached entries: key → { value, storedAt }. */
const store = new Map();

/** Rolling per-minute call ledger: minute bucket → count. */
const ledger = new Map();

/**
 * @param {string} zoneId
 * @param {string} shelfId
 * @param {string} [audience] WHOSE view this answer is. See below.
 *
 * The audience segment is a correctness and privacy boundary, not a tuning
 * knob. Keying on (zone, shelf) alone is right while every lookup runs on one
 * house credential, because one address then serves the whole zone. It is
 * WRONG the moment shoppers connect their own Swiggy accounts: each one queries
 * their OWN address, so two shoppers in the same zone can legitimately get
 * different stock and different prices — and a zone-keyed cache would serve one
 * shopper's answer to the other.
 *
 * Callers pass a HASH of the address, never the address itself: cache keys end
 * up in logs and metrics, and a provider address id is a handle on somebody's
 * home.
 */
export const cacheKey = (zoneId, shelfId, audience = "house") =>
  `${zoneId}::${shelfId}::${audience}`;

function spend(now, limit) {
  const bucket = Math.floor(now / 60_000);
  // Drop older buckets; the ledger never grows.
  for (const k of ledger.keys()) if (k < bucket) ledger.delete(k);
  const used = ledger.get(bucket) || 0;
  if (used >= limit) return false;
  ledger.set(bucket, used + 1);
  return true;
}

/**
 * Read through the cache, coalescing concurrent callers.
 *
 * @param {string} key
 * @param {() => Promise<any>} fetcher  the provider call
 * @param {{ ttlMs?: number, budget?: number, now?: () => number }} [opts]
 * @returns {Promise<{ value: any, source: string, degraded: boolean }>}
 */
export async function readThrough(key, fetcher, opts = {}) {
  const ttlMs = opts.ttlMs ?? TTL.shelfMs;
  const budget = opts.budget ?? BUDGET.houseRequestsPerMinute;
  const now = opts.now ? opts.now() : Date.now();

  const entry = store.get(key);
  const age = entry ? now - entry.storedAt : Infinity;

  // 1. Fresh enough to answer directly.
  if (entry && age < ttlMs) {
    return { value: entry.value, source: SIGNAL_SOURCE.CACHE, degraded: false };
  }

  // 2. Someone is already asking for exactly this. Wait for them.
  const pending = inflight.get(key);
  if (pending) {
    const value = await pending;
    return { value, source: SIGNAL_SOURCE.CACHE, degraded: false };
  }

  // 3. Out of budget: degrade, never queue.
  if (!spend(now, budget)) {
    if (entry && age < TTL.staleMaxMs) {
      return { value: entry.value, source: SIGNAL_SOURCE.STALE, degraded: true };
    }
    return { value: null, source: SIGNAL_SOURCE.NONE, degraded: true };
  }

  const promise = (async () => {
    const value = await fetcher();
    store.set(key, { value, storedAt: now });
    return value;
  })();

  inflight.set(key, promise);

  try {
    const value = await promise;
    return { value, source: SIGNAL_SOURCE.LIVE, degraded: false };
  } catch (err) {
    // A stale answer is still evidence, up to a point. Past staleMaxMs it is
    // not, and we say we do not know rather than keep asserting old stock.
    if (entry && age < TTL.staleMaxMs) {
      return { value: entry.value, source: SIGNAL_SOURCE.STALE, degraded: true };
    }
    if (err instanceof RateLimitError) {
      return { value: null, source: SIGNAL_SOURCE.NONE, degraded: true };
    }
    throw err;
  } finally {
    inflight.delete(key);
  }
}

/** Observability: what the layer is currently holding and spending. */
export function cacheStats(now = Date.now()) {
  const bucket = Math.floor(now / 60_000);
  return {
    liveKeys: store.size,
    inflight: inflight.size,
    callsThisMinute: ledger.get(bucket) || 0,
    budget: BUDGET.houseRequestsPerMinute,
    maxLiveKeys: BUDGET.maxLiveKeys,
  };
}

/** Test seam only. Not a cache-invalidation strategy. */
export function __resetCache() {
  store.clear();
  inflight.clear();
  ledger.clear();
}
