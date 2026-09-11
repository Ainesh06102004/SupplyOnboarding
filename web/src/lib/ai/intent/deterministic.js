// ============================================================================
// KOI — Query Intent · Deterministic interpreter
// Turns a shopper's sentence into an intent using nothing but a phrase table.
// This is the DEFAULT interpreter and the PERMANENT fallback — not a stub. With
// no model configured the storefront still understands "high protein snacks
// under rs 200, no dairy", which is the whole point of shipping it first.
//
// What it guarantees:
//   - Pure. Same string in, same intent out. No I/O, no clock, no randomness.
//   - It only ever emits keys that exist in lib/recommendation/config.js. The
//     phrase table maps LANGUAGE to those keys; it never invents one.
//     VOCAB_DRIFT reports any phrase pointing at a key the catalogs no longer
//     have, and the test suite asserts it is empty.
//   - A restriction it recognises but cannot map becomes `unresolved` rather
//     than a near-miss. Narrowing a stated allergy to the nearest key KOI has
//     is a false safety promise.
//   - An ambiguous restriction widens, never narrows. "no nuts" becomes BOTH
//     peanuts and tree nuts: a shopper who says it may mean either, and a
//     restriction can only ever be over-applied safely.
//
// Negation is POSITIONAL, not per-clause. "high protein snacks without dairy"
// is one clause, and a clause-wide flag would negate the whole thing — dropping
// the protein goal and the snack occasion on the way past. A cue instead
// negates from where it appears to the end of its clause, so terms in front of
// it stay positive. The suffix form ("dairy free", "lactose intolerant") is
// handled separately, because there the restriction sits BEFORE the cue.
//
// Where the numbers come from:
//   Qualitative macro words reuse KOI's OWN published thresholds — "high
//   protein" is THRESHOLDS.proteinHigh and "low sugar" is THRESHOLDS.sugarLow,
//   and each sets a claim flag so the resolver applies the full rule from
//   lib/nutrition/claims.js — the same one behind the shelves and badges. No
//   threshold is invented here, and no magic number is inlined.
// ============================================================================

import { FOODS_LOVE, THRESHOLDS } from "@/lib/recommendation/config";
import {
  GOAL_KEYS, DIET_KEYS, MEAL_KEYS, AVOID_KEYS, LOVE_KEYS, BUDGET_KEYS,
  SORTS, LIMIT_BOUNDS,
} from "./schema";

// ── Phrase tables: language → catalog key ───────────────────────────────────
// These are shopper phrasings, which is genuinely new information — the keys
// they point at remain owned by config.js.

const GOAL_PHRASES = {
  fatloss: ["fat loss", "lose weight", "weight loss", "losing weight", "cutting", "cut", "slim down", "lean out", "leaner", "shred"],
  muscle: ["muscle gain", "gain muscle", "build muscle", "muscle", "bulking", "bulk", "strength", "mass gain"],
  weight_gain: ["weight gain", "gain weight", "put on weight"],
  maintenance: ["maintenance", "maintain", "stay the same"],
  wellness: ["general wellness", "wellness", "eat cleaner", "clean eating", "general health", "feel better", "healthy", "healthier"],
  high_protein: ["high protein", "more protein", "protein rich", "rich in protein", "protein"],
  low_sugar: ["low sugar", "lower sugar", "less sugar", "diabetic", "diabetes"],
  heart_health: ["heart health", "heart healthy", "cholesterol", "blood pressure"],
  gut_health: ["gut health", "digestion", "digestive", "bloating", "fibre rich", "fiber rich", "high fibre", "high fiber"],
};

const DIET_PHRASES = {
  vegan: ["vegan", "plant based"],
  vegetarian: ["vegetarian", "pure veg", "veg only", "veggie"],
  eggetarian: ["eggetarian", "egg vegetarian"],
  jain: ["jain"],
  pescatarian: ["pescatarian", "pescetarian"],
  non_vegetarian: ["non vegetarian", "non veg", "nonveg"],
};

const MEAL_PHRASES = {
  breakfast: ["breakfast", "morning meal"],
  lunch: ["lunch"],
  dinner: ["dinner", "supper"],
  snacks: ["snack", "snacking", "munchies", "something to munch"],
  pre_workout: ["pre workout", "preworkout", "before workout", "before gym", "before training"],
  post_workout: ["post workout", "postworkout", "after workout", "after gym", "after training", "recovery"],
  late_night: ["late night", "midnight", "late evening"],
  office_snacks: ["office snack", "office", "desk snack", "work snack"],
};

