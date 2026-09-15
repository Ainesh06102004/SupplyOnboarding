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
//                12 g per 100 AND 5 g in a real serving — because density
//                alone put the badge on a 0.1 g pinch of saffron. Stricter is
//                permitted; looser is not.
//
// Since Phase 2.2 these are DATA, not constants: food.claim_rule, in a
// versioned food.claim_rule_set, compiled into ./claimRules.js by
// scripts/buildClaimRules.mjs. The tests hold THRESHOLDS.proteinHigh,
// proteinPerServingFloor, fibreHigh and sugarLow to the same figures.
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

import { extractFacts } from "@/lib/recommendation/productFacts";
import { isNum } from "@/lib/recommendation/scoringEngine";
import { toPer100, toPerServing } from "./basis";
import { CLAIM_RULES, CLAIM_RULE_VERSION } from "./claimRules";

export { CLAIM_RULES, CLAIM_RULE_VERSION };

const thresholdOf = (claim, match) =>
  (CLAIM_RULES[claim] ?? []).flat().find((c) => Object.entries(match).every(([key, value]) => c[key] === value))?.threshold ?? null;

// The same figures under the names other modules already print and compare.
export const SCHEDULE_I = Object.freeze({
  highFibre: Object.freeze({
    per100g: thresholdOf("high_fibre", { basis: "per_100", form: "solid" }),
    per100kcal: thresholdOf("high_fibre", { basis: "per_100kcal" }),
  }),
  lowSugar: Object.freeze({
    solid: thresholdOf("low_sugar", { form: "solid" }),
    liquid: thresholdOf("low_sugar", { form: "liquid" }),
  }),
  sugarFree: thresholdOf("sugar_free", { nutrient: "sugars_g" }),
});

/**
 * One clause's figure from a row, or null when the row cannot answer it: no
 * basis, no measurable serving, a solid's rule asked of a drink, no energy.
 */
function valueFor(row, clause) {
  if (clause.basis === "per_serving") {
    const s = toPerServing(row);
    return isNum(s[clause.nutrient]) ? Number(s[clause.nutrient]) : null;
  }
  const p = toPer100(row);
  if (clause.basis === "per_100kcal") {
    // Unit-free, so it serves solids and drinks alike.
    return isNum(p[clause.nutrient]) && isNum(p.energy_kcal) && Number(p.energy_kcal) > 0
      ? (Number(p[clause.nutrient]) / Number(p.energy_kcal)) * 100
      : null;
  }
  if (clause.form === "solid" && p.unit !== "g") return null;
  if (clause.form === "liquid" && p.unit !== "ml") return null;
  if (clause.form === "any" && p.unit === null) return null;
  return isNum(p[clause.nutrient]) ? Number(p[clause.nutrient]) : null;
}

const passes = (value, clause) =>
  value !== null && (clause.comparator === "gte" ? value >= clause.threshold : value <= clause.threshold);

/**
 * Whether a row supports a claim under the active rule set: every clause of
 * any one group holds. An unknown claim holds for nothing.
 * @param {string} claim high_protein | high_fibre | low_sugar | sugar_free
 * @param {object} row a `sku_nutrition`-shaped row (see rowFromFacts)
 * @returns {boolean}
 */
export function claimHolds(claim, row) {
  const groups = CLAIM_RULES[claim];
  if (!groups || !row) return false;
  return groups.some((clauses) => clauses.every((clause) => passes(valueFor(row, clause), clause)));
}

/** @param {object} row @returns {boolean} */
export const isHighFibre = (row) => claimHolds("high_fibre", row);

/** @param {object} row @returns {boolean} */
export const isLowSugar = (row) => claimHolds("low_sugar", row);

/** @param {object} row @returns {boolean} */
export const isSugarFree = (row) => claimHolds("sugar_free", row);

/** @param {object} row @returns {boolean} */
export const isHighProtein = (row) => claimHolds("high_protein", row);

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
