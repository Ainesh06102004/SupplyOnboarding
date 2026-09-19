// ============================================================================
// KOI PLANNER — tests for the constraint model
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanModel, nameOf, NUTRIENTS, MAX_PACKS_PER_SKU, MODEL_VERSION, QUALITY_TIEBREAK, SPEND_TIEBREAK, qualityCost, portionCap, PORTION_RULE, PRICE_SANITY, FAIRNESS, DEVIATION_COST, GOAL_MODEL, PREFERENCE, CONTINUITY, continuityBonus, KITCHEN, brandIn, ROBUST, isUncertain, PRIORITY, priorityWeights, budgetBeforeTargets, inCategory, occasionsFor } from "@/lib/planner/model.js";
import { refusalReason } from "@/lib/planner/report.js";

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
// The model rounds a pack's cost to six places; a test that subtracts must too.
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

test("what one member cannot eat is kept from them, not from the household", () => {
  const model = buildPlanModel({ members: [adult, nutFree], catalogue: [almonds, rice], days: 7 });
  assert.deepEqual(model.meta.skus, ["almonds", "rice"], "almonds can still be bought for the adult");
  assert.deepEqual(model.excluded, []);
  assert.deepEqual(model.meta.refusals, { almonds: [{ member: "kid", flag: "tree_nut", rule: "avoided" }] });
  assert.equal(colNamed(model, nameOf.eats("almonds", "kid")), undefined, "the kid has no share of almonds to be given");
  assert.ok(colNamed(model, nameOf.eats("almonds", "me")));
  assert.deepEqual(Object.keys(rowNamed(model, "eaten_almonds").coefficients).sort(), [nameOf.eats("almonds", "me"), nameOf.packs("almonds")].sort());
  assert.equal(rowNamed(model, "target_kid_protein").coefficients[nameOf.eats("almonds", "kid")], undefined);
});

test("a wife's gluten-free diet and a kid's nut allergy stay theirs", () => {
  const me = { id: "me", targets: { protein: 60 }, avoidFlags: [], dietExcludes: [] };
  const wife = { id: "wife", targets: { protein: 50 }, avoidFlags: ["gluten"], dietExcludes: [] };
  const kid = { id: "kid", targets: { protein: 30 }, avoidFlags: ["tree_nut"], dietExcludes: [] };
  const atta = { ...rice, skuId: "atta", contains: ["gluten"] };
  const model = buildPlanModel({ members: [me, wife, kid], catalogue: [almonds, atta, rice], days: 7 });
  assert.deepEqual(model.meta.skus, ["almonds", "atta", "rice"]);
  assert.ok(colNamed(model, nameOf.eats("almonds", "me")) && colNamed(model, nameOf.eats("atta", "me")), "nothing is kept from me");
  assert.equal(colNamed(model, nameOf.eats("atta", "wife")), undefined);
  assert.ok(colNamed(model, nameOf.eats("almonds", "wife")));
  assert.equal(colNamed(model, nameOf.eats("almonds", "kid")), undefined);
  assert.ok(colNamed(model, nameOf.eats("atta", "kid")));
});

test("what the household keeps out of the house is bought for no one", () => {
  const me = { id: "me", targets: { protein: 60 }, avoidFlags: [], dietExcludes: [] };
  const peanutButter = { ...almonds, skuId: "pb", contains: ["peanut"] };
  const perPerson = buildPlanModel({ members: [me, { ...nutFree, avoidFlags: ["peanut"] }], catalogue: [peanutButter, rice], days: 7 });
  assert.ok(perPerson.meta.skus.includes("pb"), "without the switch, it can be bought for me");

  const keptOut = buildPlanModel({ members: [me, { ...nutFree, avoidFlags: ["peanut"] }], catalogue: [peanutButter, rice], days: 7, keepOutFlags: ["peanut"] });
  assert.deepEqual(keptOut.meta.skus, ["rice"]);
  assert.deepEqual(keptOut.excluded, [{ skuId: "pb", reason: "kept_out_of_house", flag: "peanut" }]);
  assert.deepEqual(keptOut.meta.keepOutFlags, ["peanut"]);
});

