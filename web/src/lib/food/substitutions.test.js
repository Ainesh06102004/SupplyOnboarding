// ============================================================================
// KOI FOOD — tests for substitution edges
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { edgesBetween, buildSubstitutionEdges, describeEdge, MEANINGFUL, RULE_VERSION } from "@/lib/food/substitutions.js";

const reasons = (from, to) => edgesBetween(from, to).map((e) => e.reason).sort();

// The two live biscuits, as the database holds them.
const butterCookies = {
  skuId: "butter", categoryKey: "snacks.biscuits_cookies", role: "snack", per100Unit: "g",
  sugarsPer100: 26.2, proteinPer100: 10.9, rupeesPerGProtein: 5.5, novaGroup: 4,
  allergens: ["peanut", "soy", "gluten", "dairy"],
};
const chocolateBiscuits = {
  skuId: "chocbis", categoryKey: "snacks.biscuits_cookies", role: "snack", per100Unit: "g",
  sugarsPer100: 15, proteinPer100: 8, rupeesPerGProtein: 15, novaGroup: null,
  allergens: null,
};

test("the same category is always an edge, and the figures travel with the reason", () => {
  const edges = edgesBetween(butterCookies, chocolateBiscuits);
  const sugar = edges.find((e) => e.reason === "less_sugar");
  assert.deepEqual(sugar.basis, { from: 26.2, to: 15, less: 11.2, per: "100 g" });
  assert.equal(describeEdge(sugar.reason, sugar.basis), "11.2 g less sugar per 100 g");
  assert.equal(sugar.comparability, 1);
  assert.equal(sugar.rule_version, RULE_VERSION);
  assert.deepEqual(reasons(butterCookies, chocolateBiscuits), ["less_sugar", "same_category"]);
});

test("a difference under FSSAI's 25% is not an edge, because it is not sayable", () => {
  const a = { skuId: "a", categoryKey: "snacks.namkeen", role: "snack", per100Unit: "g", sugarsPer100: 10, proteinPer100: 10 };
  const barelyLess = { skuId: "b", categoryKey: "snacks.namkeen", role: "snack", per100Unit: "g", sugarsPer100: 8, proteinPer100: 10 };
  const clearlyLess = { skuId: "c", categoryKey: "snacks.namkeen", role: "snack", per100Unit: "g", sugarsPer100: 7, proteinPer100: 10 };
  assert.deepEqual(reasons(a, barelyLess), ["same_category"], "20% less is not a comparative claim");
  assert.deepEqual(reasons(a, clearlyLess), ["less_sugar", "same_category"]);
  assert.equal(MEANINGFUL.relative, 0.25);

  // And the gram floor keeps trivial absolute differences out.
  const trace = { skuId: "d", categoryKey: "snacks.namkeen", role: "snack", per100Unit: "g", sugarsPer100: 0.8, proteinPer100: 10 };
  const lessTrace = { skuId: "e", categoryKey: "snacks.namkeen", role: "snack", per100Unit: "g", sugarsPer100: 0.2, proteinPer100: 10 };
  assert.deepEqual(reasons(trace, lessTrace), ["same_category"]);
});

test("per 100 g and per 100 ml are not compared, for want of a density", () => {
  const drink = { skuId: "drink", categoryKey: "beverages.drink_mixes", role: "drink", per100Unit: "ml", sugarsPer100: 4, proteinPer100: 1 };
  const powder = { skuId: "powder", categoryKey: "beverages.drink_mixes", role: "drink", per100Unit: "g", sugarsPer100: 59.7, proteinPer100: 9.1 };
  assert.deepEqual(reasons(powder, drink), ["same_category"], "not 55 g less sugar");
  assert.deepEqual(reasons(drink, powder), ["same_category"], "nor more protein");
});

test("'without an allergen' needs a complete list on both sides", () => {
  const withList = { ...chocolateBiscuits, allergens: ["gluten"] };
  assert.ok(reasons(butterCookies, withList).includes("without_allergen"));
  const edge = edgesBetween(butterCookies, withList).find((e) => e.reason === "without_allergen");
  assert.deepEqual(edge.basis, { allergens: ["dairy", "peanut", "soy"], adds: [] });
  assert.equal(describeEdge(edge.reason, edge.basis), "Without dairy, peanut and soy");

  // What the alternative brings of its own is recorded with what it drops.
  const chivda = { ...withList, allergens: ["peanut", "tree_nut"] };
  const swap = edgesBetween(butterCookies, chivda).find((e) => e.reason === "without_allergen");
  assert.deepEqual(swap.basis, { allergens: ["dairy", "gluten", "soy"], adds: ["tree_nut"] });
  assert.equal(describeEdge(swap.reason, swap.basis), "Without dairy, gluten and soy, but contains tree nut");
  // chocolateBiscuits has no current list: no promise about absence.
  assert.ok(!reasons(butterCookies, chocolateBiscuits).includes("without_allergen"));
  assert.ok(!reasons(withList, butterCookies).includes("without_allergen"), "the other direction adds allergens");
});

test("less processed needs both groups; an unread label is not an improvement", () => {
  const raw = { ...chocolateBiscuits, novaGroup: 1 };
  assert.ok(reasons(butterCookies, raw).includes("less_processed"));
  assert.ok(!reasons(butterCookies, chocolateBiscuits).includes("less_processed"));
  assert.ok(!reasons(raw, butterCookies).includes("less_processed"));
});

test("a different aisle is no substitute; another category in the same aisle is a weaker one", () => {
  // Chips and biscuits are both snacks: the same aisle, the same meal role.
  const chips = { skuId: "chips", categoryKey: "snacks.chips_crisps", role: "snack", per100Unit: "g", sugarsPer100: 2.2, proteinPer100: 12.8, rupeesPerGProtein: 5.86 };
  // Nuts sit in another aisle, and rice is another role as well.
  const nuts = { skuId: "nuts", categoryKey: "nuts_seeds.nuts", role: "snack", per100Unit: "g", sugarsPer100: 2.1, proteinPer100: 17, rupeesPerGProtein: 13.24, novaGroup: 1 };
  const rice = { skuId: "rice", categoryKey: "staples.rice", role: "meal_base", per100Unit: "g", sugarsPer100: 0.1, proteinPer100: 9.5 };
  assert.deepEqual(reasons(butterCookies, rice), [], "a biscuit is not replaced by rice");
  assert.deepEqual(reasons(butterCookies, nuts), [], "nor by nuts, which are another aisle");

  const edges = edgesBetween(butterCookies, chips);
  assert.deepEqual(edges.map((e) => e.reason), ["less_sugar"]);
  assert.ok(edges.every((e) => e.comparability === 0.6));
});

test("every edge is one-directional, and nothing substitutes for itself", () => {
  const rows = buildSubstitutionEdges([butterCookies, chocolateBiscuits]);
  assert.ok(rows.every((r) => r.from_sku !== r.to_sku));
  assert.equal(rows.filter((r) => r.from_sku === "butter" && r.reason === "less_sugar").length, 1);
  assert.equal(rows.filter((r) => r.from_sku === "chocbis" && r.reason === "less_sugar").length, 0);
  // Cheaper per gram of protein runs the other way: ₹5.50 against ₹15.
  assert.ok(rows.some((r) => r.from_sku === "chocbis" && r.reason === "cheaper_per_g_protein"));
  assert.equal(buildSubstitutionEdges([butterCookies]).length, 0);
});
