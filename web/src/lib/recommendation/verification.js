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
export function unverifiedFor(facts, profile = {}) {
  if (facts.ingredientEvidence === "verified") return { allergens: [], diet: null };

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
    && LABEL_VERIFIED_DIETS.includes(dietDef.key)
    && !declared.includes(dietDef.label.toLowerCase())
    ? dietDef
    : null;

  return { allergens, diet };
}
