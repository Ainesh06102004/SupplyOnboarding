// ============================================================================
// KOI - Measurement basis normalisation
//
// `sku_nutrition` stores the figures a label declares plus the basis they were
// declared on: 'per_100g', 'per_100ml' or 'per_serving'. Two facts follow, and
// nothing in this codebase acted on either before this module existed:
//
//   1. Two products are only comparable within one basis. 139 kcal per serving
//      and 139 kcal per 100 g are not the same food.
//   2. A claim about what a product *gives* the shopper is only meaningful per
//      realistic serving. The storefront used to stamp "High Protein" on
//      Premium Pampore Saffron: 11.4 g per 100 g is perfectly true, and the
//      declared serving is 0.1 g.
//
// Rule, everywhere below: no figure, no claim. An unknown basis or an
// unparseable serving size yields null, never a coerced 0 - the same principle
// resolveIntent.js and shelves.js already document, for the same reason.
//
// On units: this module never converts grams to millilitres. A ratio within one
// unit needs no density (200 ml of a per-100ml product is simply 2x); across
// units it would need a density this database does not hold, so that case
// returns null rather than assuming 1 g/ml.
// ============================================================================

import { isNum } from "@/lib/recommendation/scoringEngine";

// The label columns worth scaling. Keyed by their `sku_nutrition` column names
// so a caller can read the result with the same keys it read the row with.
export const SCALABLE_FIELDS = Object.freeze([
  "energy_kcal",
  "protein_g",
  "carbs_g",
  "sugars_g",
  "added_sugar_g",
  "fibre_g",
  "total_fat_g",
  "saturated_fat_g",
  "trans_fat_g",
  "sodium_mg",
  "cholesterol_mg",
  "potassium_mg",
  "calcium_mg",
  "iron_mg",
  "vitamin_d_mcg",
]);

// Multipliers onto the canonical unit of each system.
const MASS = { g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, kgs: 1000 };
const VOLUME = { ml: 1, mls: 1, l: 1000, ltr: 1000, litre: 1000, liter: 1000 };

/**
 * "40g" -> { value: 40, unit: 'g' }, "1kg" -> { value: 1000, unit: 'g' },
 * "0.1 g" -> { value: 0.1, unit: 'g' }, "200ml" -> { value: 200, unit: 'ml' }.
 *
 * Returns null for anything it cannot read with certainty - "1 pack",
 * "as desired", "", null. A serving size KOI cannot measure is a serving size
 * KOI cannot make a claim about.
 */
export function parseAmount(text) {
  if (text === null || text === undefined) return null;
  const match = String(text).trim().toLowerCase().match(/^([0-9]*\.?[0-9]+)\s*([a-z]+)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2];
  if (unit in MASS) return { value: value * MASS[unit], unit: "g" };
  if (unit in VOLUME) return { value: value * VOLUME[unit], unit: "ml" };
  return null;
}

/** Lowercased basis, or null when absent. The CHECK constraint stores lowercase. */
function readBasis(nutrition) {
  const raw = nutrition?.measurement_basis;
  if (raw === null || raw === undefined || raw === "") return null;
  const basis = String(raw).trim().toLowerCase();
  return basis === "per_100g" || basis === "per_100ml" || basis === "per_serving" ? basis : null;
}

/** The unit a per-100 basis is expressed in. */
const basisUnit = (basis) => (basis === "per_100g" ? "g" : basis === "per_100ml" ? "ml" : null);

/** Every scalable field as null - what a caller gets when nothing is knowable. */
function unknown() {
  const out = { unit: null };
  for (const field of SCALABLE_FIELDS) out[field] = null;
  return out;
}

/** Each declared field multiplied by `factor`; undeclared fields stay null. */
function scale(nutrition, factor, unit) {
  const out = { unit };
  for (const field of SCALABLE_FIELDS) {
    const value = nutrition?.[field];
    out[field] = isNum(value) ? Number(value) * factor : null;
  }
  return out;
}

/**
 * Macros per 100 units of the product's own measurement system, plus the `unit`
 * they are expressed in ('g' | 'ml' | null). Use this for density comparisons
 * between products - "is this a protein-dense food".
 */
export function toPer100(nutrition) {
  const basis = readBasis(nutrition);
  if (basis === null) return unknown();

  if (basis === "per_100g" || basis === "per_100ml") {
    return scale(nutrition, 1, basisUnit(basis));
  }

  // per_serving -> scale up to 100. Needs a measurable serving.
  const serving = parseAmount(nutrition?.serving_size);
  if (serving === null) return unknown();
  return scale(nutrition, 100 / serving.value, serving.unit);
}

/**
 * Macros per one declared serving. Use this for contribution claims - "does one
 * realistic serving of this actually deliver the nutrient".
 */
export function toPerServing(nutrition) {
  const basis = readBasis(nutrition);
  if (basis === null) return unknown();

  if (basis === "per_serving") {
    const declared = parseAmount(nutrition?.serving_size);
    return scale(nutrition, 1, declared?.unit ?? null);
  }

  const serving = parseAmount(nutrition?.serving_size);
  if (serving === null) return unknown();

  // Mixing a per-100g figure with a millilitre serving would need a density
  // this database does not hold. Refuse rather than assume 1 g/ml.
  if (serving.unit !== basisUnit(basis)) return unknown();

  return scale(nutrition, serving.value / 100, serving.unit);
}

/**
 * How many declared servings a pack holds, from the pack's net weight.
 * Null unless both amounts parse in the same unit system.
 */
export function servingsPerPack(netWeight, servingSize) {
  const pack = parseAmount(netWeight);
  const serving = parseAmount(servingSize);
  if (pack === null || serving === null) return null;
  if (pack.unit !== serving.unit) return null;
  return pack.value / serving.value;
}

// Label field -> the pair of normalized `sku_nutrition` columns it fills.
export const NORMALIZED_COLUMN_MAP = Object.freeze([
  ["energy_kcal", "kcal_per_100g", "kcal_per_serving"],
  ["protein_g", "protein_per_100g", "protein_per_serving"],
  ["carbs_g", "carbs_per_100g", "carbs_per_serving"],
  ["sugars_g", "sugars_per_100g", "sugars_per_serving"],
  ["fibre_g", "fibre_per_100g", "fibre_per_serving"],
  ["total_fat_g", "fat_per_100g", "fat_per_serving"],
]);

/** The columns are NUMERIC(8,2); round here so stored and compared agree. */
const round2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
/** servings_per_pack is NUMERIC(6,1). */
const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

/**
 * What a row's normalized columns should hold, given what it declares. The one
 * definition both writers use — the backfill script and the label engine's
 * publish step — so a stored per-100 figure always equals what this module
 * computes at read time.
 *
 * @param {object} row a `sku_nutrition`-shaped row
 * @param {string|null} [netWeight] the SKU's net weight, for servings_per_pack
 * @returns {object} the twelve normalized columns plus servings_per_pack
 */
export function normalizedColumns(row, netWeight = null) {
  const per100 = toPer100(row);
  const perServing = toPerServing(row);
  const out = {};
  for (const [field, col100, colServing] of NORMALIZED_COLUMN_MAP) {
    out[col100] = round2(per100[field]);
    out[colServing] = round2(perServing[field]);
  }
  out.servings_per_pack = round1(servingsPerPack(netWeight, row?.serving_size));
  return out;
}
