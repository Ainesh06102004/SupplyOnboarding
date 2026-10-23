// ============================================================================
// A meal KOI didn't plan, estimated: "a big plate of biryani at a restaurant".
// Pure; runs in the browser (Track) and on the server (KOI's log_meal).
//
// A dish is a home recipe (recipes/*.js) or an eaten-out dish
// (recipes/eatenOut.js); both are gram lines over food items, so the figure is
// the same arithmetic as a planned plate. Where it was eaten changes two things
// a home recipe can't know (SETTINGS): how much fat goes in (oil, ghee, butter,
// cream, nuts: the lines portions.js calls "fat"), and how big a serving is.
// Each dish is scaled from where it is usually made, so a street samosa eaten
// at a stall is the stall's samosa, and a home biryani eaten at a restaurant
// takes the restaurant's oil and plate.
//
// The answer is a RANGE, because nobody can see the oil: the point estimate,
// and low/high at the setting's spread. The factors and spreads are KOI's
// working assumptions, not measurements, and every estimate says what it
// assumed (basis). A meal KOI can't name ("something at a friend's") is a
// typical meal of that kind, with a wider range and a nudge to name the dish.
//
// The model never writes a figure: KOI's agent and the Track sheet both call
// estimateMeal with dish keys from matchDishes, and show what it returns.
// ============================================================================

import { recipeFor } from "./recipes";
import { RECIPES } from "./recipes/index";
import { OUT_DISHES } from "./recipes/eatenOut";
import { foodOf, scaleNutrients, addNutrients, zero, MACROS } from "./foods";
import { roleOf } from "@/lib/plan/portions";

/** Where a meal was eaten, and what that does to a home recipe. KOI's working factors, not measurements. */
export const SETTINGS = Object.freeze({
  home: Object.freeze({ key: "home", label: "At home", words: "home cooking", oil: 1, portion: 1, spread: 0.15 }),
  canteen: Object.freeze({ key: "canteen", label: "Canteen or office", words: "a canteen", oil: 1.5, portion: 1.1, spread: 0.25 }),
  restaurant: Object.freeze({ key: "restaurant", label: "Restaurant or delivery", words: "a restaurant", oil: 2, portion: 1.3, spread: 0.3 }),
  street: Object.freeze({ key: "street", label: "Street food or a stall", words: "a stall", oil: 1.5, portion: 1, spread: 0.3 }),
});

/** The one portion question, for a dish served on a plate. */
export const PORTIONS = Object.freeze([
  Object.freeze({ key: "small", label: "A small plate", factor: 0.7 }),
  Object.freeze({ key: "usual", label: "A usual plate", factor: 1 }),
  Object.freeze({ key: "big", label: "A big plate", factor: 1.4 }),
  Object.freeze({ key: "seconds", label: "Seconds", factor: 1.9 }),
]);
export const MAX_PIECES = 8;

/** A typical meal of each kind, for a meal KOI can't name. Wide on purpose. */
export const GENERIC_MEALS = Object.freeze({
  breakfast: Object.freeze({ kcal: 450, protein: 14, carbs: 60, fat: 17, fibre: 4 }),
  lunch: Object.freeze({ kcal: 750, protein: 25, carbs: 90, fat: 32, fibre: 7 }),
  dinner: Object.freeze({ kcal: 750, protein: 25, carbs: 90, fat: 32, fibre: 7 }),
  snack: Object.freeze({ kcal: 300, protein: 6, carbs: 36, fat: 15, fibre: 2 }),
  drinks: Object.freeze({ kcal: 150, protein: 3, carbs: 25, fat: 4, fibre: 0 }),
});
export const GENERIC_SPREAD = 0.4;

