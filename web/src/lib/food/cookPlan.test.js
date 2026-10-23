import { test } from "node:test";
import assert from "node:assert/strict";
import { cookPlan } from "./cookPlan";
import { recipeFor, renderText } from "./recipes";

const BATCH = { id: "A", slot: "lunch", dishes: [{ key: "chicken_curry" }], eaters: ["me", "wife"], cells: ["0:lunch", "1:lunch", "2:lunch"], boxes: 3 };
// "me" is on their own numbers: their curry is sized (more chicken, the same oil); "wife" eats a standard serving.
const sizedItem = (cellKey) => {
  const r = recipeFor("chicken_curry");
  return { kind: "dish", cellKey, dishKey: "chicken_curry", scale: 1.3, servedGrams: 390, lines: r.lines.map((l) => ({ index: l.index, food: l.food, grams: l.food === "chicken_curry_cut" ? 230 : l.grams })), nutrition: { kcal: 600, protein: 46, carbs: 10, fat: 34, fibre: 1 } };
};
const portions = { me: { days: [0, 1, 2].map((i) => ({ index: i, items: [sizedItem(`${i}:lunch`)] })) } };
const people = [{ memberId: "me", label: "Me" }, { memberId: "wife", label: "Wife" }];

test("a batch cooks every person's every box, and the pot is the sum of the plates", () => {
  const plan = cookPlan({ dishKey: "chicken_curry", mode: "batch", batch: BATCH, portions, people });
  assert.equal(plan.servings, 6);
  const r = recipeFor("chicken_curry");
  const chicken = r.lines.find((l) => l.food === "chicken_curry_cut").index;
  const oil = r.lines.find((l) => l.food === "sunflower_oil").index;
  assert.equal(plan.gramsOf(chicken), 3 * 230 + 3 * 150, "three sized boxes and three standard");
  assert.equal(plan.gramsOf(oil), 6 * 10, "the oil did not grow with the chicken");
  assert.deepEqual(plan.boxes.map((b) => [b.label, b.count, b.sized]), [["Me", 3, true], ["Wife", 3, false]]);
});

test("the method says what goes in the pot: the real totals, not one scale", () => {
  const plan = cookPlan({ dishKey: "chicken_curry", mode: "batch", batch: BATCH, portions, people });
  const r = recipeFor("chicken_curry");
  assert.match(renderText("Add {0}.", r, { scale: plan.scale, gramsOf: plan.gramsOf }), /^Add 1140 g curry-cut chicken\.$/);
});

test("a cell cooks for the people at that table; plain mode cooks standard servings", () => {
  const cell = { key: "1:lunch", shared: { dishes: [{ key: "chicken_curry" }], eaters: ["me", "wife"] } };
  const one = cookPlan({ dishKey: "chicken_curry", mode: "cell", cell, portions, people });
  assert.equal(one.servings, 2);
  assert.equal(one.boxes[0].sized, true);
  const plain = cookPlan({ dishKey: "chicken_curry", servings: 4 });
  assert.equal(plain.mode, "plain");
  assert.equal(plain.servings, 4);
  assert.equal(plain.cookedGrams, 4 * recipeFor("chicken_curry").served);
});

test("an unknown dish has no cook plan", () => {
  assert.equal(cookPlan({ dishKey: "no_such_dish" }), null);
});
