import { test } from "node:test";
import assert from "node:assert/strict";
import { takeTwo, applyAdjustments, adjustmentFrom, activeEffects, REBALANCE_RULES } from "./rebalance";
import { platesOfDay, dayLedger } from "./today";
import { sizePortions } from "./portions";
import { GOAL_RULES } from "@/lib/planner/goals";

const SLOTS = ["breakfast", "lunch", "snack", "dinner"];
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOME = ["kanda_poha", ["steamed_rice", "dal_tadka"], "fruit_chaat", ["phulka", "aloo_gobi"]];
const RICE_CURRY = ["steamed_rice", "chicken_curry"];

/** A Monday-to-Sunday week as buildWeek returns it. */
function weekOf(day = HOME, { eaters = ["m1"], lunches = null } = {}) {
  const days = LABELS.map((label, index) => ({ index, label, date: `2026-10-${26 + index}` }));
  const cells = {};
  for (const d of days) {
    const meals = lunches ? day.map((m, s) => (SLOTS[s] === "lunch" ? lunches[d.index] : m)) : day;
    meals.forEach((m, s) => {
      const key = `${d.index}:${SLOTS[s]}`;
      cells[key] = { key, day: d.index, slot: SLOTS[s], shared: { dishes: (Array.isArray(m) ? m : [m]).map((k) => ({ key: k, name: k })), eaters }, own: {}, notes: {} };
    });
  }
  return { days, slots: SLOTS, cells, additions: {}, supplierOf: () => null };
}

// Someone with body details and their own calories, but not their own carbs and fat.
const HOME_COOK = {
  memberId: "m1", label: "Me", age_band: "adult_19_59", sex: "male", activity_level: "moderate",
  age_years: "32", weight_kg: "78", height_cm: "175", target_source: "stated", target_kcal: "2200", target_protein_g: "90",
};
const LIFTER = {
  ...HOME_COOK, target_kcal: "2600", target_protein_g: "150", target_carbs_g: "300", target_fat_g: "80", target_tolerance_pct: "5",
};
const outLunch = (kcal, protein = 30) => ({ eaten_on: "2026-10-27", slot: "lunch", status: "other", estimate: { point: { kcal, protein, carbs: Math.round((kcal * 0.45) / 4), fat: Math.round((kcal * 0.4) / 9), fibre: 4 } } });

test("the ledger counts a meal as eaten, half eaten, skipped or something else", () => {
  const week = weekOf();
  const plates = platesOfDay({ week, memberId: "m1", dayIndex: 1 });
  const by = Object.fromEntries(plates.map((p) => [p.slot, p.nutrition.kcal]));
  const ledger = dayLedger({
    plates,
    logs: [
      { slot: "breakfast", status: "partial" },
      { slot: "lunch", status: "other", estimate: { point: { kcal: 1000, protein: 30, carbs: 100, fat: 50, fibre: 5 } } },
      { slot: "snack", status: "skipped" },
    ],
    target: { kcal: 2200, protein: 90 },
  });
  assert.ok(Math.abs(ledger.eaten.kcal - (by.breakfast / 2 + 1000)) < 1);
  assert.ok(Math.abs(ledger.expected.kcal - (by.breakfast / 2 + 1000 + by.dinner)) < 1, "dinner is still expected as planned");
  assert.equal(ledger.logged, 3);
  assert.equal(ledger.gap.kcal, Math.round(ledger.expected.kcal - 2200));
});

