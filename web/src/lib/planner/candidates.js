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
import { effectiveGoal, carbCeiling } from "./goals";

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
    const facts = extractFacts(product);
    catalogue.push({
      skuId,
      name: product.name ?? null,
      // For a household's brand rules (model.js KITCHEN). The shelf's Open Food
      // Facts products carry a brand name and no id, so names are what match.
      brand: product.brand ?? null,
      // How processed, and whether it needs a fridge (00057). Null is unknown
      // and is never treated as a pass.
      novaGroup: product.novaGroup ?? null,
      keepRefrigerated: product.keepRefrigerated ?? null,
      price: Number(product.price),
      // The latest KOI score, for the quality tiebreak (model.js). null when unscored.
      score: isNum(product.score) ? Number(product.score) : null,
      // The flags the graph found: allergens, diet flags, additive filters.
      contains: [...facts.contains],
      // How much KOI knows about what is in it (productFacts.js). Only a full
      // list can show an allergen is absent, and a machine-read one only when
      // enough readings agreed (verification.js); anything less proves presence only.
      ingredientEvidence: facts.ingredientEvidence,
      readAgreement: facts.readAgreement ?? null,
      availability: product.availability ?? "unknown",
      perPack: supplied.perPack,
      packSize: `${supplied.packSize.value} ${supplied.packSize.unit}`,
      // For the portion ceiling (model.js PORTION_RULE): the pack in the
      // portion's unit, what the food is in a meal, and its reference serving.
      packAmount: supplied.packSize.value,
      packUnit: supplied.packSize.unit,
      role: product.categoryKey ? nodeInfo(product.categoryKey)?.role ?? null : null,
      // The kitchen this shelf belongs to, where it belongs to one (00061).
      // Null for rice, dal and atta, which are food rather than Indian food.
      cuisine: product.categoryKey ? nodeInfo(product.categoryKey)?.cuisine ?? null : null,
      // For the age rules (ageSafety.js): nuts sold whole are a category fact.
      categoryKey: product.categoryKey ?? null,
      portion: product.portion ?? null,
    });
  }
  return { catalogue, unplannable };
}

/**
 * What a household keeps out of the house, as contains-flags: hard avoids
 * only (00047). A preference cannot keep a food out of a home.
 *
 * @param {string[]} keys household.keep_out
 * @param {object} avoidByKey FOODS_AVOID by key
 * @returns {string[]}
 */
export function keepOutFlagsFor(keys = [], avoidByKey = {}) {
  return (keys ?? [])
    .map((key) => avoidByKey[key])
    .filter((entry) => entry?.mode === "hard")
    .map((entry) => entry.flag);
}

/**
 * How strict an avoid is when nothing says (00050): a hard allergen is an
 * allergy, another hard avoid a rule, a soft one a dislike.
 * @param {object} entry a FOODS_AVOID entry
 * @returns {"allergy"|"rule"|"dislike"}
 */
export function defaultSeverity(entry) {
  if (entry?.mode !== "hard") return "dislike";
  return entry.kind === "allergen" ? "allergy" : "rule";
}

/**
 * A household member as the model wants them: their targets, their goal, the
 * flags that remove a product for them, and nothing else.
 *
 * An avoid's severity decides (00050): an allergy, an intolerance or a rule
 * removes a product; a dislike is a preference, and a preference does not get
 * to decide whether a family can be fed — dislikes are listed in the plan's
 * constraint snapshot as noted but not enforced, so the shopper can see that
 * KOI read them and chose not to starve the plan with them. With no severity
 * stored, the avoid's own mode decides, as before.
 *
 * A goal applies to adults only (goals.js#effectiveGoal).
 *
 * @param {object} member a household_member row, plus `avoids` [{ key, severity }] or `avoidKeys`
 * @param {{ avoidByKey: object, dietExclusions: object }} catalogues from config
 * @returns {{ id, label, ageBand, energyGoal, eatingPattern, carbsMax, profileVersion, targets, avoidFlags, dietExcludes, softAvoidFlags }}
 */
export function memberFor(member, { avoidByKey, dietExclusions }) {
  const avoids = member.avoids ?? (member.avoidKeys ?? []).map((key) => ({ key, severity: null }));
  const hard = [];
  const soft = [];
  for (const { key, severity } of avoids) {
    const entry = avoidByKey[key];
    if (!entry) continue;
    ((severity ?? defaultSeverity(entry)) === "dislike" ? soft : hard).push(entry.flag);
  }
  const { energyGoal, eatingPattern } = effectiveGoal(member);
  // A diet chosen for this plan alone stands in for the saved one; the saved
  // profile is never changed by planning (plan §9.10.2).
  const dietType = member.dietForThisPlan ?? member.diet_type ?? null;
  return {
    id: String(member.id),
    label: member.label ?? null,
    // What the age rules read (ageSafety.js).
    ageBand: member.age_band ?? null,
    energyGoal,
    eatingPattern,
    carbsMax: carbCeiling(eatingPattern),
    dietType,
    // From their profile: how much they eat, and which meals they eat at home.
    appetite: member.appetite ?? null,
    mealsFromHome: member.meals_from_home ?? [],
    // How much spice they will eat (00052): none refuses it, mild costs.
    spiceTolerance: member.spice_tolerance ?? null,
    // This week only: what they feel like, and what to leave out for them.
    preferCategories: member.preferCategories ?? [],
    skipCategories: member.skipCategories ?? [],
    skipSkus: member.skipSkus ?? [],
    // The saved profile this plan was made from (household_member_version).
    profileVersion: isNum(member.version) ? Number(member.version) : null,
    targets: {
      kcal: isNum(member.target_kcal) ? Number(member.target_kcal) : null,
      protein: isNum(member.target_protein_g) ? Number(member.target_protein_g) : null,
      carbs: isNum(member.target_carbs_g) ? Number(member.target_carbs_g) : null,
      fat: isNum(member.target_fat_g) ? Number(member.target_fat_g) : null,
    },
    avoidFlags: [...new Set(hard)],
    softAvoidFlags: [...new Set(soft)],
    dietExcludes: [...(dietExclusions[dietType] ?? [])],
  };
}
