// The facts KOI derives per SKU, and what a partial list may and may not prove.

import test from "node:test";
import assert from "node:assert/strict";

import { tier2Facts, skuFacts, FACTS_VERSION } from "@/lib/food/facts.js";

test("what sweetens it is proof; whether anything does needs the whole list", () => {
  // A partial list naming jaggery proves jaggery.
  const partial = tier2Facts("Jaggery, Peanuts", false);
  assert.deepEqual(partial.sweetenedWith, ["jaggery"]);
  assert.equal(partial.sweetened, true);
  assert.equal(partial.evidence, "partial_list");

  // A partial list naming no sweetener proves nothing either way. This is the
  // whole rule: absence of evidence is not evidence of absence, and "no added
  // sugar" is exactly the claim a partial list cannot support.
  const quiet = tier2Facts("Peanuts, Salt", false);
  assert.deepEqual(quiet.sweetenedWith, []);
  assert.equal(quiet.sweetened, null, "not false");

  // The same list, read in full, can say so.
  const full = tier2Facts("Peanuts, Salt", true);
  assert.equal(full.sweetened, false);
  assert.equal(full.evidence, "full_list");

  // Nothing at all to read.
  assert.deepEqual(tier2Facts(null, true), { sweetenedWith: null, sweetened: null, millet: null, wholeGrain: null, evidence: "none" });
});

test("every kind of sweetener the graph knows, by its own name", () => {
  assert.deepEqual(tier2Facts("Refined Sugar", true).sweetenedWith, ["sugar"]);
  assert.deepEqual(tier2Facts("Honey", true).sweetenedWith, ["honey"]);
  assert.deepEqual(tier2Facts("Dates, Almonds", true).sweetenedWith, ["fruit"], "a date is sweet and is not a sugar");
  assert.deepEqual(tier2Facts("Sucralose", true).sweetenedWith, ["artificial"]);
  // Order is the graph's, and a bar can be sweetened twice over.
  assert.deepEqual(tier2Facts("Jaggery, Refined Sugar", true).sweetenedWith, ["sugar", "jaggery"]);
});

test("a whole grain and a millet are read off the same graph", () => {
  const ragi = tier2Facts("Ragi Flour, Salt", true);
  assert.equal(ragi.millet, true);
  assert.equal(ragi.wholeGrain, true, "every millet is a whole grain");

  const maida = tier2Facts("Refined Wheat Flour", true);
  assert.equal(maida.millet, false);
  assert.equal(maida.wholeGrain, false, "refined is the opposite of whole, and the full list can say so");

  assert.equal(tier2Facts("Refined Wheat Flour", false).wholeGrain, null, "a partial list cannot");
  assert.equal(tier2Facts("Brown Rice", false).wholeGrain, true, "though it can prove one it names");
});

test("the facts row carries them, and says which list it had", () => {
  const row = skuFacts({
    ingredientsText: null,
    partialText: "Jaggery, Ragi",
    mrp: 200,
    netWeight: "500 g",
    nutrition: null,
    vegReadings: [],
  });
  assert.deepEqual(row.sweetened_with, ["jaggery"]);
  assert.equal(row.millet, true);
  assert.equal(row.sweetened, true);
  assert.equal(row.tier2_evidence, "partial_list");
  assert.equal(row.nova_group, null, "and processing still needs a complete list");
  assert.match(FACTS_VERSION, /^facts-v2\+/);
});