test("a product no member can eat is left out, and says who refused it", () => {
  const model = buildPlanModel({ members: [nutFree], catalogue: [almonds, rice], days: 7 });
  assert.deepEqual(model.meta.skus, ["rice"]);
  assert.deepEqual(model.excluded, [{ skuId: "almonds", reason: "refused", refusedBy: [{ member: "kid", flag: "tree_nut", rule: "avoided" }] }]);
  assert.equal(colNamed(model, nameOf.packs("almonds")), undefined, "not in the program at all");
});

test("whole nuts are kept from an under-5, and caffeine from a child, not from the adults", () => {
  const toddler = { id: "toddler", ageBand: "child_1_3", targets: { protein: 12.5 }, avoidFlags: [], dietExcludes: [] };
  const grown = { ...adult, ageBand: "adult_19_59" };
  const wholeAlmonds = { ...almonds, categoryKey: "nuts_seeds.nuts" };
  const coffee = { skuId: "coffee", price: 300, contains: ["caffeine"], availability: "unknown", perPack: { kcal: 1000, protein: 20 }, categoryKey: "beverages.drink_mixes" };
  const model = buildPlanModel({ members: [grown, toddler], catalogue: [wholeAlmonds, coffee, rice], days: 7 });
  assert.deepEqual(model.meta.refusals, {
    almonds: [{ member: "toddler", flag: "whole_nuts", rule: "age" }],
    coffee: [{ member: "toddler", flag: "caffeine", rule: "age" }],
  });
  assert.equal(colNamed(model, nameOf.eats("almonds", "toddler")), undefined);
  assert.ok(colNamed(model, nameOf.eats("almonds", "me")), "still bought for the adult");
  assert.equal(model.meta.ageSafety, "age-safety-v1");

  const alone = buildPlanModel({ members: [toddler], catalogue: [wholeAlmonds, rice], days: 7 });
  assert.deepEqual(alone.excluded, [{ skuId: "almonds", reason: "refused", refusedBy: [{ member: "toddler", flag: "whole_nuts", rule: "age" }] }]);
});

test("losing: the energy target is a ceiling, and gaining weights the shortfall", () => {
  const cutting = { ...adult, id: "cut", energyGoal: "lose" };
  const bulking = { ...adult, id: "bulk", energyGoal: "gain" };
  const model = buildPlanModel({ members: [cutting, bulking, adult], catalogue: [rice], days: 7 });
  assert.equal(colNamed(model, nameOf.over("cut", "kcal")).upper, 0, "nothing over a deficit");
  assert.equal(colNamed(model, nameOf.over("cut", "protein")).upper, Infinity, "protein may still go over");
  assert.equal(colNamed(model, nameOf.short("bulk", "kcal")).cost, DEVIATION_COST.kcal.short * GOAL_MODEL.gainShortfallMultiplier);
  assert.equal(colNamed(model, nameOf.short("me", "kcal")).cost, DEVIATION_COST.kcal.short);
  assert.deepEqual(model.meta.goals.cut, { energyGoal: "lose", eatingPattern: "balanced", carbsMax: null });
});

test("keto: a carbohydrate ceiling over the plan, and no product whose carbohydrate is undeclared", () => {
  const keto = { ...adult, id: "keto", eatingPattern: "keto", carbsMax: 50 };
  const undeclared = { skuId: "mystery", price: 100, contains: [], availability: "unknown", perPack: { kcal: 1000, protein: 30 } };
  const model = buildPlanModel({ members: [keto, adult], catalogue: [almonds, undeclared, rice], days: 7 });
  const ceiling = rowNamed(model, "carbs_ceiling_keto");
  assert.equal(ceiling.upper, 350, "50 g a day for 7 days");
  assert.deepEqual(ceiling.coefficients, { [nameOf.eats("almonds", "keto")]: 44, [nameOf.eats("rice", "keto")]: 780 });
  assert.deepEqual(model.meta.refusals.mystery, [{ member: "keto", flag: "carbs_not_declared", rule: "pattern" }]);
  assert.ok(colNamed(model, nameOf.eats("mystery", "me")), "still planned for the member with no carb limit");
});

