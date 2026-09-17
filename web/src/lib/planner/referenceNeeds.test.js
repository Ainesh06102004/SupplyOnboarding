// ============================================================================
// KOI PLANNER — tests for the ICMR-NIN 2020 reference needs (plan §9.10.1)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { referenceNeeds } from "@/lib/planner/referenceNeeds.js";
import { AGE_BAND_KEYS } from "@/lib/planner/brief.js";

test("the figures are ICMR-NIN 2020's", () => {
  assert.deepEqual(referenceNeeds({ ageBand: "child_1_3" }), { kcal: 1070, protein: 12.5, source: "icmr_nin_2020", note: null });
  assert.equal(referenceNeeds({ ageBand: "child_7_9" }).kcal, 1700);
  assert.equal(referenceNeeds({ ageBand: "teen_16_18", sex: "male" }).kcal, 3320);
  assert.equal(referenceNeeds({ ageBand: "teen_16_18", sex: "female" }).protein, 46.2);
  assert.deepEqual(referenceNeeds({ ageBand: "adult_19_59", sex: "male", activity: "moderate" }), { kcal: 2710, protein: 54, source: "icmr_nin_2020", note: null });
  assert.equal(referenceNeeds({ ageBand: "adult_19_59", sex: "female", activity: "active" }).kcal, 2720);
});

test("adults default to sedentary work, and seniors use the adult figure", () => {
  assert.equal(referenceNeeds({ ageBand: "adult_19_59", sex: "female" }).kcal, 1660);
  assert.equal(referenceNeeds({ ageBand: "senior_60_plus", sex: "male", activity: "light" }).kcal, 2110);
});

test("with no sex, the midpoint, and it says so", () => {
  const teen = referenceNeeds({ ageBand: "teen_13_15" });
  assert.equal(teen.kcal, 2630);
  assert.equal(teen.protein, 44.1, "(44.9 + 43.2) / 2 = 44.05, to one decimal");
  assert.match(teen.note, /sex was not given/);
  assert.equal(referenceNeeds({ ageBand: "child_4_6" }).note, null, "no difference, no note");
});

test("every age band the planner knows has a figure; anything else has none", () => {
  for (const band of AGE_BAND_KEYS) assert.ok(referenceNeeds({ ageBand: band }), band);
  assert.equal(referenceNeeds({ ageBand: "infant" }), null);
});
