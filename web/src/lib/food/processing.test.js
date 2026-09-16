// ============================================================================
// KOI FOOD — tests for the processing group (NOVA) read from ingredient lists
// Run with `npm test`. Reads the compiled names (processingData.js).
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { processingOf, PROCESSING_VERSION } from "@/lib/food/processing.js";
import { skuFacts, rupeesPerGramProtein, agreedVegMark } from "@/lib/food/facts.js";

const groupOf = (text) => processingOf(text).group;

test("group 1: foods alone, however they are described", () => {
  assert.equal(groupOf("100% Almond Kernels"), 1);
  assert.equal(groupOf("Roasted Almonds, Roasted Cashews, Black Raisins"), 1);
  assert.match(PROCESSING_VERSION, /^[0-9a-f]{12}$/);
});

test("group 2: culinary ingredients alone", () => {
  assert.equal(groupOf("Honey"), 2);
  assert.equal(groupOf("Cold Pressed Groundnut Oil"), 2);
  assert.equal(groupOf("Iodised Salt"), 2);
});

test("group 3: foods with salt, sugar or oil added, or an additive that preserves them", () => {
  assert.equal(groupOf("Roasted Almonds, Roasted & Salted Pistachios"), 3);
  assert.equal(groupOf("Banana (Nendran) (75%), Coconut Oil (23%), Iodized Salt, Turmeric Powder"), 3);
  assert.equal(groupOf("Thin Poha (50%), Peanuts, Cashews, Raisins, Groundnut Oil (11.5%), Spices and Condiments (2.2%), Turmeric, Salt, Sugar"), 3);
  assert.equal(groupOf("Gram Flour, Rice Bran Oil, Salt, Acidity Regulator (INS 330)"), 3);
});

test("group 4: a cosmetic additive or a substance of no culinary use", () => {
  const cookies = processingOf("Protein mix (47%) (Whole Wheat, Ragi, Jowar, Milk Solids, Soy Protein), Raw Cane Sugar, Butter, Groundnut oil, Jaggery, Raising agent (Baking Soda), Salt, Natural and Nature Identical flavours");
  assert.equal(cookies.group, 4);
  assert.ok(cookies.markers.some((m) => m.includes("flavour")));
  assert.equal(groupOf("Corn grits (89%), Sugar, Iodised salt, Malt Extract, Soya lecithin-Emulsifier (INS-322)"), 4);
  assert.equal(groupOf("Casein, Sucrose, Precooked Rice Flour, Bengal Gram"), 4);
  assert.equal(groupOf("Jowar Flour, Rice Flour, Emulsifier INS 170 (i), Sunflower oil, Salt"), 4, "the label declares an emulsifier");
  assert.equal(groupOf("Wheat Flour, Sugar, Colour (Caramel)"), 4, "a colour of any origin");
});

test("an additive KOI cannot classify counts as processing, never as a food", () => {
  const read = processingOf("Wheat Flour, INS 9999");
  assert.equal(read.group, 3);
  assert.deepEqual(read.unclassifiedAdditives, ["ins9999"]);
});

test("nothing readable gets no group", () => {
  assert.equal(groupOf(""), null);
  assert.equal(groupOf("(47%)"), null);
});

test("rupees per gram of protein needs a price, a net weight and protein in one unit", () => {
  const almonds = { measurement_basis: "per_100g", protein_g: 17 };
  // 200 g at 17 g per 100 g is 34 g of protein for ₹450.
  assert.equal(rupeesPerGramProtein({ mrp: 450, netWeight: "200g", nutrition: almonds }), 13.24);
  assert.equal(rupeesPerGramProtein({ mrp: 450, netWeight: "200ml", nutrition: almonds }), null);
  assert.equal(rupeesPerGramProtein({ mrp: null, netWeight: "200g", nutrition: almonds }), null);
  assert.equal(rupeesPerGramProtein({ mrp: 450, netWeight: "200g", nutrition: { measurement_basis: "per_100g", protein_g: 0 } }), null);
});

test("the veg mark counts only when both readings agree on it", () => {
  assert.equal(agreedVegMark([{ first: "not_visible", second: "veg" }, { first: "veg", second: "veg" }]), "veg");
  assert.equal(agreedVegMark([{ first: "not_visible", second: "veg" }]), null);
  assert.equal(agreedVegMark([]), null);
});

test("facts without a complete list say why there is no processing group", () => {
  const facts = skuFacts({ ingredientsText: null, mrp: 299, netWeight: "250g", nutrition: { measurement_basis: "per_serving", serving_size: "100g", protein_g: 1.88 }, vegReadings: [] });
  assert.equal(facts.nova_group, null);
  assert.match(facts.nova_basis.reason, /ingredient list/);
  assert.equal(facts.rupees_per_g_protein, 63.62);
});
