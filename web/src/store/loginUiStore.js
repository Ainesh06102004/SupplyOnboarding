// ============================================================================
// KOI — the one sign-in sheet's state (not persisted)
//
// Every store surface that asks a shopper to sign in — the header, the phone
// tab bar, the Plan, the address book, the signed-out states of Orders,
// Household and "What KOI keeps", and proxy.js's ?login=required bounce — opens
// the SAME sheet, mounted once by StoreChrome. Before this, each mounted its
// own copy wherever it happened to sit, and a copy inside the store header was
// trapped by the header's backdrop-filter: it opened 63 px tall and invisible.
// ============================================================================

import { create } from "zustand";

export const useLoginUi = create((set) => ({
  open: false,
  /** Where to land after signing in; a same-origin path, or null to stay. */
  next: null,
  /** True when the route gate sent them here, rather than their own choice. */
  required: false,
  /**
   * @param {{ next?: string|null, required?: boolean }} [opts]
   */
  openLogin: ({ next = null, required = false } = {}) => set({ open: true, next, required }),
  setOpen: (open) => set(open ? { open: true } : { open: false, next: null, required: false }),
}));
