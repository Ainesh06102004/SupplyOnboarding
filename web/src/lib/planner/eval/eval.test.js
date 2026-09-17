// ============================================================================
// KOI PLANNER — tests for the reference-household suite (plan §9.10.4, C8)
// Run with `npm test`. The real run is scripts/evalPlanner.mjs, with HiGHS.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { checkPlan, planMetrics, SLOW_MS } from "@/lib/planner/eval/properties.js";
import { REFERENCE_HOUSEHOLDS, randomHouseholds } from "@/lib/planner/eval/households.js";
import { runPlannerSuite } from "@/lib/planner/eval/suite.js";
import { AGE_BAND_KEYS } from "@/lib/planner/brief.js";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config.js";

const almonds = { skuId: "almonds", price: 450, contains: ["tree_nut"], categoryKey: "nuts_seeds.nuts" };
const atta = { skuId: "atta", price: 300, contains: ["gluten"], categoryKey: "staples.flours" };
const rice = { skuId: "rice", price: 299, contains: [], categoryKey: "staples.rice" };
const catalogue = [almonds, atta, rice];

const adult = { id: "me", ageBand: "adult_19_59", targets: { kcal: 2000 }, avoidFlags: [], dietExcludes: [] };
const toddler = { id: "toddler", ageBand: "child_1_3", targets: { kcal: 1070 }, avoidFlags: [], dietExcludes: [] };
const coeliac = { id: "wife", ageBand: "adult_19_59", targets: { kcal: 1660 }, avoidFlags: ["gluten"], dietExcludes: [] };

const plan = (eats, extra = {}) => ({
  attempt: { step: "as_asked" },
  model: { meta: { portionCaps: {} } },
  solution: {
    usable: true,
    status: "Optimal",
    packs: Object.fromEntries(Object.entries(eats).map(([sku, by]) => [sku, Object.values(by).reduce((a, b) => a + b, 0)])),
    eats,
  },
  report: { cost: 0, perMember: [], basket: [] },
  ...extra,
});

test("a toddler given whole almonds, or a coeliac given atta, is a safety finding", () => {
  const found = checkPlan({ members: [adult, toddler, coeliac], catalogue, ...plan({ almonds: { me: 0.5, toddler: 0.5 }, atta: { wife: 1 } }) });
  assert.deepEqual(found.map((f) => [f.kind, f.property]), [["safety", "unsafe_for_age"], ["safety", "avoided_food_eaten"]]);
  assert.deepEqual(found[0].detail, { skuId: "almonds", member: "toddler", rule: "whole_nuts" });
});

test("the same basket eaten by the right people is clean", () => {
  assert.deepEqual(checkPlan({ members: [adult, toddler, coeliac], catalogue, ...plan({ almonds: { me: 1 }, atta: { me: 1 }, rice: { toddler: 0.5, wife: 0.5 } }) }), []);
});

test("a food the house keeps out is a finding even when its eater may have it", () => {
  const found = checkPlan({ members: [adult], catalogue, keepOutFlags: ["tree_nut"], ...plan({ almonds: { me: 1 } }) });
  assert.deepEqual(found.map((f) => f.property), ["kept_out_food_bought"]);
});

test("integrity: bought and not eaten, past a portion ceiling, over a budget that held", () => {
  const p = plan({ rice: { me: 1 } });
  p.solution.packs.rice = 2;
  p.model.meta.portionCaps = { rice: { me: { packs: 0.5 } } };
  p.report.cost = 598;
  const found = checkPlan({ members: [adult], catalogue, budget: 500, ...p });
  assert.deepEqual(found.map((f) => f.property).sort(), ["bought_not_eaten", "over_budget", "portion_over_ceiling"]);

  const raised = checkPlan({ members: [adult], catalogue, budget: 500, ...plan({ rice: { me: 1 } }, { attempt: { step: "budget_raised" }, report: { cost: 598, perMember: [] } }) });
  assert.deepEqual(raised, [], "when the ladder gave the budget up, spending past it is what was reported");
});

test("quality: no plan, someone given nothing, a slow solve", () => {
  assert.equal(checkPlan({ members: [adult], catalogue, ...plan({}, { solution: { usable: false, status: "Infeasible" } }) })[0].property, "no_usable_plan");
  const found = checkPlan({ members: [adult, toddler], catalogue, ms: SLOW_MS + 1, ...plan({ rice: { me: 1 } }) });
  assert.deepEqual(found.map((f) => [f.kind, f.property]), [["quality", "member_given_nothing"], ["quality", "slow_solve"]]);
});

test("metrics: each member's shortfall share, and the gap between worst and best", () => {
  const m = planMetrics({ perMember: [
    { id: "me", asked: { kcal: 14000, protein: 400 }, shortfall: { kcal: 1400 } },
    { id: "kid", asked: { kcal: 7000 }, shortfall: { kcal: 2100 } },
  ] });
  assert.deepEqual(m.shortShares, { me: { kcal: 0.1, protein: 0 }, kid: { kcal: 0.3 } });
  assert.deepEqual(m.worstShortShare, { kcal: 0.3, protein: 0 });
  assert.deepEqual(m.fairnessGap, { kcal: 0.2, protein: 0 });
});

