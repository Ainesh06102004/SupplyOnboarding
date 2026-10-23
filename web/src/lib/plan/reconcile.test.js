import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileWeek } from "./reconcile";
import { sizePortions } from "./portions";

const ME = { memberId: "m1", target_source: "stated", target_kcal: "2600", target_protein_g: "190", target_carbs_g: "290", target_fat_g: "75", target_tolerance_pct: "5" };
const SLOTS = ["breakfast", "lunch", "snack", "dinner"];
const PLAN = [
  ["masala_omelette", ["steamed_rice", "soya_curry"], "roasted_chana", ["phulka", "grilled_chicken_salad"]],
  ["egg_bhurji", ["steamed_rice", "tandoori_chicken"], "fruit_bowl", ["phulka", "tofu_bhurji"]],
];
const cells = {};
PLAN.forEach((meals, i) => meals.forEach((m, s) => {
  cells[`${i}:${SLOTS[s]}`] = { key: `${i}:${SLOTS[s]}`, slot: SLOTS[s], shared: { dishes: (Array.isArray(m) ? m : [m]).map((key) => ({ key })), eaters: ["m1"] }, own: {} };
}));
// The rice and the eggs come from the basket; everything else is fresh or from the kitchen.
const week = {
  days: PLAN.map((_, i) => ({ index: i })), slots: SLOTS, cells,
  additions: { m1: [{ skuId: "whey", name: "Whey protein", perDay: 30, slot: "snack" }] },
  supplierOf: (dishKey, index) => (dishKey === "steamed_rice" && index === 0 ? "rice" : ["masala_omelette", "egg_bhurji"].includes(dishKey) && index === 0 ? "eggs" : null),
};
const portions = sizePortions({ week, person: ME, labels: new Map([["whey", { kcal: 400, protein: 80, carbs: 10, fat: 5, fibre: 0 }]]) });

test("a portioned week totals its shelf products against the person's share, and says what's short", () => {
  const r = reconcileWeek({
    week, portions,
    share: [{ skuId: "rice", name: "Sona Masoori Rice", amount: 100, unit: "g" }, { skuId: "eggs", name: "Eggs", amount: 1200, unit: "g" }, { skuId: "whey", name: "Whey protein", amount: 1000, unit: "g" }],
    basket: [{ skuId: "rice", name: "Sona Masoori Rice", packAmount: 1000 }],
  });
  const rice = r.shelf.find((x) => x.skuId === "rice");
  assert.ok(rice.grams > 100);
  assert.equal(rice.shortGrams, rice.grams - 100);
  assert.equal(rice.morePacks, 1);
  assert.ok(r.short.some((x) => x.skuId === "rice"));
  const eggs = r.shelf.find((x) => x.skuId === "eggs");
  assert.equal(eggs.shortGrams, 0);
  assert.ok(eggs.sparePct > 0);
  assert.ok(r.shelf.find((x) => x.skuId === "whey").grams >= 30);
});

test("everything bought elsewhere is a fresh list, by weight or by count", () => {
  const r = reconcileWeek({ week, portions });
  const chicken = r.fresh.find((x) => x.food === "chicken_breast");
  assert.ok(chicken.grams > 0);
  assert.match(chicken.text, /^\d+ g$|kg$/);
  assert.ok(!r.fresh.some((x) => x.food === "salt"), "the kitchen's salt is not shopping");
  assert.ok(!r.fresh.some((x) => x.food === "rice_white"), "the basket's rice is not a fresh line");
});
