// ============================================================================
// KOI — Query Intent · What a model is asked, and the shape it must answer in
//
// Phase 4.1. Pure. The strict JSON schema and the instructions are both
// GENERATED from the catalogues in lib/recommendation/config.js, the same way
// schema.js generates its Zod enums, so a model is offered exactly the keys the
// engine understands and no others.
//
// The model sees one sentence and this vocabulary. It never sees the
// catalogue, a product, a price list or a profile (plan §13, rule 4).
//
// Whatever it answers is still only a suggestion: parseIntent validates it,
// sanitiseIntent removes words the shopper did not type, groundLimits removes
// numbers the shopper did not type, and adoptRefinement lets it add
// restrictions but never remove one.
// ============================================================================

import {
  GOAL_PROFILES, DIET_TYPES, MEALS, FOODS_AVOID, FOODS_LOVE, BUDGETS, THRESHOLDS,
} from "@/lib/recommendation/config";
import { GOAL_KEYS, DIET_KEYS, MEAL_KEYS, AVOID_KEYS, LOVE_KEYS, BUDGET_KEYS, SORTS, LIMIT_BOUNDS } from "./schema";
import { MEDICAL_TERMS } from "./deterministic";
import { nullableEnum, nullableNumber, enumArray, strictObject } from "@/lib/ai/providers/openaiFormat";

export const INTENT_SCHEMA_NAME = "koi_query_intent";

/** The strict schema the model answers in. Every field present; nulls for "not asked". */
export const INTENT_JSON_SCHEMA = Object.freeze(strictObject({
  profile: strictObject({
    goal: nullableEnum(GOAL_KEYS),
    dietType: nullableEnum(DIET_KEYS),
    mealPrefs: enumArray(MEAL_KEYS),
    foodsAvoid: enumArray(AVOID_KEYS),
    foodsLove: enumArray(LOVE_KEYS),
    budget: nullableEnum(BUDGET_KEYS),
  }),
  view: strictObject({
    sort: nullableEnum(SORTS),
    minScore: nullableNumber(),
    maxKcal: nullableNumber(),
    minProtein: nullableNumber(),
    maxSugar: nullableNumber(),
    maxPrice: nullableNumber(),
    proteinClaim: { type: "boolean" },
    sugarClaim: { type: "boolean" },
  }),
  text: { type: "string" },
  unresolved: { type: "array", items: { type: "string" } },
}));

const vocabulary = (name, entries) => `${name}: ${entries.map(([key, label]) => `${key} (${label})`).join("; ")}`;

/** What the model is told. Built from the catalogues, so it cannot drift from them. */
export const INTENT_INSTRUCTIONS = [
  "You read one sentence a shopper typed into the search box of KOI, an Indian grocery store, and return what they asked for using only the keys listed below.",
  "",
  "Rules:",
  "- Set a field only when the sentence asks for it. Everything else is null, false or an empty list.",
  `- Never invent a number. maxKcal, minProtein, maxSugar, maxPrice (rupees) and minScore are set only to a number the shopper wrote. Two exceptions, KOI's own claim words: "high protein" sets minProtein ${THRESHOLDS.proteinHigh} and proteinClaim true; "low sugar" sets maxSugar ${THRESHOLDS.sugarLow} and sugarClaim true.`,
  `- Limits a shopper may ask for: maxKcal ${LIMIT_BOUNDS.maxKcal.join("-")}, minProtein ${LIMIT_BOUNDS.minProtein.join("-")}, maxSugar ${LIMIT_BOUNDS.maxSugar.join("-")}, maxPrice ${LIMIT_BOUNDS.maxPrice.join("-")}, minScore 0-100.`,
  "- Something to keep out that has no key below goes in unresolved, copied word for word from the sentence (at most three words). Never drop a restriction.",
  `- A medical condition is never a filter. Copy the words into unresolved and set nothing else for it. Examples: ${MEDICAL_TERMS.slice(0, 6).join(", ")}.`,
  "- text is a brand or product word from the sentence that a product name might contain, or an empty string. Never a whole sentence.",
  "",
  "Vocabulary:",
  vocabulary("goal", Object.entries(GOAL_PROFILES).map(([key, g]) => [key, g.label])),
  vocabulary("dietType", DIET_TYPES.map((d) => [d.key, d.label])),
  vocabulary("mealPrefs", MEALS.map((m) => [m.key, m.label])),
  vocabulary("foodsAvoid", FOODS_AVOID.map((a) => [a.key, a.label])),
  vocabulary("foodsLove", FOODS_LOVE.map((l) => [l.key, l.label])),
  vocabulary("budget", BUDGETS.map((b) => [b.key, b.hint])),
  `sort: ${SORTS.join("; ")}`,
].join("\n");

/**
 * The model's answer, labelled as the model's. Validation happens after this.
 * @param {object} output
 * @returns {object}
 */
export function intentFromModel(output) {
  return { ...(output ?? {}), source: "openai", confidence: 0 };
}
