// ============================================================================
// KOI PLANNER — tests for the constraint model
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanModel, nameOf, NUTRIENTS, MAX_PACKS_PER_SKU, MODEL_VERSION, QUALITY_TIEBREAK, SPEND_TIEBREAK, qualityCost, portionCap, PORTION_RULE, PRICE_SANITY, FAIRNESS, DEVIATION_COST } from "@/lib/planner/model.js";

const almonds = { skuId: "almonds", price: 450, contains: ["tree_nut"], availability: "unknown", perPack: { kcal: 1312, protein: 34, carbs: 44, fat: 100 } };
const cookies = { skuId: "cookies", price: 120, contains: ["gluten", "dairy", "soy", "peanut"], availability: "unknown", perPack: { kcal: 940, protein: 21.8, carbs: 130, fat: 40 } };
const rice = {
  skuId: "rice", price: 299, contains: [], availability: "available", perPack: { kcal: 3500, protein: 95, carbs: 780, fat: 5 },
  packAmount: 1000, packUnit: "g", role: "meal_base", portion: { amount: 45, unit: "g", max: 90, measure: null },
};

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
  const model = buildPlanModel({ members: [jain], catalogue: [potatoChips, rice], days: 7 });
  assert.deepEqual(model.meta.skus, ["rice"]);
  assert.equal(model.excluded[0].rule, "diet");
  assert.equal(model.excluded[0].flag, "root_veg");
});

test("packs are whole, shares are not, and everything bought is eaten", () => {
  const model = buildPlanModel({ members: [adult, nutFree], catalogue: [rice], days: 7 });
  assert.equal(colNamed(model, nameOf.packs("rice")).integer, true);
  // Two members may eat 1.26 kg of rice each in a week: two whole packs, not fourteen.
  assert.equal(colNamed(model, nameOf.packs("rice")).upper, 2);
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
  const dearProtein = { skuId: "dear", price: 300, contains: [], perPack: { protein: 10 } };
  const model = buildPlanModel({ members: [adult], catalogue: [dearProtein, cheapProtein, rice], days: 7, candidateLimit: 2 });
  assert.deepEqual(model.meta.skus, ["cheap", "rice"], "0.5 and 0.32 g of protein per rupee beat 0.03");
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
  const model = buildPlanModel({ members: [adult, nutFree], catalogue: [rice], days: 7, maxPacksPerSku: 1 });
  assert.equal(colNamed(model, nameOf.packs("rice")).upper, 1);
  assert.equal(colNamed(model, nameOf.eats("rice", "me")).upper, 1, "the tighter of the pack cap and the portion");
  assert.equal(model.meta.maxPacksPerSku, 1);
});

test("nobody is planned more of one product than they could eat", () => {
  const kid = { id: "kid", targets: { kcal: 1400, protein: 30 }, avoidFlags: [], dietExcludes: [] };
  const model = buildPlanModel({ members: [adult, kid], catalogue: [rice], days: 7 });
  // A staple is eaten twice a day: 2 x 90 g x 7 days = 1,260 g of a 1,000 g pack.
  assert.equal(colNamed(model, nameOf.eats("rice", "me")).upper, 1.26);
  // 1,400 kcal is 70% of the 2,000 kcal reference: 126 g a day.
  assert.equal(colNamed(model, nameOf.eats("rice", "kid")).upper, 0.882);
  assert.equal(colNamed(model, nameOf.packs("rice")).upper, 2, "1.26 + 0.882 packs: two whole ones");
  assert.deepEqual(model.meta.portionCaps.rice.me, { packs: 1.26, basis: "reference_portion", perDay: 180, unit: "g" });
  assert.equal(model.meta.portionRule, PORTION_RULE.version);
  assert.equal(MODEL_VERSION, "plan-model-v4");
});

test("anything but a staple is one serving a day", () => {
  const snack = { skuId: "snack", price: 90, contains: [], perPack: { kcal: 860 }, packAmount: 200, packUnit: "g", role: "snack", portion: { amount: 30, unit: "g", max: 60 } };
  assert.deepEqual(portionCap(snack, adult, 7), { packs: 2.1, basis: "reference_portion", perDay: 60, unit: "g" });
});

