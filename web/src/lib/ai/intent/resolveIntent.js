// ============================================================================
// KOI — Query Intent · Resolver
// Turns an intent into the set of product ids that satisfy it, by running the
// shopper's merged profile through the KRE's own eligibility stage and then
// applying the limits they asked for.
//
// This is the only module that sees both an intent and the catalogue, which is
// why the integrity checks live here rather than in the interpreter:
//
//   1. Undeclared beats plausible. A limit on a macro ("under 200 calories")
//      excludes a product whose figure KOI has never been told. `null <= 200`
//      is true, and letting that through would publish a calorie claim derived
//      from missing data — the fault shelves.js documents for shelf membership.
//      Same rule, same reason, one guard: `isNum` from the KRE.
//
//   2. A figure is only comparable within one measurement basis. `sku_nutrition`
//      holds `per_100g` for most rows and `per_serving` for a few, every
//      normalized `*_per_100g` column is NULL, and `servings_per_pack` is unset
//      — so a per-serving row cannot be converted, only excluded. Comparing the
//      two silently is how "under 200 calories" would rank a 200-per-serving
//      product alongside a 200-per-100g one as though they were the same food.
//      A product with NO stated basis is compared as-is and counted in
//      diagnostics: live rows all declare one, so that case is the dev fixtures,
//      and excluding them would make search look broken in development while
//      changing nothing about production.
//
//   3. A residual word that matches nothing is dropped, not applied. Filler the
//      phrase table did not recognise would otherwise be used as a substring
//      and empty the grid. Only text that actually matches a product survives.
//
// Eligibility itself is NOT reimplemented here. Hard constraints go through
// `filterEligible`, so an allergen is removed by the same code path whether it
// came from a sentence or from the onboarding form.
// ============================================================================

import { FOODS_AVOID, FOODS_LOVE } from "@/lib/recommendation/config";
import { generateCandidates } from "@/lib/recommendation/candidateGenerator";
import { filterEligible } from "@/lib/recommendation/eligibilityFilter";
import { isNum } from "@/lib/recommendation/scoringEngine";
import { mealMatches } from "@/lib/recommendation/shelves";
import { mergeProfile } from "./merge";
import { isEmptyIntent } from "./schema";

const AVOID_BY_KEY = Object.freeze(Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a])));
const LOVE_BY_KEY = Object.freeze(Object.fromEntries(FOODS_LOVE.map((f) => [f.key, f])));

// The basis a numeric macro limit is read against. Matches the majority of
// live rows; anything else declared is incomparable rather than convertible.
const LIMIT_BASIS = "per_100g";

// Flags productFacts.js INFERS from a declared macro rather than reading from
// the label. For these, "the flag is absent" can mean "the macro is unknown",
// so a shopper asking to avoid one needs the underlying figure to exist before
// the product can be called clean. Absence of evidence is not evidence.
const INFERRED_FROM_MACRO = Object.freeze({
  refined_sugar: "sugar",
  high_sodium: "sodium",
});

/**
 * @typedef {Object} ResolvedIntent
 * @property {Set<string>|null} ids  ids satisfying the intent, or null when the
 *   intent constrains nothing and the grid should be left alone
 * @property {object} profile        the merged KRE profile
 * @property {string[]} refusals     intent fields refused for loosening a stored preference
 * @property {string} text           residual search text, "" if it matched nothing
 * @property {object} diagnostics    stage-by-stage counts
 */

/**
 * Resolve an intent against a catalogue.
 *
 * @param {Array} products frontend product shapes
 * @param {object|null} intent a parsed, sanitised intent
 * @param {object|null} storedProfile the shopper's saved goal profile
 * @returns {ResolvedIntent}
 */
