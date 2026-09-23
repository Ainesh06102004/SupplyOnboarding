// ============================================================================
// The Plan page's four goal cards (the founder's design), as KOI's own goals.
// Pure.
//
// A card is a pair of the member profile's energy goal and eating pattern
// (00050), never a new kind of goal: the targets still come from goals.js,
// with its cited rules. "Lose fat & build muscle" is eating at maintenance with
// more protein — the one reading of recomposition KOI's rules can honestly back.
// Goals are for adults (00050); a child's card set is empty.
// ============================================================================

import { goalsAllowed } from "@/lib/planner/goals";

export const GOAL_CARDS = Object.freeze([
  { key: "lose", title: "Lose Weight", sub: "Shed kilos sustainably", energyGoal: "lose", eatingPattern: null },
  { key: "muscle", title: "Build Muscle", sub: "Gain lean muscle mass", energyGoal: "gain", eatingPattern: "high_protein" },
  { key: "recomp", title: "Lose Fat & Build Muscle", sub: "Recomp your body", badge: "POPULAR", energyGoal: "maintain", eatingPattern: "high_protein", note: "At maintenance calories, with more protein" },
  { key: "maintain", title: "Maintain & Eat Better", sub: "Keep your weight, eat better", energyGoal: "maintain", eatingPattern: null },
]);

/** Patterns a card does not set, kept when the card is chosen (keto stays keto when you pick "lose"). */
const KEPT_PATTERNS = new Set(["low_carb", "keto"]);

const PATTERN_WORDS = Object.freeze({ low_carb: "Low carb", keto: "Keto" });

/**
 * The card a profile's goal shows as, and the pattern the card does not say.
 * @param {{ age_band?: string, energy_goal?: string, eating_pattern?: string }} form
 * @returns {{ card: object|null, extra: string|null }}
 */
export function cardFor(form = {}) {
  if (!goalsAllowed(form.age_band)) return { card: null, extra: null };
  const energy = form.energy_goal || "maintain";
  const pattern = form.eating_pattern || "balanced";
  const card = GOAL_CARDS.find((c) => c.energyGoal === energy && c.eatingPattern === pattern)
    ?? GOAL_CARDS.find((c) => c.energyGoal === energy && c.eatingPattern === null)
    ?? (energy === "gain" ? GOAL_CARDS.find((c) => c.key === "muscle") : null);
  const extra = KEPT_PATTERNS.has(pattern) || (card?.key === "muscle" && pattern !== "high_protein")
    ? PATTERN_WORDS[pattern] ?? null
    : null;
  return { card: card ?? null, extra };
}

/**
 * The profile fields a card sets. null for a child: goals are for adults.
 * @param {object} form the member's profile form
 * @param {string} key a GOAL_CARDS key
 * @returns {{ energy_goal: string, eating_pattern: string }|null}
 */
export function applyCard(form = {}, key) {
  if (!goalsAllowed(form.age_band)) return null;
  const card = GOAL_CARDS.find((c) => c.key === key);
  if (!card) return null;
  const current = form.eating_pattern || "balanced";
  const eatingPattern = card.eatingPattern ?? (KEPT_PATTERNS.has(current) ? current : "balanced");
  return { energy_goal: card.energyGoal, eating_pattern: eatingPattern };
}

/** A short goal line for a household pill: "Recomp" or "Maintain". */
export function goalShortLabel(form = {}) {
  if (!goalsAllowed(form.age_band)) return "Child";
  const { card } = cardFor(form);
  switch (card?.key) {
    case "lose": return "Lose";
    case "muscle": return "Muscle";
    case "recomp": return "Recomp";
    default: return "Maintain";
  }
}
