// ============================================================================
// "What do you love to eat?" — the shopper's words, as kinds of food KOI
// stocks. Pure.
//
// A word becomes a category key through the same graph the planner reads
// (food.category_alias → CATEGORY_WORDS, and the taxonomy's own terms via
// categorise). Only keys are kept; the words are not (00066). A word that
// names nothing KOI knows, or a kind of food it does not stock, is said so —
// and can go to the demand queue, which is how KOI learns what to stock.
// ============================================================================

import { CATEGORY_WORDS } from "@/lib/food/foodWords";
import { categorise, nodeInfo } from "@/lib/food/taxonomy";

export const MAX_FAVOURITES = 12;

const clean = (s) => String(s ?? "").toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * @param {string} text "paneer, dosa, filter coffee"
 * @param {Iterable<string>} stocked category keys the storefront actually has
 * @returns {{ matched: {word, key, label}[], notStocked: {word, key, label}[], unknown: string[] }}
 */
export function readFavourites(text, stocked = []) {
  const have = new Set(stocked);
  const out = { matched: [], notStocked: [], unknown: [] };
  const words = String(text ?? "").split(/[,;\n]+|\band\b/i).map(clean).filter((w) => w.length >= 2);
  for (const word of words.slice(0, MAX_FAVOURITES)) {
    const key = CATEGORY_WORDS[word] ?? categorise({ name: word })?.key ?? null;
    const info = key ? nodeInfo(key) : null;
    if (!info) {
      out.unknown.push(word);
      continue;
    }
    // A shelf is stocked if it, or a shelf under it, has a product.
    const stockedKey = have.has(key) ? key : [...have].find((k) => k.startsWith(`${key}.`)) ?? null;
    const entry = { word, key: stockedKey ?? key, label: info.subcategory ?? info.label };
    (stockedKey ? out.matched : out.notStocked).push(entry);
  }
  return out;
}

/** A category key's label, for a chip. */
export const favouriteLabel = (key) => nodeInfo(key)?.subcategory ?? nodeInfo(key)?.label ?? key;
