// ============================================================================
// KOI — Cart
// Survives navigation, reload and — critically — leaving the site entirely.
// Marketplace checkout sends the shopper to an external consent screen, so a
// cart held only in memory is destroyed by the very flow it has to support.
//
// What persists is a REFERENCE, never a snapshot: { id, quantity, addedAt }.
// Price, score, stock and macros are re-resolved from the catalogue on
// hydration. A ₹ value written to localStorage last week is a stale-price bug
// waiting to be charged to someone, and a persisted "in stock" is a claim no
// one has re-checked.
//
// SSR-safe by the same pattern as goalStore: nothing reads storage during
// render. `skipHydration` defers it, `hydrate()` runs it from an effect, and
// `hydrated` lets cart-dependent UI tell "empty" apart from "not loaded yet" —
// without which the checkout page bounces a hydrating shopper back to the shop.
// ============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const KEY = 'koi_cart';

/** Persisted line. Deliberately carries no price and no availability. */
const toRef = (item) => ({
  id: item.id,
  quantity: item.quantity,
  addedAt: item.addedAt ?? Date.now(),
});

export const useCartStore = create(
  persist(
    (set, get) => ({
      /** Full product objects, resolved. Never read from storage directly. */
      items: [],
      /** True once hydration has run — distinguishes empty from not-yet-loaded. */
      hydrated: false,

      /**
       * Marked from onRehydrateStorage, never from module scope. The persist
       * middleware writes on every state change, so touching the store before
       * rehydrate runs would flush an empty `items` over the saved cart —
       * silently emptying the basket it was meant to restore.
       */
      setHydrated: () => set({ hydrated: true }),

      addToCart: (product) => set((state) => {
        const existing = state.items.find((i) => i.id === product.id);
        if (existing) {
          return {
            items: state.items.map((i) =>
              i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
            ),
          };
        }
        return { items: [...state.items, { ...product, quantity: 1, addedAt: Date.now() }] };
      }),

      removeFromCart: (productId) => set((state) => ({
        items: state.items.filter((i) => i.id !== productId),
      })),

      increaseQty: (productId) => set((state) => ({
        items: state.items.map((i) =>
          i.id === productId ? { ...i, quantity: i.quantity + 1 } : i
        ),
      })),

      decreaseQty: (productId) => set((state) => {
        const item = state.items.find((i) => i.id === productId);
        if (item?.quantity === 1) {
          return { items: state.items.filter((i) => i.id !== productId) };
        }
        return {
          items: state.items.map((i) =>
            i.id === productId ? { ...i, quantity: i.quantity - 1 } : i
          ),
        };
      }),

      clearCart: () => set({ items: [] }),

      /**
       * Re-attach persisted references to real products.
       *
       * Lines whose product is no longer in the catalogue are dropped: a
       * product KOI can no longer describe is one it should not sell. Call
       * once the catalogue is loaded; safe to call again as it arrives.
       *
       * @param {Array} catalogue products currently known to the storefront
       */
      resolveFromCatalogue: (catalogue = []) => set((state) => {
        if (!catalogue.length) return {};
        const byId = new Map(catalogue.map((p) => [String(p.id), p]));
        return {
          items: state.items
            .map((line) => {
              const product = byId.get(String(line.id));
              // Product data wins; the reference contributes only quantity.
              return product
                ? { ...product, quantity: line.quantity, addedAt: line.addedAt }
                : null;
            })
            .filter(Boolean),
        };
      }),

      getTotalItems: () => get().items.reduce((total, i) => total + i.quantity, 0),
      getSubtotal: () => get().items.reduce((total, i) => total + (Number(i.price) || 0) * i.quantity, 0),
    }),
    {
      name: KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // References only — see the banner.
      partialize: (state) => ({ items: state.items.map(toRef) }),
      // Deferred so nothing touches storage during SSR or first render.
      skipHydration: true,
      onRehydrateStorage: () => (state) => { state?.setHydrated?.(); },
    }
  )
);

/**
 * Restore the cart. Call once from an effect; idempotent.
 *
 * Lines come back as bare references — full products are attached by
 * resolveFromCatalogue() once the catalogue loads.
 */
export function hydrateCart() {
  if (typeof window === 'undefined') return;
  if (useCartStore.getState().hydrated) return;
  Promise.resolve(useCartStore.persist.rehydrate()).finally(() => {
    // onRehydrateStorage does not fire when storage is unavailable (private
    // browsing, blocked site data). Without this the UI waits forever.
    if (!useCartStore.getState().hydrated) useCartStore.getState().setHydrated();
  });
}
