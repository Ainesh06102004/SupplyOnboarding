// ============================================================================
// KRE — Step 3: Scoring Engine (pure, deterministic)
// Every eligible product gets a score from configurable components + penalties.
// scoreProduct() is a pure function of (facts, profile) — no globals, no I/O —
// so it is trivially unit-testable and reproducible.
//
// Additive components (max 100): goalMatch 35, macroMatch 25, preferredFood 15,
// mealMatch 10, budgetMatch 5, popularity 5, trust 5.
// Penalties documented in config.PENALTIES.
// ============================================================================

import {
  WEIGHTS, PENALTIES, THRESHOLDS as T, GOAL_PROFILES, UNKNOWN_FIT,
  FOODS_LOVE, FOODS_AVOID, MEALS, BUDGET_RANGES, MEAL_MATCH,
} from "./config";
import { REASONS, CAUTIONS } from "./reasons";
import { unverifiedFor } from "./verification";
import { isHighProtein, isHighFibre, isLowSugar, rowFromFacts } from "@/lib/nutrition/claims";

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

// A macro KOI actually holds a figure for. Every comparison below needs this,
// because `null` compares as 0 against a number: `null < 6` is true and
// `null <= 4` is true, so an undeclared macro silently passes any "is it low?"
// test written the obvious way.
// Exported so every consumer that compares a macro uses this one guard rather
// than writing the obvious-and-wrong version again. Search filters need it too.
export const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const LOVE_BY_KEY = Object.fromEntries(FOODS_LOVE.map((f) => [f.key, f]));
const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const MEAL_BY_KEY = Object.fromEntries(MEALS.map((m) => [m.key, m]));

// Normalise a single macro to 0..1 given a desired direction, or null when the
// macro was never declared. Null is not a score of zero and not a score of one:
// it is the absence of a score, and goalFit drops it rather than averaging it.
function metricScore(kind, value, dir) {
  if (!isNum(value)) return null;
  const v = Number(value);
  const scale = { protein: T.proteinHigh, sugar: T.sugarHigh, fibre: T.fibreHigh, kcal: T.kcalHigh, fat: 15 }[kind] || 10;
  if (dir === "high") return clamp(v / scale);
  if (dir === "low") return clamp(1 - v / scale);
  return clamp(1 - Math.abs(v - scale / 2) / (scale / 2)); // 'mid'
}

// ── goal fit (0..1) ──
//
// Scores the metrics this product declares, then shrinks the result toward
// UNKNOWN_FIT by how many it does NOT declare.
//
// The old body read `facts.macros[metric] ?? 0` and averaged over ALL of them,
// so an undeclared macro scored as zero — and because five of the nine goal
// profiles want `sugar: "low"`, a zero there scored a perfect 1.0. A product
// with no nutrition panel beat one with a good panel on the largest single
// component of the score.
//
// Averaging only the declared metrics fixes the reward but leaves absence
// costless: a product declaring nothing but good fibre would TIE with one
// declaring good fibre AND good sugar. Coverage shrinkage is what makes a
// complete product win — an incomplete one is judged on what it declares and
// then pulled toward "we don't know" for what it doesn't.
function goalFit(facts, goal) {
  const def = GOAL_PROFILES[goal] || GOAL_PROFILES.maintenance;
  const entries = Object.entries(def.metrics);
  if (!entries.length) return UNKNOWN_FIT;

  const known = entries
    .map(([metric, dir]) => metricScore(metric, facts.macros[metric], dir))
    .filter((v) => v !== null);

  const coverage = known.length / entries.length;
  if (coverage === 0) return UNKNOWN_FIT;

  const declaredFit = known.reduce((sum, v) => sum + v, 0) / known.length;
  return declaredFit * coverage + UNKNOWN_FIT * (1 - coverage);
}

