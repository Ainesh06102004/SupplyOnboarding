import { test } from "node:test";
import assert from "node:assert/strict";
import { DISHES } from "./dishData";
import { RECIPES } from "./recipes/index";
import { recipeFor, dishNutrition, renderText, lineText, stepUses } from "./recipes";
import { foodOf } from "./foods";
import { kitchenMeasure, quarters, snapGrams } from "./measures";

// What one adult serving of each kind plausibly carries (kcal). A recipe
// outside its band is a typo in grams, not a style choice.
const KCAL_BAND = { breakfast: [80, 650], main: [60, 600], base: [100, 450], one_pot: [250, 750], snack: [60, 450], drink: [0, 350] };
const written = DISHES.filter((d) => RECIPES[d.key]);

test("every dish has a written recipe", () => {
  const missing = DISHES.filter((d) => !RECIPES[d.key]).map((d) => d.key);
  assert.deepEqual(missing, []);
});

test("every recipe names a dish, and every dish line has a food and grams", () => {
  for (const key of Object.keys(RECIPES)) assert.ok(DISHES.some((d) => d.key === key), `${key}: no such dish`);
  for (const dish of written) {
    const r = RECIPES[dish.key];
    assert.equal(r.g.length, dish.lines.length, `${dish.key}: ${r.g.length} amounts for ${dish.lines.length} lines`);
    r.g.forEach(([food, grams], i) => {
      assert.ok(foodOf(food), `${dish.key} line ${i}: unknown food ${food}`);
      assert.ok(Number.isFinite(grams) && grams > 0, `${dish.key} line ${i}: grams ${grams}`);
    });
  }
});

test("a recipe's food agrees with its line's shelf and supply", () => {
  // A line on a KOI shelf is sized from the product's label in a plan; its food
  // item must still be the same kind of thing (milk is not paneer).
  const shelfFood = {
    "dairy.paneer": ["paneer"], "dairy.curd": ["curd"], "dairy.milk": ["milk_toned", "milk_whole"],
    "fats_oils.ghee": ["ghee"], "eggs.hen_eggs": ["egg", "egg_white"], "staples.rice": ["rice_white", "rice_brown", "poha"],
  };
  for (const dish of written) {
    dish.lines.forEach((line, i) => {
      const allowed = shelfFood[line.category];
      if (allowed) assert.ok(allowed.includes(RECIPES[dish.key].g[i][0]), `${dish.key} line ${i} (${line.category}) is ${RECIPES[dish.key].g[i][0]}`);
    });
  }
});

test("one serving of each recipe is plausible for its kind", () => {
  for (const dish of written) {
    const n = dishNutrition(recipeFor(dish.key));
    const [lo, hi] = KCAL_BAND[dish.kind];
    assert.ok(n.kcal >= lo && n.kcal <= hi, `${dish.key} (${dish.kind}): ${Math.round(n.kcal)} kcal`);
    // Energy roughly agrees with its macros (4/4/9, fibre aside) — a wrong food key shows up here.
    const fromMacros = n.protein * 4 + n.carbs * 4 + n.fat * 9;
    assert.ok(Math.abs(fromMacros - n.kcal) <= Math.max(30, n.kcal * 0.12), `${dish.key}: ${Math.round(n.kcal)} kcal vs ${Math.round(fromMacros)} from macros`);
  }
});

test("every method step names real lines, and every line is used or obvious", () => {
  for (const dish of written) {
    const r = recipeFor(dish.key);
    assert.ok(r.steps.length >= 2 && r.steps.length <= 6, `${dish.key}: ${r.steps.length} steps`);
    for (const s of r.steps) {
      for (const i of s.uses) assert.ok(i < r.lines.length, `${dish.key} step ${s.n} names line ${i}`);
      assert.ok(!/\{|\}/.test(renderText(s.text, r)), `${dish.key} step ${s.n} left a placeholder`);
    }
    // A required line nobody is told to use is a missing instruction — salt is the one line steps may just say.
    const used = new Set(r.steps.flatMap((s) => s.uses));
    const words = r.steps.map((s) => s.text.toLowerCase()).join(" ");
    for (const line of r.lines) {
      if (used.has(line.index)) continue;
      const GENERIC = new Set(["fresh", "powder", "seeds", "leaves", "whole", "raw", "split", "yellow", "white", "medium"]);
      const nameWords = foodOf(line.food).name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
      const said = /salt/.test(line.food) ? /salt/.test(words) : nameWords.some((w) => words.includes(w));
      assert.ok(said, `${dish.key}: line ${line.index} (${line.food}) is never used in the method`);
    }
  }
});

test("stepUses reads line placeholders, not water", () => {
  assert.deepEqual(stepUses("Mix {0} with {water:240} and {3}."), [0, 3]);
});

test("kitchen measures read the way a kitchen measures", () => {
  assert.equal(quarters(1.5), "1½");
  assert.equal(quarters(0.25), "¼");
  assert.equal(kitchenMeasure("rice_white", 95).text, "½ cup");
  assert.equal(kitchenMeasure("rice_white", 380).text, "2 cups");
  assert.equal(kitchenMeasure("sunflower_oil", 40).text, "3 tbsp");
  assert.equal(kitchenMeasure("sunflower_oil", 10).text, "2 tsp");
  assert.equal(kitchenMeasure("turmeric", 0.5).text, "a pinch of");
  assert.equal(kitchenMeasure("egg", 150).text, "3 eggs");
  assert.equal(kitchenMeasure("garlic", 8).text, "2 cloves");
  assert.equal(kitchenMeasure("onion", 55).text, "½ medium onion");
  assert.equal(kitchenMeasure("tomato", 250).text, "2½ medium tomatoes");
  assert.equal(kitchenMeasure("asafoetida", 0.1).text, "a pinch of");
  assert.equal(kitchenMeasure("chicken_curry_cut", 150).text, "150 g");
  assert.equal(snapGrams("rice_white", 100), 92.5);
});

test("a line reads naturally: '3 eggs', not '3 eggs egg'", () => {
  const r = recipeFor("masala_omelette");
  assert.equal(lineText(r.lines[0]).amount, "3 eggs");
  assert.equal(lineText(r.lines[0]).name, "");
  assert.equal(renderText("Beat {0}.", r), "Beat 3 eggs.");
  assert.equal(renderText("Use {water:480}.", r), "Use 2 cups of water.");
  assert.match(renderText("Use {3}.", r, { unit: "grams" }), /^Use 5 g sunflower oil\.$/);
});

test("scaling a recipe scales its nutrition and its amounts", () => {
  const r = recipeFor("veg_dalia");
  const one = dishNutrition(r);
  const four = dishNutrition(r, { scale: 4 });
  assert.ok(Math.abs(four.kcal - one.kcal * 4) < 1e-6);
  assert.equal(renderText("{0}", r, { scale: 4 }), "1½ cups broken wheat");
});

test("a shelf line can be sized from the product's own label", () => {
  const r = recipeFor("muesli_curd");
  const label = { kcal: 100, protein: 10, carbs: 5, fat: 4, fibre: 0 };
  const withLabel = dishNutrition(r, { per100For: (line) => (line.category === "dairy.curd" ? label : null) });
  const plain = dishNutrition(r);
  assert.ok(withLabel.protein > plain.protein);
});

test("an optional line left out is left out of the nutrition too", () => {
  const r = recipeFor("kanda_poha");
  assert.ok(dishNutrition(r, { leaveOut: ["Peanut"] }).fat < dishNutrition(r).fat);
});
