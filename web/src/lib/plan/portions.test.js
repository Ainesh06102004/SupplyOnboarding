import { test } from "node:test";
import assert from "node:assert/strict";
import { sizePortions, dayTargets, plateWords, roleOf, ROLE_BOUNDS, PORTION_RULES } from "./portions";
import { snapGrams } from "@/lib/food/measures";
import { MACROS } from "@/lib/food/foods";

const ME = {
  memberId: "m1", label: "Me", age_band: "adult_19_59", target_source: "stated",
  target_kcal: "2600", target_protein_g: "190", target_carbs_g: "290", target_fat_g: "75", target_tolerance_pct: "5", carb_cycling: false,
};
const SLOTS = ["breakfast", "lunch", "snack", "dinner"];
// A lifter's week: protein-dense mains, rice or roti, a snack, and a scoop of whey from the basket.
const LIFTER_WEEK = [
  ["masala_omelette", ["steamed_rice", "soya_curry"], "roasted_chana", ["phulka", "grilled_chicken_salad"]],
  ["egg_bhurji", ["brown_rice", "tandoori_chicken"], "fruit_bowl", ["phulka", "tofu_bhurji"]],
  ["moong_chilla", ["steamed_rice", "soya_keema"], "boiled_eggs", ["phulka", "palak_paneer"]],
  ["overnight_oats", ["jeera_rice", "chicken_curry"], "roasted_chana", ["phulka", "soya_curry"]],
  ["masala_omelette", ["steamed_rice", "grilled_chicken_salad"], "curd_fruit_bowl", ["phulka", "tofu_bhurji"]],
  ["egg_bhurji", ["brown_rice", "soya_keema"], "boiled_eggs", ["phulka", "kadai_paneer"]],
  ["besan_chilla", ["steamed_rice", "tandoori_chicken"], "sprouts_chaat", ["phulka", "masoor_dal"]],
];
// An ordinary home week: good food, but nothing like 190 g of protein in it.
const HOME_WEEK = [
  ["kanda_poha", ["steamed_rice", "dal_tadka"], "fruit_chaat", ["phulka", "aloo_gobi"]],
  ["idli", ["jeera_rice", "rajma"], "bhel_puri", ["phulka", "mixed_veg"]],
];
const WHEY = { kcal: 400, protein: 80, carbs: 10, fat: 5, fibre: 0 };
const LABELS = new Map([["whey", WHEY]]);

/** A week as buildWeek returns it, for one person, without a basket. */
function weekOf(plan, { whey = true, eaters = ["m1"] } = {}) {
  const days = plan.map((_, i) => ({ index: i, date: `2026-10-${26 + i}`, label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] }));
  const cells = {};
  plan.forEach((meals, i) => meals.forEach((m, s) => {
    const dishes = (Array.isArray(m) ? m : [m]).map((key) => ({ key }));
    cells[`${i}:${SLOTS[s]}`] = { key: `${i}:${SLOTS[s]}`, day: i, slot: SLOTS[s], shared: { dishes, eaters }, own: {}, notes: {} };
  }));
  return {
    days, slots: SLOTS, cells,
    additions: { m1: whey ? [{ skuId: "whey", name: "Whey protein", perDay: 30, unit: "g", slot: "snack" }] : [] },
    supplierOf: () => null,
  };
}

test("a lifter's week lands every day within 5% on calories, protein, carbs and fat", () => {
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS });
  for (const d of r.days) assert.ok(d.within, `day ${d.index}: ${JSON.stringify(d.deviation)} (${d.gap})`);
  assert.ok(r.within);
  assert.ok(Math.abs(r.worst.pct) <= 5);
});

test("a tighter tolerance is held to, or the day says it missed", () => {
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: { ...ME, target_tolerance_pct: "3" }, labels: LABELS });
  for (const d of r.days) {
    const worst = Math.max(...MACROS.map((n) => Math.abs(d.deviation[n])));
    assert.equal(d.within, worst <= 3);
    if (!d.within) assert.ok(d.gap);
  }
});

