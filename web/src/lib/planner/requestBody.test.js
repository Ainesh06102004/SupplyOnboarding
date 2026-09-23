import { test } from "node:test";
import assert from "node:assert/strict";

import { readPlanRequest, readStructuredChange } from "./requestBody";

const HOUSE = "3f1c2b8a-1d2e-4f5a-9b8c-7d6e5f4a3b2c";
const MEMBER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

test("a plan request is bounded and shaped, never trusted", () => {
  assert.equal(readPlanRequest({}).error, "householdId is required");
  assert.match(readPlanRequest({ householdId: HOUSE, days: 30 }).error, /1 to 14/);
  assert.match(readPlanRequest({ householdId: HOUSE, budget: -5 }).error, /positive/);
  assert.match(readPlanRequest({ householdId: HOUSE, requireAvailable: true }).error, /zoneId/);
  const { value } = readPlanRequest({
    householdId: HOUSE,
    memberIds: [MEMBER, "not-a-uuid", MEMBER],
    thisWeek: { [MEMBER]: { dietType: "fasting", targets: { protein: 9999, kcal: 1800 } }, junk: { dietType: "vegan" } },
  });
  assert.deepEqual(value.memberIds, [MEMBER]);
  assert.equal(value.days, 7);
  assert.deepEqual(value.thisWeek[MEMBER].targets, { kcal: 1800 });
  assert.equal(value.thisWeek.junk, undefined);
});

test("a structured change carries swaps by SKU id and nothing else", () => {
  assert.equal(readStructuredChange(null), null);
  assert.equal(readStructuredChange({ budget: 5 }), null);
  const read = readStructuredChange({ swaps: [{ fromSku: "a1", toSku: "b2", from: "Oats", to: "Muesli" }, { fromSku: "x", toSku: "x" }, { fromSku: "bad id!", toSku: "c" }] });
  assert.deepEqual(read, { swaps: [{ fromSku: "a1", toSku: "b2", from: "Oats", to: "Muesli" }], includeSkus: [] });
});

test("a menu's staples come in by SKU id, bounded, and nothing else rides along", () => {
  const read = readStructuredChange({ includeSkus: ["rajma-1", "rajma-1", "bad id!", "ghee-2"], budget: 1 });
  assert.deepEqual(read, { swaps: [], includeSkus: ["rajma-1", "ghee-2"] });
  assert.equal(readStructuredChange({ includeSkus: Array.from({ length: 20 }, (_, i) => `s${i}`) }).includeSkus.length, 8);
});
