// ============================================================================
// KOI ENGINE — Publishing without a reviewer
//
// KOI does not staff a review queue (decided 12 Sep 2026), so what a person
// would have checked is checked mechanically instead:
//
//   1. The label is read twice, independently. A misread is usually a one-off;
//      two readings agreeing on a figure or a word is the check a second pair
//      of eyes would have made.
//   2. The arithmetic checks in checks.js must pass for the group.
//   3. The photo's printed product name must not name a different product.
//
// A group that clears all three publishes as evidence = 'machine_read'. One
// that does not stays unpublished — the storefront keeps calling it unverified
// — and is listed with its reason. Nobody is required to act on it.
//
// WHAT "AGREE" MEANS FOR A NUTRITION TABLE (revised 15 Sep 2026, after reading
// all 18 KOI labels with two models):
//   - Labels print a per-100 column and a per-serving column, and two models
//     pick different ones. When they do, both are converted to per 100 before
//     comparing, with a tolerance for the label's own rounding.
//   - The five core figures — energy, protein, carbohydrate, sugars, fat — must
//     agree or nothing publishes.
//   - A secondary row (fibre, sodium, cholesterol …) that only one reading has,
//     or that the two read differently, is DROPPED, not published and not
//     blocking. An unconfirmed number becomes "not declared", which the
//     storefront already handles honestly.
//
// The storefront words machine-read facts as what the pack says ("No peanuts
// listed on the pack"), never as a guarantee. engine.publish_machine_read()
// re-checks the stored agreement, so the database does not take this module's
// word for it either.
//
// Pure.
// ============================================================================

import { toPer100 } from "@/lib/nutrition/basis";
import { NUTRIENT_FIELDS } from "./labelSchema";
import { proposeAllergens, toNutritionRow } from "./proposals";

export const CORE_NUTRIENTS = Object.freeze(["energy_kcal", "protein_g", "carbs_g", "sugars_g", "total_fat_g"]);

const EXACT = 0.051;        // two transcriptions of one printed figure differ only by rounding
const LIST_SIMILARITY = 0.97;

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean);
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));
const isPer100 = (basis) => basis === "per_100g" || basis === "per_100ml";
const round2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size && !B.size) return 1;
  const shared = [...A].filter((t) => B.has(t)).length;
  return shared / (A.size + B.size - shared);
}

/**
 * Which of two readings to publish from: the one that read a per-100 column,
 * when only one of them did. Per-100 figures are what KOI stores and claims on,
 * and they do not depend on a serving size being read right.
 * @returns {[object, object|null]} [primary, other]
 */
export function pickPrimary(a, b) {
  if (b && !isPer100(a.nutrition.basis) && isPer100(b.nutrition.basis)) return [b, a];
  return [a, b];
}

/** A reading's figures on `basis`: as printed if it matches, else converted per 100. */
function onBasis(reading, basis) {
  const n = reading.nutrition;
  if (n.basis === basis) return { values: n.values, converted: false };
  if (!isPer100(basis)) return null;
  const p = toPer100({ measurement_basis: n.basis, serving_size: n.serving_size, ...n.values });
  if (p.unit === null || `per_100${p.unit}` !== basis) return null;
  return { values: Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, p[f]])), converted: true };
}

/**
 * Field-by-field agreement on the nutrition table, and the consensus figures.
 * `a` is the primary reading (pickPrimary).
 */
