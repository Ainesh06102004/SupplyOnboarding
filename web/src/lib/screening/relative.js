// ============================================================================
// KOI SCREENING — A product in context: its category, compared
//
// Plan §11.2. Pure. The absolute KOI score is category-blind: honey scores low
// because honey is sugar. Comparing honey with honey is more informative, so
// this places a product among the Indian products Open Food Facts lists in its
// category — on the four conditions §11.2 sets, all of them enforced here:
//
//   1. Never a bare number. The line says what it is compared with: "Less
//      sugar per 100 g than 81% of 85 biscuits & cookies on Open Food Facts".
//   2. Never a percentile against KOI's own shelf, and never from fewer than
//      RELATIVE.minSample products (engine.category_reference).
//   3. Attribution travels with the sentence (`attribution`).
//   4. Two numbers, and this one never touches safety. Nothing here changes a
//      score, an eligibility decision, an allergen or a claim; the reference
//      version and date are returned with every result.
//
// The legal frame: a relative statement is a comparative claim under the FSS
// (Advertising and Claims) Regulations, 2018, so a comparison is made only
// when the product is at least 25% away from the category's middle product —
// the same threshold substitution edges use.
//
// FOUNDER DECISION, 17 September 2026 (plan §11.2): one wording, and
// favourable lines only, because several cues on one page confuse. So a
// product shows at most ONE line — its most favourable nutrient comparison:
// less sugar, saturated fat or sodium, or more protein or fibre — and nothing
// when it has none. That is a selection by design, recorded as such.
// ============================================================================

import { toPer100 } from "@/lib/nutrition/basis";
import { nutritionScore } from "./score";
import { nodeInfo } from "@/lib/food/taxonomy";

export const RELATIVE = Object.freeze({
  minSample: 30,
  minRelativeDiff: 0.25,
  referencePrefix: "off-ref",
});

/** The measures a line can be about, and which direction is the favourable one. */
export const MEASURES = Object.freeze([
  { metric: "sugars_g", word: "sugar", unit: "g", minAbs: 1, favourable: "less" },
  { metric: "saturated_fat_g", word: "saturated fat", unit: "g", minAbs: 1, favourable: "less" },
  { metric: "sodium_mg", word: "sodium", unit: "mg", minAbs: 20, favourable: "less" },
  { metric: "protein_g", word: "protein", unit: "g", minAbs: 1, favourable: "more" },
  { metric: "fibre_g", word: "fibre", unit: "g", minAbs: 1, favourable: "more" },
]);

/** Every measure the reference is built for. */
export const REFERENCE_METRICS = Object.freeze(["nutrition_rating", ...MEASURES.map((m) => m.metric), "energy_kcal"]);

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/**
 * KOI's nutrition rating (lib/screening/score.js) on per-100 figures alone.
 * The serving size is set aside on both sides: Open Food Facts rows rarely
 * carry one, and a pack's own serving must not make it look better than a
 * reference product rated without.
 *
 * @param {object} row a sku_nutrition-shaped row
 * @returns {number|null}
 */
export function nutritionRating(row) {
  return nutritionScore({ ...row, serving_size: null, portion_reference: null }).score;
}

/**
 * The 0th..100th percentile of a set of values (linear interpolation).
 * @param {number[]} values
 * @returns {number[]|null} 101 cut points, or null with no values
 */
export function quantileCuts(values) {
  const sorted = values.filter(isNum).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return Array.from({ length: 101 }, (_, i) => {
    const at = (i / 100) * (sorted.length - 1);
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo)) * 1000) / 1000;
  });
}

/**
 * Share of the reference strictly below and strictly above a value, as whole
 * percentages, read off the 101 cut points by interpolation. Ties count on
 * neither side: with 30% of biscuits declaring 0 g fibre, a biscuit with 0 g
 * has more fibre than 0% of them and less than 70%.
 *
 * @param {number} value
 * @param {number[]} cuts 101 cut points
 * @returns {{ below: number, above: number }}
 */