/** What people call home dishes when they say them, beyond the dish's own name. */
const HOME_ALIASES = Object.freeze({
  masala_dosa: ["dosa", "masala dosa", "dosai"],
  ragi_dosa: ["dosa", "ragi dosa"],
  idli: ["idli", "idly", "idlis"],
  medu_vada: ["vada", "medu vada", "vadai"],
  uttapam: ["uttapam", "uthappam"],
  kanda_poha: ["poha"],
  rava_upma: ["upma"],
  aloo_paratha: ["aloo paratha", "paratha"],
  plain_paratha: ["paratha"],
  chicken_biryani: ["biryani", "chicken biryani"],
  veg_biryani: ["biryani", "veg biryani"],
  veg_fried_rice: ["fried rice", "veg fried rice"],
  egg_fried_rice: ["fried rice", "egg fried rice"],
  hakka_noodles: ["noodles", "hakka noodles", "chowmein", "chow mein"],
  butter_chicken: ["butter chicken", "murgh makhani"],
  paneer_butter_masala: ["paneer butter masala", "paneer makhani"],
  chana_masala: ["chole", "chana masala", "chhole"],
  rajma: ["rajma", "rajma chawal"],
  dal_tadka: ["dal", "dal tadka", "dal fry"],
  steamed_rice: ["rice", "chawal"],
  phulka: ["roti", "chapati", "phulka"],
  masala_chai: ["chai", "tea", "masala chai"],
  filter_coffee: ["coffee", "filter coffee"],
  sweet_lassi: ["lassi"],
  dhokla: ["dhokla"],
  misal_pav: ["misal", "misal pav"],
  pav_bhaji: ["pav bhaji"],
  tandoori_chicken: ["tandoori chicken"],
  paneer_tikka: ["paneer tikka"],
  curd_rice: ["curd rice", "thayir sadam"],
  moong_khichdi: ["khichdi", "khichri"],
});

const SINGULAR = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const wordsOf = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map(SINGULAR);
// Measure words as wordsOf leaves them ("glasses" → "glasse").
const MEASURE_WORDS = new Set(["plate", "of", "x", "glass", "glasse", "cup", "bowl", "piece", "pc", "serving", "katori", "can", "bottle"]);
const NUMBER_WORDS = Object.freeze({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ek: 1, do: 2, teen: 3, char: 4, half: 0.5, aadha: 0.5 });

/**
 * A dish as a meal: a home recipe or an eaten-out dish, as gram lines.
 * @returns {{ key, name, context, unit: "plate"|"piece", noun, served, lines: Array<{food, grams}> }|null}
 */
export function mealDishFor(key) {
  const r = recipeFor(key);
  if (r) return { key, name: r.name, context: "home", unit: "plate", noun: null, served: r.served, lines: r.lines.map((l) => ({ food: l.food, grams: l.grams })) };
  const o = OUT_DISHES[key];
  if (!o) return null;
  return { key, name: o.name, context: o.context, unit: o.unit, noun: o.noun ?? null, served: o.served, lines: o.g.map(([food, grams]) => ({ food, grams })) };
}

/** Every dish a meal can be: [key, name, aliases]. */
const INDEX = [
  ...Object.keys(RECIPES).map((key) => [key, recipeFor(key)?.name ?? key, HOME_ALIASES[key] ?? []]),
  ...Object.entries(OUT_DISHES).map(([key, o]) => [key, o.name, o.aliases ?? []]),
].map(([key, name, aliases]) => ({ key, name, phrases: [...new Set([name, ...aliases])].map((p) => ({ text: p.toLowerCase(), words: wordsOf(p) })) }));

/**
 * The dishes a sentence names, as mentions. A word that fits several dishes
 * ("biryani": chicken, veg or mutton) is ONE mention with several options, for
 * the person to choose; a longer name wins over a word inside it ("chicken
 * momos" is not also "momos"). A number just before a dish is its count.
 * @param {string} text
 * @returns {Array<{ words: string[], options: Array<{key, name, unit}>, count: number|null }>}
 */