// Curated rather than derived from CONTAINS_KEYWORDS. That catalog maps flags to
// product-label signals, so borrowing it wholesale would read "no chicken" as
// the whole `meat` flag and quietly exclude fish and mutton too. A shopper's
// words deserve a narrower, deliberate mapping.
const AVOID_PHRASES = {
  milk: ["dairy", "milk", "butter", "ghee", "paneer", "cheese", "curd", "yogurt", "yoghurt", "cream", "whey"],
  lactose: ["lactose"],
  // "nut" sits in both lists on purpose — see the banner.
  peanuts: ["peanut", "groundnut", "nut"],
  tree_nuts: [
    "nut", "tree nut", "almond", "cashew", "walnut", "pistachio", "hazelnut",
    "pecan", "macadamia", "badam", "kaju", "akhrot", "pista", "dry fruit",
  ],
  soy: ["soy", "soya", "tofu"],
  gluten: ["gluten", "wheat", "maida"],
  eggs: ["egg"],
  fish: ["fish", "tuna", "salmon", "anchovy"],
  shellfish: ["shellfish", "prawn", "shrimp", "crab", "lobster"],
  red_meat: ["red meat", "beef", "pork", "mutton", "lamb"],
  caffeine: ["caffeine", "coffee", "espresso", "tea"],
  artificial_sweeteners: ["artificial sweetener", "sweetener", "aspartame", "sucralose", "saccharin"],
  palm_oil: ["palm oil", "palmolein"],
  refined_sugar: ["refined sugar", "added sugar", "sugar"],
  high_sodium: ["sodium", "salt", "salty"],
  preservatives: ["preservative"],
  artificial_colours: ["artificial colour", "artificial color", "colouring", "coloring"],
  artificial_flavours: ["artificial flavour", "artificial flavor"],
  spicy: ["spicy", "chilli", "chili", "masala"],
};

// Restrictions a shopper can plausibly state that KOI has NO key for. Recognised
// only so they can be reported as not applied. Extending FOODS_AVOID to cover
// them is a shared-catalog change (engine + UI + migration) and deliberately
// outside this slice.
const UNRESOLVABLE_RESTRICTIONS = [
  "seafood", "onion", "garlic", "msg", "sesame", "corn", "yeast", "mushroom",
  "coconut", "maize", "jaggery",
];

const BUDGET_PHRASES = {
  low: ["cheap", "budget", "affordable", "inexpensive", "low cost", "pocket friendly"],
  medium: ["mid range", "midrange", "moderately priced"],
  high: ["premium", "expensive", "high end", "luxury"],
};

const SORT_PHRASES = {
  "Price Low to High": ["cheapest", "lowest price", "price low to high", "least expensive"],
  "Highest KOI Score": ["highest score", "best score", "top scoring", "highest koi score", "best rated"],
  Newest: ["newest", "latest", "just added", "recently added"],
};

// ── Table assembly ──────────────────────────────────────────────────────────
// One table, longest phrase first, so precedence falls out of the data rather
// than out of the order of a dozen if-statements: "protein bar" beats
// "protein", "non veg" beats "veg", "red meat" beats "meat".

const VOCAB_DRIFT = [];

function validKeys(map, allowed, field) {
  const allow = new Set(allowed);
  const out = {};
  for (const [key, phrases] of Object.entries(map)) {
    if (!allow.has(key)) { VOCAB_DRIFT.push(`${field}:${key}`); continue; }
    out[key] = phrases;
  }
  return out;
}

const TABLES = [
  ["goal", validKeys(GOAL_PHRASES, GOAL_KEYS, "goal")],
  ["diet", validKeys(DIET_PHRASES, DIET_KEYS, "diet")],
  ["meal", validKeys(MEAL_PHRASES, MEAL_KEYS, "meal")],
  ["avoid", validKeys(AVOID_PHRASES, AVOID_KEYS, "avoid")],
  ["budget", validKeys(BUDGET_PHRASES, BUDGET_KEYS, "budget")],
  ["sort", validKeys(SORT_PHRASES, SORTS, "sort")],
  ["love", validKeys(
    Object.fromEntries(FOODS_LOVE.map((f) => [f.key, f.keywords])),
    LOVE_KEYS, "love",
  )],
];

