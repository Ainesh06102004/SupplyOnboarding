// ============================================================================
// KOI SCREENING — A product in context: its category, compared
//
// Plan §11.2. Pure. The absolute KOI score is category-blind: honey scores low
// because honey is sugar. Comparing honey with honey is more informative, so
// this places a product among the Indian products Open Food Facts lists in its
// category — on the four conditions §11.2 sets, all of them enforced here:
//
//   1. Never a bare number. Every line says what it is compared with: "above
//      82% of 728 biscuits & cookies sold in India", "#2 of 4 biscuits &
//      cookies KOI stocks".
//   2. Never a percentile against KOI's own shelf. Percentiles come from the
//      Open Food Facts reference (engine.category_reference), and only with
//      RELATIVE.minSample products in the category. KOI's own shelf gets an
//      ordinal rank, which is honest at any size.
//   3. Attribution travels with the sentence (`attribution`).
//   4. Two numbers, and this one never touches safety. Nothing here changes a
//      score, an eligibility decision, an allergen or a claim; the reference
//      version and date are returned with every result.
//
// And the legal frame: a relative statement is a comparative claim under the
// FSS (Advertising and Claims) Regulations, 2018, so a line is made only when
// the product is at least 25% away from the category's middle product — the
// same threshold substitution edges use. Lines are made in BOTH directions:
// a comparison that only ever reports good news is a selection, not a
// comparison. Whether to show the unfavourable ones is a founder decision
// (plan §15 item 11), and counsel confirms the wording (item 12); until then
// the storefront shows none of this (KOI_RELATIVE_SCORES).
// ============================================================================

import { toPer100 } from "@/lib/nutrition/basis";
import { nutritionScore, RUBRIC_VERSION } from "./score";
import { nodeInfo } from "@/lib/food/taxonomy";

export const RELATIVE = Object.freeze({
  minSample: 30,
  minRelativeDiff: 0.25,
  referencePrefix: "off-ref",
});

/** The measures phrased per nutrient: `lessIsLighter` says which way reads as "less". */
export const MEASURES = Object.freeze([
  { metric: "sugars_g", word: "sugar", unit: "g", minAbs: 1 },
  { metric: "saturated_fat_g", word: "saturated fat", unit: "g", minAbs: 1 },
  { metric: "sodium_mg", word: "sodium", unit: "mg", minAbs: 20 },
  { metric: "protein_g", word: "protein", unit: "g", minAbs: 1 },
  { metric: "fibre_g", word: "fibre", unit: "g", minAbs: 1 },
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
 * The product in context.
 *
 * @param {object} input
 * @param {object} input.product storefront product (skuId, name, score, categoryKey)
 * @param {object} input.row its nutrition row (rowFromProduct)
 * @param {Array} input.references engine.category_reference rows for one version
 * @param {Array} [input.stocked] storefront products, for the rank among KOI's own shelf
 * @returns {{ category, rating, nutrients, rank, attribution, note }|null}
 */
export function inContext({ product, row, references = [], stocked = [] }) {
  const categoryKey = product?.categoryKey ?? null;
  const ref = referenceFor(categoryKey, references);
  const out = { category: null, rating: null, nutrients: [], rank: null, attribution: null, note: null };

  if (ref) {
    const info = nodeInfo(ref.nodeKey);
    const label = String(info?.subcategory ?? info?.label ?? ref.nodeKey).toLowerCase();
    const any = ref.byMetric.values().next().value;
    out.category = {
      key: ref.nodeKey,
      label,
      referenceVersion: any.reference_version,
      builtAt: any.built_at,
      dataThrough: any.off_data_through ?? null,
    };
    const per100 = toPer100(row);
    const sameUnit = per100.unit && per100.unit === any.unit;

    if (sameUnit) {
      const ratingRef = ref.byMetric.get("nutrition_rating");
      const rating = nutritionRating(row);
      if (ratingRef && isNum(rating)) {
        const middle = Number(ratingRef.cuts[50]);
        const apart = middle > 0 ? Math.abs(rating - middle) / middle : 0;
        if (apart >= RELATIVE.minRelativeDiff) {
          const { below } = positionIn(rating, ratingRef.cuts);
          out.rating = {
            rating,
            percentile: below,
            n: Number(ratingRef.n),
            rubricVersion: ratingRef.rubric_version ?? RUBRIC_VERSION,
            text: `On KOI's nutrition rating, above ${below}% of ${ratingRef.n} ${label} sold in India.`,
          };
        }
      }

      for (const m of MEASURES) {
        const r = ref.byMetric.get(m.metric);
        const value = per100[m.metric];
        if (!r || !isNum(value)) continue;
        const middle = Number(r.cuts[50]);
        const diff = Number(value) - middle;
        if (Math.abs(diff) < m.minAbs) continue;
        if (middle > 0 ? Math.abs(diff) / middle < RELATIVE.minRelativeDiff : Number(value) <= 0) continue;
        const { below, above } = positionIn(value, r.cuts);
        out.nutrients.push(diff < 0
          ? { metric: m.metric, direction: "less", text: `Less ${m.word} per 100 ${per100.unit} than ${above}% of ${r.n} ${label}.` }
          : { metric: m.metric, direction: "more", text: `More ${m.word} per 100 ${per100.unit} than ${below}% of ${r.n} ${label}.` });
      }
    }
    out.attribution = `Compared with Open Food Facts' Indian listings (© Open Food Facts contributors, ODbL), reference ${out.category.referenceVersion}.`;
  }

  // KOI's own shelf: an ordinal, among scored products in the same category.
  if (categoryKey && isNum(product?.score)) {
    const shelf = stocked.filter((p) => p.categoryKey === categoryKey && isNum(p.score));
    if (shelf.length >= 2) {
      const ranked = [...shelf].sort((a, b) => Number(b.score) - Number(a.score));
      const position = ranked.findIndex((p) => String(p.skuId) === String(product.skuId)) + 1;
      if (position > 0) {
        const info = nodeInfo(categoryKey);
        const label = String(info?.subcategory ?? info?.label ?? categoryKey).toLowerCase();
        out.rank = { position, of: shelf.length, text: `#${position} of ${shelf.length} ${label} KOI stocks, by KOI score.` };
      }
    }
  }

  if (!out.rating && !out.nutrients.length && !out.rank) return null;
  out.note = "A comparison, not a score: the KOI score above is unchanged by it.";
  return out;
}