test("an ordinary home week can't reach 190 g of protein, and says so in words", () => {
  const r = sizePortions({ week: weekOf(HOME_WEEK, { whey: false }), person: ME, labels: new Map() });
  assert.equal(r.within, false);
  for (const d of r.days.filter((x) => !x.within)) assert.match(d.gap, /^short \d+ g (protein|carbs|fat)$|^\d+ g (protein|carbs|fat) over$|kcal (over|under)$/);
  assert.ok(r.days.some((d) => /protein/.test(d.gap ?? "")));
});

test("every role stays inside its bounds; oil can halve, never vanish", () => {
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS });
  for (const d of r.days) for (const item of d.items.filter((i) => i.kind === "dish")) {
    for (const [role, scale] of Object.entries(item.roles)) {
      const [lo, hi] = ROLE_BOUNDS[role];
      assert.ok(scale >= lo - 0.01 && scale <= hi + 0.01, `${item.dishKey} ${role} ×${scale}`);
    }
  }
  for (const d of r.days) for (const item of d.items.filter((i) => i.kind === "addition")) assert.ok(item.grams >= 0 && item.grams <= 30 * PORTION_RULES.additionMax);
});

test("what a person is told to cook is what the totals describe: rounded grams, re-checked", () => {
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS });
  for (const d of r.days) {
    const sum = d.items.reduce((a, i) => a + i.nutrition.kcal, 0);
    assert.ok(Math.abs(sum - d.totals.kcal) < 1e-6);
    for (const item of d.items.filter((i) => i.kind === "dish")) {
      for (const l of item.lines) {
        // Bulk in 5 g steps; small amounts on a spoon a kitchen has.
        if (l.grams >= 20) assert.equal(l.grams % 5, 0, `${item.dishKey} ${l.food} ${l.grams} g`);
        else assert.ok(Math.abs(snapGrams(l.food, l.grams) - l.grams) < 1e-6 || Number.isInteger(l.grams), `${item.dishKey} ${l.food} ${l.grams} g`);
      }
    }
  }
});

test("a dish is sized by component: more chicken does not mean more oil", () => {
  assert.equal(roleOf("chicken_curry_cut"), "protein");
  assert.equal(roleOf("rice_white"), "carb");
  assert.equal(roleOf("sunflower_oil"), "fat");
  assert.equal(roleOf("onion"), "rest");
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS });
  const curry = r.days[3].items.find((i) => i.dishKey === "chicken_curry");
  assert.ok(curry.roles.protein > curry.roles.fat, JSON.stringify(curry.roles));
});

test("carb cycling moves carbs to training days and keeps the week", () => {
  const person = { ...ME, carb_cycling: true };
  assert.deepEqual(dayTargets(person, { training: true, trainingDays: 4 }), { kcal: 2840, protein: 190, carbs: 350, fat: 75 });
  assert.deepEqual(dayTargets(person, { training: false, trainingDays: 4 }), { kcal: 2280, protein: 190, carbs: 210, fat: 75 });
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person, labels: LABELS, trainingDays: new Set([0, 1, 3, 4]) });
  assert.ok(r.days[0].totals.carbs > r.days[2].totals.carbs);
});

test("tied items (one batch, several boxes) get one portion", () => {
  const ties = { "0:lunch|soya_curry": "batchA", "3:dinner|soya_curry": "batchA" };
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS, ties });
  const a = r.days[0].items.find((i) => i.id === "0:lunch|soya_curry");
  const b = r.days[3].items.find((i) => i.id === "3:dinner|soya_curry");
  assert.deepEqual(a.roles, b.roles);
  assert.deepEqual(a.lines.map((l) => l.grams), b.lines.map((l) => l.grams));
});

test("a shared dish is sized for this person only; someone else at the table doesn't change it", () => {
  const alone = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS });
  const shared = sizePortions({ week: weekOf(LIFTER_WEEK, { eaters: ["m1", "m2"] }), person: ME, labels: LABELS });
  assert.deepEqual(alone.days.map((d) => d.totals.kcal), shared.days.map((d) => d.totals.kcal));
});

test("a plate reads as its main foods with grams", () => {
  const r = sizePortions({ week: weekOf(LIFTER_WEEK), person: ME, labels: LABELS });
  const curry = r.days[3].items.find((i) => i.dishKey === "chicken_curry");
  assert.match(plateWords(curry), /curry-cut chicken \d+ g/);
});
