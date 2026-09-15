// ============================================================================
// KOI FOOD — Which allergens a piece of label text names
//
// Phase 2.1. Answers from the allergen graph (food.allergen_family,
// food.ingredient_alias, food.ingredient_allergen), compiled into
// ./allergenLexicon.js by scripts/buildAllergenLexicon.mjs, so the storefront
// in the browser and the label engine on the server ask the same graph the
// same question.
//
// Matching is by whole words, longest name first, and a matched name is
// consumed. So "peanut butter" is peanut and not milk, "cocoa butter" and
// "vegetable ghee" are not milk, "coconut milk" is not dairy, "sunflower
// lecithin" is not soy, "eggless" is not egg, and "lentils" and "raisins" are
// not sesame or mustard. The keyword lists this replaced matched substrings
// and got every one of those wrong.
//
// Pure.
// ============================================================================

import { words } from "./normalise";
import { FAMILIES, INGREDIENTS, ALIASES, LEXICON_VERSION as GRAPH_VERSION } from "./allergenLexicon";

// Bump when the matching rules below change. The label engine's evaluation
// gate keys on LEXICON_VERSION, so a new rule pauses label reading until the
// evaluation passes on it, exactly as a changed graph does.
const MATCHER_VERSION = "m2";

/** The compiled graph and the rules that read it, together. */
export const LEXICON_VERSION = `${GRAPH_VERSION}-${MATCHER_VERSION}`;

/** Every allergen family the graph knows, by the storefront's flag names. */
export const ALLERGEN_KEYS = Object.freeze(Object.keys(FAMILIES));

function buildIndex(entries) {
  const index = new Map();
  let longest = 1;
  for (const [phrase, target] of entries) {
    if (!index.has(phrase)) index.set(phrase, target);
    longest = Math.max(longest, phrase.split(" ").length);
  }
  return { index, longest };
}

const INGREDIENT_INDEX = buildIndex(ALIASES.map(([alias, i]) => [alias, { ingredient: i }]));

// A statement names groups ("tree nuts", "crustaceans") as well as
// ingredients. Group words come first so "milk" in a statement is the family.
const STATEMENT_INDEX = buildIndex([
  ...Object.entries(FAMILIES).flatMap(([key, family]) => family.statementWords.map((w) => [w, { family: key }])),
  ...ALIASES.map(([alias, i]) => [alias, { ingredient: i }]),
]);

// A list separator ends a name. "Soy, Milk Solids" is soy AND milk; read
// without the comma it would be "soy milk", which is soy only, and the milk
// would be lost. So names are matched only within the pieces between
// separators, never across them.
const SEPARATORS = /[,;:()[\]{}.\/|&•\r\n]+/;

function scan(text, { index, longest }) {
  const hits = [];
  for (const piece of String(text ?? "").split(SEPARATORS)) {
    const tokens = words(piece);
    let i = 0;
    while (i < tokens.length) {
      let step = 1;
      for (let n = Math.min(longest, tokens.length - i); n >= 1; n -= 1) {
        const target = index.get(tokens.slice(i, i + n).join(" "));
        if (target) {
          hits.push(target);
          step = n;
          break;
        }
      }
      i += step;
    }
  }
  return hits;
}

const inFamilyOrder = (set) => ALLERGEN_KEYS.filter((key) => set.has(key));

/**
 * Allergens an ingredient list (or any product text) names.
 * @param {string} text
 * @returns {{ contains: string[], mayContain: string[], ingredients: string[] }}
 *   contains: from `contains` and `derived_from` links; mayContain: from
 *   `may_contain` links not already contained; ingredients: what was found
 */
export function allergensIn(text) {
  const contains = new Set();
  const mayContain = new Set();
  const ingredients = [];
  for (const hit of scan(text, INGREDIENT_INDEX)) {
    const [name, links] = INGREDIENTS[hit.ingredient];
    ingredients.push(name);
    for (const [family, relation] of links) (relation === "may_contain" ? mayContain : contains).add(family);
  }
  for (const family of contains) mayContain.delete(family);
  return { contains: inFamilyOrder(contains), mayContain: inFamilyOrder(mayContain), ingredients };
}

/**
 * Allergens an allergen or may-contain statement declares, by group ("tree
 * nuts", "cereals containing gluten") or by ingredient ("almond").
 * @param {string} text
 * @returns {string[]}
 */
export function allergensInStatement(text) {
  const found = new Set();
  for (const hit of scan(text, STATEMENT_INDEX)) {
    if (hit.family) {
      found.add(hit.family);
      continue;
    }
    for (const [family, relation] of INGREDIENTS[hit.ingredient][1]) {
      if (relation !== "may_contain") found.add(family);
    }
  }
  return inFamilyOrder(found);
}