test("a member id that the solution could not be read back for is refused loudly", () => {
  assert.throws(() => buildPlanModel({ members: [{ ...adult, id: "kid_1" }], catalogue: [rice], days: 7 }), /may not contain "_"/);
});

test("an allergen is named before an age rule when both apply", () => {
  const toddler = { id: "toddler", ageBand: "child_4_6", targets: { protein: 16 }, avoidFlags: ["tree_nut"], dietExcludes: [] };
  const model = buildPlanModel({ members: [toddler], catalogue: [{ ...almonds, categoryKey: "nuts_seeds.nuts" }, rice], days: 7 });
  assert.equal(model.excluded[0].refusedBy[0].rule, "avoided");
});

test("a diet removes a product the same way an allergen does", () => {
  const potatoChips = { skuId: "chips", price: 150, contains: ["root_veg"], availability: "unknown", perPack: { protein: 25.6, kcal: 1000 } };
  const model = buildPlanModel({ members: [jain], catalogue: [potatoChips, rice], days: 7 });
  assert.deepEqual(model.meta.skus, ["rice"]);
  assert.equal(model.excluded[0].refusedBy[0].rule, "diet");
  assert.equal(model.excluded[0].refusedBy[0].flag, "root_veg");
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
  assert.equal(occasionsFor("meal_base", []), 2, "with nothing stated, the rule's own occasions");
});

test("someone who eats fewer meals at home, or eats less, is planned less", () => {
  const breakfastOnly = { ...adult, mealsFromHome: ["breakfast"] };
  const allMeals = { ...adult, mealsFromHome: ["breakfast", "lunch", "dinner", "snacks"] };
  assert.equal(portionCap(rice, allMeals, 7).perDay, 180, "two occasions, as before");
  assert.equal(portionCap(rice, breakfastOnly, 7).perDay, 90, "one meal at home, one serving");
  assert.equal(portionCap(rice, { ...adult, mealsFromHome: ["snacks"] }, 7).perDay, 45, "no main meal at home: half a serving");
  const snack = { skuId: "snack", price: 90, contains: [], perPack: { kcal: 860 }, packAmount: 200, packUnit: "g", role: "snack", portion: { amount: 30, unit: "g", max: 60 } };
  assert.equal(portionCap(snack, allMeals, 7).perDay, 60);
  assert.equal(portionCap(snack, breakfastOnly, 7).perDay, 30, "they don't snack at home");
  assert.equal(portionCap(rice, { ...allMeals, appetite: "large" }, 7).perDay, 216, "a big eater, a fifth more");
  assert.equal(portionCap(rice, { ...allMeals, appetite: "small" }, 7).perDay, 144);
  assert.equal(PORTION_RULE.version, "portion-cap-v2");
});

test("this week: what they feel like costs a little less, and what they skip is not for them", () => {
  const biscuits = {
    skuId: "biscuits", price: 120, contains: [], availability: "unknown", perPack: { kcal: 940, protein: 21.8, carbs: 130, fat: 40 },
    packAmount: 200, packUnit: "g", role: "snack", portion: { amount: 30, unit: "g", max: 60 }, categoryKey: "snacks.biscuits_cookies",
  };
  const wants = { ...adult, id: "wants", preferCategories: ["snacks"] };
  const skips = { ...adult, id: "skips", skipCategories: ["snacks.biscuits_cookies"] };
  const model = buildPlanModel({ members: [wants, skips], catalogue: [{ ...rice, categoryKey: "staples.rice" }, biscuits], days: 7 });
  assert.equal(colNamed(model, nameOf.eats("biscuits", "wants")).cost, -PREFERENCE.bonusPerPack, "a nudge, not a rule");
  assert.equal(colNamed(model, nameOf.eats("rice", "wants")).cost, 0);
  assert.equal(colNamed(model, nameOf.eats("biscuits", "skips")), undefined);
  assert.deepEqual(model.meta.refusals.biscuits, [{ member: "skips", flag: "not_this_week", rule: "this_week" }]);
  assert.deepEqual(model.meta.thisWeek.wants.prefer, ["snacks"]);
  assert.equal(refusalReason({ flag: "not_this_week", rule: "this_week" }), "not what they feel like this week");
  assert.equal(inCategory("snacks.biscuits_cookies", ["snacks"]), true, "an aisle covers what is under it");
  assert.equal(inCategory("snacks_extra", ["snacks"]), false);
  assert.equal(MODEL_VERSION, "plan-model-v13");
});