export function compareNutrition(a, b) {
  const out = { ok: false, basis: null, serving_size: null, servings_per_pack: null, values: null, differences: [], dropped: [] };
  if (!a.visible.nutrition_table || !b.visible.nutrition_table) {
    out.differences.push(a.visible.nutrition_table || b.visible.nutrition_table
      ? "only one reading found a nutrition table" : "no nutrition table in the photo");
    return out;
  }
  if (!a.nutrition.basis || !b.nutrition.basis) {
    out.differences.push("a reading found no basis (per 100 g, per 100 ml or per serving)");
    return out;
  }

  const basis = a.nutrition.basis;
  const A = onBasis(a, basis);
  const B = onBasis(b, basis);
  if (!B) {
    out.differences.push(`basis: ${a.nutrition.basis} vs ${b.nutrition.basis}, and the second cannot be converted to the first`);
    return out;
  }

  const values = {};
  for (const f of NUTRIENT_FIELDS) {
    const x = A.values[f];
    const y = B.values[f];
    if (x === null && y === null) { values[f] = null; continue; }
    // A converted figure carries the label's rounding times the serving factor.
    const tolerance = B.converted ? Math.max(0.3, 0.05 * Math.abs(x ?? y)) : EXACT;
    if (x !== null && y !== null && Math.abs(x - y) <= tolerance) { values[f] = x; continue; }
    const detail = `${f}: ${x ?? "not read"} vs ${y === null ? "not read" : round2(y)}`;
    if (CORE_NUTRIENTS.includes(f)) out.differences.push(detail);
    else { out.dropped.push(detail); values[f] = null; }
  }

  // Serving size. Per-serving figures cannot stand without an agreed one.
  // Per-100 figures can: a serving both readings agree on is kept, and so is
  // one the conversion itself confirmed (its figures matched per 100);
  // anything else is left out rather than published on one reading's word.
  const sa = a.nutrition.serving_size;
  const sb = b.nutrition.serving_size;
  const same = sa !== null && norm(sa) === norm(sb);
  if (basis === "per_serving") {
    if (!same) out.differences.push(`serving size: "${sa ?? ""}" vs "${sb ?? ""}"`);
    out.serving_size = same ? sa : null;
  } else if (same) {
    out.serving_size = sa;
  } else if (B.converted && out.differences.length === 0) {
    out.serving_size = sb;
  } else if (sa !== null || sb !== null) {
    out.dropped.push(`serving size: "${sa ?? ""}" vs "${sb ?? ""}"`);
  }

  const spa = a.nutrition.servings_per_pack;
  out.servings_per_pack = spa !== null && spa === b.nutrition.servings_per_pack ? spa : null;
  out.basis = basis;
  out.values = values;
  out.ok = out.differences.length === 0;
  return out;
}

/**
 * Field-by-field agreement between two independent readings of one photo.
 * @param {object} a primary reading
 * @param {object} b the other reading
 */
export function compareReadings(a, b) {
  const nutrition = compareNutrition(a, b);

  const ingredients = { ok: false, differences: [], similarity: null };
  if (a.visible.ingredients && b.visible.ingredients && a.ingredients_text && b.ingredients_text) {
    ingredients.similarity = Number(jaccard(a.ingredients_text, b.ingredients_text).toFixed(3));
    ingredients.ok = norm(a.ingredients_text) === norm(b.ingredients_text) || ingredients.similarity >= LIST_SIMILARITY;
    if (!ingredients.ok) ingredients.differences.push(`the two readings of the list differ (${Math.round(ingredients.similarity * 100)}% of words shared)`);
  } else {
    ingredients.differences.push(a.visible.ingredients || b.visible.ingredients
      ? "only one reading found an ingredient list"
      : "no ingredient list in the photo");
  }

  // Allergens must agree exactly: a near-match on the list is fine, a
  // disagreement about whether milk is in it is not.
  const pa = proposeAllergens(a);
  const pb = proposeAllergens(b);
  const allergens = { ok: sameSet(pa.contains, pb.contains) && sameSet(pa.may_contain, pb.may_contain), differences: [] };
  if (!sameSet(pa.contains, pb.contains)) allergens.differences.push(`contains: ${pa.contains.join(", ") || "none"} vs ${pb.contains.join(", ") || "none"}`);
  if (!sameSet(pa.may_contain, pb.may_contain)) allergens.differences.push(`may contain: ${pa.may_contain.join(", ") || "none"} vs ${pb.may_contain.join(", ") || "none"}`);

  return { nutrition, ingredients, allergens };
}

const STOP = new Set(["the", "and", "with", "mix", "pack", "of", "net", "wt", "new"]);

