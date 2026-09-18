// ============================================================================
// KOI PLANNER — tests for what can be planned with
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { plannableFrom, perPackFrom, memberFor } from "@/lib/planner/candidates.js";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config.js";

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const catalogues = { avoidByKey: AVOID_BY_KEY, dietExclusions: DIET_EXCLUSIONS };

// California Almonds, as the storefront holds it: 200 g at 17 g per 100 g.
const almonds = {
  skuId: "sku-almonds",
  name: "California Almonds",
  price: 450,
  weight: "200g",
  measurementBasis: "per_100g",
  nutrition: [
    { label: "Protein", value: 17 },
    { label: "Calories", value: 656 },
    { label: "Carbs", value: 22 },
    { label: "Fat", value: 56 },
  ],
  label: { evidence: "machine_read", ingredientsText: "100% Almond Kernels", allergens: ["tree_nut"], mayContain: [], confirmedAt: new Date().toISOString() },
};

test("a pack's figures come from the per-100 label and the net weight", () => {
  const { perPack, packSize } = perPackFrom(almonds);
  assert.deepEqual(perPack, { kcal: 1312, protein: 34, carbs: 44, fat: 112 });
  assert.deepEqual(packSize, { value: 200, unit: "g" });
});

test("grams and millilitres are never multiplied together", () => {
  assert.equal(perPackFrom({ ...almonds, weight: "200ml" }), null);
  assert.equal(perPackFrom({ ...almonds, weight: "1 pack" }), null, "a pack KOI cannot measure");
  assert.equal(perPackFrom({ ...almonds, measurementBasis: null }), null, "no basis, no arithmetic");
});

test("a plannable product carries its price, its flags and what a pack supplies", () => {
  const { catalogue, unplannable } = plannableFrom([almonds]);
  assert.deepEqual(unplannable, []);
  assert.equal(catalogue.length, 1);
  assert.equal(catalogue[0].skuId, "sku-almonds");
  assert.equal(catalogue[0].price, 450);
  assert.equal(catalogue[0].packSize, "200 g");
  assert.ok(catalogue[0].contains.includes("tree_nut"), "from the ingredient graph");
  assert.equal(catalogue[0].availability, "unknown", "nobody has been asked yet");
});

test("what KOI cannot quantify or price is recorded, not silently dropped", () => {
  const { catalogue, unplannable } = plannableFrom([
    almonds,
    { ...almonds, skuId: "sku-free", price: 0, name: "Free sample" },
    { ...almonds, skuId: "sku-vague", weight: "1 box", name: "Mystery box" },
    { ...almonds, skuId: null, name: "No SKU" },
  ]);
  assert.deepEqual(catalogue.map((c) => c.skuId), ["sku-almonds"]);
  assert.deepEqual(unplannable, [
    { skuId: "sku-free", name: "Free sample", reason: "no_price" },
    { skuId: "sku-vague", name: "Mystery box", reason: "cannot_quantify_a_pack" },
    { skuId: null, name: "No SKU", reason: "no_sku" },
  ]);
});

test("a member's hard avoids remove products; their preferences are noted, not enforced", () => {
  const member = memberFor({
    id: "m1",
    label: "Kid 1",
    diet_type: "jain",
    target_protein_g: 30,
    target_kcal: 1600,
    avoidKeys: ["tree_nuts", "preservatives", "artificial_colours"],
  }, catalogues);

  assert.equal(member.id, "m1");
  assert.deepEqual(member.targets, { kcal: 1600, protein: 30, carbs: null, fat: null });
  assert.deepEqual(member.avoidFlags, ["tree_nut"], "an allergen is hard");
  assert.deepEqual(member.softAvoidFlags, ["preservatives", "artificial_colour"], "a preference is not");
  assert.deepEqual(member.dietExcludes, DIET_EXCLUSIONS.jain);
});

test("severity decides: a dislike is noted, a rule refuses even a soft avoid, and a disliked allergen is only noted", () => {
  const member = memberFor({
    id: "m3",
    label: "Me",
    avoids: [
      { key: "palm_oil", severity: "rule" },
      { key: "eggs", severity: "dislike" },
      { key: "gluten", severity: "intolerance" },
      { key: "spicy", severity: null },
    ],
  }, catalogues);
  assert.deepEqual(member.avoidFlags.sort(), ["gluten", "palm_oil"]);
  assert.deepEqual(member.softAvoidFlags.sort(), ["egg", "spicy"]);
});

test("a diet chosen for this plan stands in for the saved one, and this week's choices reach the model", () => {
  const member = memberFor({
    id: "m4", label: "Me", age_band: "adult_19_59", diet_type: "non_vegetarian", appetite: "large", meals_from_home: ["breakfast", "dinner"],
    dietForThisPlan: "vegetarian", preferCategories: ["snacks"], skipCategories: ["sweets"], avoidKeys: [],
  }, catalogues);
  assert.equal(member.dietType, "vegetarian");
  assert.deepEqual(member.dietExcludes, DIET_EXCLUSIONS.vegetarian);
  assert.deepEqual([member.appetite, member.mealsFromHome, member.preferCategories, member.skipCategories], ["large", ["breakfast", "dinner"], ["snacks"], ["sweets"]]);
  const saved = memberFor({ id: "m5", diet_type: "non_vegetarian", avoidKeys: [] }, catalogues);
  assert.equal(saved.dietType, "non_vegetarian", "with no choice for this plan, the profile's diet");
});

test("a goal reaches the model for an adult, and not for a child", () => {
  const adult = memberFor({ id: "a", age_band: "adult_19_59", energy_goal: "lose", eating_pattern: "keto", version: 3, avoidKeys: [] }, catalogues);
  assert.deepEqual([adult.energyGoal, adult.eatingPattern, adult.carbsMax, adult.profileVersion], ["lose", "keto", 50, 3]);
  const child = memberFor({ id: "c", age_band: "child_7_9", energy_goal: "lose", eating_pattern: "keto", avoidKeys: [] }, catalogues);
  assert.deepEqual([child.energyGoal, child.eatingPattern, child.carbsMax], ["maintain", "balanced", null]);
});

test("a member with no targets and no diet asks nothing of the plan", () => {
  const member = memberFor({ id: "m2", label: "Guest", avoidKeys: [] }, catalogues);
  assert.deepEqual(member.targets, { kcal: null, protein: null, carbs: null, fat: null });
  assert.deepEqual(member.avoidFlags, []);
  assert.deepEqual(member.dietExcludes, []);
});