test("a change keeps the plan it changes, and what was asked for is always a candidate", () => {
  const oats = {
    skuId: "oats", price: 260, contains: [], availability: "unknown", perPack: { kcal: 1700, protein: 50, carbs: 300, fat: 30 },
    packAmount: 500, packUnit: "g", role: "meal_base", portion: { amount: 40, unit: "g", max: 80 }, score: 70,
  };
  const dal = { ...rice, skuId: "dal", price: 190, score: 70 };

  // Nothing was asked for: the basket KOI already handed over costs less to buy again.
  const plain = buildPlanModel({ members: [adult], catalogue: [rice, dal], days: 7 });
  const kept = buildPlanModel({ members: [adult], catalogue: [rice, dal], days: 7, keepSkus: ["dal"] });
  assert.equal(
    colNamed(kept, nameOf.packs("dal")).cost,
    round6(colNamed(plain, nameOf.packs("dal")).cost - continuityBonus(dal.price)),
    "a pack already in the plan is not re-priced",
  );
  assert.equal(round6(continuityBonus(899)), 0.1399, "an expensive pack is worth more to keep, because dropping it saves more");
  assert.equal(continuityBonus(1e9), CONTINUITY.cap, "and never more than the cap");
  assert.equal(colNamed(kept, nameOf.packs("rice")).cost, colNamed(plain, nameOf.packs("rice")).cost, "the rest is priced as ever");
  assert.deepEqual(kept.meta.keptFromLastPlan, ["dal"]);

  // Ranked by protein per rupee, oats lose to both dals — but "add oats" means oats.
  const cut = buildPlanModel({ members: [adult], catalogue: [rice, dal, oats], days: 7, candidateLimit: 2 });
  assert.equal(cut.meta.skus.includes("oats"), false, "without the ask, the limit cuts it");
  const asked = buildPlanModel({ members: [adult], catalogue: [rice, dal, oats], days: 7, candidateLimit: 2, includeSkus: ["oats"] });
  assert.equal(asked.meta.skus.includes("oats"), true, "asked for by name, so it is in the program");
  assert.deepEqual(asked.meta.includedByShopper, ["oats"]);
  assert.equal(colNamed(asked, nameOf.packs("oats")).lower, 1, "at least one pack of it");
});

