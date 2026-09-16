// ============================================================================
// KOI PLANNER — tests for the constraint model
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanModel, nameOf, NUTRIENTS, MAX_PACKS_PER_SKU, MODEL_VERSION, QUALITY_TIEBREAK, SPEND_TIEBREAK, qualityCost } from "@/lib/planner/model.js";

const almonds = { skuId: "almonds", price: 450, contains: ["tree_nut"], availability: "unknown", perPack: { kcal: 1312, protein: 34, carbs: 44, fat: 100 } };
const cookies = { skuId: "cookies", price: 120, contains: ["gluten", "dairy", "soy", "peanut"], availability: "unknown", perPack: { kcal: 940, protein: 21.8, carbs: 130, fat: 40 } };
const rice = { skuId: "rice", price: 299, contains: [], availability: "available", perPack: { kcal: 3500, protein: 95, carbs: 780, fat: 5 } };

const adult = { id: "me", targets: { protein: 60, kcal: 2000 }, avoidFlags: [], dietExcludes: [] };
const nutFree = { id: "kid", targets: { protein: 30 }, avoidFlags: ["tree_nut"], dietExcludes: [] };
const jain = { id: "gran", targets: { protein: 40 }, avoidFlags: [], dietExcludes: ["meat", "fish", "shellfish", "egg", "honey", "root_veg"] };

const rowNamed = (model, name) => model.rows.find((r) => r.name === name);
const colNamed = (model, name) => model.columns.find((c) => c.name === name);

test("what one member cannot eat, the household does not buy", () => {
  const model = buildPlanModel({ members: [adult, nutFree], catalogue: [almonds, rice], days: 7 });
  assert.deepEqual(model.meta.skus, ["rice"]);
  assert.deepEqual(model.excluded, [{ skuId: "almonds", reason: "refused", member: "kid", flag: "tree_nut", rule: "avoided" }]);
  assert.equal(colNamed(model, nameOf.packs("almonds")), undefined, "not in the program at all");
});

test("a diet removes a product the same way an allergen does", () => {
  const potatoChips = { skuId: "chips", price: 150, contains: ["root_veg"], availability: "unknown", perPack: { protein: 25.6, kcal: 1000 } };
  const model = buildPlanModel({ members: [jain], catalogue: [potatoChips, rice], days: 3 });
  assert.deepEqual(model.meta.skus, ["rice"]);
  assert.equal(model.excluded[0].rule, "diet");
  assert.equal(model.excluded[0].flag, "root_veg");
});

test("packs are whole, shares are not, and everything bought is eaten", () => {
  const model = buildPlanModel({ members: [adult, nutFree], catalogue: [rice], days: 7 });
  assert.equal(colNamed(model, nameOf.packs("rice")).integer, true);
  assert.equal(colNamed(model, nameOf.packs("rice")).upper, MAX_PACKS_PER_SKU);
  assert.equal(colNamed(model, nameOf.eats("rice", "me")).integer, false);
  // packs - eats(me) - eats(kid) = 0
  const eaten = rowNamed(model, "eaten_rice");
  assert.deepEqual(eaten, {
    name: "eaten_rice",
    lower: 0,
    upper: 0,
    coefficients: { [nameOf.packs("rice")]: -1, [nameOf.eats("rice", "me")]: 1, [nameOf.eats("rice", "kid")]: 1 },
  });
});

test("a target becomes a goal with a shortfall and an excess, scaled by the days", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [rice], days: 7 });
  const row = rowNamed(model, "target_me_protein");
  assert.equal(row.lower, 420, "60 g a day for 7 days");
  assert.equal(row.upper, 420);
  assert.equal(row.coefficients[nameOf.eats("rice", "me")], 95);
  assert.equal(row.coefficients[nameOf.short("me", "protein")], 1);
  assert.equal(row.coefficients[nameOf.over("me", "protein")], -1);
  // A shortfall costs more than an excess, so the solver prefers to overshoot.
  assert.ok(colNamed(model, nameOf.short("me", "protein")).cost > colNamed(model, nameOf.over("me", "protein")).cost);
  // No target, no row: KOI does not invent one.
  assert.equal(rowNamed(model, "target_me_fat"), undefined);
  assert.equal(rowNamed(model, "target_me_carbs"), undefined);
});

test("the budget is one row over whole packs, and absent when not given", () => {
  const withBudget = buildPlanModel({ members: [adult], catalogue: [rice, cookies], days: 7, budget: 1500 });
  assert.deepEqual(rowNamed(withBudget, "budget").coefficients, { [nameOf.packs("rice")]: 299, [nameOf.packs("cookies")]: 120 });
  assert.equal(rowNamed(withBudget, "budget").upper, 1500);
  assert.equal(rowNamed(buildPlanModel({ members: [adult], catalogue: [rice], days: 7 }), "budget"), undefined);
});