test("the reference households are well formed, and use only keys the planner knows", () => {
  const avoidKeys = new Set(FOODS_AVOID.map((a) => a.key));
  const diets = new Set(DIET_TYPES.map((d) => d.key));
  assert.ok(REFERENCE_HOUSEHOLDS.length >= 20);
  assert.equal(new Set(REFERENCE_HOUSEHOLDS.map((h) => h.id)).size, REFERENCE_HOUSEHOLDS.length, "ids are unique");
  for (const h of REFERENCE_HOUSEHOLDS) {
    assert.ok(h.members.length > 0, h.id);
    assert.equal(new Set(h.members.map((m) => m.id)).size, h.members.length, `${h.id}: member ids are unique`);
    for (const m of h.members) {
      assert.ok(AGE_BAND_KEYS.includes(m.age_band), `${h.id}/${m.id} band`);
      assert.ok(diets.has(m.diet_type), `${h.id}/${m.id} diet`);
      for (const key of [...m.avoids.map((a) => a.key), ...(h.keepOut ?? [])]) assert.ok(avoidKeys.has(key), `${h.id}: ${key}`);
      assert.ok(Number(m.target_kcal) > 0 || Number(m.target_protein_g) > 0, `${h.id}/${m.id} has a target`);
    }
  }
  for (const id of ["keto_adult", "gym_cutting", "gym_bulking", "senior_losing", "middle_aged_low_carb"]) {
    assert.ok(REFERENCE_HOUSEHOLDS.some((h) => h.id === id), `${id}: every kind of eater is in the set`);
  }
});

test("random households replay exactly from their seed, and give children no goal", () => {
  assert.deepEqual(randomHouseholds({ count: 5, seed: 7 }), randomHouseholds({ count: 5, seed: 7 }));
  assert.notDeepEqual(randomHouseholds({ count: 5, seed: 7 }), randomHouseholds({ count: 5, seed: 8 }));
  for (const h of randomHouseholds({ count: 40, seed: 1 })) {
    assert.ok(h.members.length >= 1 && h.members.length <= 6);
    for (const key of h.keepOut) assert.ok(h.members.some((m) => m.avoids.some((a) => a.key === key && a.severity !== "dislike")), "only what someone refuses is kept out");
    for (const m of h.members.filter((x) => !["adult_19_59", "senior_60_plus"].includes(x.age_band))) {
      assert.deepEqual([m.energy_goal, m.eating_pattern, m.weight_kg], ["maintain", "balanced", null]);
    }
  }
});

test("a keto member given undeclared carbohydrate, or more than the ceiling, is a safety finding", () => {
  const keto = { id: "keto", ageBand: "adult_19_59", energyGoal: "lose", eatingPattern: "keto", carbsMax: 50, targets: { kcal: 1500 }, avoidFlags: [], dietExcludes: [] };
  const bread = { skuId: "bread", price: 50, contains: [], categoryKey: "staples.flours", perPack: { kcal: 1000, carbs: 200 } };
  const mystery = { skuId: "mystery", price: 50, contains: [], categoryKey: "snacks.namkeen", perPack: { kcal: 500 } };
  const found = checkPlan({ members: [keto], catalogue: [bread, mystery], days: 7, ...plan({ bread: { keto: 2 }, mystery: { keto: 1 } }) });
  assert.deepEqual(found.map((f) => f.property).sort(), ["carb_limit_passed", "undeclared_carbs_under_a_carb_limit"]);
  const over = checkPlan({ members: [keto], catalogue: [bread], days: 1, ...plan({ bread: { keto: 1.6 } }) });
  assert.ok(over.some((f) => f.property === "deficit_passed"), "1,600 kcal in a day against a 1,500 ceiling");
});

test("the suite fails on a safety finding in any household, and on an unfed reference member", async () => {
  const household = (id, members) => ({ id, about: id, days: 7, budget: null, members });
  const kidRow = { id: "kid", label: "Kid", age_band: "child_1_3", diet_type: "vegetarian", target_kcal: 1070, target_protein_g: 12.5, avoidKeys: [] };
  const meRow = { id: "me", label: "Me", age_band: "adult_19_59", diet_type: "vegetarian", target_kcal: 2110, target_protein_g: 54, avoidKeys: [] };
  const feeds = (eats) => async () => plan(eats);

  const safe = await runPlannerSuite({ catalogue, reference: [household("ok", [meRow, kidRow])], solvePlan: feeds({ rice: { me: 1, kid: 0.5 } }) });
  assert.equal(safe.passed, true);
  assert.equal(safe.metrics.safety_findings, 0);

  const unsafe = await runPlannerSuite({ catalogue, random: [household("r", [kidRow])], solvePlan: feeds({ almonds: { kid: 1 } }) });
  assert.equal(unsafe.passed, false);
  assert.equal(unsafe.failures[0].findings[0].property, "unsafe_for_age");

  const unfedReference = await runPlannerSuite({ catalogue, reference: [household("ref", [meRow, kidRow])], solvePlan: feeds({ rice: { me: 1 } }) });
  assert.equal(unfedReference.passed, false);
  const unfedRandom = await runPlannerSuite({ catalogue, random: [household("rand", [meRow, kidRow])], solvePlan: feeds({ rice: { me: 1 } }) });
  assert.equal(unfedRandom.passed, true, "a random household may be unfeedable from the catalogue: reported, not failed");
  assert.equal(unfedRandom.metrics.quality_findings, 1);
});
