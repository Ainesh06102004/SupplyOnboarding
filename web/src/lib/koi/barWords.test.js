import { test } from "node:test";
import assert from "node:assert/strict";

import { promptsFor, workingWords, mealAt, elapsed } from "./barWords";

test("the meal of the moment follows the clock", () => {
  assert.equal(mealAt(8), "breakfast");
  assert.equal(mealAt(13), "lunch");
  assert.equal(mealAt(17), "snack");
  assert.equal(mealAt(21), "dinner");
  assert.equal(mealAt(2), "dinner");
});

test("a product page names the product", () => {
  const lines = promptsFor({ path: "/store/product/abc", facts: { product: "Kabuli Chana", category: "Staples" }, agent: true });
  assert.ok(lines.some((l) => l.includes("Kabuli Chana")));
  assert.ok(lines.some((l) => l.includes("staples")));
});

test("Track offers the next meal to log by its dish", () => {
  const lines = promptsFor({ path: "/store/track", hour: 13, facts: { nextMeal: { slot: "lunch", dish: "Jeera rice with Baingan bharta" } } });
  assert.match(lines[0], /instead of Jeera rice with Baingan bharta/);
});

test("the Plan's prompts follow its step, and the cart its contents", () => {
  assert.ok(promptsFor({ path: "/store/plan", facts: { step: "pantry" }, agent: true }).some((l) => /at home/.test(l)));
  const cart = promptsFor({ path: "/store/cart", cart: { total: 2162, own: 2, plan: true }, agent: true });
  assert.ok(cart.includes("Bring this cart under ₹1,900"));
  assert.ok(cart.some((l) => l.includes("2 things I added")));
});

test("without Agent Mode the bar only suggests what it can route", () => {
  const plain = promptsFor({ path: "/store/household", hour: 13 });
  assert.equal(plain.length, 1);
  assert.match(plain[0], /^Had a veg thali for lunch$/);
  assert.ok(promptsFor({ path: "/store/calendar" }).includes("Lunch out every Tuesday"));
});

test("working words lead with the tool's own, and time reads like a spinner", () => {
  assert.equal(workingWords("check_product")[0], "Squinting at the label");
  assert.ok(workingWords("nope").includes("Tempering"));
  assert.equal(elapsed(4200), "4s");
  assert.equal(elapsed(72000), "1m 12s");
});
