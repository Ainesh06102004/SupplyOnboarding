// ============================================================================
// KOI — Query Intent · Schema
// The wire shape of an interpreted shopper query, and the ONLY vocabulary any
// interpreter — the rule-based one today, a model later — is permitted to speak.
//
// Guarantees:
//   - Every enum is GENERATED from the frozen catalogs in
//     lib/recommendation/config.js. An interpreter cannot emit a key the engine
//     does not already understand; unknown keys fail validation and are dropped
//     rather than reaching the pipeline. Engine, UI and migration stay in step
//     by construction rather than by discipline.
//   - The shape carries KEYS, BANDS and shopper-stated LIMITS only. There is no
//     field for a KOI score, a nutrition figure, or an availability claim, so no
//     interpreter can author one. A numeric limit here is a constraint the
//     shopper asked for, never an assertion about a product.
//
// Deliberately absent:
//   - Anything that widens eligibility. There is no "ignore my diet type"
//     field. Restrictions are only ever added; see merge.js.
//   - Free text destined for a supply provider. Search stays on KOI's Postgres.
// ============================================================================

import { z } from "zod";
import {
  GOAL_PROFILES, DIET_TYPES, MEALS, FOODS_AVOID, FOODS_LOVE, BUDGETS,
} from "@/lib/recommendation/config";

const keysOf = (list) => Object.freeze(list.map((x) => x.key));

export const GOAL_KEYS = Object.freeze(Object.keys(GOAL_PROFILES));
export const DIET_KEYS = keysOf(DIET_TYPES);
export const MEAL_KEYS = keysOf(MEALS);
export const AVOID_KEYS = keysOf(FOODS_AVOID);
export const LOVE_KEYS = keysOf(FOODS_LOVE);
export const BUDGET_KEYS = keysOf(BUDGETS);

// Sort labels are UI literals owned by app/store/shop/page.js. Listed here so
// an interpreter can only name a sort the grid actually implements.
export const SORTS = Object.freeze([
  "Recommended", "Highest KOI Score", "Price Low to High", "Newest",
]);

// Bounds on the numeric view filters. These limit what a shopper may ASK for;
// they assert nothing about any product. A macro filter reads declared columns
// and excludes products whose figure is undeclared — see resolveIntent.js.
export const LIMIT_BOUNDS = Object.freeze({
  maxKcal: Object.freeze([20, 2000]),
  minProtein: Object.freeze([1, 100]),
  maxSugar: Object.freeze([0, 100]),
  maxPrice: Object.freeze([1, 100000]),
});

const enumOf = (list) => z.enum([...list]);
const listOf = (list) => z.array(enumOf(list)).max(list.length).default([]);
const limit = (name, int = false) => {
  const [lo, hi] = LIMIT_BOUNDS[name];
  const base = int ? z.number().int() : z.number();
  return base.min(lo).max(hi).nullable().default(null);
};

/**
 * An interpreted query.
 *
 * `profile` is merged over the shopper's stored profile and handed to the KRE,
 * so it speaks the engine's own vocabulary — note `mealPrefs`, which is the
 * name `scoringEngine.js` actually reads, not `meals`.
 *
 * `view` is presentation only and maps onto filter state the shop page already
 * owns. It cannot express anything the grid cannot already do.
 *
 * `unresolved` carries restrictions the interpreter recognised as restrictions
 * but could not map to a catalog key. It exists because silently dropping a
 * stated dietary limit is the dangerous failure: KOI must say "I did not apply
 * this" rather than quietly returning products that violate it.
 */
export const IntentSchema = z.object({
  profile: z.object({
    goal: enumOf(GOAL_KEYS).nullable().default(null),
    dietType: enumOf(DIET_KEYS).nullable().default(null),
    mealPrefs: listOf(MEAL_KEYS),
    foodsAvoid: listOf(AVOID_KEYS),
    foodsLove: listOf(LOVE_KEYS),
    budget: enumOf(BUDGET_KEYS).nullable().default(null),
    // `prefault`, not `default`: Zod 4 hands a `default` value back without
    // parsing it, so `.default({})` would yield a literally empty object and
    // every inner default — `foodsAvoid: []` included — would be `undefined`.
    // `prefault` runs the value through the schema, so a parsed intent is
    // always fully shaped and callers need no `|| []` to be safe.
  }).prefault({}),

  view: z.object({
    sort: z.enum([...SORTS]).nullable().default(null),
    minScore: z.number().int().min(0).max(100).nullable().default(null),
    maxKcal: limit("maxKcal"),
    minProtein: limit("minProtein"),
    maxSugar: limit("maxSugar"),
    maxPrice: limit("maxPrice"),

    // True when `minProtein` came from KOI's own claim vocabulary ("high
    // protein") rather than a figure the shopper named. Only then does the
    // resolver also require the serving gate the "High Protein" badge uses, so
    // that search and the product card cannot disagree about who is high
    // protein. A shopper who asks for "at least 25g protein" is asking a
    // density question and gets a literal answer.
    proteinClaim: z.boolean().default(false),
  }).prefault({}),

  // Residual free text, kept ONLY when it names something the catalogue might
  // match on — a brand or a product word. Never a whole sentence: a sentence
  // used as a substring is the bug this feature exists to fix.
  text: z.string().max(80).default(""),

  // Echoes of the shopper's own words, never interpreter prose. `sanitise()`
  // enforces that each entry is a substring of the submitted query.
  unresolved: z.array(z.string().max(40)).max(8).default([]),

  source: z.string().max(40).default("deterministic"),
  confidence: z.number().min(0).max(1).default(0),
});

export const EMPTY_INTENT = Object.freeze(IntentSchema.parse({}));

const uniq = (a) => [...new Set(a)];

/**
 * Validate and normalise anything claiming to be an intent.
 *
 * Never throws. An unparseable payload becomes `EMPTY_INTENT`, which callers
 * treat as "understood nothing" and fall back to plain text search — a model
 * returning nonsense degrades to today's behaviour rather than breaking search.
 *
 * @param {unknown} raw
 * @returns {{ ok: boolean, intent: object, issues: string[] }}
 */
export function parseIntent(raw) {
  const result = IntentSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      intent: EMPTY_INTENT,
      issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`),
    };
  }
  const intent = result.data;
  return {
    ok: true,
    issues: [],
    intent: {
      ...intent,
      profile: {
        ...intent.profile,
        mealPrefs: uniq(intent.profile.mealPrefs),
        foodsAvoid: uniq(intent.profile.foodsAvoid),
        foodsLove: uniq(intent.profile.foodsLove),
      },
      unresolved: uniq(intent.unresolved),
    },
  };
}

/**
 * True when an intent expresses no constraint the storefront can act on.
 * `unresolved` deliberately does not count — it is something to tell the
 * shopper about, not something that narrows the grid.
 *
 * @param {object|null} intent
 * @returns {boolean}
 */
export function isEmptyIntent(intent) {
  if (!intent) return true;
  const p = intent.profile || {};
  const v = intent.view || {};
  return (
    !p.goal && !p.dietType && !p.budget &&
    !(p.mealPrefs || []).length &&
    !(p.foodsAvoid || []).length &&
    !(p.foodsLove || []).length &&
    !v.sort && v.minScore == null &&
    v.maxKcal == null && v.minProtein == null &&
    v.maxSugar == null && v.maxPrice == null
  );
}
