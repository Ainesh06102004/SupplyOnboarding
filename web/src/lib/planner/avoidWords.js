// ============================================================================
// KOI PLANNER — The words that name an avoid
//
// Pure. Shared by household briefs (brief.js) and follow-ups (followup.js).
//
// "No nuts" is an avoid; "no paneer" is a product. Search reads "no paneer" as
// "avoid milk", which is the right tightening for a filter, but in a plan it
// would take every dairy product out of the week when the shopper only said
// paneer. So a planner reading counts an avoid only when the message names the
// avoid itself, and holds a model's avoids to the same test.
// ============================================================================

import { FOODS_AVOID } from "@/lib/recommendation/config";
import { normalise } from "@/lib/ai/intent/deterministic";

const EXTRA_WORDS = Object.freeze({
  tree_nuts: ["nut", "nuts"], peanuts: ["peanut", "groundnut", "nuts"], milk: ["dairy"], lactose: ["dairy"],
  eggs: ["egg"], gluten: ["wheat"], soy: ["soya"], red_meat: ["meat"], refined_sugar: ["sugar"],
  high_sodium: ["salt", "sodium"], spicy_food: ["spicy"], artificial_sweeteners: ["sweetener", "sweeteners"],
  preservatives: ["preservative"], artificial_colours: ["colour", "colours", "color", "colors"],
  artificial_flavours: ["flavour", "flavours", "flavor", "flavors"], caffeine: ["coffee"], shellfish: ["prawn", "prawns", "seafood"],
});

export const AVOID_WORDS = Object.freeze(Object.fromEntries(FOODS_AVOID.map((a) => [
  a.key,
  [...new Set([a.key.replace(/_/g, " "), normalise(a.label), ...(EXTRA_WORDS[a.key] ?? [])])],
])));

/**
 * Avoid keys a piece of text names in so many words.
 * @param {string} text
 * @returns {string[]}
 */
export function avoidKeysNamed(text) {
  const haystack = ` ${normalise(text)} `;
  return Object.entries(AVOID_WORDS)
    .filter(([, words]) => words.some((w) => haystack.includes(` ${w} `)))
    .map(([key]) => key);
}
