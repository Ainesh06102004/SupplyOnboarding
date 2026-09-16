// ============================================================================
// KOI PLANNER — What a product has to be before it can be planned with
//
// Phase 3.3. Pure. A storefront product becomes a row the constraint model
// can use, or it becomes a recorded reason why not.
//
// To be planned with, KOI must know three things about a pack:
//
//   what it costs        the MRP
//   what it supplies     the declared per-100 figures AND the net weight, in
//                        one unit. 17 g of protein per 100 g says nothing
//                        about a pack until KOI knows the pack is 200 g, and
//                        basis.js will not convert grams to millilitres.
//   what is in it        the flags from the ingredient graph, so a member's
//                        allergens and diet can remove it
//
// Anything missing one of those is not planned with, and the reason is kept:
// a plan that quietly ignored half the catalogue would be a plan nobody could
// check. This is the same rule the rest of KOI follows — no figure, no claim —
// applied to arithmetic instead of to words.
// ============================================================================

import { extractFacts } from "@/lib/recommendation/productFacts";
import { nodeInfo } from "@/lib/food/taxonomy";
import { rowFromProduct } from "@/lib/nutrition/claims";
import { toPer100, parseAmount } from "@/lib/nutrition/basis";
import { NUTRIENTS } from "./model";

/** sku_nutrition's column for each nutrient the planner works in. */
const COLUMN = Object.freeze({ kcal: "energy_kcal", protein: "protein_g", carbs: "carbs_g", fat: "total_fat_g" });

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * What one pack of this product supplies, or null when KOI cannot say.
 *
 * @param {object} product a storefront product
 * @returns {{ perPack: object, packSize: {value: number, unit: string} }|null}
 */
export function perPackFrom(product) {
  const per100 = toPer100(rowFromProduct(product));
  const pack = parseAmount(product?.weight);
  // A per-100 g figure and a 200 ml pack are not multipliable.
  if (!per100.unit || !pack || pack.unit !== per100.unit) return null;

  const factor = pack.value / 100;
  const perPack = {};
  for (const nutrient of NUTRIENTS) {
    const value = per100[COLUMN[nutrient]];
    if (isNum(value)) perPack[nutrient] = round2(Number(value) * factor);
  }
  return Object.keys(perPack).length ? { perPack, packSize: pack } : null;
}

/**
 * Turn a catalogue into rows the model can plan with.
 *
 * @param {Array} products storefront products (fetchAllProducts shape)
 * @returns {{ catalogue: Array, unplannable: Array<{skuId, name, reason}> }}
 */
export function plannableFrom(products = []) {
  const catalogue = [];
  const unplannable = [];
  for (const product of products) {
    const skuId = product?.skuId ? String(product.skuId) : null;
    if (!skuId) {
      unplannable.push({ skuId: null, name: product?.name ?? null, reason: "no_sku" });
      continue;
    }
    if (!isNum(product.price) || Number(product.price) <= 0) {
      unplannable.push({ skuId, name: product.name ?? null, reason: "no_price" });
      continue;
    }
    const supplied = perPackFrom(product);
    if (!supplied) {
      unplannable.push({ skuId, name: product.name ?? null, reason: "cannot_quantify_a_pack" });
      continue;
    }
    catalogue.push({
      skuId,
      name: product.name ?? null,
      price: Number(product.price),
      // The latest KOI score, for the quality tiebreak (model.js). null when unscored.
      score: isNum(product.score) ? Number(product.score) : null,
      // The flags the graph found: allergens, diet flags, additive filters.
      contains: [...extractFacts(product).contains],
      availability: product.availability ?? "unknown",
      perPack: supplied.perPack,
      packSize: `${supplied.packSize.value} ${supplied.packSize.unit}`,
      // For the portion ceiling (model.js PORTION_RULE): the pack in the
      // portion's unit, what the food is in a meal, and its reference serving.
      packAmount: supplied.packSize.value,
      packUnit: supplied.packSize.unit,
      role: product.categoryKey ? nodeInfo(product.categoryKey)?.role ?? null : null,
      portion: product.portion ?? null,
    });
  }
  return { catalogue, unplannable };
}

/**
 * A household member as the model wants them: their targets, the flags that
 * remove a product for them, and nothing else.
 *
 * Hard avoids remove a product. A soft avoid (preservatives, artificial
 * colours and the rest) is a preference, and a preference does not get to
 * decide whether a family can be fed — those are listed in the plan's
 * constraint snapshot as noted but not enforced, so the shopper can see that
 * KOI read them and chose not to starve the plan with them.
 *
 * @param {object} member a household_member row plus its avoid keys
 * @param {{ avoidByKey: object, dietExclusions: object }} catalogues from config
 * @returns {{ id, label, targets, avoidFlags, dietExcludes, softAvoidFlags }}
 */
export function memberFor(member, { avoidByKey, dietExclusions }) {
  const keys = member.avoidKeys ?? [];
  const hard = [];
  const soft = [];
  for (const key of keys) {
    const entry = avoidByKey[key];
    if (!entry) continue;
    (entry.mode === "hard" ? hard : soft).push(entry.flag);
  }
  return {
    id: String(member.id),
    label: member.label ?? null,
    targets: {
      kcal: isNum(member.target_kcal) ? Number(member.target_kcal) : null,
      protein: isNum(member.target_protein_g) ? Number(member.target_protein_g) : null,
      carbs: isNum(member.target_carbs_g) ? Number(member.target_carbs_g) : null,
      fat: isNum(member.target_fat_g) ? Number(member.target_fat_g) : null,
    },
    avoidFlags: [...new Set(hard)],
    softAvoidFlags: [...new Set(soft)],
    dietExcludes: [...(dietExclusions[member.diet_type] ?? [])],
  };
}
