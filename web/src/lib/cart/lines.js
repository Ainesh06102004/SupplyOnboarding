// ============================================================================
// KOI — one cart: the arithmetic. Pure.
//
// The cart holds one line per SKU. A line knows how many of its packs came
// from the week's plan (`fromPlan`) as well as how many there are in all
// (`quantity`), and that one split is what makes the plan and the shop share a
// cart without stepping on each other:
//
//   • Putting the plan in the cart REPLACES the plan's share. Pressing it twice
//     never doubles, and a changed plan swaps its packs without touching the
//     shopper's own (`quantity − fromPlan` is theirs, always).
//   • Lowering a line below the plan's count lowers the plan's share with it;
//     raising it above keeps the extra as the shopper's own.
//
// What it guarantees: no I/O, no clock (callers pass `now`), no prices. A line
// carries whatever product fields the caller resolved; nothing here reads or
// invents a ₹ figure. What it does NOT do: decide which plan is current, or
// fetch a catalogue — see lib/cart/client.js for that.
// ============================================================================

/**
 * The key a line is stored under: its SKU, or the product for a legacy line
 * whose SKU has not been resolved yet.
 * @param {{ skuId?: string|number|null, productId?: string|number|null, id?: string|number|null }} x
 * @returns {string|null}
 */
export function lineKey(x) {
  if (!x) return null;
  if (x.skuId !== null && x.skuId !== undefined && x.skuId !== "") return String(x.skuId);
  const product = x.productId ?? x.id;
  return product === null || product === undefined ? null : `p:${product}`;
}

/** A whole, non-negative pack count. Anything else is 0. */
export function packs(n) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The shopper's own packs on a line: everything the plan did not put there.
 * @param {{ quantity: number, fromPlan?: number }} line
 */
export function ownPacks(line) {
  return Math.max(0, packs(line?.quantity) - packs(line?.fromPlan));
}

/**
 * Add packs of a product. Added packs are the shopper's own.
 * @param {Array<object>} items current lines
 * @param {object} product a catalogue product (needs skuId or id)
 * @param {number} n packs to add
 * @param {number} now ms timestamp for a new line
 * @param {string|null} [from] where a new line was added from ("pantry": the Plan's Pantry shop), kept on the line
 * @returns {Array<object>}
 */
export function addPacks(items, product, n, now, from = null) {
  const add = packs(n);
  const key = lineKey({ skuId: product?.skuId, productId: product?.id });
  if (!add || !key) return items;
  let found = false;
  const next = items.map((item) => {
    if (lineKey(item) !== key) return item;
    found = true;
    return { ...item, quantity: packs(item.quantity) + add };
  });
  if (found) return next;
  return [...items, { ...product, skuId: product.skuId ?? null, productId: product.id ?? null, quantity: add, fromPlan: 0, addedAt: now, ...(from ? { addedFrom: from } : {}) }];
}

/**
 * Set a line's pack count. 0 removes it. Going below the plan's share lowers
 * the share; going above keeps the extra as the shopper's.
 * @param {Array<object>} items
 * @param {string} key a lineKey
 * @param {number} n
 * @returns {Array<object>}
 */
export function setPacks(items, key, n) {
  const q = packs(n);
  return items
    .map((item) => (lineKey(item) === key ? { ...item, quantity: q, fromPlan: Math.min(packs(item.fromPlan), q) } : item))
    .filter((item) => packs(item.quantity) > 0);
}

/**
 * Replace the plan's share of the cart with a plan's packs.
 *
 * Every line's own packs survive. A SKU the new plan no longer wants keeps only
 * its own packs (and leaves if it has none). A SKU new to the cart arrives
 * carrying the product the caller resolved for it.
 *
 * @param {Array<object>} items current lines
 * @param {Array<{skuId: string|number, packs: number, product?: object}>} lines the plan's packs to buy
 * @param {number} now ms timestamp for new lines
 * @returns {Array<object>}
 */
export function applyPlanShare(items, lines, now) {
  const want = new Map();
  for (const l of lines ?? []) {
    const n = packs(l.packs);
    if (n && l.skuId !== null && l.skuId !== undefined) want.set(String(l.skuId), l);
  }
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = lineKey(item);
    const plan = want.get(key);
    seen.add(key);
    const fromPlan = plan ? packs(plan.packs) : 0;
    const quantity = ownPacks(item) + fromPlan;
    if (quantity > 0) out.push({ ...item, quantity, fromPlan });
  }
  for (const [key, l] of want) {
    if (seen.has(key)) continue;
    const n = packs(l.packs);
    out.push({ ...(l.product ?? {}), skuId: l.skuId, productId: l.product?.id ?? null, quantity: n, fromPlan: n, addedAt: now });
  }
  return out;
}

/**
 * Take lines out after they were handed off. Only the given keys go; a line
 * Swiggy could not take stays, so nothing the shopper chose is lost.
 * @param {Array<object>} items
 * @param {Iterable<string>} keys lineKeys that were handed off
 * @returns {Array<object>}
 */