// ── macro fit vs user targets (0..1) ──
//
// Two failures lived here, both from treating a missing number as a number.
//
// 1. `(targets.protein * 4) / Math.max(targets.kcal, 1)` — a profile carrying
//    protein but no kcal made Math.max(undefined, 1) NaN, and NaN propagated
//    through targetShare, proteinMatch, fit and the product's whole raw score.
//    A NaN score does not throw; it silently sorts as equal to everything,
//    which quietly reduces ranking to the tie-break.
//
// 2. `protein * 4 / Math.max(kcal, 1)` — a product with protein declared but
//    NO energy declared divided by 1 instead of by its calories, producing a
//    protein share around 88 where a real one is ~0.25. That clamps to a
//    PERFECT macro match. Missing nutrition data scored better than complete
//    nutrition data, which is the strongest possible incentive in the wrong
//    direction.
//
// 3. `1 - sugar / T.sugarHigh` with an undeclared sugar figure — null coerced
//    to 0 — returned exactly 1.0, a perfect sugar score, for 40% of this
//    component.
//
// All three are now explicit: a share needs both numbers, where energy is not
// declared the fallback is absolute protein against the same threshold goalFit
// uses, and each half is scored only where its own macro is declared. The
// halves that ARE known are re-weighted between themselves, so a half-declared
// product is judged on what it declares rather than handed the rest for free.
function macroFit(facts, targets) {
  const { protein, sugar, kcal } = facts.macros;

  const targetKcal = Number(targets?.kcal) > 0 ? Number(targets.kcal) : null;
  const targetProtein = Number(targets?.protein) > 0 ? Number(targets.protein) : null;
  // 0.25 is the default share used when a shopper has set no targets.
  const targetShare = targetKcal && targetProtein ? (targetProtein * 4) / targetKcal : 0.25;

  const proteinMatch = !isNum(protein)
    ? null
    : isNum(kcal) && kcal > 0
      ? clamp((protein * 4) / kcal / Math.max(targetShare, 0.001) / 1.5)
      : clamp(protein / T.proteinHigh);

  const sugarFactor = isNum(sugar) ? clamp(1 - sugar / T.sugarHigh) : null;

  // Score across whichever halves are declared, then shrink toward UNKNOWN_FIT
  // by the share that is not. The two weights sum to 1, so the declared weight
  // IS the coverage. Neither half declared → UNKNOWN_FIT, the same neutral
  // goalFit uses.
  const parts = [];
  if (proteinMatch !== null) parts.push([0.6, proteinMatch]);
  if (sugarFactor !== null) parts.push([0.4, sugarFactor]);
  const coverage = parts.reduce((sum, [w]) => sum + w, 0);

  const declaredFit = coverage > 0
    ? parts.reduce((sum, [w, v]) => sum + w * v, 0) / coverage
    : UNKNOWN_FIT;
  const fit = declaredFit * coverage + UNKNOWN_FIT * (1 - coverage);

  return { fit, proteinMatch, sugarFactor };
}

/**
 * Pure scoring function.
 * @param {object} facts   from extractFacts()
 * @param {object} profile { goal, targets, foodsLove[], foodsAvoid[], mealPrefs[], budget }
 * @returns {{ id, raw, display, breakdown, reasons: string[], category, facts }}
 */
