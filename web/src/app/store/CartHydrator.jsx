"use client";

// ============================================================================
// KOI STORE — Cart hydration
// Renders nothing. Restores the persisted cart once on the client, then
// re-attaches each line to a real product as soon as the catalogue loads.
//
// Lives in the store layout so hydration happens once per session rather than
// separately on the shop, product and cart pages — three fetches of the same
// catalogue, three chances to disagree about what is in the basket.
// ============================================================================

import { useEffect } from "react";
import { hydrateCart, useCartStore } from "@/store/cartStore";
import { getSeedCatalogue } from "@/components/store/shop/shopData";
import { mergeCatalogue } from "@/lib/data/mergeCatalogue";
import { fetchAllProducts } from "@/lib/data/productFetcher";

export default function CartHydrator() {
  const resolveFromCatalogue = useCartStore((s) => s.resolveFromCatalogue);

  useEffect(() => {
    let alive = true;

    (async () => {
      // AWAIT THIS. Every set() on a persisted store writes storage, so
      // resolving the catalogue before rehydration completes flushes the empty
      // initial state over the saved basket. Opening the cart page emptied the
      // cart, permanently, and looked exactly like "the cart is not opening".
      await hydrateCart();
      if (!alive) return;

      const seed = getSeedCatalogue();
      // Enrichment only: the seed is a handful of dev fixtures and matches
      // almost no real product, so a line it cannot find is unresolved, not
      // discontinued. It stays a bare reference until the real catalogue lands.
      if (seed.length) resolveFromCatalogue(seed);

      try {
        const live = await fetchAllProducts();
        // Authoritative: this catalogue is what the storefront can actually
        // describe and sell, so a line missing from it is genuinely gone.
        if (alive && live?.length) {
          resolveFromCatalogue(mergeCatalogue(seed, live), { authoritative: true });
        }
      } catch {
        /* seed-resolved lines stand */
      }
    })();

    return () => { alive = false; };
  }, [resolveFromCatalogue]);

  return null;
}
