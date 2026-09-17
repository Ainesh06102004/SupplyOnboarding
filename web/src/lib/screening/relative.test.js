// ============================================================================
// KOI SCREENING — tests for category-relative comparisons (plan §11.2)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { quantileCuts, positionIn, referenceFor, inContext, nutritionRating, RELATIVE } from "@/lib/screening/relative.js";

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const ref = (metric, values, patch = {}) => ({
  reference_version: "off-ref-2026-09-17",
  node_key: "snacks.biscuits_cookies",
  metric,
  unit: "g",
  n: values.length,
  cuts: quantileCuts(values),
  rubric_version: metric === "nutrition_rating" ? "koi-screen-v3" : null,
  built_at: "2026-09-17T10:00:00Z",
  off_data_through: "2026-09-16T00:00:00Z",
  ...patch,
});

// 101 biscuits: sugar 0..100 g per 100 g (middle 50), protein 0..20 g (middle 10).
const references = [
  ref("sugars_g", range(0, 100)),
  ref("protein_g", range(0, 100).map((v) => v / 5)),
  ref("nutrition_rating", range(0, 100)),
];
const biscuit = { skuId: "b", name: "Biscuit", categoryKey: "snacks.biscuits_cookies" };
const row = (patch) => ({ measurement_basis: "per_100g", sugars_g: 15, protein_g: 10, total_fat_g: 2, saturated_fat_g: 1, sodium_mg: 50, ...patch });

test("cut points and positions read the way a percentile should", () => {
  const cuts = quantileCuts(range(0, 100));
  assert.equal(cuts.length, 101);
  assert.equal(cuts[50], 50);
  assert.deepEqual(positionIn(20, cuts), { below: 20, above: 80 });
  assert.deepEqual(positionIn(20.5, cuts), { below: 21, above: 80 });
  assert.deepEqual(positionIn(-5, cuts), { below: 0, above: 100 });
  assert.deepEqual(positionIn(500, cuts), { below: 100, above: 0 });
  // 30% declare 0 g: a 0 g product is above none of them and has less than the other 70%
  // (101 cut points read that within a point).
  const fibre = quantileCuts([...Array(30).fill(0), ...range(1, 70)]);
  const zero = positionIn(0, fibre);
  assert.equal(zero.below, 0);
  assert.ok(Math.abs(zero.above - 70) <= 1, `about 70%, got ${zero.above}`);
  assert.equal(quantileCuts([]), null);
});

test("the one line names what it is compared with, and says it is a comparison", () => {
  const ctx = inContext({ product: biscuit, row: row({}), references });
  assert.equal(ctx.category.label, "biscuits & cookies");
  assert.deepEqual(ctx.line, { metric: "sugars_g", percent: 85, n: 101, text: "Less sugar per 100 g than 85% of 101 biscuits & cookies on Open Food Facts." });
  assert.doesNotMatch(JSON.stringify(ctx), /sold in India/, "volunteer listings are not the market");
  assert.match(ctx.attribution, /Open Food Facts.*ODbL.*off-ref-2026-09-17/);
  assert.match(ctx.note, /not a score/);
  assert.equal(ctx.category.referenceVersion, "off-ref-2026-09-17", "the reference is versioned and dated");
});

test("a difference under 25% of the middle product is not said at all", () => {
  const near = inContext({ product: biscuit, row: row({ sugars_g: 45, protein_g: 11 }), references });
  assert.equal(near, null, "45 g against a middle of 50 is 10% apart: no comparative claim");
});

test("favourable lines only (founder decision): an unfavourable product shows nothing", () => {
  const sweet = inContext({ product: biscuit, row: row({ sugars_g: 80, protein_g: 4 }), references });
  assert.equal(sweet, null, "more sugar and less protein than most: no line");
});

test("one wording: of several favourable comparisons, only the strongest is shown", () => {
  const ctx = inContext({ product: biscuit, row: row({ sugars_g: 30, protein_g: 18 }), references });
  assert.equal(ctx.line.text, "More protein per 100 g than 90% of 101 biscuits & cookies on Open Food Facts.", "protein at 90% beats sugar at 70%");
  assert.ok(!("rating" in ctx) && !("rank" in ctx), "no rating line and no shelf rank");
});

test("no percentile from too few products", () => {
  const small = references.map((r) => ({ ...r, n: RELATIVE.minSample - 1 }));
  assert.equal(referenceFor("snacks.biscuits_cookies", small), null);
  assert.equal(inContext({ product: biscuit, row: row({}), references: small }), null);
});

test("a category with too few falls back to its aisle, and units must match", () => {
  const aisle = references.map((r) => ({ ...r, node_key: "snacks" }));
  assert.equal(referenceFor("snacks.biscuits_cookies", aisle).nodeKey, "snacks");
  const drink = inContext({ product: biscuit, row: { measurement_basis: "per_100ml", sugars_g: 5, total_fat_g: 0 }, references });
  assert.equal(drink, null, "per 100 ml is not compared with per 100 g");
});

test("the nutrition rating ignores the serving on both sides", () => {
  const withServing = nutritionRating({ measurement_basis: "per_100g", sugars_g: 2, total_fat_g: 2, saturated_fat_g: 1, sodium_mg: 50, protein_g: 25, serving_size: "40 g" });
  const without = nutritionRating({ measurement_basis: "per_100g", sugars_g: 2, total_fat_g: 2, saturated_fat_g: 1, sodium_mg: 50, protein_g: 25 });
  assert.equal(withServing, without);
});
