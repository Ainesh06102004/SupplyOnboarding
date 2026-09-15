// ============================================================================
// KOI FOOD — Find known names in text: whole words, longest name first
//
// Shared by the allergen graph (allergens.js) and the category tree
// (taxonomy.js), so "peanut butter" is one name to both and neither can match
// part of a word.
//
// Pure.
// ============================================================================

import { words } from "./normalise";

// A list separator ends a name. "Soy, Milk Solids" is soy AND milk; read
// without the comma it would be "soy milk", which is soy only, and the milk
// would be lost. So names are matched only within the pieces between
// separators, never across them.
export const SEPARATORS = /[,;:()[\]{}.\/|&•\r\n]+/;

/**
 * @param {Array<[string, object]>} entries [normalised name, what it names]; the first entry for a name wins
 * @returns {{ index: Map<string, object>, longest: number }}
 */
export function buildIndex(entries) {
  const index = new Map();
  let longest = 1;
  for (const [phrase, target] of entries) {
    if (!index.has(phrase)) index.set(phrase, target);
    longest = Math.max(longest, phrase.split(" ").length);
  }
  return { index, longest };
}

/**
 * Every known name in the text, in order. Each hit is the name's target plus
 * `start` and `end`, word positions across the whole text (end exclusive), and
 * `piece`, which of the separator-delimited pieces it was found in.
 * @param {string} text
 * @param {{ index: Map<string, object>, longest: number }} built
 * @returns {Array<object>}
 */
export function scan(text, { index, longest }) {
  const hits = [];
  let offset = 0;
  let piece = -1;
  for (const part of String(text ?? "").split(SEPARATORS)) {
    piece += 1;
    const tokens = words(part);
    let i = 0;
    while (i < tokens.length) {
      let step = 1;
      for (let n = Math.min(longest, tokens.length - i); n >= 1; n -= 1) {
        const target = index.get(tokens.slice(i, i + n).join(" "));
        if (target) {
          hits.push({ ...target, start: offset + i, end: offset + i + n, piece });
          step = n;
          break;
        }
      }
      i += step;
    }
    offset += tokens.length;
  }
  return hits;
}