export function positionIn(value, cuts) {
  const v = Number(value);
  const c = cuts.map(Number);
  const last = c.length - 1;
  // Percentile rank at the first cut >= v (for "below") and the last cut <= v (for "above").
  const rankFrom = (i, j) => (i < 0 ? 0 : j > last ? last : c[j] === c[i] ? i : i + (v - c[i]) / (c[j] - c[i]));
  const firstAtLeast = c.findIndex((x) => x >= v);
  const below = firstAtLeast === -1 ? last : firstAtLeast === 0 ? 0 : rankFrom(firstAtLeast - 1, firstAtLeast);
  let lastAtMost = -1;
  for (let i = 0; i <= last; i++) if (c[i] <= v) lastAtMost = i;
  const atOrBelow = lastAtMost === -1 ? 0 : lastAtMost === last ? last : c[lastAtMost] === v ? lastAtMost : rankFrom(lastAtMost, lastAtMost + 1);
  const scale = 100 / last;
  return { below: Math.round(below * scale), above: Math.round((last - atOrBelow) * scale) };
}

/**
 * The reference rows to compare with: the product's own category if it has
 * enough products, else its aisle. Rows are grouped by node, then metric.
 *
 * @param {string|null} categoryKey
 * @param {Array} rows engine.category_reference rows (one version)
 * @returns {{ nodeKey: string, byMetric: Map }|null}
 */
export function referenceFor(categoryKey, rows = []) {
  if (!categoryKey) return null;
  const candidates = [categoryKey, categoryKey.split(".")[0]];
  for (const nodeKey of [...new Set(candidates)]) {
    const byMetric = new Map(rows.filter((r) => r.node_key === nodeKey && Number(r.n) >= RELATIVE.minSample).map((r) => [r.metric, r]));
    if (byMetric.size) return { nodeKey, byMetric };
  }
  return null;
}

/**
 * The product in context: its one most favourable comparison, or null.
 *
 * @param {object} input
 * @param {object} input.product storefront product (skuId, name, categoryKey)
 * @param {object} input.row its nutrition row (rowFromProduct)
 * @param {Array} input.references engine.category_reference rows for one version
 * @returns {{ category, line: { metric, percent, n, text }, attribution, note }|null}
 */
export function inContext({ product, row, references = [] }) {
  const ref = referenceFor(product?.categoryKey ?? null, references);
  if (!ref) return null;
  const any = ref.byMetric.values().next().value;
  const per100 = toPer100(row);
  if (!per100.unit || per100.unit !== any.unit) return null;

  const info = nodeInfo(ref.nodeKey);
  const label = String(info?.subcategory ?? info?.label ?? ref.nodeKey).toLowerCase();

  // Every favourable comparison at 25% or more from the middle product; the one line shown is the strongest.
  const favourable = [];
  for (const m of MEASURES) {
    const r = ref.byMetric.get(m.metric);
    const value = per100[m.metric];
    if (!r || !isNum(value)) continue;
    const middle = Number(r.cuts[50]);
    const diff = Number(value) - middle;
    const direction = diff < 0 ? "less" : "more";
    if (direction !== m.favourable || Math.abs(diff) < m.minAbs) continue;
    if (middle > 0 ? Math.abs(diff) / middle < RELATIVE.minRelativeDiff : Number(value) <= 0) continue;
    const { below, above } = positionIn(value, r.cuts);
    const percent = direction === "less" ? above : below;
    favourable.push({
      metric: m.metric,
      percent,
      n: Number(r.n),
      // "on Open Food Facts", not "sold in India": volunteer listings, not the market.
      text: `${direction === "less" ? "Less" : "More"} ${m.word} per 100 ${per100.unit} than ${percent}% of ${r.n} ${label} on Open Food Facts.`,
    });
  }
  if (!favourable.length) return null;
  const line = favourable.sort((a, b) => b.percent - a.percent || b.n - a.n)[0];

  return {
    category: { key: ref.nodeKey, label, referenceVersion: any.reference_version, builtAt: any.built_at, dataThrough: any.off_data_through ?? null },
    line,
    attribution: `Compared with Open Food Facts' Indian listings (© Open Food Facts contributors, ODbL), reference ${any.reference_version}.`,
    note: "A comparison, not a score: the KOI score above is unchanged by it.",
  };
}
