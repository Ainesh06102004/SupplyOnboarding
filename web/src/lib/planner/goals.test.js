// ============================================================================
// KOI PLANNER — tests for goals and suggested targets (plan §9.10.1)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { suggestTargets, effectiveGoal, carbCeiling, goalsAllowed, GOAL_RULES } from "@/lib/planner/goals.js";
import { ACTIVITY, GOAL_DEFS, computeTargets } from "@/store/goalStore.js";

test("goal setup and the planner use the same numbers", () => {
  for (const key of ["sedentary", "light", "moderate", "active"]) assert.equal(GOAL_RULES.activityFactor[key], ACTIVITY[key].factor, key);
  assert.equal(GOAL_RULES.loseShare.adult, -GOAL_DEFS.fatloss.adj);
  assert.equal(GOAL_RULES.gainShare, GOAL_DEFS.muscle.adj);
  assert.equal(GOAL_RULES.proteinPerKg.lose, GOAL_DEFS.fatloss.proteinPerKg);
  assert.equal(GOAL_RULES.proteinPerKg.gain, GOAL_DEFS.muscle.proteinPerKg);
  assert.equal(GOAL_RULES.proteinPerKg.maintain, GOAL_DEFS.maintenance.proteinPerKg);
});

test("with body data, maintenance is Mifflin–St Jeor, as in goal setup", () => {
  const t = suggestTargets({ ageBand: "adult_19_59", sex: "male", activity: "moderate", ageYears: 30, weightKg: 70, heightCm: 175 });
  const setup = computeTargets({ weightNow: 70, height: 175, age: 30, sex: "male", activity: "moderate", goal: "maintenance" });
  assert.equal(t.kcal, setup.kcal);
  assert.equal(t.source, "mifflin_st_jeor");
  assert.equal(t.protein, 58, "0.83 g/kg of 70 kg, balanced");
});

test("without body data, ICMR-NIN 2020 reference needs", () => {
  assert.deepEqual(
    (({ kcal, protein, carbsMax, source }) => ({ kcal, protein, carbsMax, source }))(suggestTargets({ ageBand: "adult_19_59", sex: "female", activity: "moderate" })),
    { kcal: 2130, protein: 45.7, carbsMax: null, source: "icmr_nin_2020" },
  );
  const toddler = suggestTargets({ ageBand: "child_1_3" });
  assert.equal(toddler.kcal, 1070);
  assert.equal(toddler.protein, 12.5);
});

test("a gym-goer cutting: 20% below, 1.9 g/kg, and never under the floor", () => {
  const cut = suggestTargets({ ageBand: "adult_19_59", sex: "male", activity: "heavy", ageYears: 28, weightKg: 80, heightCm: 180, energyGoal: "lose", eatingPattern: "high_protein" });
  const maintain = suggestTargets({ ageBand: "adult_19_59", sex: "male", activity: "heavy", ageYears: 28, weightKg: 80, heightCm: 180 });
  assert.equal(cut.kcal, Math.round((maintain.kcal * 0.8) / 10) * 10);
  assert.equal(cut.protein, 152);
  const small = suggestTargets({ ageBand: "adult_19_59", sex: "female", energyGoal: "lose" });
  assert.equal(small.kcal, 1330, "1,660 × 0.8 is above the 1,200 floor");
  const tiny = suggestTargets({ ageBand: "adult_19_59", sex: "female", ageYears: 55, weightKg: 40, heightCm: 145, energyGoal: "lose" });
  assert.equal(tiny.kcal, 1200, "the floor holds");
  assert.match(tiny.basis.join(" "), /under 1,200 kcal, so 1,200/);
});

test("a gym-goer bulking: 12% above and 2.0 g/kg", () => {
  const bulk = suggestTargets({ ageBand: "adult_19_59", sex: "male", activity: "heavy", energyGoal: "gain", eatingPattern: "high_protein" });
  assert.equal(bulk.kcal, Math.round((3470 * 1.12) / 10) * 10);
  assert.equal(bulk.protein, 130, "2.0 g per kg of the 65 kg reference man");
});

test("keto and low carb set a carbohydrate ceiling, for adults only", () => {
  assert.equal(suggestTargets({ ageBand: "adult_19_59", eatingPattern: "keto" }).carbsMax, 50);
  assert.equal(suggestTargets({ ageBand: "senior_60_plus", eatingPattern: "low_carb" }).carbsMax, 130);
  assert.equal(carbCeiling("balanced"), null);
});

test("a senior loses at most 10%, and gets at least 1.0 g protein per kg", () => {
  const senior = suggestTargets({ ageBand: "senior_60_plus", sex: "male", ageYears: 68, weightKg: 70, heightCm: 168, energyGoal: "lose" });
  const maintain = suggestTargets({ ageBand: "senior_60_plus", sex: "male", ageYears: 68, weightKg: 70, heightCm: 168 });
  assert.equal(senior.kcal, Math.max(1500, Math.round((maintain.kcal * 0.9) / 10) * 10));
  assert.equal(senior.protein, 70);
});

test("children and teens are maintain and balanced, whatever is asked", () => {
  assert.equal(goalsAllowed("teen_16_18"), false);
  assert.deepEqual(effectiveGoal({ age_band: "child_7_9", energy_goal: "lose", eating_pattern: "keto" }), { energyGoal: "maintain", eatingPattern: "balanced" });
  const teen = suggestTargets({ ageBand: "teen_16_18", sex: "male", energyGoal: "lose", eatingPattern: "keto", weightKg: 90, heightCm: 180, ageYears: 17 });
  assert.equal(teen.kcal, 3320, "the ICMR figure, not a deficit");
  assert.equal(teen.carbsMax, null);
  assert.equal(teen.source, "icmr_nin_2020", "a child's body data is never used");
  assert.deepEqual(effectiveGoal({ age_band: "adult_19_59", energy_goal: "gain", eating_pattern: "nonsense" }), { energyGoal: "gain", eatingPattern: "balanced" });
});

test("every suggestion says where it came from", () => {
  const t = suggestTargets({ ageBand: "teen_13_15" });
  assert.ok(t.basis.some((b) => /ICMR-NIN 2020/.test(b)));
  assert.ok(t.basis.some((b) => /sex was not given/.test(b)));
  assert.equal(t.version, "goal-rules-v1");
  assert.equal(suggestTargets({ ageBand: "infant" }), null);
});
