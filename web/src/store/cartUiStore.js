// ============================================================================
// KOI — the cart's on-screen state (not persisted)
//
// Whether the cart drawer is open, the "Added to cart" confirmation, the
// latest plan as last read (so every cart surface can offer an update), and
// whether a page is showing the phone total bar (the agent dock shrinks beside
// it instead of stacking on it). Nothing here is the shopper's data; it is
// gone on reload by design.
// ============================================================================

import { create } from "zustand";

export const useCartUi = create((set) => ({
  sheetOpen: false,
  openSheet: () => set({ sheetOpen: true, added: null }),
  closeSheet: () => set({ sheetOpen: false }),

  /** The line just added: { key, at }. The toast reads the line from the cart. */
  added: null,
  showAdded: (key) => set({ added: { key: String(key), at: Date.now() } }),
  dismissAdded: () => set({ added: null }),

  /** The household's latest plan as last fetched: { planId, basket, members } or null. */
  latestPlan: undefined,
  setLatestPlan: (latestPlan) => set({ latestPlan }),

  /** A page with a phone total bar is mounted. */
  totalBar: false,
  setTotalBar: (totalBar) => set({ totalBar }),

  /** "Cart updated · Undo" after a plan update. */
  updated: null,
  setUpdated: (updated) => set({ updated }),
}));
