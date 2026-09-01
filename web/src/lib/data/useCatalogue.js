"use client";

// ============================================================================
// KOI — Catalogue hook
//
// One way for a page to get the catalogue: seed for an instant first paint,
// live rows merged in when they arrive, live winning on id.
//
// `status` is the point of this file. A page cannot render honestly from
// `products.length === 0` alone, because that single condition covers two
// different worlds — "still loading, say nothing yet" and "the catalogue is
// genuinely empty, say so". Collapsing them is how a store ends up flashing
// its no-products state at every visitor on every load.
// ============================================================================

import { useEffect, useState } from "react";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { mergeCatalogue } from "@/lib/data/mergeCatalogue";

/** @typedef {'loading'|'ready'|'empty'} CatalogueStatus */

/**
 * @param {() => Array} seedFn  dev-only fixtures; returns [] in production
 * @returns {{ products: Array, status: CatalogueStatus, live: boolean }}
 */
export function useCatalogue(seedFn) {
  const [products, setProducts] = useState(seedFn);
  const [live, setLive] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchAllProducts();
        if (!alive) return;
        if (data && data.length) {
          setProducts(mergeCatalogue(seedFn(), data));
          setLive(true);
        }
      } catch {
        // Keep whatever the seed gave us. A failed fetch is not evidence that
        // the catalogue is empty, and `settled` below still flips so the page
        // stops waiting — it just resolves to the seed's answer.
      } finally {
        if (alive) setSettled(true);
      }
    })();
    return () => { alive = false; };
    // seedFn is a stable module-scope function in every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = !settled && products.length === 0 ? "loading" : products.length === 0 ? "empty" : "ready";

  return { products, status, live };
}
