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

test("a member with no targets and no diet asks nothing of the plan", () => {
  const member = memberFor({ id: "m2", label: "Guest", avoidKeys: [] }, catalogues);
  assert.deepEqual(member.targets, { kcal: null, protein: null, carbs: null, fat: null });
  assert.deepEqual(member.avoidFlags, []);
  assert.deepEqual(member.dietExcludes, []);
});