/**
 * Is this photo a DIFFERENT product's label? Only the printed product name
 * counts — a label also prints the manufacturer's company, a tagline ("Mother's
 * wisdom") or a sub-brand ("Safranal"), none of which say which product it is.
 * So a name that fails to match this SKU is not enough to block; it blocks only
 * when it matches another product KOI lists better than it matches this one.
 * That catches the real mistake — a combo pack photographed as one of its
 * contents — without refusing every label with a tagline on it.
 * @param {object} reading
 * @param {{ product?: string, brand?: string|null, variant?: string|null, others?: string[] }} sku
 *   others: the names of the other products in the catalogue
 */
export function matchesProduct(reading, sku) {
  const printed = tokens(reading.product_name).filter((t) => t.length >= 3 && !STOP.has(t));
  if (!printed.length) return { ok: true, reason: "No product name in the photo; it is taken as the product it was uploaded to." };
  const share = (name) => {
    const known = norm(name).replace(/\s+/g, "");
    return printed.filter((t) => known.includes(t)).length / printed.length;
  };
  const own = share(`${sku.product ?? ""} ${sku.brand ?? ""} ${sku.variant ?? ""}`);
  if (own >= 0.5) return { ok: true, reason: "The name on the photo matches this product." };

  const rival = (sku.others || []).map((name) => [name, share(name)]).sort((a, b) => b[1] - a[1])[0];
  if (rival && rival[1] >= 0.5 && rival[1] > own) {
    return { ok: false, reason: `The photo reads "${reading.product_name}", which names ${rival[0]}, not ${sku.product}.` };
  }
  // An image taken from the brand's store was matched to this SKU, not given
  // for it, and store galleries show other products too. A printed name that
  // does not name this product is not given the benefit of the doubt.
  if (sku.fromStore) {
    return { ok: false, reason: `The image came from the brand's store and reads "${reading.product_name}", which does not name ${sku.product}.` };
  }
  return { ok: true, reason: `The photo reads "${reading.product_name}", which names no other product KOI lists; taken as ${sku.product}.` };
}

/**
 * What the automatic path may publish from one pair of readings.
 * @param {{ reading, second, result, sku: { product, brand, variant, netWeight } }} input
 *   reading: the PRIMARY parsed reading (pickPrimary); second: the other, or
 *   null if it failed; result: runChecks(reading)
 * @returns {{ agreement, ingredients: object|null, nutrition: object|null, blocked: Array<{group, reason}> }}
 */
export function planAutoPublish({ reading, second, result, sku }) {
  const agreement = second
    ? compareReadings(reading, second)
    : {
        nutrition: { ok: false, differences: ["the second reading failed"], dropped: [] },
        ingredients: { ok: false, differences: ["the second reading failed"] },
        allergens: { ok: false, differences: ["the second reading failed"] },
      };
  agreement.identity = matchesProduct(reading, sku);

  const failed = (groups) => result.checks.filter((c) => groups.includes(c.group) && c.ok === false).map((c) => c.detail);
  const blocked = [];

  if (!agreement.identity.ok) {
    blocked.push({ group: "identity", reason: agreement.identity.reason });
    return { agreement, ingredients: null, nutrition: null, blocked };
  }

  let nutrition = null;
  if (reading.visible.nutrition_table) {
    const why = [...failed(["nutrition"]), ...(agreement.nutrition.ok ? [] : agreement.nutrition.differences)];
    if (why.length) {
      blocked.push({ group: "nutrition", reason: why.join(" ") });
    } else {
      const n = agreement.nutrition;
      nutrition = toNutritionRow(
        { basis: n.basis, serving_size: n.serving_size, servings_per_pack: n.servings_per_pack, values: n.values },
        sku.netWeight ?? null,
      );
    }
  }

  let ingredients = null;
  if (reading.visible.ingredients) {
    const why = [
      ...failed(["ingredients", "allergens"]),
      ...(agreement.ingredients.ok ? [] : agreement.ingredients.differences),
      ...(agreement.allergens.ok ? [] : agreement.allergens.differences),
    ];
    if (why.length) {
      blocked.push({ group: "ingredients", reason: why.join(" ") });
    } else {
      const allergens = proposeAllergens(reading);
      ingredients = {
        raw_ingredient_text: reading.ingredients_text,
        parsed_ingredients: reading.ingredients,
        allergens: allergens.contains,
        may_contain: allergens.may_contain,
      };
    }
  }

  return { agreement, ingredients, nutrition, blocked };
}
