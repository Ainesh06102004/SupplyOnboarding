"use client";

// ============================================================================
// KOI — Catalogue hook
//
// One way for a page to get the catalogue: seed for an instant first paint,
// then the live rows REPLACE it when they arrive.
//
// The seed has exactly two jobs — paint something before the fetch lands, and
// stand in when the fetch finds nothing. Neither survives live rows arriving,
// so they replace rather than merge. Merging looked harmless because
// mergeCatalogue dedupes on id, but a fixture id ("os-dfm") can never collide
// with a Supabase uuid, so the merge was a concatenation: dev fixtures sat in
// the shop permanently, next to real products, at 10 of 28 entries. They carry
// no skuId, so they can never be asked about — every one of them showed no
// stock chip and an "availability unknown" panel forever, which reads as a
// broken supply integration rather than as a fixture.
//
// This also makes development agree with production, where getSeedCatalogue()
// returns [] and mergeCatalogue([], live) was already just `live`.
//
// `status` is the point of this file. A page cannot render honestly from
// `products.length === 0` alone, because that single condition covers two
// different worlds — "still loading, say nothing yet" and "the catalogue is
// genuinely empty, say so". Collapsing them is how a store ends up flashing
// its no-products state at every visitor on every load.
// ============================================================================

import { useEffect, useState } from "react";
import { fetchAllProducts } from "@/lib/data/productFetcher";

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
          setProducts(data);
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
    // Genuinely dependency-free now: the effect fetches and replaces, and no
    // longer reads seedFn. The seed is consumed once, as useState's initialiser.
  }, []);

  const status = !settled && products.length === 0 ? "loading" : products.length === 0 ? "empty" : "ready";

  return { products, status, live };
}
