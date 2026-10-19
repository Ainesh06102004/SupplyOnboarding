// ============================================================================
// KOI — where the checkout is, for the header's progress rail
//
// The checkout page sets it; the focused header (CheckoutRail) reads it, so the
// rail's last leg fills and Swiggy ticks the moment the basket is handed off.
//   review   choosing the address, reading what Swiggy would take
//   sending  the hand-off is in flight
//   sent     Swiggy has the basket
// ============================================================================

import { create } from "zustand";

export const useCheckoutStage = create((set) => ({
  stage: "review",
  setStage: (stage) => set({ stage }),
}));