export function scoreProduct(facts, profile = {}) {
  const b = {}; // breakdown
  const reasons = [];
  const goal = profile.goal || "maintenance";
  const goalLabel = (GOAL_PROFILES[goal] || {}).label || "your goal";

  // 1 · goal match
  const gFit = goalFit(facts, goal);
  b.goalMatch = +(gFit * WEIGHTS.goalMatch).toFixed(2);
  if (gFit >= 0.6) reasons.push(REASONS.goal(goalLabel));

  // 2 · macro match
  const { fit: mFit, proteinMatch } = macroFit(facts, profile.targets);
  b.macroMatch = +(mFit * WEIGHTS.macroMatch).toFixed(2);
  // `proteinMatch` is null when protein was never declared, and `null >= 0.7`
  // is false — so an undeclared product claims neither reason. Stated rather
  // than relied on.
  // "High protein" is KOI's claim and carries the badge's two gates; a product
  // that merely fits the shopper's protein target says only that.
  const row = rowFromFacts(facts);
  if (proteinMatch !== null && proteinMatch >= 0.7) {
    reasons.push(isHighProtein(row) ? REASONS.highProtein() : REASONS.proteinGoal());
  }
  else if (mFit >= 0.6) reasons.push(REASONS.calorieTarget());

  // 3 · preferred food bonus
  const matchedFoods = (profile.foodsLove || [])
    .map((k) => LOVE_BY_KEY[k])
    .filter((f) => f && f.keywords.some((kw) => facts.haystack.includes(kw)));
  b.preferredFood = matchedFoods.length ? WEIGHTS.preferredFood : 0;
  if (matchedFoods[0]) reasons.push(REASONS.likes(matchedFoods[0].label));

  // 4 · meal match
  const matchedMealKey = (profile.mealPrefs || []).find((mk) => {
    const m = MEAL_MATCH[mk];
    return m && (m.categories.includes(facts.category) || m.keywords.some((kw) => facts.haystack.includes(kw)));
  });
  b.mealMatch = matchedMealKey ? WEIGHTS.mealMatch : 0;
  if (matchedMealKey) reasons.push(REASONS.meal((MEAL_BY_KEY[matchedMealKey] || {}).label || matchedMealKey));

  // 5 · budget match
  const [lo, hi] = BUDGET_RANGES[profile.budget || "any"] || BUDGET_RANGES.any;
  b.budgetMatch = facts.price >= lo && facts.price <= hi ? WEIGHTS.budgetMatch : 0;
  if (b.budgetMatch && profile.budget && profile.budget !== "any") reasons.push(REASONS.budget());

  // 6 · popularity
  const pop = facts.recommended ? 1 : clamp(facts.betterThan / 100);
  b.popularity = +(pop * WEIGHTS.popularity).toFixed(2);

  // 7 · KOI trust
  b.trust = +(clamp(facts.trust / 100) * WEIGHTS.trust).toFixed(2);
  if (facts.trust >= 85) reasons.push(REASONS.trust());

  // ── penalties ──
  b.penalties = 0;
  const avoided = (profile.foodsAvoid || []).map((k) => AVOID_BY_KEY[k]).filter(Boolean);
  const softAvoidHits = avoided.filter((a) => a.mode === "soft" && facts.contains.has(a.flag));
  if (softAvoidHits.length) b.penalties += PENALTIES.avoidedIngredient;

  // The shopper avoids something this product's data cannot answer for.
  // refined_sugar and high_sodium are the two macro-derived avoid flags, so an
  // undeclared sugar or sodium figure means the flag's absence is silence, not
  // a clean result. Charged only when nothing was actually detected —
  // otherwise the -100 above already covers it.
  //
  // Allergens and label-only diets join them. An allergen the product's data
  // does not mention has not been ruled out unless a person checked the whole
  // ingredient list — see verification.js.
  const gaps = unverifiedFor(facts, profile);
  const unprovable = gaps.allergens.length > 0 || gaps.diet !== null || avoided.some(
    (a) =>
      (a.flag === "refined_sugar" && !isNum(facts.macros.sugar)) ||
      (a.flag === "high_sodium" && !isNum(facts.macros.sodium))
  );
  if (unprovable && !softAvoidHits.length) b.penalties += PENALTIES.unverifiableAvoid;

  const cautions = [];
  if (gaps.allergens.length) cautions.push(CAUTIONS.notVerifiedFor(gaps.allergens.map((a) => a.label)));
  if (gaps.diet) cautions.push(CAUTIONS.notVerifiedAsDiet(gaps.diet.label));
  if ((goal === "fatloss" || goal === "low_sugar") && isNum(facts.macros.sugar) && facts.macros.sugar > T.sugarHigh) b.penalties += PENALTIES.highSugarForFatLoss;
  // `null < T.proteinMin` is TRUE. Without the guard this penalised every
  // product whose protein was merely undeclared — a verdict about a gap in
  // KOI's data dressed up as a verdict about the food.
  if (["muscle", "high_protein", "fatloss"].includes(goal) && isNum(facts.macros.protein) && facts.macros.protein < T.proteinMin) b.penalties += PENALTIES.proteinBelowThreshold;
  if (facts.contains.has("high_sodium")) b.penalties += PENALTIES.highSodium;
  if (facts.lowStock) b.penalties += PENALTIES.lowStock;

  // ── contextual "always nice to know" reasons ──
  // These reach the shopper as statements of fact about the food, so each one
  // requires the figure it is about. `null <= T.sugarLow` is TRUE: without this
  // guard every product with no declared sugar was labelled "Lower sugar" on
  // the shelf — a published health claim derived from the absence of data,
  // which is the one thing KOI must never do.
  // Both are regulated claims, decided by claims.js on the declared basis —
  // which also refuses a product whose basis it does not know.
  if (isLowSugar(row)) reasons.push(REASONS.lowSugar());
  if (isHighFibre(row)) reasons.push(REASONS.highFibre());

  // "No ingredients you avoid" is only sayable when the things they avoid could
  // have been detected. Two avoid flags are derived from macros rather than
  // from ingredient keywords, so where that macro is undeclared the absence of
  // the flag proves nothing and the reassurance is withheld. The same holds for
  // an allergen on a product with no verified ingredient list.
  //
  // How it is said depends on who checked. A person's check supports "No
  // ingredients you avoid". Two agreeing machine readings support only what the
  // pack lists — so that is what the shopper is told.
  if (avoided.length && !softAvoidHits.length && !unprovable) {
    reasons.push(facts.ingredientEvidence === "machine_read"
      ? REASONS.notListedOnPack(avoided.map((a) => a.label))
      : REASONS.noAvoid());
  }

  const raw = b.goalMatch + b.macroMatch + b.preferredFood + b.mealMatch + b.budgetMatch + b.popularity + b.trust + b.penalties;
  const display = Math.round(clamp(raw, 0, 100));

  // de-dup, keep order, cap for a clean UI
  const seen = new Set();
  const cleanReasons = reasons.filter((r) => (seen.has(r) ? false : seen.add(r))).slice(0, 5);

  return { id: facts.id, raw: +raw.toFixed(2), display, breakdown: b, reasons: cleanReasons, cautions, category: facts.category, facts };
}