test("the kitchen's own rules: brands, spice, the pantry, waste and repeats", () => {
  const spicy = {
    skuId: "mixture", price: 180, contains: ["spicy"], availability: "unknown", brand: "Grand Sweets & Snacks",
    perPack: { kcal: 1250, protein: 25, carbs: 120, fat: 70 }, packAmount: 250, packUnit: "g", role: "snack",
    portion: { amount: 25, unit: "g", max: 50 },
  };
  const ricePack = { ...rice, brand: "Gorakhpur" };
  const catalogue = [ricePack, spicy];

  // A brand the household will not buy is not in the program at all.
  const refused = buildPlanModel({ members: [adult], catalogue, days: 7, refusedBrands: ["grand sweets & snacks"] });
  assert.equal(refused.meta.skus.includes("mixture"), false);
  assert.deepEqual(refused.excluded.find((e) => e.skuId === "mixture"), { skuId: "mixture", reason: "brand_refused", brand: "Grand Sweets & Snacks" });
  assert.equal(brandIn("Grand Sweets and Snacks", ["grand sweets & snacks"]), true, "typed the way a shopper types it");
  assert.equal(brandIn(null, ["anything"]), false, "no brand is not every brand");

  // One the household likes costs a little less, like any other preference.
  const plain = buildPlanModel({ members: [adult], catalogue, days: 7 });
  const liked = buildPlanModel({ members: [adult], catalogue, days: 7, preferredBrands: ["Gorakhpur"] });
  assert.equal(
    colNamed(liked, nameOf.packs("rice")).cost,
    round6(colNamed(plain, nameOf.packs("rice")).cost - KITCHEN.preferredBrandBonus),
  );

  // Spice: "none" is a refusal, "mild" is a cost on their eating it.
  const noSpice = buildPlanModel({ members: [{ ...adult, spiceTolerance: "none" }], catalogue, days: 7 });
  assert.equal(noSpice.meta.skus.includes("mixture"), false, "no one left who can eat it");
  assert.deepEqual(noSpice.excluded.find((e) => e.skuId === "mixture").refusedBy, [{ member: "me", flag: "spicy", rule: "spice" }]);
  const mild = buildPlanModel({ members: [{ ...adult, spiceTolerance: "mild" }], catalogue, days: 7 });
  assert.equal(colNamed(mild, nameOf.eats("mixture", "me")).cost, KITCHEN.mildSpiceCost, "reached for last, not kept from them");

  // What is in the house is not bought again.
  const stocked = buildPlanModel({ members: [adult], catalogue, days: 7, pantrySkus: ["rice"] });
  assert.equal(stocked.meta.skus.includes("rice"), false);
  assert.equal(stocked.excluded.find((e) => e.skuId === "rice").reason, "already_in_your_kitchen");

  // No leftovers: a pack is sized by the normal serving, not the largest one.
  assert.equal(portionCap(rice, adult, 7).perDay, 180, "two occasions of the largest serving");
  assert.equal(portionCap(rice, adult, 7, 1, "none").perDay, 90, "two occasions of the usual one");

  // Last week's packs cost what the household says a repeat is worth.
  const bored = buildPlanModel({ members: [adult], catalogue, days: 7, repeatTolerance: "low", lastPlanSkus: ["rice"] });
  assert.equal(bored.meta.kitchen.repeatTolerance, "low");
  assert.equal(
    colNamed(bored, nameOf.packs("rice")).cost,
    round6(colNamed(plain, nameOf.packs("rice")).cost + KITCHEN.repeat.low),
  );
  const same = buildPlanModel({ members: [adult], catalogue, days: 7, repeatTolerance: "high", lastPlanSkus: ["rice"] });
  assert.equal(colNamed(same, nameOf.packs("rice")).cost, round6(colNamed(plain, nameOf.packs("rice")).cost + KITCHEN.repeat.high));
  assert.equal(colNamed(plain, nameOf.packs("rice")).cost, buildPlanModel({ members: [adult], catalogue, days: 7, lastPlanSkus: ["rice"] }).columns.find((c) => c.name === nameOf.packs("rice")).cost, "usual says nothing");
});