test("Take 2 always offers to leave it, recommends exactly one option, and never moves a day past its caps", () => {
  const week = weekOf();
  const t = takeTwo({ week, person: HOME_COOK, entry: outLunch(900) });
  assert.equal(t.inWeek, true);
  // Not on their own numbers: the day is measured against its plan, so the gap is what lunch changed.
  assert.equal(t.against, "plan");
  const plannedLunch = platesOfDay({ week, memberId: "m1", dayIndex: 1 }).find((p) => p.slot === "lunch").nutrition.kcal;
  assert.ok(Math.abs(t.gap.kcal - (900 - plannedLunch)) <= 1);
  assert.ok(t.numbers.some((o) => o.id === "leave"));
  assert.equal(t.numbers.filter((o) => o.recommended).length, 1);
  const plannedDay = platesOfDay({ week, memberId: "m1", dayIndex: 2 }).reduce((a, p) => a + p.nutrition.kcal, 0);
  const cap = Math.min((REBALANCE_RULES.spreadCapPct / 100) * plannedDay, REBALANCE_RULES.spreadCapKcal);
  const spread = t.numbers.find((o) => o.id === "spread");
  assert.ok(spread, "a big lunch can be spread");
  for (const [day, s] of Object.entries(spread.effect.shift)) {
    assert.ok(Number(day) > 1, "only later days");
    assert.ok(Math.abs(s.kcal) <= cap + 0.5, `day ${day}: ${s.kcal}`);
    assert.ok(!(s.protein < 0), "protein is never cut");
  }
  // Without their own numbers, the rest of today is a smaller plate, inside the plate bounds.
  const today = t.numbers.find((o) => o.id === "today");
  assert.ok(today);
  for (const f of Object.values(today.effect.scale)) assert.ok(f >= REBALANCE_RULES.plateScale[0] && f < 1);
  assert.deepEqual(Object.keys(today.effect.scale).sort(), ["1:dinner", "1:snack"]);
});

test("a party the week can't absorb is spread as far as the caps allow, and says what is left", () => {
  const t = takeTwo({ week: weekOf(), person: HOME_COOK, entry: { ...outLunch(3200), slot: "dinner" } });
  const spread = t.numbers.find((o) => o.id === "spread");
  assert.ok(spread.after.kcal > 0);
  assert.match(spread.detail, /more than KOI moves in a week/);
  // Never under the floor, even for a small target.
  const small = { ...HOME_COOK, sex: "female", target_kcal: "1300" };
  const t2 = takeTwo({ week: weekOf(), person: small, entry: { ...outLunch(2500), slot: "dinner" } });
  for (const s of Object.values(t2.numbers.find((o) => o.id === "spread")?.effect.shift ?? {})) {
    assert.ok(1300 + s.kcal >= GOAL_RULES.kcalFloor.female - 0.5);
  }
});

test("a day within a few percent is left alone", () => {
  const week = weekOf();
  const planned = platesOfDay({ week, memberId: "m1", dayIndex: 1 }).reduce((a, p) => a + p.nutrition.kcal, 0);
  const lunch = platesOfDay({ week, memberId: "m1", dayIndex: 1 }).find((p) => p.slot === "lunch").nutrition;
  // Same calories as planned, and a target the planned day already meets.
  const t = takeTwo({ week, person: { ...HOME_COOK, target_kcal: String(Math.round(planned)) }, entry: { ...outLunch(0), estimate: { point: lunch } } });
  assert.equal(t.numbers.find((o) => o.recommended).id, "leave");
  assert.equal(t.numbers.length, 1);
});

test("on their own numbers, the rest of today is resized and the day lands closer", () => {
  const week = weekOf(["masala_omelette", ["steamed_rice", "chicken_curry"], "roasted_chana", ["phulka", "palak_paneer"]]);
  const base = sizePortions({ week, person: LIFTER });
  const entry = outLunch(1300, 35);
  const t = takeTwo({ week, person: LIFTER, sized: base, entry });
  const today = t.numbers.find((o) => o.id === "today");
  assert.ok(today, JSON.stringify(t.numbers.map((o) => o.id)));
  assert.deepEqual(today.effect.resize, [1]);
  const adjusted = applyAdjustments({ week, person: LIFTER, base, adjustments: [adjustmentFrom({ entry, numbers: today })], logsByDate: { "2026-10-27": [entry] } });
  const day = adjusted.sized.days[1];
  assert.ok(Math.abs(day.totals.kcal - day.target.kcal) < Math.abs(t.gap.kcal), `${day.totals.kcal} vs ${day.target.kcal}, gap was ${t.gap.kcal}`);
  // Lunch is what was eaten, as logged; the other days are untouched.
  assert.equal(day.items.find((i) => i.cellKey === "1:lunch").kind, "fixed");
  assert.deepEqual(adjusted.sized.days[3], base.days[3]);
});

