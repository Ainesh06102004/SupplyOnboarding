// ============================================================================
// "Had 2 samosas at the canteen", "kal raat biryani khaya", "skipped lunch":
// a sentence about a meal, read by rules. Pure.
//
// Everything that turns words into a logged meal goes through here — the KOI
// bar (to Track), KOI's agent (log_meal, with or without a model) and Track's
// sheet when it opens on a sentence — so the same words always mean the same
// meal. The dishes and counts come from matchDishes (estimate.js); a word that
// fits several dishes ("biryani") is returned as ambiguous for the person to
// choose, never guessed. The model never picks a dish or a number.
// ============================================================================

import { matchDishes, mealDishFor } from "./estimate";

/** A meal said in the past: English and Hinglish. */
const EATEN = /\b(ate|eaten|had|have had|grabbed|ordered|order kiya|khaya|khaaya|khayi|khaayi|khai|kha liya|kha li|kha liye|piya|pi li)\b/;
/** A habit or a plan ("every Tuesday", "tomorrow") is the Calendar's (lib/calendar/words.js), not a meal eaten. */
const NOT_YET = /\b(every|each|weekly|daily|tomorrow|next|will|going to|gonna|plan to|planning to|har)\b/;
const SKIPPED = /\b(skip(ped)?|missed|didn'?t eat|did not eat|nahi khaya|nahin khaya)\b/;
const PARTIAL = /\b(half|aadha|aadhi|some of|only a bit of|thoda sa)\b.*\b(my|the|mera|meri)?\s*(breakfast|lunch|dinner|snack|plate|meal|khana)\b/;

const SLOTS = Object.freeze([
  ["breakfast", /\b(breakfast|nashta|nashte|this morning|subah)\b/],
  ["lunch", /\b(lunch|dopahar|afternoon)\b/],
  ["snack", /\b(snacks?|evening|shaam|tea ?time|chai ?time)\b/],
  ["dinner", /\b(dinner|supper|tonight|last night|raat|night)\b/],
]);
const YESTERDAY = /\b(yesterday|last night|kal raat|kal)\b/;
const TODAY = /\b(today|aaj|this morning|tonight)\b/;
const SETTINGS = Object.freeze([
  ["street", /\b(street|stall|thela|thelewala|roadside|tapri|cart|chaat ?wala|vendor)\b/],
  ["canteen", /\b(canteen|office|mess|cafeteria|college|hostel|tiffin service)\b/],
  ["restaurant", /\b(restaurant|hotel|dhaba|zomato|swiggy|delivery|delivered|ordered|order kiya|cafe|café|outside|bahar|eating out|ate out|eat out|party|wedding|shaadi)\b/],
  ["home", /\b(home|ghar|at a friend'?s|mom'?s|maa ke)\b/],
]);
const PORTIONS = Object.freeze([
  ["seconds", /\b(seconds|second helping|two plates|double|do plate)\b/],
  ["big", /\b(big|large|huge|heavy|bada|badi|bhaari|full plate|a lot of)\b/],
  ["small", /\b(small|light|little|thoda|halka|half plate|a bit of)\b/],
]);

const first = (list, text) => list.find(([, re]) => re.test(text))?.[0] ?? null;

/**
 * @param {string} sentence
 * @returns {{
 *   isMeal: boolean, status: "other"|"skipped"|"partial", slot: string|null, day: "today"|"yesterday"|null,
 *   setting: string|null, portion: string|null,
 *   items: Array<{ dishKey: string, name: string, count: number|null, portion: string|null }>,
 *   ambiguous: Array<{ words: string[], options: Array<{key, name}> }>, text: string
 * }}
 */
export function readMealSentence(sentence) {
  const text = String(sentence ?? "").trim();
  const lower = text.toLowerCase();
  const mentions = matchDishes(text);
  const slot = first(SLOTS, lower);
  const skipped = SKIPPED.test(lower);
  const partial = !skipped && PARTIAL.test(lower);
  const eaten = EATEN.test(lower);
  // A dish named with "had"/"khaya", or a meal skipped or half-eaten. "I had a question" is not a meal.
  const isMeal = !NOT_YET.test(lower) && Boolean((eaten && (mentions.length || slot)) || ((skipped || partial) && slot));
  const portion = first(PORTIONS, lower);
  const items = mentions.filter((m) => m.options.length === 1).map((m) => {
    const dish = mealDishFor(m.options[0].key);
    return { dishKey: m.options[0].key, name: m.options[0].name, count: m.count, portion: dish?.unit === "piece" ? null : portion };
  });
  return {
    isMeal,
    status: skipped ? "skipped" : partial ? "partial" : "other",
    slot,
    day: YESTERDAY.test(lower) ? "yesterday" : TODAY.test(lower) ? "today" : null,
    setting: first(SETTINGS, lower),
    portion,
    items,
    ambiguous: mentions.filter((m) => m.options.length > 1).map((m) => ({ words: m.words, options: m.options.map(({ key, name }) => ({ key, name })) })),
    text,
  };
}

/**
 * The meal in a conversation: the latest words, or a short answer ("Chicken
 * biryani") completing the meal said just before it, which KOI asked about.
 * @param {string[]} said the shopper's messages and answers, oldest first
 */
export function mealFromConversation(said = []) {
  const latest = said.at(-1) ?? "";
  const read = readMealSentence(latest);
  if (read.isMeal) return read;
  const prev = said.at(-2) ?? "";
  if (readMealSentence(prev).isMeal && latest.trim().split(/\s+/).length <= 4) return readMealSentence(`${prev} ${latest}`);
  return read;
}

/** The meal a time of day most likely is, for a sentence that doesn't say. */
export function slotAt(hour) {
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 19) return "snack";
  return "dinner";
}

/** The local date for "today" or "yesterday", YYYY-MM-DD, at a UTC offset in minutes (India: 330). */
export function dateFor(day, { now = new Date(), offsetMinutes = 330 } = {}) {
  const local = new Date(now.getTime() + offsetMinutes * 60000 - (day === "yesterday" ? 86400000 : 0));
  return local.toISOString().slice(0, 10);
}
