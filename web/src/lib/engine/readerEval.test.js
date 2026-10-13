// Measuring a new label reader against the two KOI already has (readerEval.js).

import test from "node:test";
import assert from "node:assert/strict";

import { NUTRIENT_FIELDS } from "@/lib/engine/labelSchema.js";
import { scorePhoto, summarize, summarizePair } from "@/lib/engine/readerEval.js";

const values = (over = {}) => ({ ...Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, null])), ...over });

// A protein bar's back panel: a per-100 g table, a list, and a statement.
function reading(over = {}) {
  return {
    visible: { ingredients: true, allergen_statement: true, nutrition_table: true },
    product_name: "Peanut Butter Protein Bar", brand: null, net_quantity: null, veg_mark: "veg",
    ingredients_text: "Peanuts, Whey Protein, Dates, Cocoa",
    ingredients: [],
    allergen_statement: "Contains peanut and milk.",
    may_contain_statement: null,
    nutrition: {
      basis: "per_100g", serving_size: "60g", servings_per_pack: 1,
      values: values({ energy_kcal: 420, protein_g: 33.3, carbs_g: 38, sugars_g: 12, total_fat_g: 15, sodium_mg: 210 }),
    },
    fssai_licence: null, unreadable: [],
    ...over,
  };
}

const misreadProtein = (r) => ({ ...r, nutrition: { ...r.nutrition, values: { ...r.nutrition.values, protein_g: 38.3 } } });

test("a candidate that reads what both readers read agrees on every part", () => {
  const a = reading();
  const s = scorePhoto(a, reading(), reading());
  assert.equal(s.valid, true);
  for (const p of ["nutrition", "ingredients", "allergens"]) {
    assert.deepEqual(s.parts[p], { applies: true, ab: true, ac: true, bc: true, phantom: false }, p);
  }
  assert.deepEqual(s.allergens.declared.sort(), ["dairy", "peanut"]);
  assert.deepEqual(s.allergens.missed, []);
});

test("a dropped declared allergen is a miss, and a demoted one is counted apart", () => {
  const a = reading();
  const dropped = scorePhoto(a, reading(), reading({ allergen_statement: "Contains milk.", ingredients_text: "Whey Protein, Dates, Cocoa" }));
  assert.deepEqual(dropped.allergens.missed, ["peanut"]);
  assert.equal(dropped.parts.allergens.ac, false);

  // "May contain peanut" for a bar made OF peanuts is still a wrong answer,
  // but a shopper avoiding peanuts is warned either way. Not the same failure.
  const demoted = scorePhoto(a, reading(), reading({
    allergen_statement: "Contains milk. May contain peanut.", ingredients_text: "Whey Protein, Dates, Cocoa",
  }));
  assert.deepEqual(demoted.allergens.missed, []);
  assert.deepEqual(demoted.allergens.demoted, ["peanut"]);
});

test("where the two readers split, a candidate that sides with one settles it", () => {
  const a = reading();
  const b = misreadProtein(reading());
  const sidesWithA = scorePhoto(a, b, reading());
  assert.equal(sidesWithA.parts.nutrition.ab, false);
  assert.equal(sidesWithA.parts.nutrition.ac, true);
  assert.equal(sidesWithA.parts.nutrition.bc, false);

  const sum = summarize([{ score: sidesWithA }, { score: scorePhoto(a, b, misreadProtein(reading())) }]);
  assert.deepEqual(sum.whereABDisagreed.nutrition.settles, { k: 2, n: 2, pct: 100 });
  assert.equal(sum.whereABDisagreed.nutrition.sidesWithA, 1);
  assert.equal(sum.whereABDisagreed.nutrition.sidesWithB, 1);
});

test("the candidate is held to reader 2's own rate, on the same photos", () => {
  const a = reading();
  const rows = [
    { score: scorePhoto(a, reading(), reading()), costUsd: 0.0007, latencyMs: 4000 },
    { score: scorePhoto(a, reading(), misreadProtein(reading())), costUsd: 0.0009, latencyMs: 6000 },
    { score: scorePhoto(a, misreadProtein(reading()), reading()), costUsd: null, latencyMs: null },
    { score: scorePhoto(a, reading(), null), error: "the reading did not match the label schema" },
  ];
  const sum = summarize(rows);
  assert.deepEqual(sum.valid, { k: 3, n: 4, pct: 75 });
  assert.equal(sum.errors, 1);
  // Of the three valid photos, B agreed with A on two, and so did C.
  assert.deepEqual(sum.asReader2.nutrition.candidate, { k: 2, n: 3, pct: 66.7 });
  assert.deepEqual(sum.asReader2.nutrition.baselineB, { k: 2, n: 3, pct: 66.7 });
  assert.deepEqual(sum.whereABAgreed.nutrition, { k: 1, n: 2, pct: 50 });
  // An unpriced call is left out of the average, not counted as free.
  assert.deepEqual(sum.cost, { usd: 0.0016, perPhotoUsd: 0.0008, priced: 2 });
});

test("a panel only the candidate saw is a phantom, and the part was never in play", () => {
  const noTable = reading({ visible: { ingredients: true, allergen_statement: true, nutrition_table: false }, nutrition: { basis: null, serving_size: null, servings_per_pack: null, values: values() } });
  const s = scorePhoto(noTable, noTable, reading());
  assert.equal(s.parts.nutrition.applies, false);
  assert.equal(s.parts.nutrition.phantom, true);
  assert.equal(summarize([{ score: s }]).asReader2.nutrition.candidate.n, 0);
});

test("two open readers agreeing on the wrong figure is the number that matters", () => {
  const a = reading();
  const wrong = misreadProtein(reading());
  const sum = summarizePair([
    { a, b: reading(), c1: reading(), c2: reading() }, // all four agree
    { a, b: reading(), c1: wrong, c2: misreadProtein(reading()) }, // the open pair agrees on 38.3
    { a, b: reading(), c1: reading(), c2: null }, // one open reader failed: not a pair
  ]);
  assert.equal(sum.photos, 2);
  assert.deepEqual(sum.parts.nutrition.pair, { k: 2, n: 2, pct: 100 });
  assert.deepEqual(sum.parts.nutrition.agreedOnSomethingElse, { k: 1, n: 2, pct: 50 });
  assert.deepEqual(sum.parts.ingredients.agreedOnSomethingElse, { k: 0, n: 2, pct: 0 });
});
