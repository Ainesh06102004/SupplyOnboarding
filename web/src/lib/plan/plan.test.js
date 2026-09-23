import { test } from "node:test";
import assert from "node:assert/strict";

import { GOAL_CARDS, applyCard, cardFor, goalShortLabel } from "./goalCards";
import { RESTRICTION_CHIPS, chipOn, toggleChip, avoidsFromWords, cyclePill, DIET_PILLS } from "./restrictions";
import { projection, dailyFigures, KCAL_PER_KG } from "./projection";
import { enrichBasket, peopleOf, weekBoard, proteinSources, slotsFor, noteLines, SLOTS, categoriesFrom } from "./planView";
import { newRun, reduceRun, lineFor } from "./runSteps";
import { readFavourites } from "./favourites";
import { NODES, nodeInfo } from "@/lib/food/taxonomy";

const adult = { age_band: "adult_19_59", sex: "male", activity_level: "moderate", age_years: "30", weight_kg: "92", height_cm: "175", diet_type: "vegetarian", energy_goal: "lose", eating_pattern: "balanced", avoids: [] };

// ── goal cards ────────────────────────────────────────────────────────────
test("a goal card sets the profile's energy goal and pattern, and keeps keto when it says nothing about it", () => {
  assert.deepEqual(applyCard({ ...adult, eating_pattern: "keto" }, "lose"), { energy_goal: "lose", eating_pattern: "keto" });
  assert.deepEqual(applyCard(adult, "muscle"), { energy_goal: "gain", eating_pattern: "high_protein" });
  assert.deepEqual(applyCard(adult, "recomp"), { energy_goal: "maintain", eating_pattern: "high_protein" });
  assert.deepEqual(applyCard({ ...adult, eating_pattern: "high_protein" }, "maintain"), { energy_goal: "maintain", eating_pattern: "balanced" });
});

test("goals are for adults: a child gets no card and no goal", () => {
  const child = { ...adult, age_band: "child_7_9" };
  assert.equal(applyCard(child, "lose"), null);
  assert.equal(cardFor(child).card, null);
  assert.equal(goalShortLabel(child), "Child");
});

test("every profile goal reads back as a card", () => {
  for (const card of GOAL_CARDS) {
    const patch = applyCard(adult, card.key);
    assert.equal(cardFor({ ...adult, ...patch }).card.key, card.key);
  }
  assert.equal(cardFor({ ...adult, energy_goal: "lose", eating_pattern: "keto" }).extra, "Keto");
});

// ── restrictions ──────────────────────────────────────────────────────────
test("the nut chip is two allergies, and tapping it again takes both off", () => {
  const nuts = RESTRICTION_CHIPS.find((c) => c.key === "nuts");
  const on = toggleChip(nuts, adult);
  assert.deepEqual(on.avoids.map((a) => [a.key, a.severity]), [["peanuts", "allergy"], ["tree_nuts", "allergy"]]);
  assert.equal(chipOn(nuts, { ...adult, ...on }), true);
  assert.deepEqual(toggleChip(nuts, { ...adult, ...on }).avoids, []);
});

test("Jain is a diet, and off again the household is still vegetarian", () => {
  const jain = RESTRICTION_CHIPS.find((c) => c.key === "jain");
  assert.equal(toggleChip(jain, adult).diet_type, "jain");
  assert.equal(toggleChip(jain, { ...adult, diet_type: "jain" }).diet_type, "vegetarian");
});

test("there is no Low-GI or diabetic chip: KOI has no GI data and makes no disease claims", () => {
  assert.equal(RESTRICTION_CHIPS.some((c) => /gi|diabet/i.test(c.label)), false);
});

test("avoid words become keys KOI enforces; a word it cannot enforce is said, not guessed", () => {
  const read = avoidsFromWords("brinjal, peanuts and lehsun");
  assert.deepEqual(read.avoids.map((a) => a.key).sort(), ["onion_garlic", "peanuts"]);
  assert.deepEqual(read.unknown, ["brinjal"]);
});

test("a diet the pill does not cycle still shows its name", () => {
  assert.equal(cyclePill(DIET_PILLS, "jain").label, "Jain");
  assert.equal(cyclePill(DIET_PILLS, "vegan").next, "vegetarian");
});

