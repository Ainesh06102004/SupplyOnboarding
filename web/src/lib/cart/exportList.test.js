import { test } from "node:test";
import assert from "node:assert/strict";

import { exportList, shelfLine } from "./exportList";

const oats = { name: "Rolled Oats", weight: "1 kg", brand: "True Elements", quantity: 2, fromPlan: 2 };
const dal = { name: "Moong Dal", weight: "1 kg", brand: "Tata Sampann", quantity: 3, fromPlan: 1 };
const yogurt = { name: "Greek Yogurt", weight: "400 g", brand: "Unknown", quantity: 1, fromPlan: 0, addedFrom: "pantry" };
const plan = { planId: "p1", fresh: ["Onion", "Tomato"], kitchen: ["Salt", "Turmeric"] };
const NOW = Date.UTC(2026, 9, 23, 6);

test("a shelf line names the pack, its size and brand, and how many", () => {
  assert.equal(shelfLine(oats), "Rolled Oats, 1 kg (True Elements) × 2");
  assert.equal(shelfLine(yogurt), "Greek Yogurt, 400 g × 1");
});

test("the list keeps the plan's packs apart from what the shopper added, extra packs included", () => {
  const out = exportList({ planLines: [oats, dal], ownLines: [yogurt], plan }, { now: NOW });
  assert.deepEqual(out.sections.map((s) => s.title), ["From this week's plan", "You added", "Fresh, for the week", "Check your kitchen for"]);
  assert.deepEqual(out.sections[0].items, ["Rolled Oats, 1 kg (True Elements) × 2", "Moong Dal, 1 kg (Tata Sampann) × 1"]);
  assert.deepEqual(out.sections[1].items, ["Greek Yogurt, 400 g × 1", "Moong Dal, 1 kg (Tata Sampann) × 2"]);
  assert.match(out.text, /☐ Onion/);
  assert.match(out.text, /Salt · Turmeric/);
  assert.equal(out.count, 6);
});

test("fresh food can be left off, and a cart with no plan has no fresh list", () => {
  assert.deepEqual(exportList({ planLines: [oats], ownLines: [], plan }, { fresh: false }).sections.map((s) => s.title), ["From this week's plan"]);
  assert.deepEqual(exportList({ planLines: [], ownLines: [yogurt], plan: null }).sections.map((s) => s.title), ["In your cart"]);
});
