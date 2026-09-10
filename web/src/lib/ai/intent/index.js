// ============================================================================
// KOI — Query Intent · Public API
// Client-safe. Importing this pulls in the deterministic interpreter only, so a
// component can interpret a query synchronously with no network and no provider
// configured. The provider path lives behind `adapter.js`, which is
// `server-only` and reachable solely through app/api/assistant/interpret.
//
// The contract for the whole module:
//   interpret(text)                  → intent, instantly, always
//   resolveIntent(products, intent)  → the ids that satisfy it
//   describeIntent(intent)           → removable chips
//   adoptRefinement(local, raw, text)→ fold a model's answer in, safely
// ============================================================================

import { interpretDeterministic } from "./deterministic";
import { parseIntent, isEmptyIntent, EMPTY_INTENT } from "./schema";
import { sanitiseIntent, isAtLeastAsStrict } from "./merge";

/**
 * Interpret a shopper's query. Pure, synchronous, no I/O.
 *
 * @param {string} text raw query
 * @returns {object} a validated, sanitised intent
 */
export function interpret(text) {
  const { intent } = parseIntent(interpretDeterministic(text));
  return sanitiseIntent(intent, text);
}

const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];

/**
 * Fold a refined interpretation (today: nothing; later: a model's answer) into
 * the one already on screen.
 *
 * A refinement may improve what the shopper is looking FOR — the goal, the
 * meal, the limits, the residual product word. It may not take away what they
 * asked to be kept OUT: `foodsAvoid` and `unresolved` union with the local
 * result, and `dietType` only moves to a stricter diet. So a model that
 * hallucinates, drops a field, or is outright wrong can still only ever add
 * restrictions to what the deterministic pass already found.
 *
 * @param {object} local the deterministic intent currently displayed
 * @param {unknown} raw  the refinement, unvalidated
 * @param {string} text  the shopper's original query
 * @returns {object} the intent to display, or `local` if the refinement is unusable
 */
export function adoptRefinement(local, raw, text) {
  const parsed = parseIntent(raw);
  if (!parsed.ok) return local;
  const refined = sanitiseIntent(parsed.intent, text);
  if (isEmptyIntent(refined) && !refined.unresolved.length) return local;

  const localDiet = local.profile.dietType;
  const refinedDiet = refined.profile.dietType;

  return {
    ...refined,
    profile: {
      ...refined.profile,
      foodsAvoid: union(local.profile.foodsAvoid, refined.profile.foodsAvoid),
      foodsLove: union(local.profile.foodsLove, refined.profile.foodsLove),
      dietType: isAtLeastAsStrict(refinedDiet, localDiet) ? refinedDiet : localDiet,
    },
    view: {
      ...refined.view,
      // The serving gate only ever narrows, so a refinement may switch it on
      // but never off — the same tighten-only rule the restrictions follow.
      proteinClaim: Boolean(local.view?.proteinClaim || refined.view?.proteinClaim),
    },
    unresolved: union(local.unresolved, refined.unresolved),
  };
}

export { resolveIntent, suggestRelaxations } from "./resolveIntent";
export { describeIntent, removeFromIntent } from "./describe";
export { mergeProfile } from "./merge";
export { isEmptyIntent, EMPTY_INTENT, parseIntent };
