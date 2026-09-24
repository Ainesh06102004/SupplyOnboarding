import { test } from "node:test";
import assert from "node:assert/strict";

import { trackRead, weightTrend, cleanCheckins, proposalFor, TRACK_RULES } from "./track";

// A 30-year-old man, 180 cm, 90 kg, moderately active, losing: Mifflin–St Jeor
// maintenance is 1,880 × 1.55 = 2,910 kcal and the target 20% under it, 2,330 —
// 580 kcal a day, about 0.53 kg a week by the arithmetic.
const me = {
  age_band: "adult_19_59", sex: "male", age_years: "30", height_cm: "180", weight_kg: "90",
  activity_level: "moderate", energy_goal: "lose", eating_pattern: "balanced", target_weight_kg: "80",
  target_kcal: "", target_protein_g: "", target_source: "mifflin_st_jeor",
};
const today = new Date("2026-10-22T09:00:00Z");
const weighIns = (kgs, start = "2026-10-01", every = 7) => kgs.map((kg, i) => ({
  checked_on: new Date(new Date(`${start}T00:00:00Z`).getTime() + i * every * 86400000).toISOString().slice(0, 10),
  weight_kg: kg,
}));

test("a trend is a line through the weigh-ins, in kg a week", () => {
  const t = weightTrend(cleanCheckins(weighIns([90, 89.5, 89, 88.5])));
  assert.equal(t.kgPerWeek, -0.5);
  assert.equal(t.count, 4);
  assert.equal(weightTrend(cleanCheckins(weighIns([90]))), null);
});

test("too few check-ins, or too short a span, are said so rather than read", () => {
  const r = trackRead(me, weighIns([90, 89.8], "2026-10-15"), { today });
  assert.equal(r.status, "too_few");
  assert.equal(r.proposal, null);
  assert.equal(TRACK_RULES.minCheckins, 3);
});

test("on the plan's pace: on track, and nothing is proposed", () => {
  const r = trackRead(me, weighIns([90, 89.5, 89, 88.5]), { today });
  assert.equal(r.planned, -0.53);
  assert.equal(r.status, "on_track");
  assert.equal(r.proposal, null);
  assert.equal(r.change, -1.5);
  assert.ok(r.toTarget.weeks > 0, "weeks to 80 kg at the trend's own pace");
});

test("losing slower than planned: a lower target, proposed, at most 200 kcal at a time", () => {
  const r = trackRead(me, weighIns([90, 90, 89.9, 89.9]), { today });
  assert.equal(r.status, "behind");
  assert.ok(r.difference > 0.4);
  assert.equal(r.proposal.from, 2330);
  assert.equal(r.proposal.kcal, 2130, "a 200 kcal step, not the whole gap");
});

test("never below the calorie floor", () => {
  const low = { ...me, sex: "female", target_kcal: "1250", target_source: "stated" };
  const p = proposalFor(low, 0.6);
  assert.equal(p.kcal, 1200, "the floor for women is 1,200");
});

test("losing faster than planned: a higher target is proposed", () => {
  const r = trackRead(me, weighIns([90, 88.8, 87.6, 86.4]), { today });
  assert.equal(r.status, "ahead");
  assert.ok(r.proposal.kcal > r.proposal.from);
});

test("no plan line without the person's own maintenance figure, and no one under 19", () => {
  const noBody = { ...me, height_cm: "" };
  assert.equal(trackRead(noBody, weighIns([90, 89.5, 89, 88.5]), { today }).status, "no_plan");
  assert.equal(trackRead({ ...me, age_band: "teen_16_18" }, [], { today }).allowed, false);
});
