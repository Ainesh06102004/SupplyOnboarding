// ============================================================================
// KOI — the one cart
// Survives navigation, reload and — critically — leaving the site entirely.
// Marketplace checkout sends the shopper to an external consent screen, so a
// cart held only in memory is destroyed by the very flow it has to support.
//
// ONE cart for the shop and the Plan. Lines are keyed by SKU (the thing a
// supply source can answer about) and each records how many of its packs came
// from the week's plan (`fromPlan`). The arithmetic is lib/cart/lines.js;
// this store only holds the result. The plan record (`plan`) says which basket
// filled the cart and what was at home, so a changed plan can be OFFERED as an
// update (lib/cart/plan.js) — never applied behind the shopper's back.
//
// What persists is a REFERENCE, never a snapshot: { skuId, productId,
// quantity, fromPlan, addedAt }. Price, score, stock and macros are re-resolved
// from the catalogue on hydration. A ₹ value written to localStorage last week
// is a stale-price bug waiting to be charged to someone, and a persisted "in
// stock" is a claim no one has re-checked.
//
// SSR-safe by the same pattern as goalStore: nothing reads storage during
// render. `skipHydration` defers it, `hydrate()` runs it from an effect, and
// `hydrated` lets cart-dependent UI tell "empty" apart from "not loaded yet" —
// without which the checkout page bounces a hydrating shopper back to the shop.
// ============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { lineKey, addPacks, setPacks, applyPlanShare, removeKeys, toRef, resolveRefs, migrateCart, packs } from '@/lib/cart/lines';

const KEY = 'koi_cart';

/**
 * Can the storefront describe this line yet?
 *
 * A hydrated-but-unresolved line is a real basket entry carrying only ids and
 * a quantity. It must be kept (it is the shopper's) and must not be rendered
 * (KOI would be showing a product it cannot name or price).
 */
export const isDescribable = (line) => Boolean(line && line.name);

/** A line given either its SKU key or, from older callers, its product id. */
function keyFor(items, idOrKey) {
  const s = String(idOrKey);
  const hit = items.find((i) => lineKey(i) === s) ?? items.find((i) => String(i.productId ?? i.id) === s);
  return hit ? lineKey(hit) : null;
}

