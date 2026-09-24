// ============================================================================
// KOI FOOD — tests for matching allergens through the allergen graph
// Run with `npm test`. Reads the compiled graph (allergenLexicon.js).
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { allergensIn, allergensInStatement, ingredientFlagsIn, ALLERGEN_KEYS, LEXICON_VERSION } from "@/lib/food/allergens.js";
import { words } from "@/lib/food/normalise.js";

const flags = (text) => allergensIn(text).contains;

test("words fold plurals, accents and INS numbers", () => {
  assert.deepEqual(words("Groundnuts, Crème, INS 322, E-322, E160b"), ["groundnut", "creme", "ins322", "ins322", "ins160b"]);
  assert.deepEqual(words("Madras"), ["madras"]);
});

test("the graph covers every allergen the storefront filters on, and is versioned", () => {
  for (const flag of ["dairy", "egg", "fish", "shellfish", "peanut", "tree_nut", "soy", "gluten"]) {
    assert.ok(ALLERGEN_KEYS.includes(flag), flag);
  }
  assert.match(LEXICON_VERSION, /^[0-9a-f]{12}-m\d+$/);
});

test("a list separator ends a name: 'Soy, Milk Solids' is soy and milk, not soy milk", () => {
  assert.deepEqual(flags("Sugar, Soy, Milk Solids"), ["dairy", "soy"]);
  assert.deepEqual(flags("Soy Milk (Water, Soybeans)"), ["soy"]);
  assert.deepEqual(allergensInStatement("Processed in a facility that also handles soy, milk products and oats.").sort(), ["dairy", "gluten", "soy"]);
  assert.deepEqual(flags("Emulsifier (INS 322); Wheat/Barley"), ["gluten", "soy"]);
});

test("whole words, longest name first: the butter in peanut butter is not milk", () => {
  assert.deepEqual(flags("Peanut Butter (90%), Salt"), ["peanut"]);
  assert.deepEqual(flags("Sugar, Cocoa Butter, Cocoa Mass"), []);
  assert.deepEqual(flags("Whole Wheat Flour, Vegetable Ghee"), ["gluten"]);
  assert.deepEqual(flags("Coconut Milk Powder, Maltodextrin"), []);
  assert.deepEqual(flags("Almond Butter"), ["tree_nut"]);
  assert.deepEqual(flags("Sunflower Lecithin"), []);
  assert.deepEqual(flags("Emulsifier (Soya Lecithin (INS 322))"), ["soy"]);
});

test("a word inside another word is not that word", () => {
  assert.deepEqual(flags("Eggless Sponge Mix"), []);
  const sesameOrMustard = allergensIn("Masoor Lentils, Grain Mix, Raisins").contains.filter((f) => f === "sesame" || f === "mustard");
  assert.deepEqual(sesameOrMustard, []);
});

test("an ingredient that carries an allergen under its own name is found", () => {
  assert.deepEqual(flags("Groundnut Oil"), ["peanut"]);
  assert.deepEqual(flags("Desi Ghee"), ["dairy"]);
  assert.deepEqual(flags("Lysozyme (INS 1105)"), ["egg"]);
  assert.deepEqual(flags("Rolled Oats"), ["gluten"]);
  assert.deepEqual(flags("Preservative (INS 223)"), ["sulphite"]);
});

test("every name the old keyword lists knew still resolves to the same allergen", () => {
  const known = {
    dairy: ["milk solids", "butter", "ghee", "yogurt", "curd", "paneer", "cheese", "khoya", "cream", "whey protein", "sodium caseinate", "lactose", "buttermilk"],
    egg: ["egg powder", "eggs"],
    fish: ["tuna", "salmon", "anchovy extract"],
    shellfish: ["prawns", "shrimp", "crab", "lobster"],
    peanut: ["peanuts", "groundnut", "moongphali", "singdana"],
    tree_nut: ["almonds", "cashew", "walnut", "hazelnut", "pistachio", "pecan", "macadamia", "brazil nut", "pine nuts", "chilgoza", "marzipan", "badam", "kaju", "akhrot", "pista", "dry fruits", "dryfruit"],
    soy: ["soy", "soya chunks", "tofu"],
    gluten: ["wheat flour", "maida", "bread crumbs", "pasta", "gluten", "barley", "rava", "suji", "malted barley extract"],
  };
  for (const [flag, names] of Object.entries(known)) {
    for (const name of names) assert.ok(flags(name).includes(flag), `${name} -> ${flag}`);
  }
});