test("a product KOI cannot quantify or price is not plannable", () => {
  const noFigures = { skuId: "mystery", price: 99, contains: [], perPack: {} };
  const noPrice = { skuId: "unpriced", price: null, contains: [], perPack: { protein: 10 } };
  const model = buildPlanModel({ members: [adult], catalogue: [noFigures, noPrice, rice], days: 7 });
  assert.deepEqual(model.excluded.map((e) => e.reason).sort(), ["no_price", "not_quantifiable"]);
  assert.deepEqual(model.meta.skus, ["rice"]);
});

test("unknown availability is not available when the caller requires it", () => {
  const loose = buildPlanModel({ members: [adult], catalogue: [rice, almonds], days: 7 });
  assert.deepEqual(loose.meta.skus, ["rice", "almonds"]);
  assert.equal(loose.meta.availability, "allow_unknown");

  const strict = buildPlanModel({ members: [adult], catalogue: [rice, almonds], days: 7, availability: "require_available" });
  assert.deepEqual(strict.meta.skus, ["rice"]);
  assert.deepEqual(strict.excluded, [{ skuId: "almonds", reason: "not_confirmed_available", availability: "unknown" }]);
});

test("a candidate limit admits the most protein per rupee, and says so", () => {
  const cheapProtein = { skuId: "cheap", price: 100, contains: [], perPack: { protein: 50 } };
  const dearProtein = { skuId: "dear", price: 1000, contains: [], perPack: { protein: 10 } };
  const model = buildPlanModel({ members: [adult], catalogue: [dearProtein, cheapProtein, rice], days: 7, candidateLimit: 2 });
  assert.deepEqual(model.meta.skus, ["cheap", "rice"], "0.5 and 0.32 g of protein per rupee beat 0.01");
  assert.deepEqual(model.excluded, [{ skuId: "dear", reason: "not_a_candidate", rule: "protein_per_rupee", rank: 3 }]);
  assert.equal(model.meta.candidateLimit, 2);
  assert.equal(model.meta.candidateRule, "protein_per_rupee");
  assert.equal(model.meta.allowedBeforeLimit, 3);

  // Under the limit, nothing is dropped and no rule is recorded.
  const whole = buildPlanModel({ members: [adult], catalogue: [rice], days: 7, candidateLimit: 5 });
  assert.equal(whole.meta.candidateRule, null);
  assert.deepEqual(whole.excluded, []);
});

test("the pack cap is the caller's to tighten", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [rice], days: 3, maxPacksPerSku: 3 });
  assert.equal(colNamed(model, nameOf.packs("rice")).upper, 3);
  assert.equal(colNamed(model, nameOf.eats("rice", "me")).upper, 3);
  assert.equal(model.meta.maxPacksPerSku, 3);
});

test("better-screened food wins a tie, and a tie is all it can win", () => {
  assert.equal(qualityCost(100), 0);
  assert.equal(qualityCost(10), 0.09);
  assert.equal(qualityCost(null), QUALITY_TIEBREAK, "unscored is not assumed good");
  const model = buildPlanModel({
    members: [adult],
    catalogue: [{ ...rice, score: 75 }, { ...cookies, skuId: "mithai", contains: [], score: 10 }],
    days: 7,
  });
  // Quality plus spend: rice 0.025 + ₹299 x 0.0001; mithai 0.09 + ₹120 x 0.0001.
  assert.equal(colNamed(model, nameOf.packs("rice")).cost, 0.0549);
  assert.equal(colNamed(model, nameOf.packs("mithai")).cost, 0.102);
  // The most quality can cost a pack is 5 kcal of shortfall; ₹1,000 of spend is the same.
  assert.ok(QUALITY_TIEBREAK <= 5 * colNamed(model, nameOf.short("me", "kcal")).cost);
  assert.ok(SPEND_TIEBREAK * 1000 <= 5 * colNamed(model, nameOf.short("me", "kcal")).cost);
  assert.equal(model.meta.qualityTiebreak, QUALITY_TIEBREAK);
  assert.equal(model.meta.spendTiebreak, SPEND_TIEBREAK);
  const flat = buildPlanModel({ members: [adult], catalogue: [{ ...rice, score: 75 }], days: 7, qualityTiebreak: 0, spendTiebreak: 0 });
  assert.equal(colNamed(flat, nameOf.packs("rice")).cost, 0);
});

test("a product the shopper cannot get is planned without, and says so", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [rice, cookies], days: 7, excludeSkus: ["rice"] });
  assert.deepEqual(model.meta.skus, ["cookies"]);
  assert.deepEqual(model.excluded, [{ skuId: "rice", reason: "removed_by_shopper" }]);
  assert.deepEqual(model.meta.removedByShopper, ["rice"]);
});

test("the model says what it is, so a stored plan can be read back", () => {
  const model = buildPlanModel({ members: [adult, nutFree, jain], catalogue: [rice], days: 5, budget: 2000 });
  assert.equal(model.meta.version, MODEL_VERSION);
  assert.deepEqual(model.meta.members, ["me", "kid", "gran"]);
  assert.equal(model.meta.days, 5);
  assert.equal(model.meta.budget, 2000);
  assert.equal(model.meta.sense, "minimise");
  assert.deepEqual(NUTRIENTS, ["kcal", "protein", "carbs", "fat"]);
});
