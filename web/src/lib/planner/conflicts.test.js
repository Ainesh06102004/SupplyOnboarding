// Which of the shopper's own asks are in the way (C7).

import test from "node:test";
import assert from "node:assert/strict";

import { findConflicts, orderFor, RELAXATIONS, MOST_FIXES } from "@/lib/planner/conflicts.js";

const base = {
  days: 7,
  budget: 1000,
  members: [{ id: "me", label: "Me", skipCategories: ["snacks"] }],
  refusedBrands: ["Maggi"],
  pantrySkus: [],
  wasteTolerance: "some",
  keepOutFlags: [],
  priorities: [],
};

/** A solver that meets the targets only once `fixedBy` has been taken back. */
const solverThatNeeds = (fixedBy, from = base) => {
  const seen = [];
  const solve = async (relaxed) => {
    const gone = RELAXATIONS.filter((r) => r.applies(from) && !r.applies(relaxed)).map((r) => r.key);
    // `days` is the one relaxation that still "applies" after it is applied.
    const shorter = Number(relaxed.days) < Number(from.days) ? ["days"] : [];
    const taken = [...gone, ...shorter];
    seen.push(taken.join("+") || "nothing");
    return { report: { cost: 1200, met: taken.includes(fixedBy) } };
  };
  return { solve, seen, stillShort: (report) => !report.met };
};

test("an ask is in the way only when taking it back fixes the plan", async () => {
  const { solve, stillShort } = solverThatNeeds("budget");
  const { fixes, tried } = await findConflicts({ base, solve, stillShort });
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].key, "budget");
  assert.match(fixes[0].says, /Spend about ₹1,200 instead of ₹1,000/);
  assert.ok(tried.includes("budget"), "and it was proved by planning again, not guessed");
});

test("an ask that changes nothing is not reported, however likely it looked", async () => {
  // Nothing fixes it: the shopper is told nothing rather than something wrong.
  const { solve, stillShort } = solverThatNeeds("never");
  const { fixes, tried } = await findConflicts({ base, solve, stillShort });
  assert.deepEqual(fixes, []);
  assert.ok(tried.length >= 3, "every ask that could have been in the way was tried");
});

test("only asks this household actually made are tried", async () => {
  const plain = { ...base, budget: null, refusedBrands: [], members: [{ id: "me", label: "Me", skipCategories: [] }], days: 2 };
  const { solve, stillShort } = solverThatNeeds("never", plain);
  const { tried } = await findConflicts({ base: plain, solve, stillShort });
  assert.deepEqual(tried, [], "no budget, no brands, no skips, too few days to halve");
});

test("a safety rule is named as the reason and never offered as a fix", async () => {
  const strict = { ...base, budget: null, refusedBrands: [], keepOutFlags: ["gluten"], members: [{ id: "me", label: "Me", skipCategories: [] }] };
  const { solve, stillShort } = solverThatNeeds("kept_out_of_house", strict);
  const { fixes, safety } = await findConflicts({ base: strict, solve, stillShort });
  assert.deepEqual(fixes, [], "KOI does not suggest letting an allergen back in the house");
  assert.match(safety.says, /kept out of the house \(gluten\)/);
});

test("at most two fixes are offered: more than that is a list, not an answer", async () => {
  // Every relaxation works, so the search has to stop itself.
  const solve = async () => ({ report: { cost: 1200, met: true } });
  const { fixes } = await findConflicts({ base, solve, stillShort: (r) => !r.met });
  assert.equal(fixes.length, MOST_FIXES);
});

test("what the household cares least about is offered first", async () => {
  // Budget ranked first means the budget is the last thing to give up, so an
  // ask tied to the targets is tried before it.
  const budgetFirst = orderFor(["budget", "targets"]).map((r) => r.key);
  const targetsFirst = orderFor(["targets", "budget"]).map((r) => r.key);
  assert.ok(budgetFirst.indexOf("budget") > budgetFirst.indexOf("skipped_this_week"));
  assert.ok(targetsFirst.indexOf("budget") < targetsFirst.indexOf("skipped_this_week"));
  assert.equal(orderFor([]).length, RELAXATIONS.length, "every ask is orderable, said or not");
});
