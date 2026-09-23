// ============================================================================
// The You step's pills and restriction chips, as KOI profile fields. Pure.
//
// A chip is a shorthand for avoids (with a severity) or a diet — the planner
// never sees the chip, only the avoid keys it stands for, and those are held
// by the allergen graph at every rung of the ladder.
//
// The design's "Low-GI / diabetic" chip is not offered: KOI has no measured GI
// for any product (FSSAI allows "low GI" only on a measured GI below 55) and
// suitability claims for a disease are barred (Reg. 10). "Less refined sugar"
// is what KOI can actually do.
// ============================================================================

import { avoidKeysNamed } from "@/lib/planner/avoidWords";
import { FOODS_AVOID } from "@/lib/recommendation/config";
import { defaultSeverityFor } from "@/lib/household/profile";

export const ACTIVITY_PILLS = Object.freeze([
  { key: "sedentary", label: "Sedentary" },
  { key: "light", label: "Light" },
  { key: "moderate", label: "Moderate" },
  { key: "heavy", label: "Active" },
]);

export const DIET_PILLS = Object.freeze([
  { key: "vegetarian", label: "Veg" },
  { key: "eggetarian", label: "Veg + egg" },
  { key: "non_vegetarian", label: "Non-veg" },
  { key: "vegan", label: "Vegan" },
]);

/** Diets the pill does not cycle through but a profile may hold. */
const OTHER_DIETS = Object.freeze({ jain: "Jain", pescatarian: "Pescatarian" });

export const SEX_PILLS = Object.freeze([
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
  { key: "unspecified", label: "Prefer not to say" },
]);

export const RESTRICTION_CHIPS = Object.freeze([
  { key: "lactose", label: "Lactose-lite", avoids: [{ key: "lactose", severity: "intolerance" }] },
  { key: "gluten", label: "Gluten-free", avoids: [{ key: "gluten", severity: "intolerance" }] },
  { key: "nuts", label: "Nut allergy", avoids: [{ key: "peanuts", severity: "allergy" }, { key: "tree_nuts", severity: "allergy" }] },
  { key: "less_sugar", label: "Less refined sugar", avoids: [{ key: "refined_sugar", severity: "dislike" }] },
  { key: "jain", label: "Jain", diet: "jain" },
  { key: "no_onion_garlic", label: "No onion-garlic", avoids: [{ key: "onion_garlic", severity: "rule" }] },
]);

/** The label a pill shows for a stored value, and the next value a tap moves to. */
export function cyclePill(pills, value) {
  const index = pills.findIndex((p) => p.key === value);
  const next = pills[(index + 1) % pills.length];
  return { label: pills[index]?.label ?? OTHER_DIETS[value] ?? "Choose", next: next.key };
}

/** Is this chip on for the profile? */
export function chipOn(chip, form = {}) {
  if (chip.diet) return form.diet_type === chip.diet;
  const held = new Set((form.avoids ?? []).map((a) => a.key));
  return chip.avoids.every((a) => held.has(a.key));
}

/**
 * The profile after tapping a chip.
 * @returns {{ avoids: {key, severity}[], diet_type: string }}
 */
export function toggleChip(chip, form = {}) {
  const avoids = [...(form.avoids ?? [])];
  let dietType = form.diet_type;
  if (chip.diet) {
    // Off again, a Jain household is still vegetarian.
    dietType = form.diet_type === chip.diet ? "vegetarian" : chip.diet;
    return { avoids, diet_type: dietType };
  }
  if (chipOn(chip, form)) {
    const off = new Set(chip.avoids.map((a) => a.key));
    return { avoids: avoids.filter((a) => !off.has(a.key)), diet_type: dietType };
  }
  for (const a of chip.avoids) {
    const existing = avoids.find((x) => x.key === a.key);
    if (existing) existing.severity = a.severity;
    else avoids.push({ ...a });
  }
  return { avoids, diet_type: dietType };
}

const LABEL_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a.label]));

/**
 * The shopper's "ingredients to avoid" words, as avoid keys KOI can enforce.
 * Words it cannot tie to a key are returned as `unknown`, never guessed at.
 * @param {string} text
 * @returns {{ avoids: {key, severity, label}[], unknown: string[] }}
 */
export function avoidsFromWords(text) {
  const pieces = String(text ?? "").split(/[,;\n]+|\band\b/i).map((s) => s.trim()).filter(Boolean);
  const avoids = [];
  const unknown = [];
  for (const piece of pieces) {
    const keys = avoidKeysNamed(piece);
    if (!keys.length) {
      unknown.push(piece.slice(0, 40));
      continue;
    }
    for (const key of keys) {
      if (!avoids.some((a) => a.key === key)) avoids.push({ key, severity: defaultSeverityFor(key), label: LABEL_BY_KEY[key] ?? key });
    }
  }
  return { avoids, unknown };
}

/** An avoid's label, for a chip. */
export const avoidLabel = (key) => LABEL_BY_KEY[key] ?? key;
