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
//   2. A figure is only comparable within one measurement basis, so every
//      figure is converted to one before it is compared. `sku_nutrition` holds
//      `per_100g` for most rows and `per_serving` for a few; comparing the two
//      silently is how "under 200 calories" would treat a 200-per-serving
//      product and a 200-per-100g one as the same food. This used to exclude
//      any row not declared `per_100g`, because the normalized columns were all
//      NULL and a serving could not be converted. `lib/nutrition/basis.js` now
//      does that conversion, so a per-serving row is converted rather than
//      dropped — and one whose serving size KOI cannot read still fails, since
//      an unconvertible figure is no better than a missing one.
//      A product with NO stated basis is compared as-is and counted in
//      diagnostics: live rows all declare one, so that case is the dev fixtures,
//      and excluding them would make search look broken in development while
//      changing nothing about production.
//
//   4. A claim KOI publishes must mean the same thing everywhere. "High protein"
//      is KOI's own words, so it carries the same two gates as the storefront
//      badge — dense enough per 100 AND enough in a real serving. Without the
//      second gate, search would return a 5 g spoonful of Golden Milk Mix as a
//      high-protein result while its own product card, having applied that
//      gate, declines to make the claim.
//
//   3. A residual word that matches nothing is dropped, not applied. Filler the
//      phrase table did not recognise would otherwise be used as a substring
//      and empty the grid. Only text that actually matches a product survives.
//
// Eligibility itself is NOT reimplemented here. Hard constraints go through
// `filterEligible`, so an allergen is removed by the same code path whether it
// came from a sentence or from the onboarding form.
// ============================================================================

import { FOODS_AVOID, FOODS_LOVE, THRESHOLDS } from "@/lib/recommendation/config";
import { toPer100, toPerServing } from "@/lib/nutrition/basis";
import { generateCandidates } from "@/lib/recommendation/candidateGenerator";
import { filterEligible } from "@/lib/recommendation/eligibilityFilter";
import { isNum } from "@/lib/recommendation/scoringEngine";
import { mealMatches } from "@/lib/recommendation/shelves";
import { mergeProfile } from "./merge";
import { isEmptyIntent } from "./schema";

const AVOID_BY_KEY = Object.freeze(Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a])));
const LOVE_BY_KEY = Object.freeze(Object.fromEntries(FOODS_LOVE.map((f) => [f.key, f])));

// The basis every numeric macro limit is compared on, after conversion.
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
  const counters = {
    eligible: eligible.length,
    byAvoid: 0, byMeal: 0, byLove: 0, byLimit: 0,
    basisUnknown: 0,    // no declared basis, compared as-is (dev fixtures)
    basisConverted: 0,  // declared on another basis and scaled to per-100
    byClaimGate: 0,     // dense enough per 100, but not per realistic serving
  };

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
 * The `sku_nutrition` row shape `lib/nutrition/basis.js` reads, rebuilt from the
 * client-side product. Going through that module rather than scaling here is
 * the point: the storefront badge, the backfill script and this filter then
 * share one converter and cannot drift apart.
 *
 * @param {object} facts extractFacts output
 * @returns {object} a partial `sku_nutrition` row
 */
function nutritionRow(facts) {
  const m = facts.macros || {};
  const p = facts.product || {};
  return {
    measurement_basis: p.measurementBasis ?? null,
    serving_size: p.servingSize ?? null,
    energy_kcal: m.kcal,
    protein_g: m.protein,
    sugars_g: m.sugar,
  };
}

/**
 * Every shopper-stated numeric limit, checked against declared figures
 * converted to one basis. A product missing the figure a limit names — or
 * declaring it on a basis KOI cannot convert, because the serving size is
 * unreadable — fails that limit. It is not given the benefit of the doubt.
 *
 * @param {object} facts extractFacts output
 * @param {object} view intent.view
 * @param {object} [counters] optional diagnostics accumulator
 * @returns {boolean}
 */
function withinLimits(facts, view, counters = null) {
  const m = facts.macros || {};
  const macroLimited =
    view.maxKcal != null || view.minProtein != null || view.maxSugar != null || view.proteinClaim;

  let per100 = null;
  let perServing = null;

  if (macroLimited) {
    const basis = facts.product?.measurementBasis ?? null;
    if (basis === null) {
      // No declared basis. Live rows all declare one, so this is the dev
      // fixtures: read the figures as they stand rather than making search look
      // broken locally, and record that the comparison was ungrounded.
      per100 = { energy_kcal: m.kcal, protein_g: m.protein, sugars_g: m.sugar };
      if (counters) counters.basisUnknown += 1;
    } else {
      const row = nutritionRow(facts);
      per100 = toPer100(row);
      perServing = toPerServing(row);
      if (basis !== LIMIT_BASIS && counters) counters.basisConverted += 1;
    }
  }

  if (view.maxKcal != null && !(isNum(per100.energy_kcal) && Number(per100.energy_kcal) <= view.maxKcal)) return false;
  if (view.minProtein != null && !(isNum(per100.protein_g) && Number(per100.protein_g) >= view.minProtein)) return false;
  if (view.maxSugar != null && !(isNum(per100.sugars_g) && Number(per100.sugars_g) <= view.maxSugar)) return false;

  // "High protein" in KOI's voice carries KOI's claim gate, not just a density
  // test — the same second gate productFetcher applies to the badge. Density
  // alone is what let a 5 g dose of Golden Milk Mix read as high protein. A
  // product whose serving KOI cannot measure fails: unverifiable is not clean.
  if (view.proteinClaim) {
    const inServing = perServing ? perServing.protein_g : null;
    if (!(isNum(inServing) && Number(inServing) >= THRESHOLDS.proteinPerServingFloor)) {
      if (counters) counters.byClaimGate += 1;
      return false;
    }
  }

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
