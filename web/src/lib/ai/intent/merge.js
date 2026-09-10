// ============================================================================
// KOI — Query Intent · Safety merge
// Combines an interpreted query with the shopper's stored profile to produce the
// profile the KRE will actually run on.
//
// The invariant this module exists to hold: an interpretation can only ever
// TIGHTEN what a shopper is shown, never loosen it. A model that returns an
// empty avoid list, hallucinates `dietType: "non_vegetarian"` over a vegan
// profile, or simply times out mid-stream cannot expose someone to a food they
// told KOI to keep away from. That property lives here rather than in the
// interpreter, so it holds no matter which interpreter produced the intent.
//
// Specifically:
//   - `foodsAvoid` is a UNION. Restrictions accumulate and are never replaced.
//   - `dietType` may only move to a STRICTER diet, measured by the exclusion
//     sets in DIET_EXCLUSIONS. A looser one is refused and reported.
//   - `targets` comes from the stored profile alone. An interpreter never sets
//     a macro target — those are computed from body stats in goalStore.
//   - `goal`, `budget` and `mealPrefs` are momentary preferences that only
//     affect ranking and presentation, so a query may set them freely.
// ============================================================================

import { DIET_EXCLUSIONS } from "@/lib/recommendation/config";
import { normalise } from "./deterministic";

const uniq = (a) => [...new Set((a || []).filter(Boolean))];

/** How many contains-flags a diet excludes; the ordering of "stricter". */
const strictness = (diet) => (DIET_EXCLUSIONS[diet] || []).length;

/**
 * True when `next` excludes everything `current` excludes.
 * Compared as sets, not counts — vegetarian and jain both exclude four flags
 * but are not interchangeable, and a count check would let one silently
 * replace the other.
 */
function isAtLeastAsStrict(next, current) {
  if (!current) return true;
  if (!next) return false;
  const currentFlags = DIET_EXCLUSIONS[current] || [];
  const nextFlags = new Set(DIET_EXCLUSIONS[next] || []);
  return currentFlags.every((flag) => nextFlags.has(flag));
}

/**
 * Strip anything from an intent that the shopper did not actually say.
 *
 * `unresolved` is the only free-text field that reaches the UI, so every entry
 * must appear in the submitted query. This is what stops an interpreter — a
 * model in particular — from putting words of its own in front of a shopper
 * under the guise of echoing them back.
 *
 * @param {object} intent a parsed intent
 * @param {string} queryText the shopper's original query
 * @returns {object} the intent with unverifiable echoes removed
 */
export function sanitiseIntent(intent, queryText) {
  const haystack = ` ${normalise(queryText)} `;
  const unresolved = (intent.unresolved || []).filter((word) => {
    const w = normalise(word);
    return w && (haystack.includes(` ${w} `) || haystack.includes(`${w} `) || haystack.includes(` ${w}`));
  });
  const text = normalise(intent.text || "");
  return {
    ...intent,
    unresolved: uniq(unresolved),
    // Residual search text must likewise come from the query itself.
    text: text && haystack.includes(text.split(" ")[0]) ? intent.text : "",
  };
}

/**
 * Merge an intent's profile half over the shopper's stored profile.
 *
 * @param {object|null} stored profile from goalStore (may be null when logged out)
 * @param {object} intent a parsed, sanitised intent
 * @returns {{ profile: object, refusals: string[] }} the KRE profile, plus a
 *   list of intent fields that were refused for being less strict than what the
 *   shopper already told KOI. `refusals` is diagnostic — the UI uses it to
 *   explain why a stored preference still applies.
 */
export function mergeProfile(stored, intent) {
  const base = stored || {};
  const from = (intent && intent.profile) || {};
  const refusals = [];

  // Restrictions only ever accumulate.
  const foodsAvoid = uniq([...(base.foodsAvoid || []), ...(from.foodsAvoid || [])]);

  let dietType = base.dietType || null;
  if (from.dietType && from.dietType !== dietType) {
    if (isAtLeastAsStrict(from.dietType, dietType)) dietType = from.dietType;
    else refusals.push(`dietType:${from.dietType}`);
  }

  return {
    refusals,
    profile: {
      ...base,
      dietType,
      foodsAvoid,
      foodsLove: uniq([...(base.foodsLove || []), ...(from.foodsLove || [])]),
      // A query names the moment; the stored list is the standing preference.
      mealPrefs: (from.mealPrefs || []).length ? uniq(from.mealPrefs) : uniq(base.mealPrefs),
      goal: from.goal || base.goal || null,
      budget: from.budget || base.budget || null,
      // Never interpreter-set: computed from body stats in goalStore.
      targets: base.targets || null,
    },
  };
}

export { isAtLeastAsStrict, strictness };
