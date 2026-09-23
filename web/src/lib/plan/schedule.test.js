import { test } from "node:test";
import assert from "node:assert/strict";

import { DISHES } from "@/lib/food/dishData";
import { dishFacts, dishFor, refusalsOf } from "@/lib/food/dishes";
import { buildWeek, alternativesFor, SLOT_KEYS } from "./schedule";

const dish = (key) => DISHES.find((d) => d.key === key);

// ── dishes, through the ingredient graph ──────────────────────────────────
test("a dish's allergens come from its lines, not from anything typed", () => {
  const dal = dishFacts(dish("dal_tadka"));
  assert.ok(dal.contains.includes("dairy"), "ghee is dairy");
  assert.ok(dal.flags.includes("allium"), "garlic and onion");
  assert.ok(dal.flags.includes("pulse"));
  assert.ok(dal.mayContain.includes("gluten"), "compounded hing");
  assert.deepEqual(dal.blends, ["Asafoetida"]);
});

test("chickpea is a pulse now, so besan chilla is not a fasting dish", () => {
  assert.ok(dishFacts(dish("besan_chilla")).flags.includes("pulse"));
  assert.equal(dishFor(dish("besan_chilla"), { diet_type: "fasting" }).ok, false);
});

test("a diet refuses what it excludes, in words", () => {
  const v = dishFor(dish("egg_bhurji"), { diet_type: "vegetarian" });
  assert.equal(v.ok, false);
  assert.match(v.because, /egg/);
  assert.equal(dishFor(dish("dal_tadka"), { diet_type: "jain" }).ok, false, "onion and garlic are root vegetables");
  assert.equal(dishFor(dish("jain_moong_dal"), { diet_type: "jain" }).ok, true);
});

