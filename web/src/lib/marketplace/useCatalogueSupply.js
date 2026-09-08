"use client";

// ============================================================================
// KOI — Supply for a whole grid, resolved from where the shopper is
//
// The browse counterpart to useProductSupply, and deliberately a different
// shape. That one spends a provider search on ONE product because a shopper
// opened it. This one must cover a grid, so it goes nowhere near a per-SKU
// verify: it asks the server for the zone's shelf-derived view of KOI's
// catalogue, which is one request no matter how many cards are on screen and
// one provider call per shelf, shared by everyone browsing that zone.
//
// THREE REASONS A GRID CAN SHOW NOTHING, and they are not the same:
//   - no pincode: nobody has said where they are, so there is no question to
//     ask. Availability is decided per delivery zone and cannot be guessed.
//   - a pincode KOI cannot place in a zone: nothing to ask about, which is not
//     the same as the provider refusing to deliver there.
//   - no signal for a product: no shelf query surfaced it. Unknown, honestly.
//
// All three render as `unknown`, which is what the cards already show. Nothing here
// can turn absence of evidence into evidence of stock.
// ============================================================================

import { useEffect, useState } from "react";
import { fetchCatalogueSupply } from "./browser";

const IDLE = Object.freeze({
  status: "idle",
  items: {},
  degraded: false,
  serviceability: "unknown",
});

/**
 * @param {string|null} pincode  the shopper's pincode; null until they set one
 * @param {number} [refreshKey]  bump to re-ask — e.g. after connecting an
 *   account, when the same zone is now answered at the shopper's own address
 * @returns {{status: 'idle'|'checking'|'done', items: Record<string, object>,
 *            degraded: boolean, serviceability: string}}
 */
export function useCatalogueSupply(pincode, refreshKey = 0) {
  const [supply, setSupply] = useState(IDLE);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    // Deferred a tick so the first state write lands after the effect returns
    // rather than cascading a second render out of the first — the convention
    // used by useProductSupply and ConnectSwiggy.
    const start = setTimeout(async () => {
      if (!pincode) {
        setSupply(IDLE);
        return;
      }

      setSupply((s) => ({ ...s, status: "checking" }));

      // One request. The zone is resolved server-side, so the browser never
      // names a cache key and a pincode KOI cannot place simply comes back
      // with no signals — every product stays unknown rather than unavailable.
      const { items, degraded, serviceability } = await fetchCatalogueSupply(
        pincode,
        controller.signal
      );
      if (!alive) return;

      setSupply({ status: "done", items, degraded, serviceability });
    }, 0);

    return () => {
      alive = false;
      clearTimeout(start);
      controller.abort();
    };
  }, [pincode, refreshKey]);

  return supply;
}
