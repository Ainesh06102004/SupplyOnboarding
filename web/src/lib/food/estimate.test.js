import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateMeal, matchDishes, searchDishes, mealDishFor, SETTINGS, PORTIONS, GENERIC_SPREAD } from "./estimate";
import { OUT_DISHES } from "./recipes/eatenOut";
import { foodOf } from "./foods";

test("every eaten-out dish is made of known foods, with a unit, a place and a serving", () => {
  for (const [key, d] of Object.entries(OUT_DISHES)) {
    assert.match(key, /^[a-z0-9_]+$/);
    assert.ok(["plate", "piece"].includes(d.unit), key);
    assert.ok(SETTINGS[d.context], `${key}: ${d.context}`);
    assert.ok(d.served > 0 && d.g.length > 0, key);
    if (d.unit === "piece") assert.equal(d.noun?.length, 2, `${key} needs a noun to count it by`);
    for (const [food, grams] of d.g) {
      assert.ok(foodOf(food), `${key}: no food item ${food}`);
      assert.ok(grams > 0, `${key}: ${food}`);
    }
  }
});

test("eaten-out dishes, as served where they're eaten, fall in plausible ranges", () => {
  const kcal = (dishKey, setting, extra = {}) => estimateMeal({ items: [{ dishKey, portion: "usual", ...extra }], setting }).point.kcal;
  const within = (n, lo, hi, what) => assert.ok(n >= lo && n <= hi, `${what}: ${n} kcal`);
  within(kcal("samosa", "street"), 220, 360, "a samosa");
  within(kcal("vada_pav", "street"), 280, 450, "a vada pav");
  within(kcal("chole_bhature", "restaurant"), 650, 1100, "chole bhature");
  within(kcal("veg_thali", "canteen"), 750, 1300, "a veg thali");
  within(kcal("mutton_biryani", "restaurant"), 700, 1100, "a plate of mutton biryani");
  within(kcal("veg_pizza", "restaurant"), 500, 800, "a regular veg pizza");
  within(kcal("butter_naan", "restaurant"), 250, 380, "a butter naan");
  within(kcal("gulab_jamun", "restaurant"), 120, 200, "a gulab jamun");
  within(kcal("soft_drink", "restaurant"), 120, 160, "a can of cola");
});

test("a home dish eaten out takes the place's oil and plate; at home it is the recipe", () => {
  const home = estimateMeal({ items: [{ dishKey: "butter_chicken", portion: "usual" }], setting: "home" });
  const out = estimateMeal({ items: [{ dishKey: "butter_chicken", portion: "usual" }], setting: "restaurant" });
  assert.ok(out.point.kcal > home.point.kcal * 1.3, `${out.point.kcal} vs ${home.point.kcal}`);
  assert.ok(out.point.fat / out.point.protein > home.point.fat / home.point.protein, "the extra is fat, not protein");
  assert.match(out.basis[0], /home recipe, with a restaurant's more fat \(×2\) and a bigger serving \(×1\.3\)/);
  // A street samosa at a stall is the stall's samosa: no factor applied.
  const samosa = estimateMeal({ items: [{ dishKey: "samosa", count: 1 }], setting: "street" });
  assert.match(samosa.basis[0], /^Samosa: as a stall makes it\.$/);
});

test("the answer is a range at the setting's spread, and a big plate is bigger", () => {
  const e = estimateMeal({ items: [{ dishKey: "chicken_biryani", portion: "usual" }], setting: "restaurant" });
  assert.ok(e.low.kcal < e.point.kcal && e.point.kcal < e.high.kcal);
  assert.ok(Math.abs(e.high.kcal / e.point.kcal - (1 + SETTINGS.restaurant.spread)) < 0.03);
  const big = estimateMeal({ items: [{ dishKey: "chicken_biryani", portion: "big" }], setting: "restaurant" });
  assert.ok(Math.abs(big.point.kcal / e.point.kcal - PORTIONS.find((p) => p.key === "big").factor) < 0.05);
});

test("pieces are counted, not plated", () => {
  const two = estimateMeal({ items: [{ dishKey: "samosa", count: 2 }], setting: "street" });
  const one = estimateMeal({ items: [{ dishKey: "samosa", count: 1 }], setting: "street" });
  assert.ok(Math.abs(two.point.kcal - 2 * one.point.kcal) <= 10);
  assert.equal(two.parts[0].amountText, "2 samosas");
});

test("a meal KOI can't name is a typical one, wider, and says so", () => {
  const e = estimateMeal({ items: [{ text: "something at a friend's" }], setting: "home", slot: "dinner" });
  assert.equal(e.generic, true);
  assert.ok(Math.abs(e.high.kcal / e.point.kcal - (1 + GENERIC_SPREAD)) < 0.03);
  assert.match(e.basis[0], /typical dinner out.*Name the dish/);
});

test("a sentence names its dishes, with counts; a word that fits several is one choice", () => {
  const keys = (text) => matchDishes(text).map((x) => x.options.map((o) => o.key).sort());
  assert.deepEqual(keys("had 2 samosas and a masala chai").sort(), [["masala_chai"], ["samosa"]]);
  assert.equal(matchDishes("had 2 samosas").find((x) => x.options[0].key === "samosa").count, 2);
  assert.deepEqual(keys("biryani at the canteen"), [["chicken_biryani", "mutton_biryani", "veg_biryani"]]);
  assert.deepEqual(keys("chicken momos"), [["momos_chicken"]], "the longer name wins");
  assert.deepEqual(keys("a non veg thali"), [["nonveg_thali"]]);
  assert.deepEqual(keys("dal makhani and 2 butter naans").sort(), [["butter_naan"], ["dal_makhani"]]);
  assert.equal(matchDishes("dal makhani and 2 butter naans").find((x) => x.options[0].key === "butter_naan").count, 2);
  assert.deepEqual(keys("nothing I know"), []);
  // Hinglish, and a measure word between the number and the dish.
  const momos = matchDishes("kal raat 2 plate momos aur ek coke");
  assert.deepEqual(momos.map((x) => [x.options.map((o) => o.key).sort(), x.count]).sort(), [[["momos_chicken", "momos_veg"], 2], [["soft_drink"], 1]]);
});

test("search finds a dish from its first letters", () => {
  assert.equal(searchDishes("samo")[0].key, "samosa");
  assert.equal(searchDishes("golgap")[0].key, "pani_puri");
  assert.ok(searchDishes("biry").length >= 3);
  assert.deepEqual(searchDishes("s"), []);
  assert.equal(mealDishFor("rajma").context, "home");
  assert.equal(mealDishFor("no_such_dish"), null);
});
