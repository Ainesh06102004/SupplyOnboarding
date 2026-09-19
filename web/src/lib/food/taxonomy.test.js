// ============================================================================
// KOI FOOD — tests for placing products in the category tree
// Run with `npm test`. Reads the compiled tree (taxonomyData.js).
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { categorise, nodeInfo, occasionsOf, servesOccasion, NODES, PORTIONS, TAXONOMY_VERSION } from "@/lib/food/taxonomy.js";

test("occasions come from the category, and a category without its own takes its aisle's", () => {
  assert.ok(servesOccasion("snacks.bars", "post_workout"));
  assert.ok(servesOccasion("staples.rice", "lunch"), "rice takes Staples' occasions");
  assert.ok(servesOccasion("snacks.biscuits_cookies", "breakfast"));
  assert.ok(!servesOccasion("snacks.chips_crisps", "breakfast"));
  assert.deepEqual(occasionsOf(null), []);
  assert.equal(nodeInfo("nuts_seeds.nuts").role, "snack");
  assert.equal(nodeInfo("nuts_seeds.nut_butters").role, "spread");
});
import { isClaimSafeText } from "@/lib/nutrition/claims.js";
import { toPerRealisticServing } from "@/lib/nutrition/basis.js";

const keyOf = (product) => categorise(product)?.key ?? null;

test("every live product lands in the category a shopper would look in", () => {
  const live = [
    [{ name: "Golden Milk Mix", categoryL1: "Beverages", categoryL2: "Health Mix" }, "beverages.drink_mixes"],
    [{ name: "Ragi Hot Chocolate Milk Mix", categoryL1: "Beverages", categoryL2: "Health Mix" }, "beverages.drink_mixes"],
    [{ name: "Gorakhpur Kalanamak Rice", categoryL1: "Farm Foods" }, "staples.rice"],
    [{ name: "Premium Pampore Saffron", categoryL1: "Farm Foods" }, "spices.spices"],
    [{ name: "Uttrakhand Honey", categoryL1: "Farm Foods" }, "sweeteners.honey"],
    [{ name: "California Almonds", categoryL1: "Healthy Snacks" }, "nuts_seeds.nuts"],
    [{ name: "Chivda Mix - Patal Poha", categoryL1: "Healthy Snacks" }, "snacks.namkeen"],
    [{ name: "Chocolate Biscuits", categoryL1: "Healthy Snacks" }, "snacks.biscuits_cookies"],
    [{ name: "Daily Dry Fruit Mix", categoryL1: "Healthy Snacks" }, "nuts_seeds.mixes"],
    [{ name: "Dates", categoryL1: "Healthy Snacks" }, "nuts_seeds.dried_fruit"],
    [{ name: "Dryfruit Instant Energy Laddubar", categoryL1: "Healthy Snacks" }, "snacks.bars"],
    [{ name: "Healthy Snack Combo - Pack of 6", categoryL1: "Healthy Snacks" }, "snacks.assortments"],
    [{ name: "Moringa Jowar Crispies - Indian Masala", categoryL1: "Healthy Snacks" }, "snacks.puffs"],
    [{ name: "The Healthy Potato Chips", categoryL1: "Snacks", categoryL2: "Chips" }, "snacks.chips_crisps"],
    [{ name: "The Healthy Butter Cookies", categoryL1: "Snacks", categoryL2: "Cookies" }, "snacks.biscuits_cookies"],
    [{ name: "The Healthy Chocolate Cookies", categoryL1: "Snacks", categoryL2: "Cookies" }, "snacks.biscuits_cookies"],
    [{ name: "Madras Mixture", categoryL1: "Snacks", categoryL2: "Savouries" }, "snacks.namkeen"],
    [{ name: "Mango Mysore Pak", categoryL1: "Sweets", categoryL2: "Traditional" }, "sweets.indian_sweets"],
  ];
  for (const [product, expected] of live) assert.equal(keyOf(product), expected, product.name);
});

test("the head noun wins: the last name in the product's name, not the first", () => {
  assert.equal(keyOf({ name: "Chocolate Biscuits" }), "snacks.biscuits_cookies");
  assert.equal(keyOf({ name: "Dark Chocolate" }), "sweets.chocolate");
  assert.equal(keyOf({ name: "Masala Peanuts" }), "nuts_seeds.nuts");
  assert.equal(keyOf({ name: "Peanut Butter" }), "nuts_seeds.nut_butters");
  assert.equal(keyOf({ name: "Almond Milk" }), "beverages.ready_to_drink");
  assert.equal(keyOf({ name: "Ragi Atta" }), "staples.flours");
  assert.equal(keyOf({ name: "Kaju Katli" }), "sweets.indian_sweets");
  assert.equal(keyOf({ name: "Roasted Fox Nuts" }), "snacks.puffs");
});

