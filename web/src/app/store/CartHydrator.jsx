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
    hydrateCart();

    let alive = true;
    (async () => {
      const seed = getSeedCatalogue();
      if (seed.length) resolveFromCatalogue(seed);
      try {
        const live = await fetchAllProducts();
        if (alive && live?.length) resolveFromCatalogue(mergeCatalogue(seed, live));
      } catch {
        /* seed-resolved lines stand */
      }
    })();

    return () => { alive = false; };
  }, [resolveFromCatalogue]);

  return null;
}