test("additives raise the shopper filters they belong to, and only those", () => {
  assert.deepEqual(ingredientFlagsIn("Colour (INS 102), Preservative (INS 211)"), ["artificial_colour", "preservatives"]);
  assert.deepEqual(ingredientFlagsIn("Colour (Curcumin), Paprika Extract, Caramel Colour (E150d)"), []);
  assert.deepEqual(ingredientFlagsIn("Sweetener (INS 955)"), ["artificial_sweetener"]);
  assert.deepEqual(ingredientFlagsIn("Sweetener (Steviol Glycosides), Erythritol"), []);
  assert.deepEqual(ingredientFlagsIn("Antioxidant (INS 319)"), ["preservatives"]);
  assert.deepEqual(ingredientFlagsIn("Antioxidant (Ascorbic Acid, Tocopherols)"), []);
  assert.deepEqual(ingredientFlagsIn("Contains added flavours (Natural and Artificial Flavouring Substances)"), ["artificial_flavour"]);
  assert.deepEqual(ingredientFlagsIn("Contains added flavour (Nature Identical Flavouring Substances)"), []);
  assert.deepEqual(ingredientFlagsIn("Titanium Dioxide"), ["artificial_colour"]);
});

test("the last keyword flags come from the graph: meat, caffeine, root vegetables, spicy", () => {
  assert.deepEqual(ingredientFlagsIn("Rice Flour, Red Chilli Powder, Salt"), ["common_salt", "grain", "spicy"]);
  assert.deepEqual(ingredientFlagsIn("Madras Mixture"), ["spicy"], "a product word");
  assert.deepEqual(ingredientFlagsIn("Onion, Garlic, Green Tea"), ["allium", "caffeine", "root_veg"]);
  assert.deepEqual(ingredientFlagsIn("Sweet Potato Chips"), ["root_veg"]);
  assert.deepEqual(ingredientFlagsIn("Chicken Tikka"), ["meat"]);
  assert.deepEqual(ingredientFlagsIn("Mutton Keema"), ["meat", "red_meat"]);
  assert.deepEqual(ingredientFlagsIn("Gelatin"), ["meat"]);
  assert.deepEqual(ingredientFlagsIn("Palmolein"), ["palm_oil"]);
  assert.deepEqual(ingredientFlagsIn("Steamed Rice"), [], "whole words: no tea in steamed");
});

test("a fasting day: what it excludes, and what it must not (00056)", () => {
  // The whole rule turns on what a vrat day ALLOWS.
  // Kuttu is the flour a fasting household buys: a whole grain and a
  // pseudocereal (00060), and deliberately not a `grain` for the fast.
  assert.deepEqual(ingredientFlagsIn("Buckwheat Flour"), ["millet", "whole_grain"]);
  assert.ok(!ingredientFlagsIn("Buckwheat Flour").includes("grain"));
  assert.deepEqual(ingredientFlagsIn("Rock Salt"), [], "sendha namak is what replaces common salt");
  assert.deepEqual(ingredientFlagsIn("Wheat Flour, Salt"), ["common_salt", "grain"]);
  assert.deepEqual(ingredientFlagsIn("Whole Wheat Flour"), ["grain", "whole_grain"], "a grain, and a whole one");
  assert.deepEqual(ingredientFlagsIn("Lentils"), ["pulse"]);
  // Onion is both: a fasting day excludes it, and so does a Jain diet. Potato
  // is only the second, which is why they are separate flags.
  assert.deepEqual(ingredientFlagsIn("Onion"), ["allium", "root_veg"]);
  assert.deepEqual(ingredientFlagsIn("Potato"), ["root_veg"], "a vrat day eats potato quite happily");
  // A Jain kitchen keeps out fungi as well (00076).
  assert.deepEqual(ingredientFlagsIn("Button Mushroom"), ["fungi"]);
});

test("statements name groups, and 'peanuts' does not declare tree nuts", () => {
  assert.deepEqual(allergensInStatement("Contains tree nuts and crustaceans").sort(), ["shellfish", "tree_nut"]);
  assert.deepEqual(allergensInStatement("Contains peanuts"), ["peanut"]);
  assert.deepEqual(allergensInStatement("Contains cereals containing gluten and milk products").sort(), ["dairy", "gluten"]);
  assert.deepEqual(allergensInStatement("May contain sulphites"), ["sulphite"]);
});
