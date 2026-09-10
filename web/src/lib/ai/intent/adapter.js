// ============================================================================
// KOI — Intent adapter seam
// The boundary between KOI's own query understanding and any third-party model.
// `server-only` guards it: the route handler under app/api/assistant/ is the
// only caller, so no provider credential can be bundled into client code.
//
// The contract an adapter must satisfy:
//
//   interpret(text: string) => Promise<object | null>
//
// It returns something intent-SHAPED, or null. It is never trusted:
// `parseIntent` validates the shape against enums generated from the frozen
// catalogs, `sanitiseIntent` strips anything not present in the shopper's own
// words, and `adoptRefinement` allows it to add restrictions but never remove
// them. An adapter is therefore a suggestion engine with no authority.
//
// What an adapter must NOT be given, and cannot express through this contract:
//   - the catalogue. It sees the query text and nothing else. It cannot be
//     asked which products exist, and cannot smuggle bulk catalogue data out.
//   - a nutrition figure, a KOI score, or an availability claim. No field.
//   - prose destined for a product card. No field.
//
// Selection mirrors KOI_MARKETPLACE: one env var, an honest default, and the
// mock/model path opt-in so it can never leak into production by accident.
// ============================================================================

import "server-only";

import { NoneAdapter } from "./adapters/none";

const ADAPTERS = Object.freeze({
  none: NoneAdapter,
});

/**
 * The configured adapter. Unknown or unset values resolve to `none` rather
 * than throwing: a typo in an env var must not take shop search down, because
 * the deterministic interpreter is what actually answers the query.
 *
 * @returns {{ name: string, interpret: (text: string) => Promise<object|null> }}
 */
export function getIntentAdapter() {
  const configured = process.env.KOI_AI_INTERPRETER;
  return ADAPTERS[configured] || ADAPTERS.none;
}

export { ADAPTERS };