export const useCartStore = create(
  persist(
    (set, get) => ({
      /** Resolved lines: product fields + skuId, productId, quantity, fromPlan, addedAt. */
      items: [],
      /**
       * Which plan filled the cart: { planId, basket: [{skuId, packs}],
       * atHome: [skuId], members, appliedAt }. Null when the plan has never
       * been added. `members` is how many people it is for, for the label.
       */
      plan: null,
      /** True once hydration has run — distinguishes empty from not-yet-loaded. */
      hydrated: false,
      /**
       * True once the authoritative catalogue has been applied. Between
       * hydration and this, lines are bare refs with no name or price — real
       * basket contents that cannot be described yet. The UI must not render
       * them and must not call the basket empty.
       */
      resolved: false,
      /** The cart just before the last plan update, for Undo. Memory only. */
      undo: null,

      /**
       * Marked from onRehydrateStorage, never from module scope. The persist
       * middleware writes on every state change, so touching the store before
       * rehydrate runs would flush an empty `items` over the saved cart —
       * silently emptying the basket it was meant to restore.
       */
      setHydrated: () => set({ hydrated: true }),

      /** Add packs of a product. Added packs are the shopper's own. */
      add: (product, n = 1) => set((state) => ({ items: addPacks(state.items, product, n, Date.now()) })),

      /** Set a line's packs (0 removes). Accepts a SKU key or a product id. */
      setQty: (idOrKey, n) => set((state) => {
        const key = keyFor(state.items, idOrKey);
        return key ? { items: setPacks(state.items, key, n) } : {};
      }),

      remove: (idOrKey) => set((state) => {
        const key = keyFor(state.items, idOrKey);
        return key ? { items: setPacks(state.items, key, 0) } : {};
      }),

      /**
       * Put a plan's packs in the cart, replacing the plan's previous share.
       * `lines` carry the resolved product for each SKU (lib/cart/client.js).
       * @param {{ planId: string|null, basket: Array<{skuId: string, packs: number}>, atHome: string[], members?: number|null, lines: Array<{skuId: string, packs: number, product?: object}> }} p
       */
      applyPlan: ({ planId, basket, atHome = [], members = null, lines }) => set((state) => ({
        undo: { items: state.items, plan: state.plan },
        items: applyPlanShare(state.items, lines, Date.now()),
        plan: { planId: planId ?? null, basket, atHome: [...atHome].map(String), members: members ?? state.plan?.members ?? null, appliedAt: Date.now() },
      })),

      /** Back to exactly the cart before the last plan update. */
      undoPlan: () => set((state) => (state.undo ? { items: state.undo.items, plan: state.undo.plan, undo: null } : {})),

      /** Forget the offer to update without changing a line ("Keep my cart"). */
      keepPlanAsIs: (basket) => set((state) => (state.plan ? { plan: { ...state.plan, basket } } : {})),

      /** After a hand-off: the accepted lines leave, the rest stay. */
      removeLines: (keys) => set((state) => ({ items: removeKeys(state.items, keys) })),

      clear: () => set({ items: [], plan: null, undo: null }),

      // ── Older names, kept so every caller moves in one sweep ──────────────
      addToCart: (product) => get().add(product, 1),
      removeFromCart: (idOrKey) => get().remove(idOrKey),
      increaseQty: (idOrKey) => {
        const key = keyFor(get().items, idOrKey);
        const line = key && get().items.find((i) => lineKey(i) === key);
        if (line) get().setQty(key, packs(line.quantity) + 1);
      },
      decreaseQty: (idOrKey) => {
        const key = keyFor(get().items, idOrKey);
        const line = key && get().items.find((i) => lineKey(i) === key);
        if (line) get().setQty(key, packs(line.quantity) - 1);
      },
      clearCart: () => get().clear(),

      /**
       * Re-attach persisted references to real products (lib/cart/lines.js
       * resolveRefs). Lines missing from an AUTHORITATIVE catalogue are dropped:
       * a product KOI can no longer describe is one it should not sell.
       *
       * @param {Array} catalogue products currently known to the storefront
       */
      resolveFromCatalogue: (catalogue = [], { authoritative = false } = {}) => set((state) => {
        if (!catalogue.length || !state.items.length) return authoritative ? { resolved: true } : {};
        const refs = state.items.map((i) => toRef(i, i.addedAt ?? null));
        return { items: resolveRefs(refs, catalogue, { authoritative }), ...(authoritative ? { resolved: true } : {}) };
      }),

      getTotalItems: () => get().items.reduce((total, i) => total + packs(i.quantity), 0),
      getSubtotal: () => get().items.reduce((total, i) => total + (Number(i.price) || 0) * packs(i.quantity), 0),
    }),
    {
      name: KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // References only — see the banner.
      partialize: (state) => ({ items: state.items.map((i) => toRef(i, i.addedAt ?? null)), plan: state.plan }),
      // v1 stored product ids; v2 keys by SKU (lib/cart/lines.js migrateCart).
      migrate: (persisted, version) => migrateCart(persisted, version),
      // Deferred so nothing touches storage during SSR or first render.
      skipHydration: true,
      onRehydrateStorage: () => (state) => { state?.setHydrated?.(); },
    }
  )
);

/** The badge: how many products are in the cart (not packs). */
export const selectLineCount = (s) => s.items.length;

/**
 * Restore the cart. Call once from an effect; idempotent.
 *
 * Lines come back as bare references — full products are attached by
 * resolveFromCatalogue() once the catalogue loads.
 */
export function hydrateCart() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (useCartStore.getState().hydrated) return Promise.resolve();
  // RETURNS the promise, and callers must await it. `persist` writes on every
  // state change, so ANY set() that lands before rehydration finishes flushes
  // the empty initial `items` over the saved basket — the shopper's cart is
  // destroyed by the act of opening the page that displays it. This used to be
  // fire-and-forget with a synchronous resolveFromCatalogue() right behind it,
  // which is exactly that race.
  return Promise.resolve(useCartStore.persist.rehydrate()).finally(() => {
    // onRehydrateStorage does not fire when storage is unavailable (private
    // browsing, blocked site data). Without this the UI waits forever.
    if (!useCartStore.getState().hydrated) useCartStore.getState().setHydrated();
  });
}
