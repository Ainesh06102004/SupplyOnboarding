// Exact macros (P2): a person's own calories, protein, carbs and fat, end to end
// through the profile form, the save, the You step's figures and one plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blankProfile, profileFromRow, memberPayload, hasExactMacros, toleranceOf } from "@/lib/household/profile";
import { withSuggestedTargets, applyProfileSet } from "@/lib/household/save";
import { dailyFigures, macroCheck, carbCycle } from "./projection";
import { readPlanRequest } from "@/lib/planner/requestBody";

const ME = {
  ...blankProfile(), label: "Me", age_band: "adult_19_59", sex: "male", activity_level: "moderate",
  age_years: "27", weight_kg: "80", height_cm: "178", energy_goal: "maintain", eating_pattern: "high_protein",
};
const OWN = { ...ME, target_source: "stated", target_kcal: "2600", target_protein_g: "190", target_carbs_g: "290", target_fat_g: "75" };

test("the profile carries all four numbers, the tolerance and carb cycling, to and from the row", () => {
  const payload = memberPayload({ ...OWN, target_tolerance_pct: "3", carb_cycling: true });
  assert.equal(payload.target_carbs_g, "290");
  assert.equal(payload.target_fat_g, "75");
  assert.equal(payload.target_tolerance_pct, "3");
  assert.equal(payload.carb_cycling, true);
  const back = profileFromRow({ id: "m1", label: "Me", target_kcal: 2600, target_protein_g: 190, target_carbs_g: 290, target_fat_g: 75, target_tolerance_pct: 3, carb_cycling: true, target_source: "stated" });
  assert.equal(back.target_carbs_g, "290");
  assert.equal(back.target_tolerance_pct, "3");
  assert.equal(back.carb_cycling, true);
  assert.ok(hasExactMacros(back));
});

test("carb cycling is for adults only, and a tolerance outside 2–15 falls back to 5", () => {
  assert.equal(memberPayload({ ...OWN, age_band: "child_7_9", carb_cycling: true }).carb_cycling, false);
  assert.equal(toleranceOf({ target_tolerance_pct: "40" }), 5);
  assert.equal(toleranceOf({ target_tolerance_pct: "10" }), 10);
});

test("own numbers survive a save; going back to KOI's suggestion clears carbs and fat", () => {
  assert.deepEqual(withSuggestedTargets(OWN), OWN);
  const back = withSuggestedTargets({ ...OWN, target_source: "suggested", carb_cycling: true });
  assert.equal(back.target_kcal, "2760");
  assert.equal(back.target_protein_g, "128");
  assert.equal(back.target_carbs_g, "");
  assert.equal(back.target_fat_g, "");
  assert.equal(back.carb_cycling, false);
  assert.equal(back.target_source, "mifflin_st_jeor");
});

test("the agent can set carbs and fat, and doing so makes the targets the person's own", () => {
  const { form, changed, rejected } = applyProfileSet({ ...ME, target_source: "mifflin_st_jeor" }, { target_carbs_g: 290, target_fat_g: 75.4, target_tolerance_pct: 99 });
  assert.equal(form.target_carbs_g, "290");
  assert.equal(form.target_fat_g, "75");
  assert.equal(form.target_source, "stated");
  assert.deepEqual(rejected, ["target_tolerance_pct"]);
  assert.equal(changed.length, 2);
});

test("the You step's figures show the person's own carbs and fat, and KOI's maintenance beside them", () => {
  const f = dailyFigures(OWN);
  assert.equal(f.maintenance, 2760);
  assert.equal(f.kcal, 2600);
  assert.equal(f.carbs, 290);
  assert.equal(f.fat, 75);
  assert.ok(f.macrosStated);
  assert.equal(f.gap, 160);
  const suggested = dailyFigures(ME);
  assert.equal(suggested.carbs, null);
  assert.equal(suggested.macrosStated, false);
});

test("four numbers add up within 1% or 25 kcal, and the carbs that would make them add up", () => {
  const ok = macroCheck({ kcal: 2600, protein: 190, carbs: 290, fat: 75 });
  assert.equal(ok.fromMacros, 2595);
  assert.ok(ok.adds);
  const off = macroCheck({ kcal: 2600, protein: 190, carbs: 350, fat: 75 });
  assert.equal(off.adds, false);
  assert.equal(off.diff, 235);
  assert.equal(off.fitCarbs, 291);
});

test("carb cycling keeps the week's carbs and moves them to training days", () => {
  const c = carbCycle({ kcal: 2600, carbs: 290 }, 4);
  assert.deepEqual(c, { training: { kcal: 2840, carbs: 350 }, rest: { kcal: 2280, carbs: 210 } });
  assert.equal(4 * c.training.carbs + 3 * c.rest.carbs, 7 * 290);
  assert.equal(carbCycle({ kcal: 2600, carbs: 290 }, 0), null);
});

test("one plan can carry carbs and fat for a person, bounded", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const { value } = readPlanRequest({ householdId: id, thisWeek: { [id]: { targets: { kcal: 2600, protein: 190, carbs: 290, fat: 75 } } } });
  assert.deepEqual(value.thisWeek[id].targets, { kcal: 2600, protein: 190, carbs: 290, fat: 75 });
  const bounded = readPlanRequest({ householdId: id, thisWeek: { [id]: { targets: { carbs: 5000, fat: -3 } } } });
  assert.equal(bounded.value.thisWeek[id], undefined);
});
