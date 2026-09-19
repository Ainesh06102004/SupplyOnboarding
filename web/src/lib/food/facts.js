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
import { ingredientFlagsIn } from "./allergens";
import { processingOf, PROCESSING_VERSION } from "./processing";

// v2: the Tier 2 facts — what sweetens it, and whether its grain is whole.
export const FACTS_VERSION = `facts-v2+${PROCESSING_VERSION}`;

/**
 * What sweetens this, and whether its grain is whole (plan §9.10.3, Tier 2).
 *
 * Read off the ingredient graph's own flags (migration 00060), so there is no
 * second list of sweetener words to drift from the first.
 *
 * THE ASYMMETRY THIS TURNS ON, which KOI already lives by everywhere else: a
 * partial ingredient list PROVES what it names and proves NOTHING about what it
 * leaves out. So "sweetened with jaggery" can be read off a partial list, and
 * "no added sugar" cannot — the second needs a complete one. `evidence` says
 * which was available, and `sweetened` is null, never false, when KOI has only
 * a partial list and saw no sweetener in it.
 *
 * @param {string|null} text any ingredient list, complete or not
 * @param {boolean} complete whether that list is complete and current
 * @returns {{sweetenedWith: string[]|null, sweetened: boolean|null, millet: boolean|null, wholeGrain: boolean|null, evidence: string}}
 */
export function tier2Facts(text, complete = false) {
  if (!text) return { sweetenedWith: null, sweetened: null, millet: null, wholeGrain: null, evidence: "none" };
  const flags = new Set(ingredientFlagsIn(text));
  const sweeteners = [
    ["sugar", "sweetened_sugar"],
    ["jaggery", "sweetened_jaggery"],
    ["honey", "honey"],
    ["fruit", "sweetened_fruit"],
    ["artificial", "artificial_sweetener"],
  ].filter(([, flag]) => flags.has(flag)).map(([name]) => name);

  return {
    // What it IS sweetened with is proof either way.
    sweetenedWith: sweeteners,
    // Whether it is sweetened AT ALL is only answerable from a full list.
    sweetened: sweeteners.length ? true : complete ? false : null,
    // Likewise a grain: naming a millet proves one, naming none proves nothing.
    millet: flags.has("millet") ? true : complete ? false : null,
    wholeGrain: flags.has("whole_grain") ? true : complete ? false : null,
    evidence: complete ? "full_list" : "partial_list",
  };
}

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
 * @param {{ ingredientsText: string|null, partialText: string|null, mrp, netWeight, nutrition, vegReadings }} input
 *   ingredientsText only when the list is complete and current; partialText is
 *   whatever else KOI holds, which proves presence and nothing more
 * @returns {object} a food.sku_facts row, without sku_id
 */
export function skuFacts({ ingredientsText, partialText = null, mrp, netWeight, nutrition, vegReadings }) {
  const nova = ingredientsText ? processingOf(ingredientsText) : null;
  const tier2 = tier2Facts(ingredientsText ?? partialText, Boolean(ingredientsText));
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
    // Tier 2 (00060). `sweetened` and the grains are null, never false, where
    // only a partial list was available: absence of evidence is not evidence.
    sweetened_with: tier2.sweetenedWith,
    sweetened: tier2.sweetened,
    millet: tier2.millet,
    whole_grain: tier2.wholeGrain,
    tier2_evidence: tier2.evidence,
    facts_version: FACTS_VERSION,
  };
}
