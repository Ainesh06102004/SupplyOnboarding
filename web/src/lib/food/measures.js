// ============================================================================
// Kitchen measures: grams ↔ "½ cup", "1½ tbsp", "2 medium onions". Pure.
//
// Nobody should need a scale to cook from a KOI recipe, so every amount is
// said the way a kitchen measures it, and the grams sit beside it for whoever
// wants them. The same steps go the other way (snapGrams): when KOI sizes a
// portion it rounds to something a person can actually measure, then re-checks
// the day, so the plan and the recipe can never disagree.
// ============================================================================

import { foodOf } from "./foods";

const QUARTERS = Object.freeze({ 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" });

/** 1.5 → "1½", 0.25 → "¼", 2 → "2". Rounds to the nearest quarter. */
export function quarters(x) {
  const q = Math.round(x * 4) / 4;
  const whole = Math.floor(q);
  const rest = QUARTERS[q - whole] ?? "";
  if (!whole && !rest) return "0";
  return `${whole || ""}${rest}`;
}

/** 1.5 → "1½", whole and halves only (pieces: "1½ onions", never "1¼"). */
function halves(x) {
  const h = Math.round(x * 2) / 2;
  const whole = Math.floor(h);
  return `${whole || ""}${h - whole ? "½" : ""}` || "0";
}

const PLURAL = Object.freeze({
  inch: "inches", pinch: "pinches", "inch of stick": "inches of stick",
  "medium potato": "medium potatoes", "medium tomato": "medium tomatoes",
  "green chilli": "green chillies", pav: "pav", arbi: "arbi", karela: "karela", "sweet potato": "sweet potatoes",
});
const plural = (word, n) => (n <= 1 ? word : PLURAL[word] ?? `${word}s`);
// Small things are counted whole: 3 cloves of garlic, 2 eggs, never 2½ cloves.
const WHOLE_PIECE_MAX_GRAMS = 12;

/**
 * The kitchen measure for an amount of a food.
 * @param {string} foodKey
 * @param {number} grams
 * @returns {{ text: string, unit: string, count: number, grams: number }} `grams` is what the measure holds
 */
export function kitchenMeasure(foodKey, grams) {
  const food = foodOf(foodKey);
  const g = Math.max(0, Number(grams) || 0);
  const m = food?.measures ?? {};
  const gramsOnly = { text: `${Math.round(g)} g`, unit: "g", count: Math.round(g), grams: Math.round(g) };
  if (!food || g === 0) return gramsOnly;

  if (m.piece) {
    const name = food.pieceName ?? "piece";
    const raw = g / m.piece;
    if (m.piece <= WHOLE_PIECE_MAX_GRAMS) {
      if (raw >= 0.5) {
        const count = Math.round(raw);
        return { text: `${count} ${plural(name, count)}`, unit: "piece", count, grams: count * m.piece };
      }
    } else if (raw >= 0.2) {
      const count = raw >= 1 ? Math.round(raw * 2) / 2 : Math.max(0.25, Math.round(raw * 4) / 4);
      const shown = raw >= 1 ? halves(count) : quarters(count);
      return { text: `${shown} ${plural(name, count)}`, unit: "piece", count, grams: count * m.piece };
    }
  }
  if (m.slice) {
    const count = Math.max(1, Math.round(g / m.slice));
    return { text: `${count} ${plural("slice", count)}`, unit: "slice", count, grams: count * m.slice };
  }
  if (m.cup && g >= m.cup * 0.25) {
    const count = Math.round((g / m.cup) * 4) / 4;
    return { text: `${quarters(count)} ${count > 1 ? "cups" : "cup"}`, unit: "cup", count, grams: count * m.cup };
  }
  if (m.tbsp && g >= m.tbsp * 0.75) {
    const count = Math.round((g / m.tbsp) * 2) / 2;
    return { text: `${halves(count)} tbsp`, unit: "tbsp", count, grams: count * m.tbsp };
  }
  if (m.tsp && g >= m.tsp * 0.2) {
    // Under a teaspoon, quarters (¼ tsp of salt matters); over it, halves — nobody measures 2¼ tsp.
    const raw = g / m.tsp;
    const count = raw > 1 ? Math.round(raw * 2) / 2 : Math.max(0.25, Math.round(raw * 4) / 4);
    return { text: `${raw > 1 ? halves(count) : quarters(count)} tsp`, unit: "tsp", count, grams: count * m.tsp };
  }
  if ((m.tsp || m.pinch) && g < (m.tsp ?? 1)) return { text: "a pinch of", unit: "pinch", count: 1, grams: m.pinch ?? 0.3 };
  return gramsOnly;
}

/** Grams said plainly: "720 g", "1.2 kg", "960 ml" for liquids measured by the cup. */
export function gramsText(grams, { liquid = false } = {}) {
  const g = Math.round(Number(grams) || 0);
  if (g >= 1000) return `${(Math.round(g / 100) / 10).toString()} ${liquid ? "l" : "kg"}`;
  return `${g} ${liquid ? "ml" : "g"}`;
}

/** Grams rounded to the kitchen measure a person would use, so a plan never asks for 37.3 g of rice. */
export function snapGrams(foodKey, grams) {
  const food = foodOf(foodKey);
  if (!food?.measures || !grams) return Math.round(Number(grams) || 0);
  return kitchenMeasure(foodKey, grams).grams;
}
