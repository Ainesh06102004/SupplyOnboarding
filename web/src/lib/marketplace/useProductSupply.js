"use client";

// ============================================================================
// KOI — Supply for one product, resolved on engagement
//
// The shopper opened a product. That, and only that, is what licenses spending
// provider quota on it: a verify costs one search per SKU (there is no lookup
// by id), so this must never run from a grid, a shelf render or a hover.
//
// The sequence is deliberately two-step, and the second step is conditional:
//
//   1. Verify the product the shopper is actually looking at.
//   2. ONLY IF it comes back `unavailable`, rank KOI's own catalogue for
//      replacements and verify the top few.
//
// An available product costs one call. Step 2 exists to answer a question the
// shopper now definitely has, so it is spending quota on a known need rather
// than on speculation.
//
// Everything degrades to `unknown`, which the UI already renders honestly.
// ============================================================================

import { useEffect, useState } from "react";
import { fetchZone, verifySupply } from "./browser";
import { AVAILABILITY } from "@/lib/recommendation/config";
import { pickSubstituteCandidates, keepAvailable, MAX_CANDIDATES } from "@/lib/recommendation/substitutes";

const IDLE = Object.freeze({
  status: "idle",
  availability: AVAILABILITY.UNKNOWN,
  price: null,
  deliveryEta: null,
  observedAt: null,
  substitutes: [],
});

/**
 * @param {object|null} product   the product being viewed
 * @param {string|null} pincode   the shopper's pincode; null until they set one
 * @param {Array} catalogue       KOI's screened products, for substitutes
 * @param {object} [goalProfile]  the shopper's goals, when they have any
 * @returns {{status: 'idle'|'checking'|'done', availability: string, price: number|null,
 *            deliveryEta: string|null, observedAt: string|null, substitutes: Array}}
 */
export function useProductSupply(product, pincode, catalogue = [], goalProfile = null) {
  const [supply, setSupply] = useState(IDLE);

  const productId = product?.id ? String(product.id) : null;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    // Deferred a tick so the first setSupply is not a render-phase update —
    // the same pattern AddressManager and the orders page use.
    const start = setTimeout(async () => {
      // No product or no pincode means no question to ask. A pincode is not
      // guessable: availability is decided per delivery zone, and inventing
      // one would claim stock for an area the shopper never named.
      if (!productId || !pincode) {
        setSupply(IDLE);
        return;
      }

      setSupply((s) => ({ ...s, status: "checking" }));

      const { zoneId, serviceability } = await fetchZone(pincode, controller.signal);
      if (!alive) return;

      if (!zoneId) {
        // Not serviceable is a definite answer; anything else is genuinely
        // unknown. Neither is "out of stock".
        setSupply({
          ...IDLE,
          status: "done",
          availability:
            serviceability === "not_serviceable" ? AVAILABILITY.UNAVAILABLE : AVAILABILITY.UNKNOWN,
        });
        return;
      }

      const signals = await verifySupply(zoneId, [productId], controller.signal);
      if (!alive) return;

      const signal = signals[productId];
      const availability = signal?.availability ?? AVAILABILITY.UNKNOWN;

      const base = {
        status: "done",
        availability,
        price: availability === AVAILABILITY.AVAILABLE ? (signal?.price ?? null) : null,
        deliveryEta: signal?.deliveryEta ?? null,
        observedAt: signal?.observedAt ?? null,
        substitutes: [],
      };

      // Only now — and only for a definite no — is it worth asking about
      // alternatives. `unknown` does not trigger this: we have not established
      // the shopper has a problem, and guessing costs real quota.
      if (availability !== AVAILABILITY.UNAVAILABLE) {
        setSupply(base);
        return;
      }

      const candidates = pickSubstituteCandidates(
        product,
        catalogue,
        goalProfile || {},
        MAX_CANDIDATES
      );
      if (!candidates.length) {
        setSupply(base);
        return;
      }

      const candidateSignals = await verifySupply(
        zoneId,
        candidates.map((c) => String(c.id)),
        controller.signal
      );
      if (!alive) return;

      setSupply({ ...base, substitutes: keepAvailable(candidates, candidateSignals) });
    }, 0);

    return () => {
      alive = false;
      clearTimeout(start);
      controller.abort();
    };
    // Intentionally keyed on the product id and pincode alone. The catalogue
    // and goal profile are read at fire time; adding them as deps would
    // re-verify — and re-spend quota — every time an unrelated array identity
    // changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, pincode]);

  return supply;
}