/** Phrase → { field: key, ... }. One phrase may serve several fields; polarity picks. */
const PHRASE_INDEX = (() => {
  const index = new Map();
  const add = (phrase, field, key) => {
    const p = phrase.toLowerCase().trim();
    if (!p) return;
    const entry = index.get(p) || {};
    // An avoid phrase keeps EVERY key it names ("nut" → peanuts and tree nuts):
    // dropping one would narrow a restriction. Other fields keep the first.
    if (field === "avoid") entry.avoid = [...(entry.avoid || []), key];
    else if (entry[field] === undefined) entry[field] = key;
    index.set(p, entry);
  };
  for (const [field, table] of TABLES) {
    for (const [key, phrases] of Object.entries(table)) {
      for (const phrase of phrases) add(phrase, field, key);
    }
  }
  for (const phrase of UNRESOLVABLE_RESTRICTIONS) add(phrase, "unresolvable", phrase);
  return index;
})();

const PHRASES_BY_LENGTH = Object.freeze(
  [...PHRASE_INDEX.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b)),
);

export { VOCAB_DRIFT, PHRASE_INDEX };

// ── Text handling ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "for", "with", "some", "something",
  "any", "anything", "me", "my", "i", "im", "want", "need", "needs", "looking",
  "look", "show", "find", "get", "give", "please", "good", "best", "nice",
  "of", "to", "in", "on", "at", "is", "are", "that", "this", "it", "you",
  "koi", "buy", "under", "below", "over", "above", "less", "than", "more",
  "up", "upto", "max", "maximum", "min", "minimum", "least", "atleast",
  "about", "around", "per", "rs", "inr", "rupee", "rupees", "gram", "grams",
  "gm", "gms", "g", "kcal", "cal", "calorie", "calories", "protein", "sugar",
  "score", "rated", "rating", "products", "product", "options", "option",
  "items", "item", "no", "not", "without", "free", "from", "avoid", "avoiding",
  "exclude", "excluding", "skip", "minus", "allergic", "allergy", "intolerant",
  "intolerance", "cant", "cannot", "have", "sans", "zero", "only", "kid",
  "kids", "child", "children", "wife", "husband", "mom", "dad",
]);

/**
 * Lowercase, currency folded to a word, punctuation folded to spaces.
 *
 * Clause delimiters survive deliberately. An earlier version stripped commas
 * here, which merged "post workout, no dairy, under 200" into a single clause
 * whose lone "no" then negated the whole query — the meal and the price limit
 * were both lost. Delimiters are structure, not noise.
 */
