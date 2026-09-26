// ============================================================================
// Agent Mode: what the shopper actually said, and what KOI's tools produced.
// Pure.
//
// Everything the model hands a tool is held to this. A number must be one the
// shopper wrote ("week" states 7, "fortnight" 14). A quote must be the
// shopper's own words, verbatim. A food must be one the shopper, the basket or
// the page named (through the ingredient graph, as router.js groundSteps does).
// ============================================================================

import { allergensIn } from "@/lib/food/allergens";

export const norm = (s) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
export const wordsOf = (s) => norm(s).replace(/[^a-z0-9₹' ]/g, " ").split(/\s+/).filter(Boolean);
export const numbersOf = (s) => (norm(s).replace(/(\d),(\d)/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
/** "4k" is 4000, "4.5k" 4500: how budgets are written. */
const thousands = (s) => (norm(s).match(/(\d+(?:\.\d+)?)\s*k\b/g) ?? []).map((m) => Math.round(parseFloat(m) * 1000));
export const foodsIn = (s) => new Set(allergensIn(String(s ?? "")).ingredients ?? []);

/**
 * @param {{ said: string[], produced?: string[], labels?: string[], products?: string[] }} input
 *   said: the shopper's messages (and typed "Other" answers); produced: tool
 *   summaries; labels: household labels; products: basket and page product names.
 */
export function evidenceFrom({ said = [], produced = [], labels = [], products = [] }) {
  const saidText = said.join(" \n ");
  const words = new Set(wordsOf(saidText));
  const numbers = new Set([
    ...numbersOf(saidText),
    ...thousands(saidText),
    ...(words.has("week") || words.has("hafta") ? [7] : []),
    ...(words.has("fortnight") ? [14] : []),
  ]);
  const foods = new Set([...foodsIn(saidText), ...products.flatMap((p) => [...foodsIn(p)]), ...produced.flatMap((p) => [...foodsIn(p)])]);
  return { said, saidText, words, numbers, foods, labels, products, produced };
}

/** A quote is the shopper's words, verbatim (case and spacing aside). */
export function isQuote(quote, evidence) {
  const q = norm(quote);
  if (!q || q.length < 2) return false;
  return evidence.said.some((s) => norm(s).includes(q));
}

/** Every number in this text is one the shopper wrote. */
export const numbersStated = (text, evidence) => numbersOf(text).every((n) => evidence.numbers.has(n));

/** Every food this text names is one the shopper, a tool, the basket or the page named. */
export const foodsKnown = (text, evidence) => [...foodsIn(text)].every((f) => evidence.foods.has(f));