test("the meal that wasn't eaten: a fresh dish moves, leftovers are packed, a fresh-only dish has nothing to move", () => {
  // Only this person eats lunch: it wasn't cooked, so it can be cooked another day.
  const fresh = takeTwo({ week: weekOf(), person: HOME_COOK, entry: outLunch(900) });
  assert.equal(fresh.meal.kind, "fresh");
  const cook = fresh.meal.options.find((o) => o.id.startsWith("cook:"));
  assert.ok(cook.effect.picks[cook.id.slice(5)]);
  assert.equal(cook.effect.carry.length, 1, "the dish it displaces moves to next week");
  assert.ok(fresh.meal.options.some((o) => o.id === "next_week"));

  // Rice and chicken curry for two: it was cooked anyway and keeps three days.
  const shared = weekOf(HOME, { eaters: ["m1", "m2"], lunches: Array(7).fill(RICE_CURRY) });
  const t = takeTwo({ week: shared, person: HOME_COOK, entry: outLunch(900) });
  assert.equal(t.meal.kind, "leftovers");
  const pack = t.meal.options.find((o) => o.recommended);
  assert.match(pack.id, /^pack:[2-4]:/);
  assert.equal(pack.effect.swaps[0].memberId, "m1");

  // Phulka and bhurji are cooked fresh and don't keep.
  const fresh2 = weekOf(HOME, { eaters: ["m1", "m2"], lunches: Array(7).fill(["phulka", "paneer_bhurji"]) });
  const t2 = takeTwo({ week: fresh2, person: HOME_COOK, entry: outLunch(900) });
  assert.equal(t2.meal.kind, "keeps");
  assert.equal(t2.meal.options.length, 1);
});

test("a spare batch box goes to a later meal before its use-by, or the freezer", () => {
  const week = weekOf(HOME, { lunches: Array(7).fill(RICE_CURRY) });
  for (const d of [1, 2, 3]) week.cells[`${d}:lunch`].shared.batch = "A";
  const batches = [{ id: "A", slot: "lunch", dishes: RICE_CURRY.map((key) => ({ key })), eaters: ["m1"], cells: ["1:lunch", "2:lunch", "3:lunch"], boxes: 3, cookDay: 0 }];
  const t = takeTwo({ week, batches, person: HOME_COOK, entry: outLunch(900) });
  assert.equal(t.meal.kind, "box");
  const box = t.meal.options.filter((o) => o.id.startsWith("box:"));
  assert.ok(box.length >= 1);
  for (const o of box) {
    const [d] = o.id.slice(4).split(":").map(Number);
    assert.ok(d > 1 && d <= 3, "before the use-by (cooked Monday, keeps three days)");
    assert.ok(!["2:lunch", "3:lunch"].includes(o.id.slice(4)), "not into another box of the same batch");
  }
  assert.ok(t.meal.options.some((o) => o.id === "freeze"));
});

test("adjustments merge what was picked, and an undone one is gone", () => {
  const entry = outLunch(900);
  const a = adjustmentFrom({
    entry,
    numbers: { id: "spread", title: "Spread it", effect: { shift: { 2: { kcal: -100 } } } },
    meal: { id: "next_week", title: "Move it to next week", effect: { carry: [{ dishes: [{ key: "dal_tadka" }] }] } },
  });
  assert.equal(a.title, "Spread it · Move it to next week");
  const b = { ...a, id: "b", effect: { shift: { 2: { kcal: -50 } } } };
  assert.equal(activeEffects([a, b]).shift[2].kcal, -150);
  assert.equal(activeEffects([a, { ...b, undone: true }]).shift[2].kcal, -100);
  assert.equal(activeEffects([{ ...a, undone: true }]).carry.length, 0);
});

test("a day outside the week's plan can only be left", () => {
  const t = takeTwo({ week: weekOf(), person: HOME_COOK, entry: { ...outLunch(900), eaten_on: "2026-11-20" } });
  assert.equal(t.inWeek, false);
  assert.deepEqual(t.numbers.map((o) => o.id), ["leave"]);
});
