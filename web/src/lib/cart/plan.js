// ============================================================================
// KOI — the plan's side of the one cart. Pure.
//
// The planner's basket (report.basket / achieved.basket: { skuId, name, packs,
// packSize, cost, shares }) is turned into the packs the cart should hold, and
// a basket the cart was filled from is compared with the latest one, so the
// cart can OFFER an update instead of applying it.
//
// The comparison is on the planner's own basket, before "have it" ticks: what
// is at home is the shopper's call, kept on the cart's plan record (`atHome`),
// and re-applied on every update. What this file does not do: read the
// database or touch the store.
// ============================================================================

import { packs } from "./lines";

/**
 * The packs to buy from a basket, after what is at home.
 * @param {Array<{skuId: string|number, packs: number}>} basket
 * @param {{ atHome?: Iterable<string|number> }} [opts]
 * @returns {Array<{skuId: string, packs: number}>}
 */
export function packsToBuy(basket, { atHome = [] } = {}) {
  const home = new Set([...atHome].map(String));
  const out = [];
  for (const line of basket ?? []) {
    if (line?.skuId === null || line?.skuId === undefined) continue;
    const skuId = String(line.skuId);
    const n = home.has(skuId) ? 0 : packs(line.packs);
    if (n) out.push({ skuId, packs: n });
  }
  return out;
}

/**
 * The basket as the cart remembers it: SKU and pack count, sorted. No names,
 * no prices — those are re-read when shown.
 * @param {Array<{skuId: string|number, packs: number}>} basket
 * @returns {Array<{skuId: string, packs: number}>}
 */
export function basketSnapshot(basket) {
  return (basket ?? [])
    .filter((l) => l?.skuId !== null && l?.skuId !== undefined && packs(l.packs) > 0)
    .map((l) => ({ skuId: String(l.skuId), packs: packs(l.packs) }))
    .sort((a, b) => a.skuId.localeCompare(b.skuId));
}

/**
 * One string that is equal for equal baskets, whatever their order.
 * @param {Array<{skuId: string|number, packs: number}>} basket
 */
export function basketSignature(basket) {
  return basketSnapshot(basket).map((l) => `${l.skuId}:${l.packs}`).join("|");
}

/**
 * What changed between the basket the cart was filled from and the latest.
 * @param {Array<{skuId: string|number, packs: number}>} before
 * @param {Array<{skuId: string|number, packs: number}>} after
 * @returns {{ added: Array<{skuId: string, packs: number}>, removed: Array<{skuId: string, packs: number}>, changed: Array<{skuId: string, from: number, to: number}>, any: boolean }}
 */
export function diffBaskets(before, after) {
  const a = new Map(basketSnapshot(before).map((l) => [l.skuId, l.packs]));
  const b = new Map(basketSnapshot(after).map((l) => [l.skuId, l.packs]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [skuId, n] of b) {
    if (!a.has(skuId)) added.push({ skuId, packs: n });
    else if (a.get(skuId) !== n) changed.push({ skuId, from: a.get(skuId), to: n });
  }
  for (const [skuId, n] of a) if (!b.has(skuId)) removed.push({ skuId, packs: n });
  return { added, removed, changed, any: added.length + removed.length + changed.length > 0 };
}
