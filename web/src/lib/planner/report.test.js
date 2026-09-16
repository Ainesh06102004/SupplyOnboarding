// ============================================================================
// KOI PLANNER — tests for achieved against asked
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { planReport, basketDiff, materiallyShort, TOLERANCE } from "@/lib/planner/report.js";

test("a plan more than 5% short of any target has not met its brief", () => {
  const report = (short, asked) => ({ perMember: [{ asked: { protein: asked }, shortfall: short ? { protein: short } : {} }] });
  assert.equal(materiallyShort(report(81, 210)), true);
  assert.equal(materiallyShort(report(1, 70)), false, "1.4% is close enough");
  assert.equal(materiallyShort(report(0, 70)), false);
  assert.equal(materiallyShort({ perMember: [] }), false);
});

test("taking an item out names a substitute only where KOI holds a reason", () => {
  const diff = basketDiff({
    removedSkuId: "ragi",
    before: [{ skuId: "ragi", name: "Ragi Mix", packs: 3 }, { skuId: "rice", name: "Rice", packs: 8 }, { skuId: "dates", name: "Dates", packs: 1 }],
    after: [{ skuId: "golden", name: "Golden Milk Mix", packs: 2 }, { skuId: "rice", name: "Rice", packs: 9 }, { skuId: "chips", name: "Chips", packs: 1 }],
    edges: [{ to_sku: "golden", why: ["35.5 g less sugar per 100 g"] }],
  });
  assert.deepEqual(diff.removed, { skuId: "ragi", name: "Ragi Mix", packs: 3 });
  assert.deepEqual(diff.substitutes, [{ skuId: "golden", name: "Golden Milk Mix", packs: 2, why: ["35.5 g less sugar per 100 g"] }]);
  assert.deepEqual(diff.added, [{ skuId: "chips", name: "Chips", packs: 1 }], "new, but not called a substitute");
  assert.deepEqual(diff.changed, [{ skuId: "rice", name: "Rice", from: 8, to: 9 }]);
  assert.deepEqual(diff.dropped, [{ skuId: "dates", name: "Dates", packs: 1 }]);
});

const rice = { skuId: "rice", name: "Kalanamak Rice", price: 299, packSize: "1000 g", perPack: { protein: 95, kcal: 3500 } };
const almonds = { skuId: "almonds", name: "California Almonds", price: 450, packSize: "200 g", perPack: { protein: 34, kcal: 1312 } };

const me = { id: "me", label: "Me", targets: { protein: 60, kcal: 2000 } };
const kid = { id: "kid", label: "Kid 1", targets: { protein: 30 } };

test("achieved is arithmetic on the basket, per member", () => {
  const report = planReport({
    members: [me, kid],
    catalogue: [rice, almonds],
    days: 7,
    // 4 x ₹299 + 2 x ₹450 = ₹2,096, so this case is within its budget.
    // Going over is its own test below.
    budget: 2500,
    solution: {
      packs: { rice: 4, almonds: 2 },
      // Me eats three packs of rice and one of almonds; the kid the rest.
      eats: { rice: { me: 3, kid: 1 }, almonds: { me: 1, kid: 1 } },
    },
  });

  assert.equal(report.cost, 4 * 299 + 2 * 450);
  assert.equal(report.withinBudget, true);
  assert.deepEqual(report.basket.map((l) => [l.name, l.packs, l.shares]), [
    ["Kalanamak Rice", 4, { me: 0.75, kid: 0.25 }],
    ["California Almonds", 2, { me: 0.5, kid: 0.5 }],
  ]);

  const mine = report.perMember.find((m) => m.id === "me");
  assert.deepEqual(mine.asked, { protein: 420, kcal: 14000 });
  assert.deepEqual(mine.achieved, { protein: 319, kcal: 11812, carbs: 0, fat: 0 });
  assert.deepEqual(mine.shortfall, { protein: 101, kcal: 2188 });
  assert.deepEqual(mine.excess, {});

  const theirs = report.perMember.find((m) => m.id === "kid");
  assert.deepEqual(theirs.asked, { protein: 210 }, "only the nutrient they set a target for");
  // One pack of rice (95 g) and one of almonds (34 g) is 129 g against 210 asked.
  assert.deepEqual(theirs.achieved.protein, 129);
  assert.deepEqual(theirs.shortfall, { protein: 81 });
  assert.deepEqual(theirs.excess, {}, "nobody is over on protein here");
});

test("a shortfall is never rounded away, and noise is not a shortfall", () => {
  const exact = planReport({
    members: [{ id: "me", targets: { protein: 10 } }],
    catalogue: [{ skuId: "x", price: 100, perPack: { protein: 70 } }],
    days: 7,
    solution: { packs: { x: 1 }, eats: { x: { me: 1 } } },
  });
  assert.deepEqual(exact.perMember[0].shortfall, {});
  assert.deepEqual(exact.perMember[0].excess, {});
  assert.equal(exact.summary.everyTargetMet, true);

  const short = planReport({
    members: [{ id: "me", label: "Me", targets: { protein: 10 } }],
    catalogue: [{ skuId: "x", price: 100, perPack: { protein: 69 } }],
    days: 7,
    solution: { packs: { x: 1 }, eats: { x: { me: 1 } } },
  });
  assert.deepEqual(short.perMember[0].shortfall, { protein: 1 });
  assert.deepEqual(short.unmet, [{ member: "me", label: "Me", nutrient: "protein", short: 1 }]);
  assert.equal(short.summary.everyTargetMet, false);
  assert.ok(TOLERANCE < 1);
});

test("an empty basket reports nothing achieved rather than nothing asked", () => {
  const report = planReport({ members: [me], catalogue: [rice], days: 7, budget: 500, solution: { packs: {}, eats: {} } });
  assert.deepEqual(report.basket, []);
  assert.equal(report.cost, 0);
  assert.equal(report.withinBudget, true, "spending nothing is within any budget");
  assert.deepEqual(report.perMember[0].asked, { protein: 420, kcal: 14000 });
  assert.deepEqual(report.perMember[0].shortfall, { protein: 420, kcal: 14000 });
  assert.equal(report.summary.products, 0);
});

test("over budget is reported, not hidden", () => {
  const report = planReport({
    members: [me],
    catalogue: [almonds],
    days: 7,
    budget: 400,
    solution: { packs: { almonds: 2 }, eats: { almonds: { me: 2 } } },
  });
  assert.equal(report.cost, 900);
  assert.equal(report.withinBudget, false);
});
