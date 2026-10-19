// ============================================================================
// KOI — what KOI is saying right now (the subtitle above the KOI bar)
//
// Pages call say("…") when KOI acts; the KOI bar shows the line word by word.
// House rules for lines (cinematic storefront, Oct 2026):
//   • short, plain, in KOI's voice;
//   • never a number: figures live in chips on the page, not in KOI's mouth;
//   • KOI asks before anything is saved, and says when something was undone.
// ============================================================================

import { create } from "zustand";

export const useKoiVoice = create((set) => ({
  line: "",
  key: 0,
  /** Replaces the subtitle. An empty string clears it. */
  say: (line) => set((s) => ({ line: String(line ?? "").slice(0, 220), key: s.key + 1 })),
  clear: () => set((s) => ({ line: "", key: s.key + 1 })),
}));

/** For code outside React (event handlers in plain modules). */
export const sayKoi = (line) => useKoiVoice.getState().say(line);
