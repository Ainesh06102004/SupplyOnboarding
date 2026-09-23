import { test } from "node:test";
import assert from "node:assert/strict";

import { leaveOutFor, readFollowUp, applyFollowUp, mergeFollowUps } from "./followup";
import { buildPlanModel } from "./model";

test("a food left out for one person is read as theirs", () => {
  assert.deepEqual(leaveOutFor("my wife doesn t want the dates"), [{ product: "dates", who: "wife" }]);
  assert.deepEqual(leaveOutFor("no chana for son, and make it cheaper"), [{ product: "chana", who: "son" }]);
  const r = readFollowUp("make it cheaper, and my wife doesn't want the dates");
  assert.deepEqual(r.leaveOutFor, [{ product: "dates", who: "wife" }]);
  assert.ok(!r.leaveOut.includes("dates"), "not left out for the household");
  assert.equal(r.budget.change, "cheaper");
});

test("the model's household-wide leave-out doesn't override one person's", () => {
  const local = readFollowUp("my wife doesn't want the dates");
  const merged = mergeFollowUps(local, { ...local, leaveOut: ["dates"], avoid: [], targets: [], unresolved: [], budget: { change: "none" } });
  assert.deepEqual(merged.leaveOut, []);
  assert.deepEqual(merged.leaveOutFor, [{ product: "dates", who: "wife" }]);
});

test("applied, it refuses the product for that person only", () => {
  const plan = { members: [{ id: "me", label: "Me", targets: {} }, { id: "wife", label: "Wife", targets: {} }], days: 7, budget: null, excludedSkus: [], includedSkus: [], cost: 100, roster: [] };
  const catalogue = [{ skuId: "d1", name: "Dates", categoryKey: "nuts_seeds.dried_fruit" }];
  const change = applyFollowUp(plan, readFollowUp("my wife doesn't want the dates"), catalogue);
  assert.deepEqual(change.applied, ["No Dates for Wife"]);
  assert.deepEqual(change.members.find((m) => m.id === "wife").skipSkus, ["d1"]);
  assert.ok(!(change.members.find((m) => m.id === "me").skipSkus ?? []).length);
  assert.ok(!change.excludedSkus.includes("d1"), "still bought for anyone else");
});

test("the planner refuses it for them, and only them", () => {
  const member = (id, extra = {}) => ({ id, label: id, targets: { kcal: 2000 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [], ...extra });
  const dates = { skuId: "d1", name: "Dates", price: 200, packAmount: 250, packUnit: "g", perPack: { kcal: 700, protein: 5 }, contains: [], role: "snack", categoryKey: "nuts_seeds.dried_fruit" };
  const model = buildPlanModel({ members: [member("me"), member("wife", { skipSkus: ["d1"] })], catalogue: [dates], days: 7 });
  assert.deepEqual(model.meta.refusals.d1, [{ member: "wife", flag: "not_this_week", rule: "this_week" }]);
});
