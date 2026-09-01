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
  WEIGHTS, PENALTIES, THRESHOLDS as T, GOAL_PROFILES,
  FOODS_LOVE, FOODS_AVOID, MEALS, BUDGET_RANGES, MEAL_MATCH,
} from "./config";
import { REASONS } from "./reasons";

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const LOVE_BY_KEY = Object.fromEntries(FOODS_LOVE.map((f) => [f.key, f]));
const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const MEAL_BY_KEY = Object.fromEntries(MEALS.map((m) => [m.key, m]));

// Normalise a single macro to 0..1 given a desired direction.
function metricScore(kind, value, dir) {
  const scale = { protein: T.proteinHigh, sugar: T.sugarHigh, fibre: T.fibreHigh, kcal: T.kcalHigh, fat: 15 }[kind] || 10;
  if (dir === "high") return clamp(value / scale);
  if (dir === "low") return clamp(1 - value / scale);
  return clamp(1 - Math.abs(value - scale / 2) / (scale / 2)); // 'mid'
}

// ── goal fit (0..1) ──
function goalFit(facts, goal) {
  const def = GOAL_PROFILES[goal] || GOAL_PROFILES.maintenance;
  const entries = Object.entries(def.metrics);
  if (!entries.length) return 0.5;
  const sum = entries.reduce((s, [metric, dir]) => s + metricScore(metric, facts.macros[metric] ?? 0, dir), 0);
  return sum / entries.length;
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
// Both are now explicit: a share needs both numbers, and where energy is not
// declared the fallback is absolute protein against the same threshold goalFit
// uses — real information, honestly scaled, rather than an accidental 1.0.
function macroFit(facts, targets) {
  const { protein, sugar, kcal } = facts.macros;

  const targetKcal = Number(targets?.kcal) > 0 ? Number(targets.kcal) : null;
  const targetProtein = Number(targets?.protein) > 0 ? Number(targets.protein) : null;
  // 0.25 is the default share used when a shopper has set no targets.
  const targetShare = targetKcal && targetProtein ? (targetProtein * 4) / targetKcal : 0.25;

  const proteinMatch =
    kcal > 0
      ? clamp((protein * 4) / kcal / Math.max(targetShare, 0.001) / 1.5)
      : clamp(protein / T.proteinHigh);

  const sugarFactor = clamp(1 - sugar / T.sugarHigh);
  return { fit: 0.6 * proteinMatch + 0.4 * sugarFactor, proteinMatch, sugarFactor };
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
  if (proteinMatch >= 0.7) reasons.push(facts.macros.protein >= T.proteinHigh ? REASONS.highProtein() : REASONS.proteinGoal());
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
  const softAvoidHits = (profile.foodsAvoid || [])
    .map((k) => AVOID_BY_KEY[k])
    .filter((a) => a && a.mode === "soft" && facts.contains.has(a.flag));
  if (softAvoidHits.length) b.penalties += PENALTIES.avoidedIngredient;
  if ((goal === "fatloss" || goal === "low_sugar") && facts.macros.sugar > T.sugarHigh) b.penalties += PENALTIES.highSugarForFatLoss;
  if (["muscle", "high_protein", "fatloss"].includes(goal) && facts.macros.protein < T.proteinMin) b.penalties += PENALTIES.proteinBelowThreshold;
  if (facts.contains.has("high_sodium")) b.penalties += PENALTIES.highSodium;
  if (facts.lowStock) b.penalties += PENALTIES.lowStock;

  // ── contextual "always nice to know" reasons ──
  if (facts.macros.sugar <= T.sugarLow) reasons.push(REASONS.lowSugar());
  if (facts.macros.fibre >= T.fibreHigh) reasons.push(REASONS.highFibre());
  if ((profile.foodsAvoid || []).length && !softAvoidHits.length) reasons.push(REASONS.noAvoid());

  const raw = b.goalMatch + b.macroMatch + b.preferredFood + b.mealMatch + b.budgetMatch + b.popularity + b.trust + b.penalties;
  const display = Math.round(clamp(raw, 0, 100));

  // de-dup, keep order, cap for a clean UI
  const seen = new Set();
  const cleanReasons = reasons.filter((r) => (seen.has(r) ? false : seen.add(r))).slice(0, 5);

  return { id: facts.id, raw: +raw.toFixed(2), display, breakdown: b, reasons: cleanReasons, category: facts.category, facts };
}
