// ============================================================================
// KOI FOOD — The facts KOI derives for each SKU (food.sku_facts)
//
// Phase 2.4. Written by the screening pass (lib/screening/rescore.js) and read
// by the planner and the score. Every fact is derived from something KOI
// holds, or is null:
//
//   nova_group            from a complete, current ingredient list only
//                         (./processing.js)
//   rupees_per_g_protein  MRP over the grams of protein in the pack, from the
//                         declared protein and the net weight, in one unit
//   veg_mark              the FSSAI veg or non-veg mark, only where two
//                         independent label readings agreed on it
//
// Pure.
// ============================================================================

import { parseAmount, toPer100 } from "@/lib/nutrition/basis";
import { processingOf, PROCESSING_VERSION } from "./processing";

export const FACTS_VERSION = `facts-v1+${PROCESSING_VERSION}`;

/**
 * @param {{ mrp: number|string|null, netWeight: string|null, nutrition: object|null }} input
 * @returns {number|null} rupees per gram of protein, to two decimals
 */
export function rupeesPerGramProtein({ mrp, netWeight, nutrition }) {
  const price = Number(mrp);
  if (mrp === null || mrp === undefined || !Number.isFinite(price) || price <= 0) return null;
  const pack = parseAmount(netWeight);
  const per100 = toPer100(nutrition);
  const protein = Number(per100.protein_g);
  if (!pack || per100.unit !== pack.unit || !(protein > 0)) return null;
  const grams = (pack.value * protein) / 100;
  return Math.round((price / grams) * 100) / 100;
}

/**
 * @param {Array<{ first: string|null, second: string|null }>} readings newest first
 * @returns {"veg"|"non_veg"|null} the newest mark both readings agreed on
 */
export function agreedVegMark(readings = []) {
  for (const { first, second } of readings) {
    if ((first === "veg" || first === "non_veg") && first === second) return first;
  }
  return null;
}

/**
 * @param {{ ingredientsText: string|null, mrp, netWeight, nutrition, vegReadings }} input
 *   ingredientsText only when the list is complete and current
 * @returns {object} a food.sku_facts row, without sku_id
 */
export function skuFacts({ ingredientsText, mrp, netWeight, nutrition, vegReadings }) {
  const nova = ingredientsText ? processingOf(ingredientsText) : null;
  return {
    nova_group: nova?.group ?? null,
    nova_basis: nova
      ? {
          markers: nova.markers,
          culinary: nova.culinary,
          processed: nova.processed,
          unclassified_additives: nova.unclassifiedAdditives,
          foods: nova.foods,
        }
      : { reason: "No complete, current ingredient list has been read." },
    rupees_per_g_protein: rupeesPerGramProtein({ mrp, netWeight, nutrition }),
    veg_mark: agreedVegMark(vegReadings),
    facts_version: FACTS_VERSION,
  };
}