// ── projection ────────────────────────────────────────────────────────────
test("the journey is energy-balance arithmetic on the member's own maintenance", () => {
  const p = projection({ ...adult, target_weight_kg: "82" }, { today: new Date("2026-09-23T00:00:00Z") });
  assert.ok(p);
  assert.equal(p.direction, "down");
  assert.equal(p.kgPerWeek, Math.round(((p.gap * 7) / KCAL_PER_KG) * 100) / 100);
  assert.equal(p.weeks, Math.ceil(10 / p.kgPerWeek));
  assert.equal(p.points.at(-1).kg, 82);
  assert.match(p.assumption, /not a prediction/);
  assert.match(p.reachDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("no journey without the member's own numbers, and none for a child", () => {
  assert.equal(projection({ ...adult, height_cm: "" }), null);
  assert.equal(projection({ ...adult, age_band: "teen_16_18", age_years: "" }), null);
});

test("a target the other way from the goal is said, not drawn", () => {
  const p = projection({ ...adult, target_weight_kg: "100" });
  assert.equal(p.weeks, null);
  assert.match(p.note, /above your weight/);
});

test("a stated target wins over the suggestion", () => {
  assert.equal(dailyFigures({ ...adult, target_kcal: "2100" }).kcal, 2100);
  assert.equal(dailyFigures({ ...adult, target_kcal: "2100" }).kcalStated, true);
});

// ── plan view ─────────────────────────────────────────────────────────────
const report = {
  basket: [
    { skuId: "s1", name: "Oats", packs: 2, packSize: "500 g", cost: 300, shares: { m1: 1 }, supplies: { kcal: 3800, protein: 130, carbs: 600, fat: 70 } },
    { skuId: "s2", name: "Mystery", packs: 1, packSize: null, cost: 50, shares: { m1: 1 }, supplies: { kcal: null, protein: null, carbs: null, fat: null } },
  ],
  cost: 350,
  perMember: [{ id: "m1", label: "Me", goal: {}, asked: { kcal: 14000, protein: 700 }, achieved: { kcal: 13300, protein: 700 }, shortfall: { kcal: 700 }, excess: {} }],
  whoEatsWhat: [{ member: "m1", label: "Me", allowed: [{ skuId: "s1", name: "Oats", packs: 2, amount: 1000, unit: "g", notVerifiedFor: [] }], notForThem: [] }],
  summary: { products: 2, packs: 3, days: 7, everyTargetMet: false },
};

test("basket lines are joined to the product they are, and a missing brand or price stays missing", () => {
  const lines = enrichBasket(report.basket, [{ skuId: "s1", brand: "KOI", image: { hero: "/x.jpg" }, price: 150, weight: "500 g", categoryKey: null }]);
  assert.equal(lines[0].brand, "KOI");
  assert.equal(lines[0].image, "/x.jpg");
  assert.equal(lines[1].product, null);
  assert.equal(lines[1].price, null);
});

test("people are shown per day, and a shortfall per day", () => {
  const [me] = peopleOf(report, 7);
  assert.deepEqual(me.perDay, { kcal: 1900, protein: 100 });
  assert.deepEqual(me.target, { kcal: 2000, protein: 100 });
  assert.equal(me.coverage.kcal, 95);
  assert.deepEqual(me.short, [{ nutrient: "kcal", perDay: 100 }]);
  assert.equal(me.met, false);
});

test("protein sources come from label figures only", () => {
  const sources = proteinSources(enrichBasket(report.basket, []), 7);
  assert.deepEqual(sources.map((s) => [s.name, s.perDay, s.share]), [["Oats", 19, 100]]);
});

test("the week board puts a product in the slot its shelf serves, per person per day", () => {
  const board = weekBoard(report, enrichBasket(report.basket, []), 7);
  assert.deepEqual(board.people, [{ id: "m1", label: "Me" }]);
  const anytime = board.rows.find((r) => r.key === "anytime");
  assert.equal(anytime.cells.m1[0].perDay, 143);
});

test("a drink shelf goes in Drinks", () => {
  const drink = Object.keys(NODES).find((k) => nodeInfo(k)?.role === "drink");
  if (drink) assert.equal(slotsFor(drink).slot, "drinks");
  assert.equal(slotsFor(null).slot, "anytime");
  assert.ok(SLOTS.every((s) => typeof s.label === "string"));
});

test("categories are the storefront's shelves, once each", () => {
  const key = Object.keys(NODES).find((k) => k.includes("."));
  const cats = categoriesFrom([{ categoryKey: key }, { categoryKey: key }, { categoryKey: null }]);
  assert.equal(cats.length, 1);
});

test("note lines say what was given up and never invent a figure", () => {
  const notes = noteLines({ days: 7, explanation: { reached: "as_asked", gave_up: null, never_relaxed: ["allergens"], unmet: [], products_refused: [], products_not_plannable: [] } });
  assert.match(notes[0].text, /nothing was given up/);
  assert.equal(noteLines({}).length, 0);
});

// ── run steps ─────────────────────────────────────────────────────────────
test("a streamed run becomes timeline lines, updated in place", () => {
  let run = newRun("plan");
  run = reduceRun(run, { type: "hello" });
  run = reduceRun(run, { type: "step", stage: "household", status: "done", members: 3, avoids: 2, days: 7, budget: 4000 });
  run = reduceRun(run, { type: "step", stage: "rung", step: "as_asked", status: "running" });
  run = reduceRun(run, { type: "step", stage: "rung", step: "as_asked", status: "built", candidates: 40, excluded: { refused: 3 } });
  assert.equal(run.lines.length, 2);
  assert.match(run.lines[1].detail, /40 products in play · 3 no one here can eat/);
  run = reduceRun(run, { type: "step", stage: "rung", step: "as_asked", status: "solved", usable: true, ms: 420 });
  run = reduceRun(run, { type: "draft", stage: "draft", basket: [{ skuId: "a" }], cost: 1234, everyTargetMet: true });
  assert.equal(run.draft.basket.length, 1);
  assert.equal(run.lines.find((l) => l.id === "draft").detail, "1 product · ₹1,234");
  run = reduceRun(run, { type: "result", payload: { planId: "p" } });
  assert.equal(run.done, true);
  assert.equal(run.result.planId, "p");
  assert.ok(run.lines.every((l) => l.state !== "running"));
});

test("an unknown event is not a line", () => {
  assert.equal(lineFor({ stage: "who-knows" }), null);
});

// ── favourites ────────────────────────────────────────────────────────────
test("favourite words become shelves KOI stocks; others are said, not guessed", () => {
  const read = readFavourites("dry fruit, zzqx", ["nuts_seeds.dried_fruit"]);
  assert.deepEqual(read.matched.map((m) => m.key), ["nuts_seeds.dried_fruit"]);
  assert.deepEqual(read.unknown, ["zzqx"]);
  const none = readFavourites("dry fruit", []);
  assert.equal(none.notStocked.length, 1);
});