test("a product's form beats a flavour, and a flavour word means it is only a flavour", () => {
  assert.equal(keyOf({ name: "Muesli Cranberry & Blueberry" }), "staples.breakfast_cereals");
  assert.equal(keyOf({ name: "Green Tea Honey Lemon" }), "beverages.tea_coffee");
  assert.equal(keyOf({ name: "Whey Protein Milk Chocolate Flavour" }), "supplements.protein_powder");
  assert.equal(keyOf({ name: "Oats Digestive" }), "snacks.biscuits_cookies");
  assert.equal(keyOf({ name: "Chocolate Coated Almonds" }), "nuts_seeds.nuts", "two ingredients: the last one");
  assert.equal(keyOf({ name: "Kool Badam Flavour" }), null, "flavoured with almond is not almonds");
  assert.equal(keyOf({ name: "Royal Elaichi Flavoured Milk Shake" }), "beverages.ready_to_drink");
  assert.equal(keyOf({ name: "Sugar Free Cookies" }), "snacks.biscuits_cookies");
  assert.equal(keyOf({ name: "Doritos Sweet Chilli" }), null);
  assert.equal(keyOf({ name: "Amla Hair Oil" }), null);
  assert.equal(keyOf({ name: "Cumin Seeds" }), "spices.spices");
});

test("the variant after a dash does not place the product", () => {
  assert.equal(keyOf({ name: "Potato Chips - Masala" }), "snacks.chips_crisps");
  assert.equal(keyOf({ name: "Crispies - Chocolate" }), "snacks.puffs");
});

test("the brand's category is a fallback, and its wording never becomes the aisle", () => {
  const placed = categorise({ name: "Protein Blend", categoryL1: "protein_powder" });
  assert.equal(placed.key, "supplements.protein_powder");
  assert.equal(placed.matchedOn, "category_l1");
  const snack = categorise({ name: "Moringa Delight", categoryL1: "Healthy Snacks" });
  assert.equal(snack.key, "snacks");
  assert.equal(snack.aisle, "Snacks");
  assert.equal(snack.subcategory, null);
  assert.equal(categorise({ name: "Mystery Item", categoryL1: "Farm Foods" }), null);
});

test("every label is claim-free, and the tree is versioned", () => {
  for (const [key, node] of Object.entries(NODES)) {
    assert.ok(isClaimSafeText(node.label), `${key}: ${node.label}`);
    if (node.parent) assert.ok(NODES[node.parent], `${key} has a parent that exists`);
  }
  assert.match(TAXONOMY_VERSION, /^[0-9a-f]{12}$/);
});

test("reference portions are sane, and only categories that have one carry one", () => {
  for (const [key, p] of Object.entries(PORTIONS)) {
    assert.ok(NODES[key]?.parent, `${key} is a category, not an aisle`);
    assert.ok(p.amount > 0 && p.max >= p.amount, key);
    assert.ok(["g", "ml"].includes(p.unit), key);
  }
  assert.deepEqual(nodeInfo("nuts_seeds.nuts").portion, { amount: 30, unit: "g", max: 60, measure: null });
  assert.equal(nodeInfo("beverages.drink_mixes").portion, null, "a mix's reference depends on its recipe");
  assert.equal(nodeInfo("supplements.protein_powder").portion, null);
});

test("a realistic serving is the declared one unless that is implausibly large", () => {
  const almonds = { measurement_basis: "per_100g", serving_size: "100g", protein_g: 17, portion_reference: nodeInfo("nuts_seeds.nuts").portion };
  assert.equal(toPerRealisticServing(almonds).protein_g, 17 * 0.3);
  const dates = { measurement_basis: "per_serving", serving_size: "100g", protein_g: 1.88, portion_reference: nodeInfo("nuts_seeds.dried_fruit").portion };
  assert.ok(Math.abs(toPerRealisticServing(dates).protein_g - 1.88 * 0.4) < 1e-9);
  const saffron = { measurement_basis: "per_100g", serving_size: "0.1g", protein_g: 11.4, portion_reference: nodeInfo("spices.spices").portion };
  assert.ok(Math.abs(toPerRealisticServing(saffron).protein_g - 0.0114) < 1e-9, "a small declared serving stays as declared");
});

test("a shelf says how long it takes, and whose kitchen it is (00061, 00062)", () => {
  const rice = nodeInfo("staples.rice");
  assert.equal(rice.form, "needs_cooking");
  assert.equal(rice.typicalMinutes, 20, "the shelf's figure, not this pack's");
  assert.equal(rice.lunchbox, false);
  assert.equal(rice.cuisine, null, "rice is food, not Indian food");

  const namkeen = nodeInfo("snacks.namkeen");
  assert.equal(namkeen.form, "ready_to_eat");
  assert.equal(namkeen.typicalMinutes, 0);
  assert.equal(namkeen.lunchbox, true);
  assert.equal(namkeen.cuisine, "indian");

  const cereal = nodeInfo("staples.breakfast_cereals");
  assert.equal(cereal.form, "instant");
  assert.equal(cereal.cuisine, "global");

  // Oil is never eaten alone, so its time belongs to whatever it goes into.
  assert.equal(nodeInfo("fats_oils.oils").form, "ingredient");
  assert.equal(nodeInfo("fats_oils.oils").typicalMinutes, 0);
});
