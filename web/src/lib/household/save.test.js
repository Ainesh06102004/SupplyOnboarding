// Run with `npm test`.
import test from "node:test";
import assert from "node:assert/strict";

import { mergeAvoids, weakens, applyProfileSet, severityFor } from "@/lib/household/save.js";
import { blankProfile } from "@/lib/household/profile.js";

test("adding an avoid keeps every avoid already held (the RPC replaces the whole list)", () => {
  const held = [{ key: "peanuts", severity: "allergy" }];
  const diff = mergeAvoids(held, { add: [{ key: "gluten" }] });
  assert.deepEqual(diff.avoids.map((a) => a.key).sort(), ["gluten", "peanuts"]);
  assert.deepEqual(diff.added, [{ key: "gluten", severity: "allergy" }]);
  assert.deepEqual(diff.removed, []);
  assert.equal(weakens(diff), false);
});

test("re-adding a held avoid without a severity keeps the stronger one", () => {
  const diff = mergeAvoids([{ key: "peanuts", severity: "allergy" }], { add: [{ key: "peanuts" }] });
  assert.deepEqual(diff.avoids, [{ key: "peanuts", severity: "allergy" }]);
  assert.equal(weakens(diff), false);
});

test("a removal or a weaker severity is reported, so it can be shown before it is saved", () => {
  const held = [{ key: "peanuts", severity: "allergy" }, { key: "palm_oil", severity: "dislike" }];
  const removed = mergeAvoids(held, { remove: ["peanuts"] });
  assert.deepEqual(removed.removed, [{ key: "peanuts", severity: "allergy" }]);
  assert.equal(weakens(removed), true);

  const weaker = mergeAvoids(held, { add: [{ key: "peanuts", severity: "dislike" }] });
  assert.deepEqual(weaker.weaker, [{ key: "peanuts", from: "allergy", to: "dislike" }]);
  assert.equal(weakens(weaker), true);

  const stronger = mergeAvoids(held, { add: [{ key: "palm_oil", severity: "rule" }] });
  assert.deepEqual(stronger.stronger, [{ key: "palm_oil", from: "dislike", to: "rule" }]);
  assert.equal(weakens(stronger), false);
});

test("unknown avoid keys are reported, never saved; only an allergen can be an allergy", () => {
  const diff = mergeAvoids([], { add: [{ key: "mushrooms" }, { key: "caffeine", severity: "allergy" }], remove: ["nonsense"] });
  assert.deepEqual(diff.unknown.sort(), ["mushrooms", "nonsense"]);
  assert.deepEqual(diff.avoids, [{ key: "caffeine", severity: "rule" }]);
  assert.equal(severityFor("peanuts", "allergy"), "allergy");
  assert.equal(severityFor("red_meat", "allergy"), "rule");
});

test("applyProfileSet takes only known values and marks stated targets", () => {
  const form = { ...blankProfile(), label: "Kid 1", age_band: "", diet_type: "" };
  const { form: next, changed, rejected } = applyProfileSet(form, { age_band: "child_7_9", diet_type: "vegetarian", energy_goal: "shred", target_protein_g: 40, target_kcal: null });
  assert.equal(next.age_band, "child_7_9");
  assert.equal(next.diet_type, "vegetarian");
  assert.equal(next.target_protein_g, "40");
  assert.equal(next.target_source, "stated");
  assert.deepEqual(rejected, ["energy_goal"]);
  assert.deepEqual(changed.map((c) => c.field), ["age_band", "diet_type", "target_protein_g"]);
  assert.deepEqual(applyProfileSet(next, { diet_type: "fasting" }).rejected, ["diet_type"], "fasting is for one plan, never a profile");
});