test("an optional line is left out for someone who can't have it, not the whole dish", () => {
  const v = dishFor(dish("kanda_poha"), { diet_type: "vegetarian", avoids: [{ key: "peanuts", severity: "allergy" }] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.leaveOut, ["Peanut"]);
});

test("a may-contain refuses only an allergy; a blend is never verified free", () => {
  const coeliac = { diet_type: "vegetarian", avoids: [{ key: "gluten", severity: "allergy" }] };
  assert.equal(dishFor(dish("dal_tadka"), coeliac).ok, false, "hing may contain gluten");
  const intolerant = { diet_type: "vegetarian", avoids: [{ key: "gluten", severity: "intolerance" }] };
  assert.equal(dishFor(dish("dal_tadka"), intolerant).ok, true);
  const nuts = { diet_type: "non_vegetarian", avoids: [{ key: "peanuts", severity: "allergy" }] };
  assert.deepEqual(dishFor(dish("chana_masala"), nuts).notVerifiedFor, ["peanuts"]);
});

test("age safety holds for dishes: no whole nuts under five", () => {
  const toddler = { age_band: "child_1_3", diet_type: "vegetarian" };
  assert.equal(dishFor(dish("handful_nuts"), toddler).ok, false);
  assert.equal(dishFor(dish("handful_nuts"), { age_band: "adult_19_59", diet_type: "vegetarian" }).ok, true);
});

test("a dislike is said, never a refusal", () => {
  const r = refusalsOf({ avoids: [{ key: "caffeine", severity: "dislike" }] });
  assert.ok(r.soft.has("caffeine"));
  assert.equal(dishFor(dish("masala_chai"), { avoids: [{ key: "caffeine", severity: "dislike" }] }).ok, true);
});

// ── the week ──────────────────────────────────────────────────────────────
const lines = [
  { skuId: "rice", name: "Gorakhpur Kalanamak Rice", categoryKey: "staples.rice" },
  { skuId: "moong", name: "Split Moong Dal", categoryKey: "staples.pulses" },
  { skuId: "chana", name: "Kabuli Chana", categoryKey: "staples.pulses" },
  { skuId: "pb", name: "Natural Peanut Butter Crunch", categoryKey: "nuts_seeds.nut_butters" },
];
const people = [
  { memberId: "me", label: "Me", age_band: "adult_19_59", diet_type: "non_vegetarian", avoids: [] },
  { memberId: "wife", label: "Wife", age_band: "adult_19_59", diet_type: "vegetarian", avoids: [] },
  { memberId: "son", label: "Son", age_band: "child_7_9", diet_type: "vegetarian", avoids: [{ key: "peanuts", severity: "allergy" }] },
];
const allowed = (skus) => skus.map(([skuId, amount]) => ({ skuId, name: skuId, packs: 1, amount, unit: "g" }));
const report = {
  whoEatsWhat: [
    { member: "me", allowed: allowed([["rice", 1400], ["moong", 700], ["chana", 700], ["pb", 500]]) },
    { member: "wife", allowed: allowed([["rice", 1000], ["moong", 500], ["chana", 100], ["pb", 400]]) },
    { member: "son", allowed: allowed([["rice", 1200], ["moong", 400]]) },
  ],
};
const start = new Date("2026-09-23T06:00:00Z");

test("a week has every day and every slot, and lunch is a base with a main or one pot", () => {
  const week = buildWeek({ report, lines, people, days: 7, start });
  assert.equal(week.days.length, 7);
  assert.deepEqual(week.slots, SLOT_KEYS);
  const lunch = week.cells["0:lunch"];
  assert.ok(lunch.shared);
  const kinds = lunch.shared.dishes.map((x) => x.kind).sort();
  assert.ok(JSON.stringify(kinds) === JSON.stringify(["base", "main"]) || JSON.stringify(kinds) === JSON.stringify(["one_pot"]));
});

test("the dish needs its staple in the basket: no rajma when there are no kidney beans", () => {
  const week = buildWeek({ report, lines, people, days: 7, start });
  const served = Object.values(week.cells).flatMap((c) => [...(c.shared?.dishes ?? []), ...Object.values(c.own).flatMap((o) => o.dishes)]).map((x) => x.key);
  assert.ok(!served.includes("rajma"));
  assert.ok(served.includes("dal_tadka") || served.includes("moong_khichdi") || served.includes("jain_moong_dal"), "the moong is cooked");
});

test("nobody is served something they can't have", () => {
  const week = buildWeek({ report, lines, people, days: 7, start });
  for (const cell of Object.values(week.cells)) {
    for (const id of cell.shared?.eaters ?? []) {
      const person = people.find((p) => p.memberId === id);
      for (const x of cell.shared.dishes) assert.ok(dishFor(dish(x.key), person).ok, `${x.key} for ${id}`);
    }
  }
});

test("variety: the same main does not fill every lunch", () => {
  const week = buildWeek({ report, lines, people, days: 7, start });
  const mains = week.days.map((d) => week.cells[`${d.index}:lunch`].shared?.dishes.map((x) => x.key).join("+"));
  assert.ok(new Set(mains).size >= 3, mains.join(", "));
});

test("the planner's amounts are spread over the meals, never invented", () => {
  const week = buildWeek({ report, lines, people, days: 7, start });
  const rice = week.perServing("me", "rice");
  assert.ok(rice && rice.amount > 0 && rice.amount <= 1400);
  // Peanut butter goes in no dish: it stays on Me's plate as an addition.
  assert.ok(week.additions.me.some((a) => a.skuId === "pb"));
  assert.ok(!week.additions.son.some((a) => a.skuId === "pb"), "the son is not given peanut butter");
});

test("the shopper's own pick wins, and alternatives suit everyone at the table", () => {
  const week = buildWeek({ report, lines, people, days: 7, start, overrides: { "0:breakfast": { dishes: ["fruit_bowl"] } } });
  assert.deepEqual(week.cells["0:breakfast"].shared.dishes.map((x) => x.key), ["fruit_bowl"]);
  const alts = alternativesFor(week.cells["0:lunch"], people);
  assert.ok(alts.every((a) => people.filter((p) => week.cells["0:lunch"].shared.eaters.includes(p.memberId)).every((p) => dishFor(dish(a.key), p).ok)));
});

test("what the dishes need beyond the basket is listed, by kind", () => {
  const week = buildWeek({ report, lines, people, days: 7, start });
  assert.ok(week.alsoNeed.fresh.length > 0);
  assert.ok(week.alsoNeed.fresh.every((f) => f.dishes.length > 0 && f.meals > 0));
  assert.ok(!week.alsoNeed.fresh.some((f) => f.ingredient === "Lentils"), "the basket brings the dal");
});

test("someone who eats no meals at home is not at the table", () => {
  const away = people.map((p) => (p.memberId === "me" ? { ...p, meals_from_home: ["dinner"] } : p));
  const week = buildWeek({ report, lines, people: away, days: 3, start });
  assert.ok(!week.cells["0:lunch"].shared?.eaters.includes("me"));
  assert.ok(week.cells["0:dinner"].shared?.eaters.includes("me") || week.cells["0:dinner"].own.me);
});
