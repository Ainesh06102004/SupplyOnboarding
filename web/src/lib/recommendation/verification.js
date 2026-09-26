// ============================================================================
// KRE — What KOI cannot vouch for
// For one product and one shopper: which of their allergens, and whether their
// diet, KOI has no complete ingredient list to check against.
//
// Eligibility already REMOVES a product whose data shows an allergen the
// shopper avoids. This answers the other half — the product that shows nothing,
// because nothing complete was ever read. That silence used to be reported to
// the shopper as "No ingredients you avoid". It is not evidence of absence, and
// a partial list is partial by name.
//
// Shared by scoring (the card's caution) and search (the unverified count) so
// both say the same thing about the same product.
// ============================================================================

import { FOODS_AVOID, DIET_TYPES, LABEL_VERIFIED_DIETS } from "./config";

const AVOID_BY_KEY = Object.freeze(Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a])));
const DIET_BY_KEY = Object.freeze(Object.fromEntries(DIET_TYPES.map((d) => [d.key, d])));

/**
 * @param {object} facts   extractFacts() output
 * @param {object} profile { foodsAvoid: string[], dietType }
 * @returns {{ allergens: Array<object>, diet: object|null }} FOODS_AVOID entries
 *   KOI cannot confirm absent, and the DIET_TYPES entry it cannot confirm, if any
 */
/** Evidence that covers the whole printed list, so absence can be stated. */
export const FULL_LIST_EVIDENCE = Object.freeze(["verified", "machine_read"]);

// A label says what the pack said when KOI last read it. Recipes change without
// notice, so after this long with no fresh reading (lib/engine/recheck.js) a
// label keeps proving what it lists and stops proving what it leaves out.
export const LABEL_MAX_AGE_DAYS = 365;
const DAY_MS = 86_400_000;

/**
 * @param {string|Date|null|undefined} confirmedAt when KOI last read the label
 * @param {number} [now]
 * @returns {boolean} false when the date is missing, unreadable, or too old
 */
export function isLabelCurrent(confirmedAt, now = Date.now()) {
  if (!confirmedAt) return false;
  const t = new Date(confirmedAt).getTime();
  return Number.isFinite(t) && now - t <= LABEL_MAX_AGE_DAYS * DAY_MS;
}

// How many independent readings must agree on a machine-read allergen set
// before it may say an allergen is absent (migration 00063). One reading, or
// two that differ, is still the complete list: it proves what is IN the
// product and settles the diet, but it cannot clear a hard allergen avoid.
export const MIN_READ_AGREEMENT = 2;

/**
 * @param {string|null|undefined} evidence      ingredientEvidence
 * @param {number|null|undefined} readAgreement readings that agreed on the allergens
 * @returns {boolean} whether the list may say an allergen is absent
 */
export function provesAllergenAbsence(evidence, readAgreement) {
  if (evidence === "verified") return true;
  return evidence === "machine_read" && Number(readAgreement) >= MIN_READ_AGREEMENT;
}

export function unverifiedFor(facts, profile = {}) {
  const fullList = FULL_LIST_EVIDENCE.includes(facts.ingredientEvidence);
  if (fullList && provesAllergenAbsence(facts.ingredientEvidence, facts.readAgreement)) return { allergens: [], diet: null };

  // Milk and lactose share the `dairy` flag; one caution per flag is enough.
  const flags = new Set();
  const allergens = (profile.foodsAvoid || [])
    .map((key) => AVOID_BY_KEY[key])
    .filter((a) => a && a.kind === "allergen" && !facts.contains.has(a.flag))
    .filter((a) => (flags.has(a.flag) ? false : (flags.add(a.flag), true)));

  // A brand declaring the diet on its own label carries that claim itself,
  // exactly as the mandatory veg mark does for vegetarian.
  const dietDef = DIET_BY_KEY[profile.dietType];
  const declared = (facts.dietary || []).map((d) => String(d).toLowerCase());
  const diet = dietDef
    && !fullList
    && LABEL_VERIFIED_DIETS.includes(dietDef.key)
    && !declared.includes(dietDef.label.toLowerCase())
    ? dietDef
    : null;

  return { allergens, diet };
}