export function resolveIntent(products = [], intent = null, storedProfile = null) {
  const { profile, refusals } = mergeProfile(storedProfile, intent);

  if (!intent || isEmptyIntent(intent)) {
    return {
      ids: null,
      profile,
      refusals,
      text: "",
      diagnostics: { total: products.length, applied: false },
    };
  }

  const view = intent.view || {};
  const wanted = intent.profile || {};

  const candidates = generateCandidates(products);
  const { eligible, removed } = filterEligible(candidates, profile);

  // Avoids the shopper stated in THIS query narrow the view, including the ones
  // the engine classes as soft. A stored "I'd rather avoid palm oil" stays a
  // ranking penalty as designed; typing "without palm oil" right now is an
  // instruction, and the two deserve different answers. Stored preferences are
  // untouched — this reads intent.profile only.
  const statedFlags = (wanted.foodsAvoid || [])
    .map((key) => AVOID_BY_KEY[key])
    .filter(Boolean)
    .map((a) => a.flag);

  // A named food narrows too. "peanut butter" must not return the whole shop
  // just because it parsed as a preference rather than as a filter.
  const wantedKeywords = (wanted.foodsLove || [])
    .map((key) => LOVE_BY_KEY[key])
    .filter(Boolean)
    .map((f) => f.keywords || []);

  const meals = wanted.mealPrefs || [];
  const counters = { eligible: eligible.length, byAvoid: 0, byMeal: 0, byLove: 0, byLimit: 0, basisUnknown: 0 };

  const survivors = eligible.filter((f) => {
    for (const flag of statedFlags) {
      const macroKey = INFERRED_FROM_MACRO[flag];
      const unverifiable = macroKey && !isNum(f.macros?.[macroKey]);
      if (f.contains.has(flag) || unverifiable) { counters.byAvoid += 1; return false; }
    }

    if (meals.length && !meals.some((m) => mealMatches(f.category, f.haystack, m))) {
      counters.byMeal += 1;
      return false;
    }

    if (wantedKeywords.length
      && !wantedKeywords.some((kws) => kws.some((kw) => f.haystack.includes(kw)))) {
      counters.byLove += 1;
      return false;
    }

    if (!withinLimits(f, view, counters)) { counters.byLimit += 1; return false; }
    return true;
  });

  // A residual word only earns the right to filter if the catalogue knows it.
  const residual = String(intent.text || "").trim().toLowerCase();
  const textMatches = residual
    ? survivors.filter((f) => f.haystack.includes(residual))
    : survivors;
  const usableText = residual && textMatches.length ? residual : "";
  const finalSet = usableText ? textMatches : survivors;

  return {
    ids: new Set(finalSet.map((f) => f.id)),
    profile,
    refusals,
    text: usableText,
    diagnostics: {
      applied: true,
      total: products.length,
      candidates: candidates.length,
      unscored: products.length - candidates.length,
      removedByEligibility: removed.length,
      ...counters,
      textDropped: Boolean(residual) && !usableText,
      matched: finalSet.length,
    },
  };
}

/**
 * Every shopper-stated numeric limit, checked against declared, comparable
 * values only. A product missing the figure a limit names — or stating it on a
 * different measurement basis — fails that limit. It is not given the benefit
 * of the doubt.
 *
 * @param {object} facts extractFacts output
 * @param {object} view intent.view
 * @param {object} [counters] optional diagnostics accumulator
 * @returns {boolean}
 */
function withinLimits(facts, view, counters = null) {
  const m = facts.macros || {};
  const macroLimited = view.maxKcal != null || view.minProtein != null || view.maxSugar != null;

  if (macroLimited) {
    const basis = facts.product?.measurementBasis ?? null;
    if (basis !== null && basis !== LIMIT_BASIS) return false;
    if (basis === null && counters) counters.basisUnknown += 1;
  }

  if (view.maxKcal != null && !(isNum(m.kcal) && Number(m.kcal) <= view.maxKcal)) return false;
  if (view.minProtein != null && !(isNum(m.protein) && Number(m.protein) >= view.minProtein)) return false;
  if (view.maxSugar != null && !(isNum(m.sugar) && Number(m.sugar) <= view.maxSugar)) return false;

  // Price and KOI score are not basis-dependent, but the same rule applies:
  // no figure, no claim, no pass.
  if (view.maxPrice != null && !(isNum(facts.price) && Number(facts.price) <= view.maxPrice)) return false;
  if (view.minScore != null && !(isNum(facts.trust) && Number(facts.trust) >= view.minScore)) return false;

  return true;
}

/**
 * Which single chip, if dropped, would produce results?
 *
 * A correct interpretation can still return nothing — "high protein snacks
 * under ₹200" is honestly empty when the only snacks over KOI's protein
 * threshold cost more than ₹200. That is the right answer, and a bare "no
 * results" makes it indistinguishable from a bug. This names the binding
 * constraint so the shopper can lift exactly one thing.
 *
 * Only called when a resolve came back empty, so the extra passes cost nothing
 * on the normal path. Pure.
 *
 * @param {Array} products
 * @param {object} intent the intent that matched nothing
 * @param {object|null} storedProfile
 * @param {Array} chips from describeIntent(intent)
 * @param {function} remove removeFromIntent, injected to keep this module free
 *   of a dependency on the description layer
 * @returns {Array<{ chip: object, matched: number }>} relaxations that would
 *   help, best first
 */
export function suggestRelaxations(products, intent, storedProfile, chips, remove) {
  const out = [];
  for (const chip of chips) {
    if (chip.kind === "unapplied") continue;
    const relaxed = remove(intent, chip);
    const { ids } = resolveIntent(products, relaxed, storedProfile);
    const matched = ids ? ids.size : products.length;
    if (matched > 0) out.push({ chip, matched });
  }
  return out.sort((a, b) => b.matched - a.matched);
}

export { withinLimits, LIMIT_BASIS };