test("with no reference portion, a product supplies at most a tenth of a member's energy", () => {
  const drinkMix = { skuId: "mix", price: 250, contains: [], perPack: { kcal: 491.4 }, packAmount: 150, packUnit: "g", role: "drink", portion: null };
  // 2,000 kcal x 7 days x 10% = 1,400 kcal of a 491.4 kcal pack.
  assert.deepEqual(portionCap(drinkMix, adult, 7), { packs: 2.849, basis: "energy_share", perDay: 200, unit: "kcal" });
  // A portion in millilitres says nothing about a pack in grams.
  const mismatched = { ...drinkMix, portion: { amount: 240, unit: "ml", max: 480 } };
  assert.equal(portionCap(mismatched, adult, 7).basis, "energy_share");
  // No energy target: the 2,000 kcal reference stands.
  assert.equal(portionCap(drinkMix, nutFree, 7).packs, 2.849);
  // No energy figure either: one pack over the period.
  assert.deepEqual(portionCap({ skuId: "x", perPack: { protein: 10 } }, adult, 7), { packs: 1, basis: "one_pack", perDay: null, unit: null });
});

test("a pack the household cannot finish in the period is not bought", () => {
  const kid = { id: "kid", targets: { kcal: 1400 }, avoidFlags: [], dietExcludes: [] };
  // 126 g a day for 3 days is 378 g: a 1 kg bag would be left over.
  const model = buildPlanModel({ members: [kid], catalogue: [rice], days: 3 });
  assert.deepEqual(model.meta.skus, []);
  assert.deepEqual(model.excluded, [{ skuId: "rice", reason: "pack_outlasts_the_plan", canEat: 0.378 }]);
});

test("a product whose nutrition is priced far beyond the catalogue's is not planned with", () => {
  const saffron = {
    skuId: "saffron", price: 1250, contains: [], perPack: { kcal: 3.1, protein: 0.11 },
    packAmount: 1, packUnit: "g", role: "cooking", portion: { amount: 0.5, unit: "g", max: 1 },
  };
  const model = buildPlanModel({ members: [adult], catalogue: [rice, cookies, almonds, saffron], days: 7 });
  assert.deepEqual(model.meta.skus, ["rice", "cookies", "almonds"]);
  assert.deepEqual(model.excluded, [{
    skuId: "saffron",
    reason: "priced_beyond_its_nutrition",
    rupeesPer1000kcal: 403226,
    typicalPer1000kcal: 235,
    rupeesPer100gProtein: 1136364,
    typicalPer100gProtein: 937,
  }]);
  assert.equal(PRICE_SANITY.multiple, 10);
});

test("the worst-off member's shortfall is charged, so a shortfall is shared", () => {
  const kid = { id: "kid", targets: { kcal: 1400, protein: 30 }, avoidFlags: [], dietExcludes: [] };
  const model = buildPlanModel({ members: [adult, kid], catalogue: [rice], days: 7 });
  // One share of shortfall per nutrient both members have a target for.
  const worstKcal = colNamed(model, nameOf.worst("kcal"));
  // Half of (0.02 per kcal x the household's 23,800 kcal for the week).
  assert.equal(worstKcal.cost, FAIRNESS.weight * DEVIATION_COST.kcal.short * (2000 + 1400) * 7);
  assert.equal(worstKcal.cost, 238);
  // short(kid) - 9,800 x worst <= 0: the kid's share of shortfall is at most the worst.
  assert.deepEqual(rowNamed(model, "fair_kid_kcal"), {
    name: "fair_kid_kcal",
    lower: -Infinity,
    upper: 0,
    coefficients: { [nameOf.short("kid", "kcal")]: 1, [nameOf.worst("kcal")]: -9800 },
  });
  assert.deepEqual(model.meta.fairnessNutrients, ["kcal", "protein"]);
  assert.equal(model.meta.fairness, FAIRNESS.weight);
});

test("fairness needs two people to be fair between, and can be turned off", () => {
  // nutFree has only a protein target, so only protein is shared.
  const mixed = buildPlanModel({ members: [adult, nutFree], catalogue: [rice], days: 7 });
  assert.deepEqual(mixed.meta.fairnessNutrients, ["protein"]);
  assert.equal(colNamed(mixed, nameOf.worst("kcal")), undefined);

  const alone = buildPlanModel({ members: [adult], catalogue: [rice], days: 7 });
  assert.deepEqual(alone.meta.fairnessNutrients, []);
  assert.equal(alone.meta.fairness, 0);

  const off = buildPlanModel({ members: [adult, nutFree], catalogue: [rice], days: 7, fairness: 0 });
  assert.equal(colNamed(off, nameOf.worst("protein")), undefined);
  assert.equal(rowNamed(off, "fair_kid_protein"), undefined);
});

test("relaxing variety doubles every portion ceiling", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [rice], days: 7, portionRelax: 2 });
  assert.equal(colNamed(model, nameOf.eats("rice", "me")).upper, 2.52);
  assert.equal(model.meta.portionRelax, 2);
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