test("what the household wants protected first changes what a goal is worth", () => {
  // Nothing said: the plan is exactly the plan KOI made before this rule.
  assert.deepEqual(priorityWeights([]), { targets: 1, budget: 1, less_processed: 1, familiar: 1, variety: 0 });
  assert.deepEqual(priorityWeights(["nonsense"]), { targets: 1, budget: 1, less_processed: 1, familiar: 1, variety: 0 });

  // Named priorities rank first; the rest fall in underneath, in KOI's order.
  const tight = priorityWeights(["budget", "variety"]);
  assert.equal(tight.budget, PRIORITY.weightByRank[0]);
  assert.equal(tight.variety, PRIORITY.weightByRank[1]);
  assert.equal(tight.targets, PRIORITY.weightByRank[2], "unnamed, so it follows in KOI's own order");
  assert.equal(budgetBeforeTargets(["budget", "targets"]), true);
  assert.equal(budgetBeforeTargets(["targets", "budget"]), false);
  assert.equal(budgetBeforeTargets([]), false, "nothing said is not a preference for the budget");

  const catalogue = [rice, { ...rice, skuId: "dal", price: 190, score: 40 }];
  const plain = buildPlanModel({ members: [adult], catalogue, days: 7 });
  const budgetFirst = buildPlanModel({ members: [adult], catalogue, days: 7, priorities: ["budget"] });
  const targetsFirst = buildPlanModel({ members: [adult], catalogue, days: 7, priorities: ["targets"] });

  // A shortfall costs four times as much to the household that ranked targets first.
  assert.equal(
    colNamed(targetsFirst, nameOf.short("me", "protein")).cost,
    colNamed(plain, nameOf.short("me", "protein")).cost * PRIORITY.weightByRank[0],
  );
  // ...and half as much to the one that put the budget above it.
  assert.equal(
    colNamed(budgetFirst, nameOf.short("me", "protein")).cost,
    colNamed(plain, nameOf.short("me", "protein")).cost * PRIORITY.weightByRank[1],
  );
  assert.deepEqual(budgetFirst.meta.priorities, ["budget"]);

  // The first priority comes back as something a solution can be measured
  // against: rupees, for a household that ranked the budget first.
  assert.equal(budgetFirst.firstPriority.name, "budget");
  assert.equal(budgetFirst.firstPriority.sense, "min");
  assert.equal(budgetFirst.firstPriority.coefficients[nameOf.packs("dal")], 190);
  assert.equal(plain.firstPriority, null, "nothing to hold when nothing was asked for");

  // Variety is a cost on the packs past the first, and only when it is ranked.
  assert.equal(colNamed(plain, "extra_rice"), undefined);
  // Two eaters, because one adult cannot finish a second pack of rice and a
  // product that can only be bought once has no "extra" to charge for.
  const varied = buildPlanModel({ members: [adult, nutFree], catalogue, days: 7, priorities: ["variety"] });
  const extra = colNamed(varied, "extra_rice");
  assert.equal(extra.cost, round6(PRIORITY.varietyPerExtraPack * PRIORITY.weightByRank[0]));
  assert.equal(extra.upper, colNamed(varied, nameOf.packs("rice")).upper - 1);
  const capped = varied.rows.find((r) => r.name === "variety_rice");
  assert.deepEqual(capped.coefficients, { [nameOf.packs("rice")]: 1, "extra_rice": -1 });
  assert.equal(capped.upper, 1, "packs minus extras is at most one");
});

test("a processing ceiling and a cold chain refuse only what KOI actually knows", () => {
  const knownUltra = { ...rice, skuId: "ultra", novaGroup: 4 };
  const knownMinimal = { ...rice, skuId: "minimal", novaGroup: 1 };
  const unknown = { ...rice, skuId: "unknown" };
  const catalogue = [knownUltra, knownMinimal, unknown];

  const strict = buildPlanModel({ members: [adult], catalogue, days: 7, processingCeiling: 2 });
  assert.equal(strict.meta.skus.includes("ultra"), false, "group 4 is over a ceiling of 2");
  assert.equal(strict.meta.skus.includes("minimal"), true);
  assert.equal(strict.meta.skus.includes("unknown"), true, "not read is not a verdict, so it is not refused either");
  assert.deepEqual(
    strict.excluded.find((e) => e.skuId === "ultra"),
    { skuId: "ultra", reason: "too_processed", novaGroup: 4, ceiling: 2 },
  );
  // The count is what stops a shopper reading this basket as "nothing ultra-processed".
  assert.equal(strict.meta.kitchen.processingKnownFor, 2, "KOI could apply the rule to two of the three");
  assert.equal(strict.meta.kitchen.processingCeiling, 2);

  // No ceiling: nothing is refused for being processed.
  const open = buildPlanModel({ members: [adult], catalogue, days: 7 });
  assert.equal(open.excluded.some((e) => e.reason === "too_processed"), false);

  // A fridge, only when the pack says so.
  const chilled = { ...rice, skuId: "chilled", keepRefrigerated: true };
  const ambient = { ...rice, skuId: "ambient", keepRefrigerated: false };
  const unsaid = { ...rice, skuId: "unsaid" };
  const cupboard = buildPlanModel({ members: [adult], catalogue: [chilled, ambient, unsaid], days: 7, shelfStableOnly: true });
  assert.equal(cupboard.meta.skus.includes("chilled"), false);
  assert.deepEqual(cupboard.meta.skus, ["ambient", "unsaid"], "an unrecorded pack is not assumed to need a fridge, nor assumed not to");
  assert.equal(cupboard.meta.kitchen.shelfStableOnly, true);
});