export function removeKeys(items, keys) {
  const gone = new Set([...keys].map(String));
  return items.filter((item) => !gone.has(lineKey(item)));
}

/**
 * The persisted form of a line: references only. No price, no name, no stock —
 * those are re-read from the catalogue every load (see store/cartStore.js).
 * @param {object} item
 * @param {number} now fallback for a line with no addedAt
 */
export function toRef(item, now) {
  return {
    skuId: item.skuId ?? null,
    productId: item.productId ?? item.id ?? null,
    quantity: packs(item.quantity),
    fromPlan: Math.min(packs(item.fromPlan), packs(item.quantity)),
    addedAt: item.addedAt ?? now,
    ...(item.addedFrom ? { addedFrom: item.addedFrom } : {}),
  };
}

/**
 * Re-attach stored references to catalogue products.
 *
 * Matches by SKU first, then by product (a v1 line knows only its product).
 * Two references that resolve to the same SKU merge. Unmatched references are
 * kept as bare refs unless the catalogue is authoritative — a dev seed of a few
 * fixtures must not empty a real basket.
 *
 * @param {Array<object>} refs
 * @param {Array<object>} catalogue products with `id` and `skuId`
 * @param {{ authoritative?: boolean }} [opts]
 * @returns {Array<object>}
 */
export function resolveRefs(refs, catalogue, { authoritative = false } = {}) {
  const bySku = new Map();
  const byProduct = new Map();
  for (const p of catalogue ?? []) {
    if (p?.skuId !== null && p?.skuId !== undefined) bySku.set(String(p.skuId), p);
    if (p?.id !== null && p?.id !== undefined) byProduct.set(String(p.id), p);
  }
  const out = new Map();
  for (const ref of refs ?? []) {
    const product =
      (ref.skuId !== null && ref.skuId !== undefined ? bySku.get(String(ref.skuId)) : null) ??
      (ref.productId !== null && ref.productId !== undefined ? byProduct.get(String(ref.productId)) : null);
    if (!product) {
      if (!authoritative) {
        const key = lineKey(ref);
        if (key && !out.has(key)) out.set(key, { skuId: ref.skuId ?? null, productId: ref.productId ?? null, quantity: packs(ref.quantity), fromPlan: packs(ref.fromPlan), addedAt: ref.addedAt ?? null, ...(ref.addedFrom ? { addedFrom: ref.addedFrom } : {}) });
      }
      continue;
    }
    const line = {
      ...product,
      skuId: product.skuId ?? ref.skuId ?? null,
      productId: product.id ?? ref.productId ?? null,
      quantity: packs(ref.quantity),
      fromPlan: Math.min(packs(ref.fromPlan), packs(ref.quantity)),
      addedAt: ref.addedAt ?? null,
      ...(ref.addedFrom ? { addedFrom: ref.addedFrom } : {}),
    };
    const key = lineKey(line);
    const prior = out.get(key);
    if (prior) {
      out.set(key, { ...line, quantity: packs(prior.quantity) + line.quantity, fromPlan: packs(prior.fromPlan) + line.fromPlan, addedAt: prior.addedAt ?? line.addedAt, ...(prior.addedFrom ? { addedFrom: prior.addedFrom } : {}) });
    } else {
      out.set(key, line);
    }
  }
  return [...out.values()].filter((l) => l.quantity > 0);
}

/**
 * Bring any stored cart up to the current shape (persist `version` 2).
 *
 * v1 stored `{ id, quantity, addedAt }` where `id` was the PRODUCT. v2 keys by
 * SKU and records the plan's share. Anything unreadable becomes an empty cart
 * rather than a crash on load.
 *
 * @param {unknown} persisted
 * @param {number} version the stored version
 * @returns {{ items: Array<object>, plan: object|null }}
 */
export function migrateCart(persisted, version) {
  const state = persisted && typeof persisted === "object" ? persisted : {};
  const items = Array.isArray(state.items) ? state.items : [];
  if (version < 2) {
    return {
      items: items
        .filter((r) => r && (r.id !== null && r.id !== undefined))
        .map((r) => ({ skuId: null, productId: r.id, quantity: packs(r.quantity) || 1, fromPlan: 0, addedAt: r.addedAt ?? null })),
      plan: null,
    };
  }
  return { items, plan: state.plan ?? null };
}

/**
 * Totals for a list of resolved lines. A line with no price adds nothing and
 * is counted in `unpriced`, so a summary can say a total is incomplete.
 * @param {Array<object>} items
 * @returns {{ products: number, packs: number, total: number, unpriced: number }}
 */
export function totals(items) {
  let total = 0;
  let count = 0;
  let unpriced = 0;
  for (const item of items ?? []) {
    const q = packs(item.quantity);
    count += q;
    const price = Number(item.price);
    if (Number.isFinite(price) && price > 0) total += price * q;
    else unpriced += 1;
  }
  return { products: (items ?? []).length, packs: count, total, unpriced };
}
