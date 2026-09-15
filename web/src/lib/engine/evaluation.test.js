// ============================================================================
// KOI ENGINE — tests for scoring the label reader against known labels
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { scoreCase, summarise, EVAL_THRESHOLDS } from "@/lib/engine/evaluation.js";
import { printedTable, labelSvg, wrap } from "@/lib/engine/eval/render.js";

const NUTRITION = {
  columns: ["per_100g", "per_serving"],
  serving: "30 g",
  per100: { protein_g: 9, carbs_g: 62, sugars_g: 2.1, fibre_g: 5.5, total_fat_g: 21, saturated_fat_g: 4.2, trans_fat_g: 0, sodium_mg: 640 },
};

const CASE = {
  id: "t",
  style: "clean",
  pack: { name: "Test Crisps & Co", brand: "Testwind", net: "60 g" },
  ingredients: "Jowar Flour, Groundnut Oil, Salt",
  allergenStatement: null,
  mayContain: null,
  nutrition: NUTRITION,
  truth: { contains: ["peanut"], mayContain: [] },
};

const printed = printedTable(NUTRITION);
const row = (basis, over = {}) => ({ measurement_basis: basis, ...printed[basis], ...over });

// ── The label ──────────────────────────────────────────────────────────────

test("the table's energy follows from its macros, and a serving scales from per 100", () => {
  assert.equal(printed.per_100g.energy_kcal, 473); // 4 × (9 + 62) + 9 × 21
  assert.equal(printed.per_serving.energy_kcal, 142);
  assert.equal(printed.per_serving.total_fat_g, 6.3);
  assert.equal(printed.per_serving.sodium_mg, 192);
});

test("a salt row replaces sodium, and kJ is printed only when asked", () => {
  const t = printedTable({ ...NUTRITION, columns: ["per_100g"], salt: true, energyKj: true });
  assert.equal(t.per_100g.sodium_mg, undefined);
  assert.equal(t.per_100g.salt_g, 1.6);
  assert.equal(t.per_100g.energy_kj, 1979);
  assert.equal(t.per_serving, undefined);
});

test("the SVG escapes what it prints and wraps long lists", () => {
  const svg = labelSvg(CASE);
  assert.match(svg, /Test Crisps &amp; Co/);
  assert.match(svg, /NUTRITIONAL INFORMATION/);
  assert.deepEqual(wrap("one two three four", 9), ["one two", "three", "four"]);
});

// ── Scoring ────────────────────────────────────────────────────────────────

test("a published list that leaves out an allergen the food contains is a miss", () => {
  const r = scoreCase(CASE, { ingredients: { allergens: [], may_contain: [] }, nutrition: null, blocked: [] });
  assert.deepEqual(r.allergenMisses, ["peanut"]);
});

test("declaring it as may-contain still warns the shopper, so it is not a miss", () => {
  const r = scoreCase(CASE, { ingredients: { allergens: ["gluten"], may_contain: ["peanut"] }, nutrition: null, blocked: [] });
  assert.deepEqual(r.allergenMisses, []);
  assert.deepEqual(r.falseAlarms, ["gluten"]);
});

test("a blocked ingredient group is never a miss: nothing was published", () => {
  const r = scoreCase(CASE, { ingredients: null, nutrition: null, blocked: [{ group: "ingredients" }] });
  assert.deepEqual(r.allergenMisses, []);
  assert.deepEqual(r.blocked, ["ingredients"]);
});

test("nutrition: a wrong number fails, a left-out figure is only omitted", () => {
  const r = scoreCase(CASE, { ingredients: null, nutrition: row("per_100g", { protein_g: 19, fibre_g: null }), blocked: [] });
  assert.equal(r.nutrition.find((f) => f.field === "protein_g").ok, false);
  const { metrics } = summarise([r]);
  assert.deepEqual(metrics.nutritionFields, { right: 7, wrong: 1, omitted: 1 });
});

test("figures published on a basis the label never printed are all wrong", () => {
  const perServingOnly = { ...CASE, nutrition: { ...NUTRITION, columns: ["per_serving"] } };
  const r = scoreCase(perServingOnly, { ingredients: null, nutrition: row("per_100g"), blocked: [] });
  assert.ok(r.nutrition.every((f) => !f.ok));
});

test("with a salt row, an invented sodium figure is wrong and none is right", () => {
  const salted = { ...CASE, nutrition: { ...NUTRITION, columns: ["per_100g"], salt: true } };
  const t = printedTable(salted.nutrition).per_100g;
  const honest = scoreCase(salted, { ingredients: null, nutrition: { measurement_basis: "per_100g", ...t, sodium_mg: null }, blocked: [] });
  const invented = scoreCase(salted, { ingredients: null, nutrition: { measurement_basis: "per_100g", ...t, sodium_mg: 640 }, blocked: [] });
  assert.equal(honest.nutrition.find((f) => f.field === "sodium_mg").ok, true);
  assert.equal(invented.nutrition.find((f) => f.field === "sodium_mg").ok, false);
});

test("the run passes only with no misses, no errors, accurate figures and enough coverage", () => {
  const good = scoreCase(CASE, { ingredients: { allergens: ["peanut"], may_contain: [] }, nutrition: row("per_100g"), blocked: [] });
  const blocked = scoreCase(CASE, { ingredients: null, nutrition: null, blocked: [{ group: "nutrition" }] });
  assert.equal(summarise([good, blocked]).passed, true);
  assert.equal(summarise([good, { id: "x", error: "timeout" }]).passed, false, "an error fails the run");
  assert.equal(summarise([blocked, blocked, good]).passed, false, `coverage below ${EVAL_THRESHOLDS.coverage}`);
  const missed = scoreCase(CASE, { ingredients: { allergens: [], may_contain: [] }, nutrition: row("per_100g"), blocked: [] });
  assert.equal(summarise([good, missed]).passed, false, "one allergen miss fails the run");
});
