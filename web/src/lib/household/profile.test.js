// ============================================================================
// KOI — tests for member profiles (plan §9.10.2)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  blankProfile, profileFromRow, memberPayload, avoidsPayload, profileProblems, profileSummary,
  severitiesFor, defaultSeverityFor, fromGoalSetup,
} from "@/lib/household/profile.js";

const adult = () => ({
  ...blankProfile(),
  memberId: "m-1",
  label: " Me ",
  energy_goal: "lose",
  eating_pattern: "keto",
  age_years: "34",
  weight_kg: "70.5",
  height_cm: "165",
  target_kcal: "1640.4",
  target_protein_g: "60",
  avoids: [{ key: "gluten", severity: "intolerance" }, { key: "spicy", severity: "" }],
});

test("a save sends every field of the form, trimmed and whole", () => {
  const p = memberPayload(adult());
  assert.equal(p.id, "m-1");
  assert.equal(p.label, "Me");
  assert.deepEqual([p.energy_goal, p.eating_pattern, p.age_years, p.weight_kg, p.height_cm], ["lose", "keto", "34", "70.5", "165"]);
  assert.equal(p.target_kcal, "1640", "the column is whole kcal");
  assert.equal(p.relation, null);
  assert.deepEqual(avoidsPayload(adult()), [{ key: "gluten", severity: "intolerance" }, { key: "spicy", severity: "dislike" }]);
});

test("moving someone to a child's age group resets everything adult-only", () => {
  const p = memberPayload({ ...adult(), age_band: "child_7_9" });
  assert.deepEqual([p.energy_goal, p.eating_pattern, p.age_years, p.weight_kg, p.height_cm], ["maintain", "balanced", null, null, null]);
  assert.equal(memberPayload(blankProfile()).id, undefined, "a new member has no id");
});

test("only an allergen can be an allergy", () => {
  assert.deepEqual(severitiesFor("peanuts").map((s) => s.key), ["allergy", "intolerance", "dislike"]);
  assert.deepEqual(severitiesFor("caffeine").map((s) => s.key), ["rule", "intolerance", "dislike"]);
  assert.equal(defaultSeverityFor("tree_nuts"), "allergy");
  assert.equal(defaultSeverityFor("red_meat"), "rule");
  assert.equal(defaultSeverityFor("preservatives"), "dislike");
});

test("a stored row reads back into the form", () => {
  const form = profileFromRow({
    id: "m-2", label: "Wife", age_band: "adult_19_59", diet_type: "vegetarian", energy_goal: "maintain", eating_pattern: "high_protein",
    weight_kg: 58, target_kcal: 1900, account_profile_id: null, version: 4,
    household_member_avoid: [{ avoid_key: "gluten", severity: "intolerance" }, { avoid_key: "milk" }],
  });
  assert.equal(form.weight_kg, "58");
  assert.equal(form.version, 4);
  assert.deepEqual(form.avoids, [{ key: "gluten", severity: "intolerance" }, { key: "milk", severity: "allergy" }]);
  assert.equal(form.is_account_holder, false);
});

test("what stops a member being planned for is said in words", () => {
  assert.deepEqual(profileProblems(adult()), []);
  const problems = profileProblems({ ...blankProfile(), age_years: "70" });
  assert.ok(problems.some((p) => /label/.test(p)));
  assert.ok(problems.some((p) => /daily target/.test(p)));
  assert.ok(problems.some((p) => /between 19 and 59/.test(p)));
});

test("a one-line summary", () => {
  assert.equal(profileSummary(adult()), "Adult (19–59) · Vegetarian · Lose weight, keto · 1,640.4 kcal · 60 g protein");
  assert.equal(profileSummary({ ...adult(), age_band: "child_4_6", target_kcal: "1360", target_protein_g: "" }), "Child (4–6) · Vegetarian · 1,360 kcal");
});

test("goal setup fills Me, and leaves what it does not know alone", () => {
  const me = { ...blankProfile(), label: "Me", avoids: [{ key: "gluten", severity: "intolerance" }] };
  const filled = fromGoalSetup(me, {
    goal: "fatloss", sex: "other", age: 41, height: 172, weightNow: 90, activity: "active", dietType: "eggetarian",
    targets: { kcal: 2150, protein: 171 }, foodsAvoid: ["gluten", "peanuts"],
  });
  assert.equal(filled.is_account_holder, true);
  assert.deepEqual([filled.age_band, filled.sex, filled.activity_level, filled.diet_type], ["adult_19_59", "unspecified", "heavy", "eggetarian"]);
  assert.deepEqual([filled.energy_goal, filled.eating_pattern, filled.age_years, filled.weight_kg], ["lose", "high_protein", "41", "90"]);
  assert.deepEqual([filled.target_kcal, filled.target_protein_g, filled.target_source], ["2150", "171", "mifflin_st_jeor"]);
  assert.deepEqual(filled.avoids, [{ key: "gluten", severity: "intolerance" }, { key: "peanuts", severity: "allergy" }], "a severity already chosen stays");
  assert.equal(fromGoalSetup(me, null), me);
});
