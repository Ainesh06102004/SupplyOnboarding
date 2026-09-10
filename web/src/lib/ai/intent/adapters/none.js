// ============================================================================
// KOI — Intent adapter: none
// The default, and an honest description of production today: KOI has no model
// provider wired. It returns null, meaning "no refinement" — the deterministic
// interpreter's answer stands.
//
// This is not a stub awaiting completion. The storefront is fully functional on
// this adapter; a provider only ever improves interpretation at the margin. Any
// future adapter must keep that true, because a shopper's search cannot depend
// on a third party being up.
// ============================================================================

/** @type {{ name: string, interpret: (text: string) => Promise<null> }} */
export const NoneAdapter = Object.freeze({
  name: "none",
  async interpret() {
    return null;
  },
});
