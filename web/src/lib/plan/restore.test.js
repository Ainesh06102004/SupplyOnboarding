import { test } from "node:test";
import assert from "node:assert/strict";

import { restoreFrom, chainOf, MAX_RESTORED_CHANGES } from "./restore";

const row = (id, at, extra = {}) => ({ id, days: 7, budget_rupees: 4000, status: "solved", created_at: `2026-09-24T10:${at}:00Z`, follows: null, change: null, cost: 3000, basket: [], ...extra });
const report = (cost) => ({ report: { cost, basket: [] }, explanation: { reached: "as_asked" } });

test("the latest plan comes back as it was shown", () => {
  const out = restoreFrom([row("b", "05", { cost: 3142 })], new Map([["b", report(3142)]]));
  assert.equal(out.plan.planId, "b");
  assert.equal(out.plan.report.cost, 3142);
  assert.equal(out.plan.budget, 4000);
  assert.equal(out.plan.restored, true);
  assert.deepEqual(out.requests, []);
});

test("a plan made before reports were stored is not reopened", () => {
  assert.equal(restoreFrom([row("a", "01")], new Map()), null);
  assert.equal(restoreFrom([], new Map()), null);
});

test("its changes come back as requests, oldest first, each undoable to the plan before it", () => {
  const rows = [
    row("c", "09", { follows: "b", change: ["No Dates for Wife"], cost: 1897 }),
    row("b", "07", { follows: "a", change: ["Budget ₹2,820"], cost: 2196 }),
    row("a", "05", { cost: 3142 }),
    row("old", "01", { cost: 2500, basket: [{ skuId: 1, packs: 2 }] }),
  ];
  const stored = new Map([["c", report(1897)], ["b", report(2196)], ["a", report(3142)]]);
  const out = restoreFrom(rows, stored);
  assert.equal(out.plan.planId, "c");
  assert.deepEqual(out.requests.map((r) => r.id), ["b", "c"]);
  assert.deepEqual(out.requests[1].applied, ["No Dates for Wife"]);
  assert.equal(out.requests[1].before.planId, "b");
  assert.equal(out.requests[1].basketChange.costBefore, 2196);
  assert.equal(out.requests[1].costAfter, 1897);
  assert.equal(out.requests[0].before.planId, "a");
  assert.equal(out.compareTo.cost, 2500, "the plan before the chain is 'your last plan'");
});

test("the chain stops where a plan can't be drawn", () => {
  const rows = [row("b", "07", { follows: "a", change: ["Cheaper"] }), row("a", "05")];
  const out = restoreFrom(rows, new Map([["b", report(2000)]]));
  assert.equal(out.plan.planId, "b");
  assert.deepEqual(out.requests, [], "no request without a plan to go back to");
});

test("a chain is bounded, and a loop can't hang it", () => {
  const long = Array.from({ length: 20 }, (_, i) => row(`p${i}`, String(59 - i).padStart(2, "0"), { follows: `p${i + 1}` }));
  assert.equal(chainOf(long).length, MAX_RESTORED_CHANGES + 1);
  const loop = [row("x", "02", { follows: "y" }), row("y", "01", { follows: "x" })];
  assert.equal(chainOf(loop).length, 2);
});
