// ============================================================================
// KOI — Nutrient claims
// The one place KOI decides whether a product may be called high in protein,
// high in fibre, low in sugar or sugar free, and the one place brand copy is
// checked before KOI repeats it.
//
// WHY THIS IS REGULATED, NOT STYLISTIC:
// These are nutrient-content claims under the Food Safety and Standards
// (Advertising and Claims) Regulations, 2018, Schedule I, and those regulations
// treat an e-commerce platform as a marketer. A badge, a shelf title, a search
// chip and a reason line are all KOI making the claim. Each used to carry its
// own threshold — fibre at 5 g where Schedule I says 6, "low sugar" at 4 g for
// solids and liquids alike where a drink must be at or under 2.5 g per 100 ml,
// and "Lower sugar", a COMPARATIVE claim that needs a named reference food.
//
// The thresholds (Schedule I):
//   high fibre   >= 6 g per 100 g, or >= 3 g per 100 kcal
//   low sugar    <= 5 g per 100 g (solids), <= 2.5 g per 100 ml (liquids)
//   sugar free   <= 0.5 g per 100 g or 100 ml
//   high protein Schedule I asks for 20% of the ICMR RDA per 100 g (10% per
//                100 ml or per 100 kcal). KOI keeps its own stricter rule —
//                THRESHOLDS.proteinHigh per 100 AND proteinPerServingFloor in a
//                real serving — because density alone put the badge on a 0.1 g
//                pinch of saffron. Stricter is permitted; looser is not.
//
// Every test here refuses rather than guesses. No basis, no serving, or no
// figure means no claim — built on basis.js, which never converts g to ml.
//
// Also here, because it is the same question asked of words instead of
// numbers: Regulation 10 prohibits claims that a food suits, prevents or treats
// a disease or physiological condition, the word "healthy", and implied
// professional endorsement. Brand-submitted claims and reviewer notes pass
// through `guardClaims` / `isClaimSafeText` before the storefront shows them.
// ============================================================================

import { THRESHOLDS } from "@/lib/recommendation/config";
import { extractFacts } from "@/lib/recommendation/productFacts";
import { isNum } from "@/lib/recommendation/scoringEngine";
import { toPer100, toPerServing } from "./basis";

export const SCHEDULE_I = Object.freeze({
  highFibre: Object.freeze({ per100g: 6, per100kcal: 3 }),
  lowSugar: Object.freeze({ solid: 5, liquid: 2.5 }),
  sugarFree: 0.5,
});

/** True when a per-100 figure is declared and satisfies `test`. */
const holds = (value, test) => isNum(value) && test(Number(value));

/**
 * @param {object} row a `sku_nutrition`-shaped row (see rowFromFacts)
 * @returns {boolean}
 */
export function isHighFibre(row) {
  const p = toPer100(row);
  if (p.unit === "g" && holds(p.fibre_g, (v) => v >= SCHEDULE_I.highFibre.per100g)) return true;
  // The energy route is unit-free, so it serves liquids too.
  return isNum(p.fibre_g) && isNum(p.energy_kcal) && Number(p.energy_kcal) > 0
    && (Number(p.fibre_g) / Number(p.energy_kcal)) * 100 >= SCHEDULE_I.highFibre.per100kcal;
}

/** @param {object} row @returns {boolean} */
export function isLowSugar(row) {
  const p = toPer100(row);
  const limit = p.unit === "g" ? SCHEDULE_I.lowSugar.solid : p.unit === "ml" ? SCHEDULE_I.lowSugar.liquid : null;
  return limit !== null && holds(p.sugars_g, (v) => v <= limit);
}

/** @param {object} row @returns {boolean} */
export function isSugarFree(row) {
  const p = toPer100(row);
  return p.unit !== null && holds(p.sugars_g, (v) => v <= SCHEDULE_I.sugarFree);
}

/** @param {object} row @returns {boolean} */
export function isHighProtein(row) {
  return holds(toPer100(row).protein_g, (v) => v >= THRESHOLDS.proteinHigh)
    && holds(toPerServing(row).protein_g, (v) => v >= THRESHOLDS.proteinPerServingFloor);
}

// ── Rows ────────────────────────────────────────────────────────────────────

/**
 * The `sku_nutrition` row shape these tests read, rebuilt from extractFacts
 * output. Every consumer that has facts rather than a database row goes through
 * this, so a claim cannot mean one thing on a shelf and another in search.
 *
 * @param {object} facts extractFacts() output
 * @returns {object}
 */
export function rowFromFacts(facts) {
  const m = facts?.macros || {};
  const p = facts?.product || {};
  return {
    measurement_basis: p.measurementBasis ?? null,
    serving_size: p.servingSize ?? null,
    energy_kcal: m.kcal ?? null,
    protein_g: m.protein ?? null,
    carbs_g: m.carbs ?? null,
    sugars_g: m.sugar ?? null,
    fibre_g: m.fibre ?? null,
    total_fat_g: m.fat ?? null,
    sodium_mg: m.sodium ?? null,
  };
}

/** Same, from a storefront product. */
export const rowFromProduct = (product) => rowFromFacts(extractFacts(product));

// ── Words ───────────────────────────────────────────────────────────────────

// Regulation 10: disease and physiological-condition claims, "healthy", and
// implied professional endorsement. Matched on whole words where a fragment
// would catch innocent text.
const PROHIBITED = Object.freeze([
  /immun/i, /diabet/i, /\bcures?\b/i, /\bheal(s|ing)?\b/i, /\bhealth(y|ier|iest)\b/i,
  /detox/i, /\bboost/i, /anti[- ]?inflamm/i, /cholesterol/i, /blood\s+(sugar|pressure)/i,
  /weight[- ]?loss/i, /fat[- ]?burn/i, /disease/i, /\bprevents?\b/i, /clinically/i,
  /(doctor|dietitian|nutritionist|expert)s?[- ]?(recommended|approved|backed)/i,
]);

// Brand wording for a claim these tests can settle from the declared figures.
const NUTRIENT_CLAIMS = Object.freeze([
  { pattern: /\bhigh[- ]?protein\b|\bprotein[- ]?rich\b|\brich in protein\b/i, test: isHighProtein },
  { pattern: /\bhigh[- ]?fib(re|er)\b|\bfib(re|er)[- ]?rich\b|\brich in fib(re|er)\b/i, test: isHighFibre },
  { pattern: /\blow[- ]?sugar\b/i, test: isLowSugar },
  { pattern: /\bsugar[- ]?free\b|\bzero sugar\b/i, test: isSugarFree },
]);

/** True when KOI may repeat this text: it carries no prohibited wording. */
export const isClaimSafeText = (text) => !PROHIBITED.some((re) => re.test(String(text || "")));

/**
 * The brand claims KOI may repeat for this product. Prohibited wording is
 * dropped outright; a nutrient claim survives only if the declared figures pass
 * the same test KOI applies to its own badges. Anything else — "No palm oil",
 * "Millet based" — is the brand's statement about its recipe and passes through
 * untouched until Phase 1 can check it against a verified label.
 *
 * @param {string[]} claims as submitted
 * @param {object} row the product's `sku_nutrition` row
 * @returns {string[]}
 */
export function guardClaims(claims, row) {
  return (Array.isArray(claims) ? claims : [])
    .filter((c) => typeof c === "string" && isClaimSafeText(c))
    .filter((c) => {
      const nutrient = NUTRIENT_CLAIMS.find((n) => n.pattern.test(c));
      return !nutrient || nutrient.test(row);
    });
}