export function matchDishes(text) {
  const tokens = wordsOf(text);
  const have = new Set(tokens);
  const hits = [];
  for (const dish of INDEX) {
    let best = null;
    for (const p of dish.phrases) {
      if (!p.words.length || !p.words.every((w) => have.has(w))) continue;
      if (!best || p.words.length > best.words.length) best = p;
    }
    if (best) hits.push({ key: dish.key, name: dish.name, words: best.words });
  }
  // A match whose words sit inside a longer match is that longer dish.
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.words.length > h.words.length && h.words.every((w) => o.words.includes(w))));
  const mentions = new Map();
  for (const h of kept) {
    const id = [...h.words].sort().join(" ");
    const m = mentions.get(id) ?? { words: h.words, options: [], count: null };
    const dish = mealDishFor(h.key);
    m.options.push({ key: h.key, name: h.name, unit: dish?.unit ?? "plate" });
    mentions.set(id, m);
  }
  for (const m of mentions.values()) {
    // "2 samosas", "2 plates of momos", "ek glass lassi": the number before the dish, past a measure word.
    let at = tokens.indexOf(m.words[0]) - 1;
    for (let skipped = 0; at >= 0 && skipped < 3 && MEASURE_WORDS.has(tokens[at]); skipped++) at--;
    const before = at >= 0 ? tokens[at] : null;
    const n = before === null ? null : /^\d+(\.\d+)?$/.test(before) ? Number(before) : NUMBER_WORDS[before] ?? null;
    m.count = n !== null && n > 0 && n <= MAX_PIECES ? n : null;
  }
  return [...mentions.values()];
}

/**
 * Dishes for a search box, best first: a name that starts with the query, then
 * a word that does, then anywhere.
 */
