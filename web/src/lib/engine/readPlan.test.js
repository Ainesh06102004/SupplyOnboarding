// ============================================================================
// KOI — tests for what label reading reads and what it costs
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { costOf, photosToRead, offSecondOpinion, PRICES } from "@/lib/engine/readPlan.js";

const img = (asin, sha, kind, w = 1000, h = 1000) => ({ id: `${asin}-${sha}`, asin, sha256: sha, kind, width: w, height: h });

test("cost follows list prices, cached input at its own rate, and the batch halves it", () => {
  const usage = { prompt_tokens: 3000, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens: 500 };
  const p = PRICES["gpt-5.4-mini"];
  const live = (2000 * p.in + 1000 * p.cachedIn + 500 * p.out) / 1e6;
  assert.equal(costOf(usage, "gpt-5.4-mini-2026-03-17"), live);
  assert.equal(costOf(usage, "gpt-5.4-mini-2026-03-17", { batch: true }), live / 2);
  assert.equal(costOf(usage, "some-unknown-model"), null);
  assert.equal(costOf(null, "gpt-4.1-mini"), null);
});

test("a photo with both panels is read instead of two single-panel photos, the sharpest one", () => {
  const picks = photosToRead([
    img("A", "n1", "nutrition"), img("A", "i1", "ingredients"),
    img("A", "l1", "label", 800, 800), img("A", "l2", "label", 1500, 1500), img("A", "f", "front"),
  ]);
  assert.deepEqual(picks.map((p) => p.sha256), ["l2"]);
});

test("without a both-panels photo, one of each panel is read, and only what's still missing", () => {
  const images = [img("B", "n1", "nutrition", 500, 500), img("B", "n2", "nutrition", 900, 900), img("B", "i1", "ingredients")];
  assert.deepEqual(photosToRead(images).map((p) => p.sha256).sort(), ["i1", "n2"]);
  const has = new Map([["B", { nutrition: true, ingredients: false }]]);
  assert.deepEqual(photosToRead(images, { has }).map((p) => p.sha256), ["i1"]);
  const done = new Map([["B", { nutrition: true, ingredients: true }]]);
  assert.deepEqual(photosToRead(images, { has: done }), []);
});

test("a photo already read, or shared by two listings, is read once", () => {
  const images = [img("C", "same", "label"), img("D", "same", "label"), img("E", "old", "label")];
  const picks = photosToRead(images, { read: new Set(["old"]) });
  assert.deepEqual(picks.map((p) => p.sha256), ["same"]);
});

const reading = (values, basis = "per_100g") => ({ basis, serving_size: "40 g", values });
const off = { energy_kcal: 400, protein_g: 30, carbs_g: 40, total_fat_g: 12, sugars_g: 5 };

test("Open Food Facts agrees only with enough figures, energy and protein among them", () => {
  assert.equal(offSecondOpinion(reading({ energy_kcal: 402, protein_g: 30.5, carbs_g: 41, total_fat_g: 12 }), off).agrees, true);
  // Three figures is not enough.
  assert.equal(offSecondOpinion(reading({ energy_kcal: 400, protein_g: 30, total_fat_g: 12 }), off).agrees, false);
  // Four figures but no protein.
  assert.equal(offSecondOpinion(reading({ energy_kcal: 400, carbs_g: 40, total_fat_g: 12, sugars_g: 5 }), off).agrees, false);
});

test("one figure out of tolerance, or nothing to compare, is not agreed", () => {
  const r = offSecondOpinion(reading({ energy_kcal: 400, protein_g: 20, carbs_g: 40, total_fat_g: 12 }), off);
  assert.equal(r.agrees, false);
  assert.match(r.why, /protein_g/);
  assert.equal(offSecondOpinion(reading({ energy_kcal: 400 }), null).agrees, false);
  assert.equal(offSecondOpinion(null, off).agrees, false);
});

test("a per-serving reading is converted before it is compared", () => {
  // 40 g serving: 160 kcal and 12 g protein per serving is 400 kcal and 30 g per 100 g.
  const r = offSecondOpinion(reading({ energy_kcal: 160, protein_g: 12, carbs_g: 16, total_fat_g: 4.8 }, "per_serving"), off);
  assert.equal(r.agrees, true, r.why);
});
