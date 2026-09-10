// ============================================================================
// KOI — Query Intent · Description
// Renders an intent as the chips the shop shows back to the shopper.
//
// Follows the same discipline as `reasons.js`: every label is a template over a
// catalog label or a number the shopper themselves supplied. Nothing here is
// generated prose, and no chip can assert anything about a product — a chip
// describes the QUERY, not the results.
//
// Each chip carries the field and key needed to remove it, because an
// interpretation the shopper cannot correct is worse than no interpretation.
// ============================================================================

import {
  GOAL_PROFILES, DIET_TYPES, MEALS, FOODS_AVOID, FOODS_LOVE, BUDGETS,
} from "@/lib/recommendation/config";

const labelOf = (list, key) => (list.find((x) => x.key === key) || {}).label || key;

/**
 * @typedef {Object} IntentChip
 * @property {string} id     stable key for React
 * @property {string} label  what the shopper reads
 * @property {string} field  dotted path into the intent, for removal
 * @property {string|null} key the catalog key, for list fields
 * @property {"constraint"|"preference"|"unapplied"} kind
 */

/**
 * Describe an intent as removable chips.
 *
 * @param {object|null} intent a parsed intent
 * @returns {IntentChip[]}
 */
export function describeIntent(intent) {
  if (!intent) return [];
  const p = intent.profile || {};
  const v = intent.view || {};
  const chips = [];

  const add = (id, label, field, key = null, kind = "preference") =>
    chips.push({ id, label, field, key, kind });

  // Restrictions first — they are the ones that must be visible.
  for (const key of p.foodsAvoid || []) {
    add(`avoid:${key}`, `No ${labelOf(FOODS_AVOID, key).toLowerCase()}`, "profile.foodsAvoid", key, "constraint");
  }
  if (p.dietType) {
    add(`diet:${p.dietType}`, labelOf(DIET_TYPES, p.dietType), "profile.dietType", p.dietType, "constraint");
  }

  for (const key of p.mealPrefs || []) {
    add(`meal:${key}`, labelOf(MEALS, key), "profile.mealPrefs", key, "constraint");
  }

  if (v.maxPrice != null) add("maxPrice", `Under ₹${v.maxPrice}`, "view.maxPrice", null, "constraint");
  if (v.maxKcal != null) add("maxKcal", `Under ${v.maxKcal} kcal`, "view.maxKcal", null, "constraint");
  if (v.minProtein != null) add("minProtein", `${v.minProtein}g+ protein`, "view.minProtein", null, "constraint");
  if (v.maxSugar != null) add("maxSugar", `Under ${v.maxSugar}g sugar`, "view.maxSugar", null, "constraint");
  if (v.minScore != null) add("minScore", `KOI score ${v.minScore}+`, "view.minScore", null, "constraint");

  if (p.goal) add(`goal:${p.goal}`, (GOAL_PROFILES[p.goal] || {}).label || p.goal, "profile.goal", p.goal);
  if (p.budget && p.budget !== "any") {
    const b = BUDGETS.find((x) => x.key === p.budget) || {};
    add(`budget:${p.budget}`, b.hint || b.label || p.budget, "profile.budget", p.budget);
  }
  for (const key of p.foodsLove || []) {
    add(`love:${key}`, labelOf(FOODS_LOVE, key), "profile.foodsLove", key);
  }
  if (v.sort) add("sort", v.sort, "view.sort");

  if (intent.text) add("text", `"${intent.text}"`, "text");

  // Last, and deliberately distinct: things KOI recognised as a restriction but
  // has no way to enforce. Shown so the shopper is never left believing a limit
  // was applied when it was not.
  for (const word of intent.unresolved || []) {
    add(`unresolved:${word}`, `Couldn't apply "${word}"`, "unresolved", word, "unapplied");
  }

  return chips;
}

/**
 * Remove one chip's contribution from an intent.
 * Pure — returns a new intent; the caller re-resolves.
 *
 * @param {object} intent
 * @param {IntentChip} chip
 * @returns {object} a new intent
 */
export function removeFromIntent(intent, chip) {
  const next = {
    ...intent,
    profile: { ...intent.profile },
    view: { ...intent.view },
    unresolved: [...(intent.unresolved || [])],
  };
  if (chip.field === "text") {
    next.text = "";
    return next;
  }
  if (chip.field === "unresolved") {
    next.unresolved = next.unresolved.filter((w) => w !== chip.key);
    return next;
  }

  const [scope, field] = chip.field.split(".");
  if (scope === "profile" || scope === "view") {
    const bag = next[scope];
    if (Array.isArray(bag[field])) bag[field] = bag[field].filter((k) => k !== chip.key);
    else bag[field] = null;
  }
  // `proteinClaim` is a modifier on `minProtein`, not a chip of its own. Lifting
  // the protein limit has to lift its serving gate too, or a removed chip would
  // go on narrowing the grid invisibly.
  if (scope === "view" && field === "minProtein") next.view.proteinClaim = false;
  return next;
}
