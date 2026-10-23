// ============================================================================
// KOI — the KOI bar's ask: a question a page puts to the shopper in the bar
//
// The bar is the one place KOI talks (cinematic storefront, Oct 2026), so a
// page that needs an answer ("what did you have instead?") doesn't open a
// sheet: it asks in the bar. <KoiAsk> (components/store/shell/KoiAsk.jsx)
// opens the ask and renders its content into the bar's slot through a portal,
// so the content keeps the page's live state. Both bars (KoiBar, AgentDock)
// read `ask` and, while it is set, become the question: the ember beats in
// the bar and the usual prompt steps aside.
// ============================================================================

import { create } from "zustand";

export const useKoiBar = create((set, get) => ({
  /** { id, label, onCancel } while a page is asking, else null. */
  ask: null,
  /** The bar's element the ask renders into (set by whichever bar is mounted). */
  slot: null,
  open: (ask) => set({ ask }),
  /** Closes the ask only if it is still this one: a newer ask is left alone. */
  close: (id) => { if (get().ask?.id === id) set({ ask: null }); },
  setSlot: (slot) => set({ slot }),
}));
