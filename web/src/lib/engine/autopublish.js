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
//   3. The photo must not name a different product than the SKU it is on.
//
// A group that clears all three publishes as evidence = 'machine_read'. One
// that does not stays unpublished — the storefront keeps calling it unverified
// — and is listed with its reason, for a better photo or for anyone who
// chooses to fix it. Nobody is required to.
//
// The storefront words machine-read facts as what the pack says ("No peanuts
// listed on the pack"), never as a guarantee. engine.publish_machine_read()
// re-checks the stored agreement, so the database does not take this module's
// word for it either.
//
// Pure.
// ============================================================================

import { NUTRIENT_FIELDS } from "./labelSchema";
import { proposeAllergens, toNutritionRow } from "./proposals";

const TOLERANCE = 0.051;   // two transcriptions of one printed figure may differ only by rounding
const LIST_SIMILARITY = 0.97;

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean);
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size && !B.size) return 1;
  const shared = [...A].filter((t) => B.has(t)).length;
  return shared / (A.size + B.size - shared);
}

/**
 * Field-by-field agreement between two independent readings of one photo.
 * @returns {{ nutrition, ingredients, allergens }} each { ok: boolean, differences: string[] }
 */
export function compareReadings(a, b) {
  const nutrition = { ok: false, differences: [] };
  if (a.visible.nutrition_table && b.visible.nutrition_table) {
    const d = nutrition.differences;
    if (a.nutrition.basis !== b.nutrition.basis) d.push(`basis: ${a.nutrition.basis} vs ${b.nutrition.basis}`);
    if (norm(a.nutrition.serving_size) !== norm(b.nutrition.serving_size)) d.push(`serving size: "${a.nutrition.serving_size ?? ""}" vs "${b.nutrition.serving_size ?? ""}"`);
    for (const f of NUTRIENT_FIELDS) {
      const x = a.nutrition.values[f];
      const y = b.nutrition.values[f];
      if (x === null && y === null) continue;
      if (x === null || y === null || Math.abs(x - y) > TOLERANCE) d.push(`${f}: ${x ?? "not read"} vs ${y ?? "not read"}`);
    }
    nutrition.ok = d.length === 0;
  } else {
    nutrition.differences.push(a.visible.nutrition_table || b.visible.nutrition_table
      ? "only one reading found a nutrition table"
      : "no nutrition table in the photo");
  }

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
 * Does the name printed on the photo belong to this SKU? A photo with no name
 * on it cannot contradict the SKU it was uploaded to; one that names another
 * product can, and then nothing from it publishes.
 * @param {object} reading
 * @param {{ product?: string, brand?: string|null, variant?: string|null }} sku
 */
export function matchesProduct(reading, sku) {
  const printed = tokens(`${reading.product_name ?? ""} ${reading.brand ?? ""}`).filter((t) => t.length >= 3 && !STOP.has(t));
  if (!printed.length) return { ok: true, reason: "No product name in the photo; it is taken as the product it was uploaded to." };
  const known = norm(`${sku.product ?? ""} ${sku.brand ?? ""} ${sku.variant ?? ""}`).replace(/\s+/g, "");
  const hits = printed.filter((t) => known.includes(t)).length;
  const ok = hits / printed.length >= 0.5;
  return {
    ok,
    reason: ok
      ? "The name on the photo matches this product."
      : `The photo reads "${reading.product_name ?? reading.brand}", which does not match ${sku.product}.`,
  };
}

/**
 * What the automatic path may publish from one pair of readings.
 * @param {{ reading, second, result, sku: { product, brand, variant, netWeight } }} input
 *   reading/second: parsed LabelReadings; result: runChecks(reading)
 * @returns {{ agreement, ingredients: object|null, nutrition: object|null, blocked: Array<{group, reason}> }}
 */
export function planAutoPublish({ reading, second, result, sku }) {
  const agreement = second
    ? compareReadings(reading, second)
    : {
        nutrition: { ok: false, differences: ["the second reading failed"] },
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
    if (why.length) blocked.push({ group: "nutrition", reason: why.join(" ") });
    else nutrition = toNutritionRow(reading.nutrition, sku.netWeight ?? null);
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