export function normalise(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[₹]/g, " rs ")
    .replace(/[‐-―‘’“”]/g, " ")
    .replace(/[^a-z0-9+.,;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cues that negate what FOLLOWS them, to the end of the clause.
const PREFIX_CUES = Object.freeze([
  "no", "not", "without", "avoid", "avoiding", "exclude", "excluding", "skip",
  "minus", "sans", "zero", "allergic", "allergy", "cant", "cannot",
]);

// Cues that negate the term BEFORE them: "dairy free", "lactose intolerant".
const SUFFIX_CUES = Object.freeze([/\s([a-z]+(?:\s[a-z]+)?)\s+free\b/, /\s([a-z]+(?:\s[a-z]+)?)\s+intoleran\w*\b/]);

const CLAUSE_SPLIT = /\s+(?:and|but|also|plus|with)\s+|\s*[,;/]\s*|\s*\+\s*/;

/**
 * Split normalised text into clauses. Negation is resolved per clause later,
 * by position, so no polarity is decided here.
 *
 * @param {string} text normalised text
 * @returns {string[]}
 */
export function splitClauses(text) {
  if (!text) return [];
  return text
    .split(CLAUSE_SPLIT)
    .map((c) => c.replace(/[,;/]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Character offset in `padded` from which a prefix cue negates, or Infinity.
 * @param {string} padded a clause wrapped in single spaces
 * @returns {number}
 */
export function negationStart(padded) {
  let earliest = Infinity;
  for (const cue of PREFIX_CUES) {
    const at = padded.indexOf(` ${cue} `);
    if (at !== -1 && at < earliest) earliest = at;
  }
  return earliest;
}

// ── Numeric limits ──────────────────────────────────────────────────────────

const clamp = (n, name) => {
  const [lo, hi] = LIMIT_BOUNDS[name];
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/**
 * Pull shopper-stated numeric limits out of a clause, blanking what it consumes.
 * Units decide the field: a bare "under 200" in a shop means rupees, while
 * "200 calories" and "20g protein" name themselves.
 *
 * @param {string} text a clause
 * @returns {{ rest: string, limits: object }}
 */
export function extractLimits(text) {
  let rest = ` ${text} `;
  const limits = {};
  const take = (re, field) => {
    const m = rest.match(re);
    if (!m) return;
    const value = clamp(Number(m[1]), field);
    if (value === null) return;
    if (limits[field] === undefined) limits[field] = value;
    rest = rest.replace(m[0], " ");
  };

  take(/(\d{2,4})\s*(?:kcal|cal|calorie|calories)\b/, "maxKcal");
  take(/(\d{1,3})\s*(?:g|gm|gms|gram|grams)?\s*(?:of\s*)?protein\b/, "minProtein");
  take(/protein\s*(?:above|over|at least|atleast|min|minimum)?\s*(\d{1,3})\s*(?:g|gm|gram|grams)?\b/, "minProtein");
  take(/(\d{1,3})\s*(?:g|gm|gms|gram|grams)?\s*(?:of\s*)?sugar\b/, "maxSugar");
  take(/(?:score|rated|rating)\s*(?:above|over|at least|atleast|of)?\s*(\d{1,3})\b/, "minScore");
  take(/(\d{2,3})\s*\+\s*score\b/, "minScore");
  take(/(?:rs|inr|rupees|rupee)\s*(\d{1,6})\b/, "maxPrice");
  take(/(\d{1,6})\s*(?:rs|inr|rupees|rupee)\b/, "maxPrice");
  take(/(?:under|below|less than|upto|up to|within|max|maximum|cheaper than)\s*(\d{2,6})\b/, "maxPrice");

  if (limits.minScore !== undefined && !Number.isInteger(limits.minScore)) delete limits.minScore;
  return { rest: rest.replace(/\s+/g, " ").trim(), limits };
}

// ── The interpreter ─────────────────────────────────────────────────────────

const EMPTY_ACC = () => ({
  goal: null, dietType: null, budget: null,
  mealPrefs: [], foodsAvoid: [], foodsLove: [],
  view: {
    sort: null, minScore: null, maxKcal: null, minProtein: null, maxSugar: null, maxPrice: null,
    proteinClaim: false, sugarClaim: false,
  },
  unresolved: [], residual: [],
});

const push = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };

/**
 * Longest table phrase present in a padded clause.
 * `phrase` is the table key; `variant` is the form the shopper actually typed,
 * which is what gets echoed back for an unapplied restriction.
 */
function longestMatch(padded) {
  for (const phrase of PHRASES_BY_LENGTH) {
    for (const variant of [phrase, `${phrase}s`, `${phrase}es`]) {
      const needle = ` ${variant} `;
      const at = padded.indexOf(needle);
      if (at !== -1) return { phrase, variant, at, length: variant.length };
    }
  }
  return null;
}

const blank = (padded, at, length) =>
  `${padded.slice(0, at + 1)}${" ".repeat(length)}${padded.slice(at + 1 + length)}`;

/**
 * Record a term the shopper asked to keep out.
 * `spoken` is their own wording, used for the echo so the chip reads back what
 * they typed ("nuts") rather than the table's key ("nut").
 */
function applyNegated(acc, entry, spoken) {
  if (!entry) { push(acc.unresolved, spoken); return; }
  if (entry.avoid !== undefined) for (const key of entry.avoid) push(acc.foodsAvoid, key);
  else push(acc.unresolved, spoken);
}

/** Record a term the shopper is looking for. */
function applyPositive(acc, entry) {
  if (!entry) return;
  if (entry.goal !== undefined && !acc.goal) acc.goal = entry.goal;
  if (entry.diet !== undefined && !acc.dietType) acc.dietType = entry.diet;
  if (entry.meal !== undefined) push(acc.mealPrefs, entry.meal);
  if (entry.love !== undefined) push(acc.foodsLove, entry.love);
  if (entry.budget !== undefined && !acc.budget) acc.budget = entry.budget;
  if (entry.sort !== undefined && !acc.view.sort) acc.view.sort = entry.sort;
}

/**
 * Resolve a suffix-negated term ("dairy" from "dairy free"). Tries the whole
 * captured phrase before its last word, so "palm oil free" reaches palm_oil
 * rather than stopping at "oil".
 */
function applySuffixNegation(acc, captured) {
  const phrase = captured.trim();
  const words = phrase.split(" ");
  const candidates = words.length > 1 ? [phrase, words[words.length - 1]] : [phrase];
  for (const candidate of candidates) {
    const entry = PHRASE_INDEX.get(candidate);
    if (entry && (entry.avoid !== undefined || entry.unresolvable !== undefined)) {
      applyNegated(acc, entry, candidate);
      return words;
    }
  }
  push(acc.unresolved, words[words.length - 1]);
  return words;
}

/**
 * Interpret a shopper's query with no model involved.
 *
 * @param {string} input raw query text
 * @returns {object} an intent-shaped object. Run it through `parseIntent()`
 *   before use — this function does not validate itself.
 */
export function interpretDeterministic(input) {
  const acc = EMPTY_ACC();
  const text = normalise(input);
  if (!text) return { ...toIntent(acc), source: "deterministic", confidence: 0 };

  let signals = 0;

  for (const clause of splitClauses(text)) {
    let working = ` ${clause} `;

    // Suffix negation first: it names its target BEFORE the cue, so it has to
    // be consumed before positional negation looks at what follows a cue.
    for (const re of SUFFIX_CUES) {
      let m = working.match(re);
      while (m) {
        applySuffixNegation(acc, m[1]);
        signals += 1;
        working = working.replace(m[0], " ");
        m = working.match(re);
      }
    }

    const { rest, limits } = extractLimits(working.trim());
    for (const [field, value] of Object.entries(limits)) {
      if (acc.view[field] === null) { acc.view[field] = value; signals += 1; }
    }

    let padded = ` ${rest} `;
    const negFrom = negationStart(padded);

    for (let guard = 0; guard < 12; guard += 1) {
      const hit = longestMatch(padded);
      if (!hit) break;
      const entry = PHRASE_INDEX.get(hit.phrase);
      if (hit.at >= negFrom) applyNegated(acc, entry, hit.variant);
      else applyPositive(acc, entry);
      signals += 1;
      padded = blank(padded, hit.at, hit.length);
    }

    for (const token of padded.trim().split(/\s+/)) {
      if (token.length >= 3 && !STOPWORDS.has(token) && !/^\d/.test(token)) push(acc.residual, token);
    }
  }

  // Qualitative macro words inherit KOI's own published thresholds so search and
  // shelves make the same claim. An explicit number the shopper gave always wins.
  //
  // `proteinClaim` records which of the two happened. "High protein" is KOI
  // asserting a claim, so the resolver holds it to the same serving gate the
  // badge uses; "at least 25g protein" is the shopper's own density question and
  // is answered literally.
  if (acc.goal === "high_protein" && acc.view.minProtein === null) {
    acc.view.minProtein = THRESHOLDS.proteinHigh;
    acc.view.proteinClaim = true;
  }
  if (acc.goal === "low_sugar" && acc.view.maxSugar === null) {
    acc.view.maxSugar = THRESHOLDS.sugarLow;
    acc.view.sugarClaim = true;
  }

  const confidence = signals === 0 ? 0 : Math.min(1, 0.55 + 0.15 * signals);
  return { ...toIntent(acc), source: "deterministic", confidence: Number(confidence.toFixed(2)) };
}

function toIntent(acc) {
  return {
    profile: {
      goal: acc.goal,
      dietType: acc.dietType,
      mealPrefs: acc.mealPrefs,
      foodsAvoid: acc.foodsAvoid,
      foodsLove: acc.foodsLove,
      budget: acc.budget,
    },
    view: { ...acc.view },
    text: acc.residual.slice(0, 3).join(" ").slice(0, 80),
    unresolved: acc.unresolved.slice(0, 8),
  };
}
