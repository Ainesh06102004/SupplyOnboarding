// ============================================================================
// Recipes: a dish with amounts, a method, and what one serving carries. Pure.
//
// A dish (dishData.js) says what it is made of and where each part comes from.
// A recipe (recipes/*.js, editorial) adds, line by line, which food the line is
// and how many grams one serving takes, then the method. The two are joined by
// line position, and the test suite refuses a recipe whose lines drift from its
// dish. Until the food database is edited from the staff tools, the recipe
// files are the source and migration 00088 mirrors them into food.recipe_line.
//
// Amounts in the method are templates, so a method scales with its servings
// and switches between cups and grams without being rewritten:
//   {3}           line 3, as "1½ tbsp ghee"
//   {water:240}   240 g of water, scaled, as "1 cup of water"
//   {water:240:cold}  the same, as "1 cup of cold water"
// ============================================================================

import { DISHES } from "./dishData";
import { RECIPES } from "./recipes/index";
import { foodOf, scaleNutrients, addNutrients, zero } from "./foods";
import { kitchenMeasure, gramsText, quarters } from "./measures";

const DISH_BY_KEY = new Map(DISHES.map((d) => [d.key, d]));
const PLACEHOLDER = /\{(water:\d+(?:\.\d+)?(?::[a-z]+)?|\d+)\}/g;

/** "Whole wheat flour (atta)" → "whole wheat flour": how a food is said inside a sentence. */
export const spoken = (name) => name.replace(/\s*\(.*?\)/g, "").toLowerCase();

/**
 * The dish with its amounts and method, or null when no recipe is written yet.
 * @param {string} dishKey
 */
export function recipeFor(dishKey) {
  const dish = DISH_BY_KEY.get(dishKey);
  const r = RECIPES[dishKey];
  if (!dish || !r) return null;
  return {
    key: dish.key,
    name: dish.name,
    kind: dish.kind,
    slots: dish.slots,
    cuisine: dish.cuisine,
    prepMinutes: dish.prepMinutes,
    served: r.served ?? null,
    keepsDays: r.keeps ?? 0,
    batchable: Boolean(r.batch),
    lines: dish.lines.map((line, i) => {
      const [food, grams] = r.g[i] ?? [];
      return { ...line, index: i, food, grams: grams ?? 0 };
    }),
    steps: (r.steps ?? []).map(([title, text, minutes = null, timer = null], i) => ({ n: i + 1, title, text, minutes, timer, uses: stepUses(text) })),
  };
}

/** The line positions a step's text names. */
export function stepUses(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]).filter((t) => !t.startsWith("water")).map(Number);
}

/**
 * What one serving (× scale) carries.
 * @param {object} recipe from recipeFor
 * @param {{ scale?: number, leaveOut?: string[], per100For?: (line) => object|null }} [opts]
 *   per100For lets a shelf line be sized from the product in the basket (its label) instead of the food item.
 */
export function dishNutrition(recipe, { scale = 1, leaveOut = [], per100For = null } = {}) {
  const skip = new Set(leaveOut.map((x) => String(x).toLowerCase()));
  let total = zero();
  for (const line of recipe.lines) {
    if (line.optional && skip.has(line.ingredient.toLowerCase())) continue;
    const per100 = per100For?.(line) ?? foodOf(line.food)?.per100;
    if (!per100) continue;
    total = addNutrients(total, scaleNutrients(per100, line.grams * scale));
  }
  return total;
}

/** One amount, said for the kitchen or in grams. */
export function amountText(foodKey, grams, unit = "kitchen") {
  if (unit === "grams") return gramsText(grams);
  return kitchenMeasure(foodKey, grams).text;
}

/** A line as a shopping-list / checklist row: "1½ tbsp" + "ghee", with grams beside it. */
export function lineText(line, { scale = 1, unit = "kitchen" } = {}) {
  const food = foodOf(line.food);
  const grams = line.grams * scale;
  const measure = unit === "kitchen" ? kitchenMeasure(line.food, grams) : null;
  // "2 eggs", not "2 eggs egg": a piece that is the food names it already.
  const named = measure?.unit === "piece" && food?.pieceIsName;
  return {
    amount: measure ? measure.text : gramsText(grams),
    name: named ? "" : food ? spoken(food.name) : line.ingredient.toLowerCase(),
    grams: Math.round(grams),
  };
}

function waterText(grams, unit, adjective = "") {
  const water = adjective ? `${adjective} water` : "water";
  if (unit === "grams") return `${Math.round(grams)} ml of ${water}`;
  const cups = grams / 240;
  if (cups >= 0.25) return `${quarters(cups)} ${cups > 1.125 ? "cups" : "cup"} of ${water}`;
  return `${Math.max(1, Math.round(grams / 15))} tbsp of ${water}`;
}

/**
 * A method step with its amounts filled in.
 * @param {string} text template
 * @param {object} recipe
 * @param {{ scale?: number, unit?: "kitchen"|"grams" }} [opts]
 */
export function renderText(text, recipe, { scale = 1, unit = "kitchen" } = {}) {
  return String(text).replace(PLACEHOLDER, (_, token) => {
    if (token.startsWith("water:")) {
      const [, grams, adjective] = token.split(":");
      return waterText(Number(grams) * scale, unit, adjective);
    }
    const line = recipe.lines[Number(token)];
    if (!line) return "";
    const t = lineText(line, { scale, unit });
    return t.name ? `${t.amount} ${t.name}` : t.amount;
  });
}

/** The cooked weight of `servings`, for "fill each box with about 515 g". */
export function servedGrams(recipe, servings = 1) {
  return recipe.served ? Math.round(recipe.served * servings) : null;
}