export function searchDishes(query, { limit = 8 } = {}) {
  const q = String(query ?? "").trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = [];
  for (const dish of INDEX) {
    let score = 0;
    for (const p of dish.phrases) {
      if (p.text.startsWith(q)) score = Math.max(score, 3);
      else if (p.text.split(/\s+/).some((w) => w.startsWith(q))) score = Math.max(score, 2);
      else if (p.text.includes(q)) score = Math.max(score, 1);
    }
    if (score) scored.push({ key: dish.key, name: dish.name, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit).map(({ key, name }) => {
    const d = mealDishFor(key);
    return { key, name, unit: d.unit, noun: d.noun, context: d.context };
  });
}

const portionOf = (key) => PORTIONS.find((p) => p.key === key) ?? PORTIONS[1];
const roundOut = (n) => ({ kcal: Math.round(n.kcal / 10) * 10, protein: Math.round(n.protein), carbs: Math.round(n.carbs), fat: Math.round(n.fat), fibre: Math.round(n.fibre ?? 0) });
const times = (n, k) => Object.fromEntries(Object.entries(n).map(([key, v]) => [key, v * k]));
const pct = (x) => Math.round(x * 100);

/** "2 samosas", "a big plate", "2 big plates". */
function amountText(dish, item) {
  if (dish.unit === "piece") {
    const n = Math.max(1, Math.min(MAX_PIECES, Math.round(Number(item.count) || 1)));
    const [one, many] = dish.noun ?? [dish.name.toLowerCase(), `${dish.name.toLowerCase()}s`];
    return `${n} ${n === 1 ? one : many}`;
  }
  const p = portionOf(item.portion);
  const n = Number(item.count) > 1 ? Math.round(Number(item.count)) : 1;
  return n > 1 ? `${n} × ${p.label.toLowerCase().replace(/^a /, "")}` : p.label.toLowerCase();
}

/**
 * @param {object} input
 * @param {Array<{ dishKey?: string, portion?: string, count?: number, text?: string }>} input.items
 *   a dish (with a portion, or a count for a piece), or words KOI couldn't name
 * @param {"home"|"canteen"|"restaurant"|"street"} [input.setting]
 * @param {string} [input.slot] breakfast | lunch | snack | dinner | drinks, for an unnamed meal
 * @returns {{ point, low, high, parts: Array, basis: string[], generic: boolean, setting: string }}
 */
export function estimateMeal({ items = [], setting = "restaurant", slot = "lunch" } = {}) {
  const s = SETTINGS[setting] ?? SETTINGS.restaurant;
  const parts = [];
  const basis = [];
  for (const item of items.length ? items : [{ text: "" }]) {
    const dish = item.dishKey ? mealDishFor(item.dishKey) : null;
    if (!dish) {
      const base = GENERIC_MEALS[slot] ?? GENERIC_MEALS.lunch;
      const k = portionOf(item.portion).factor;
      parts.push({ dishKey: null, name: item.text ? String(item.text).slice(0, 60) : `A ${slot === "drinks" ? "drink" : slot}`, amountText: portionOf(item.portion).label.toLowerCase(), nutrition: times({ ...base }, k), spread: GENERIC_SPREAD });
      basis.push(`${item.text ? `"${String(item.text).slice(0, 40)}"` : "This"}: a typical ${slot === "drinks" ? "drink" : slot} out, ±${pct(GENERIC_SPREAD)}%. Name the dish for a closer number.`);
      continue;
    }
    const native = SETTINGS[dish.context] ?? SETTINGS.home;
    const oil = s.oil / native.oil;
    const plate = s.portion / native.portion;
    const amount = dish.unit === "piece"
      ? Math.max(1, Math.min(MAX_PIECES, Math.round(Number(item.count) || 1)))
      : portionOf(item.portion).factor * (Number(item.count) > 1 ? Math.round(Number(item.count)) : 1) * plate;
    let nutrition = zero();
    for (const l of dish.lines) {
      const per100 = foodOf(l.food)?.per100;
      if (!per100) continue;
      nutrition = addNutrients(nutrition, scaleNutrients(per100, l.grams * amount * (roleOf(l.food) === "fat" ? oil : 1)));
    }
    parts.push({ dishKey: dish.key, name: dish.name, amountText: amountText(dish, item), nutrition, spread: s.spread });
    const factors = [oil !== 1 && `${oil > 1 ? "more" : "less"} fat (×${Math.round(oil * 100) / 100})`, dish.unit === "plate" && plate !== 1 && `a ${plate > 1 ? "bigger" : "smaller"} serving (×${Math.round(plate * 100) / 100})`].filter(Boolean);
    basis.push(dish.context === "home"
      ? `${dish.name}: KOI's home recipe${factors.length ? `, with ${s.words}'s ${factors.join(" and ")}` : ""}.`
      : `${dish.name}: as ${SETTINGS[dish.context].words} makes it${factors.length ? `, with ${factors.join(" and ")} for ${s.words}` : ""}.`);
  }
  const point = parts.reduce((acc, p) => addNutrients(acc, p.nutrition), zero());
  const low = parts.reduce((acc, p) => addNutrients(acc, times(p.nutrition, 1 - p.spread)), zero());
  const high = parts.reduce((acc, p) => addNutrients(acc, times(p.nutrition, 1 + p.spread)), zero());
  const generic = parts.every((p) => !p.dishKey);
  if (!generic) basis.push(`Food values: IFCT 2017 and cited references. The range is ±${pct(s.spread)}% for ${s.words}: nobody can see the oil.`);
  return {
    point: roundOut(point),
    low: roundOut(low),
    high: roundOut(high),
    parts: parts.map((p) => ({ ...p, nutrition: roundOut(p.nutrition) })),
    basis,
    generic,
    setting: s.key,
  };
}

/** "≈ 820 kcal (650–1,060) · 28 g protein": how an estimate is said. */
export function estimateWords(e) {
  const k = (n) => n.toLocaleString("en-IN");
  return `≈ ${k(e.point.kcal)} kcal (${k(e.low.kcal)}–${k(e.high.kcal)}) · ${e.point.protein} g protein`;
}

export { MACROS };
