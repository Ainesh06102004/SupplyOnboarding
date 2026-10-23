import { test } from "node:test";
import assert from "node:assert/strict";
import { planBatches, mealKeeps, batchOf } from "./batch";

const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** A Monday-to-Sunday week whose lunches and dinners are given by dish key. */
function weekOf(lunches, dinners = lunches) {
  const days = LABELS.map((label, index) => ({ index, label, date: `2026-10-${26 + index}` }));
  const cells = {};
  days.forEach((d) => {
    cells[`${d.index}:lunch`] = { key: `${d.index}:lunch`, slot: "lunch", shared: { dishes: lunches[d.index].map((key) => ({ key })), eaters: ["me"] }, own: {} };
    cells[`${d.index}:dinner`] = { key: `${d.index}:dinner`, slot: "dinner", shared: { dishes: dinners[d.index].map((key) => ({ key })), eaters: ["me"] }, own: {} };
  });
  return { days, slots: ["breakfast", "lunch", "snack", "dinner"], cells };
}
const RICE_CURRY = ["steamed_rice", "chicken_curry"];
const ROTI_BHURJI = ["phulka", "paneer_bhurji"];

test("a meal keeps as long as its shortest-keeping dish; a fresh-only dish can't be boxed", () => {
  assert.equal(mealKeeps(RICE_CURRY), 3);
  assert.equal(mealKeeps(ROTI_BHURJI), 0, "phulka and bhurji are cooked fresh");
  assert.equal(mealKeeps(["bisi_bele_bath"]), 2);
});

test("Sunday's cook feeds the lunches after it, as long as the meal keeps; Wednesday's cook takes over", () => {
  const week = weekOf(Array(7).fill(RICE_CURRY));
  const { batches, overrides } = planBatches({ week, style: "batch_lunch", prepDays: [0, 3] });
  assert.equal(batches.length, 2);
  const [a, b] = batches;
  assert.equal(a.id, "A");
  assert.equal(a.cookLabel, "Sun", "the Sunday before the week");
  assert.deepEqual(a.cells, ["0:lunch", "1:lunch", "2:lunch"], "Mon–Wed: rice and chicken curry keep 3 days");
  assert.equal(b.cookLabel, "Wed");
  assert.deepEqual(b.cells, ["3:lunch", "4:lunch", "5:lunch"]);
  assert.deepEqual(overrides["1:lunch"].dishes, RICE_CURRY);
  assert.ok(!overrides["0:dinner"], "lunches only");
});

test("batching twice a week boxes dinners too; cooking fresh boxes nothing", () => {
  const week = weekOf(Array(7).fill(RICE_CURRY));
  assert.ok(planBatches({ week, style: "batch" }).batches.some((b) => b.slot === "dinner"));
  assert.deepEqual(planBatches({ week, style: "fresh" }).batches, []);
});

test("a run with nothing that keeps stays cooked fresh", () => {
  const week = weekOf(Array(7).fill(ROTI_BHURJI));
  assert.deepEqual(planBatches({ week, style: "batch_lunch" }).batches, []);
});

test("the shopper's own pick is never batched over", () => {
  const week = weekOf(Array(7).fill(RICE_CURRY));
  const { batches, overrides } = planBatches({ week, style: "batch_lunch", picks: { "1:lunch": { dishes: ["veg_pulao"] } } });
  assert.ok(!overrides["1:lunch"]);
  assert.ok(!batches[0].cells.includes("1:lunch"));
});

test("every box of a batch is tied, for each person who eats it", () => {
  const week = weekOf(Array(7).fill(RICE_CURRY));
  const plan = planBatches({ week, style: "batch_lunch" });
  const ties = plan.ties("me");
  assert.equal(ties["0:lunch|chicken_curry"], ties["2:lunch|chicken_curry"]);
  assert.notEqual(ties["0:lunch|chicken_curry"], ties["3:lunch|chicken_curry"], "a different cook, a different portion");
  assert.deepEqual(plan.ties("someone else"), {});
  assert.equal(batchOf(plan.batches, "4:lunch").id, "B");
});
