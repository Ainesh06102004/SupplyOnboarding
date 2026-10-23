// ============================================================================
// Food items: what a recipe line is made of, per 100 g. Pure.
//
// The ingredient graph (allergenLexicon.js) says what a line CONTAINS — "Milk"
// is curd, paneer and cream alike. A food item says what it IS, for sizing: the
// figures come from IFCT 2017 wherever it has the food (foodData.js carries the
// code), and the row says plainly when they don't. A KOI shelf line is sized
// with the product's own label first (nutrition.js); a food item is the
// fallback, and the only source for fresh and kitchen lines.
// ============================================================================

import { FOODS } from "./foodData";

const BY_KEY = new Map(FOODS.map((f) => [f.key, f]));

/** @param {string} key */
export const foodOf = (key) => BY_KEY.get(key) ?? null;

export const MACROS = Object.freeze(["kcal", "protein", "carbs", "fat"]);

/** A zeroed nutrient total. */
export const zero = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });

/**
 * What `grams` of a food carry, from per-100 g figures.
 * @param {{ kcal: number, protein: number, carbs: number, fat: number, fibre?: number }} per100
 * @param {number} grams
 */
export function scaleNutrients(per100, grams) {
  const k = (Number(grams) || 0) / 100;
  return {
    kcal: (per100.kcal ?? 0) * k,
    protein: (per100.protein ?? 0) * k,
    carbs: (per100.carbs ?? 0) * k,
    fat: (per100.fat ?? 0) * k,
    fibre: (per100.fibre ?? 0) * k,
  };
}

/** a + b, nutrient by nutrient. */
export function addNutrients(a, b) {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fibre: (a.fibre ?? 0) + (b.fibre ?? 0) };
}

/** Rounded for display: whole kcal, one decimal for grams. */
export function roundNutrients(n) {
  const r1 = (x) => Math.round(x * 10) / 10;
  return { kcal: Math.round(n.kcal), protein: r1(n.protein), carbs: r1(n.carbs), fat: r1(n.fat), fibre: r1(n.fibre ?? 0) };
}