test("a target holds when a few unverified labels fall short (C4)", () => {
  const verified = { ...rice, skuId: "verified", ingredientEvidence: "verified" };
  const guess = { ...rice, skuId: "guess" };
  assert.equal(isUncertain(guess), true, "a list KOI has not read is a guess");
  assert.equal(isUncertain(verified), false);

  const model = buildPlanModel({ members: [adult], catalogue: [verified, guess], days: 7 });
  const target = model.rows.find((r) => r.name === "target_me_protein");

  // Bertsimas & Sim, written out: supply minus (budget x z + sum p).
  assert.equal(target.coefficients.robustz_me_protein, -ROBUST.budget);
  assert.equal(target.coefficients["robustp_me_protein_guess"], -1);
  assert.equal(target.coefficients["robustp_me_protein_verified"], undefined, "a verified label is not protected against");

  // z + p >= margin x supplied x eats, for the uncertain one only.
  const guard = model.rows.find((r) => r.name === "robust_me_protein_guess");
  assert.equal(guard.lower, 0);
  assert.equal(guard.coefficients.robustz_me_protein, 1);
  assert.equal(guard.coefficients["robustp_me_protein_guess"], 1);
  assert.equal(guard.coefficients[nameOf.eats("guess", "me")], -round4(ROBUST.margin * rice.perPack.protein));
  assert.equal(model.rows.some((r) => r.name === "robust_me_protein_verified"), false);

  // What it protected against, for the shopper to be told.
  assert.deepEqual(model.meta.robust, { budget: 2, margin: 0.1, uncertainProducts: 1, ofProducts: 2 });

  // And it can be turned off, which is how the plan before it is reproducible.
  const off = buildPlanModel({ members: [adult], catalogue: [verified, guess], days: 7, robustBudget: 0 });
  assert.equal(off.rows.some((r) => r.name.startsWith("robust_")), false);
  assert.equal(off.columns.some((c) => c.name.startsWith("robustz_")), false);
});

test("a household leans towards a kitchen; it never refuses the other (00061)", () => {
  const namkeen = { ...rice, skuId: "namkeen", cuisine: "indian", categoryKey: "snacks.namkeen" };
  const crisps = { ...rice, skuId: "crisps", cuisine: null, categoryKey: "snacks.chips_crisps" };
  const cereal = { ...rice, skuId: "cereal", cuisine: "global", categoryKey: "staples.breakfast_cereals" };
  const catalogue = [namkeen, crisps, cereal];

  const plain = buildPlanModel({ members: [adult], catalogue, days: 7 });
  const indian = buildPlanModel({ members: [adult], catalogue, days: 7, cuisineLeaning: "indian" });

  assert.equal(
    colNamed(indian, nameOf.packs("namkeen")).cost,
    round6(colNamed(plain, nameOf.packs("namkeen")).cost - KITCHEN.cuisineBonus),
  );
  // A shelf belonging to no kitchen is untouched, which is most of a shop.
  assert.equal(colNamed(indian, nameOf.packs("crisps")).cost, colNamed(plain, nameOf.packs("crisps")).cost);
  // And the other kitchen is not punished, only not preferred.
  assert.equal(colNamed(indian, nameOf.packs("cereal")).cost, colNamed(plain, nameOf.packs("cereal")).cost);
  assert.equal(indian.meta.skus.includes("cereal"), true, "never a refusal");
  assert.equal(indian.meta.kitchen.cuisineLeaning, "indian");
  assert.equal(plain.meta.kitchen.cuisineLeaning, null);
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
