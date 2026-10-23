// ============================================================================
// "Lunch out every Tuesday", "gym Mon Wed Fri at 7am", "travelling 3 to 5
// Nov", "remind me to order atta tomorrow evening": a sentence about the
// calendar, read by rules. Pure.
//
// The KOI bar (to the Calendar), KOI's agent (schedule, with or without a
// model) and the Calendar's add sheet all read sentences here, so the same
// words always make the same event. Nothing in an event comes from a model:
// the kind, the days, the date, the meal and the person are all in the words.
// A date in the past is not a plan, and a meal already eaten is Track's
// (lib/food/mealWords.js).
// ============================================================================

import { addDays, weekdayOf } from "./events";

const KINDS = Object.freeze([
  ["travel", /\b(travel(l)?ing|travel|trip|out of town|away from home|flying|vacation|holiday|visiting|in [a-z]+ from)\b/],
  ["out", /\b(eat(ing)? out|lunch out|dinner out|breakfast out|out for (breakfast|lunch|dinner)|office lunch|lunch at (the )?office|lunch in (the )?office|team lunch|at the canteen|in the canteen|order(ing)? in|takeaway|bahar)\b/],
  ["training", /\b(gym|training|workouts?|work out|exercise|running|yoga|cricket|football|badminton|swimming|swim|cycling)\b/],
  ["prep", /\b(meal prep|prep day|batch cook(ing)?|cook in bulk)\b/],
  ["shop", /\b(shopping|groceries|grocery|kirana|sabzi mandi)\b/],
  ["plan", /\b(plan(ning)? (next|the|my) week|planning day|plan day)\b/],
  ["remind", /\bremind me\b/],
]);
const SLOTS = Object.freeze([["breakfast", /\b(breakfast|nashta)\b/], ["lunch", /\b(lunch|dopahar)\b/], ["snack", /\b(snacks?|tea ?time)\b/], ["dinner", /\b(dinner|supper|raat ka khana)\b/]]);
const DAYS = Object.freeze([
  [0, /\b(sun(day)?s?|ravivar|itwar)\b/], [1, /\b(mon(day)?s?|somvar)\b/], [2, /\b(tue(s|sday)?s?|mangalvar)\b/], [3, /\b(wed(nesday)?s?|budhvar)\b/],
  [4, /\b(thu(r|rs|rsday)?s?|guruvar)\b/], [5, /\b(fri(day)?s?|shukravar)\b/], [6, /\b(sat(urday)?s?|shanivar)\b/],
]);
const MONTHS = Object.freeze(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]);
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const REPEATS = /\b(every|each|weekly|daily|roz|har|weekdays|weekends)\b/;

const pad = (n) => String(n).padStart(2, "0");

/** A day and month as the next such date from today. */
function dateOf(day, monthWord, today) {
  const m = MONTHS.indexOf(monthWord.slice(0, 3));
  if (m < 0 || day < 1 || day > 31) return null;
  let year = Number(today.slice(0, 4));
  let iso = `${year}-${pad(m + 1)}-${pad(day)}`;
  if (iso < today) iso = `${++year}-${pad(m + 1)}-${pad(day)}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

/** The next date (today included) that falls on a weekday. */
const nextWeekday = (today, wd) => {
  for (let i = 0; i < 7; i++) if (weekdayOf(addDays(today, i)) === wd) return addDays(today, i);
  return today;
};

/**
 * @param {string} sentence
 * @param {{ labels?: string[], today: string }} opts the household's people, and today's date
 * @returns {{ isSchedule: boolean, kind: string|null, member: string|null, slot: string|null, repeatDays: number[]|null,
 *   startsOn: string|null, endsOn: string|null, atTime: string|null, title: string|null, past: boolean, text: string }}
 */
export function readScheduleSentence(sentence, { labels = [], today }) {
  const text = String(sentence ?? "").trim();
  const lower = text.toLowerCase();
  const kind = KINDS.find(([, re]) => re.test(lower))?.[0] ?? null;
  const slot = SLOTS.find(([, re]) => re.test(lower))?.[0] ?? null;

  // The days it repeats on, or the one day it is.
  let weekdays = DAYS.filter(([, re]) => re.test(lower)).map(([d]) => d);
  if (/\b(every ?day|daily|roz)\b/.test(lower)) weekdays = [0, 1, 2, 3, 4, 5, 6];
  if (/\bweekdays\b/.test(lower)) weekdays = [1, 2, 3, 4, 5];
  if (/\bweekends?\b/.test(lower) && !/\bthis weekend\b/.test(lower)) weekdays = [0, 6];
  const plural = DAYS.some(([, re]) => (lower.match(re)?.[0] ?? "").endsWith("s") && !/tues?$|thurs$/.test(lower.match(re)[0]));
  const repeats = weekdays.length > 0 && (REPEATS.test(lower) || plural || weekdays.length > 1);

  // A date, or a range of dates.
  let startsOn = null;
  let endsOn = null;
  const range = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|till|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`));
  const rangeTwoMonths = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s*(?:-|to|till|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`));
  const single = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`)) ?? lower.match(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (rangeTwoMonths) {
    startsOn = dateOf(Number(rangeTwoMonths[1]), rangeTwoMonths[2], today);
    endsOn = dateOf(Number(rangeTwoMonths[3]), rangeTwoMonths[4], today);
  } else if (range) {
    startsOn = dateOf(Number(range[1]), range[3], today);
    endsOn = dateOf(Number(range[2]), range[3], today);
  } else if (single) {
    const [a, b] = /^\d/.test(single[1]) ? [Number(single[1]), single[2]] : [Number(single[2]), single[1]];
    startsOn = dateOf(a, b, today);
  } else if (/\b(day after tomorrow|parso|parson)\b/.test(lower)) startsOn = addDays(today, 2);
  else if (/\b(tomorrow|kal)\b/.test(lower)) startsOn = addDays(today, 1);
  else if (/\b(today|aaj|tonight)\b/.test(lower)) startsOn = today;
  // A day named ("plan next week on Sunday") wins over "next week".
  else if (weekdays.length && !repeats) startsOn = nextWeekday(today, weekdays[0]);
  else if (/\bnext week\b/.test(lower)) {
    startsOn = nextWeekday(addDays(today, 1), 1);
    if (kind === "travel") endsOn = addDays(startsOn, 6);
  } else if (/\bthis weekend\b/.test(lower)) {
    startsOn = nextWeekday(today, 6);
    endsOn = addDays(startsOn, 1);
  }
  if (endsOn && startsOn && endsOn < startsOn) endsOn = null;
  if (repeats && !startsOn) startsOn = today;

  // A time: "at 7", "7:30 pm", or the part of the day.
  const clock = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? lower.match(/\bat (\d{1,2})(?::(\d{2}))?\b/);
  let atTime = null;
  if (clock) {
    let h = Number(clock[1]) % 12;
    if (clock[3] === "pm" || (!clock[3] && h >= 1 && h <= 6)) h += 12;
    if (clock[3] === "am" && Number(clock[1]) === 12) h = 0;
    atTime = `${pad(h)}:${pad(Number(clock[2] ?? 0))}`;
  } else if (kind && !["out", "travel"].includes(kind)) {
    atTime = /\bmorning|subah\b/.test(lower) ? "09:00" : /\bevening|shaam\b/.test(lower) ? "18:00" : /\bnight\b/.test(lower) ? "21:00" : null;
  }

  // Who: a saved person named in the words, else the shopper.
  const member = labels.find((l) => l && new RegExp(`\\b${l.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) ?? null;

  const title = kind === "remind" ? (text.match(/remind me (?:to |about )?(.+?)(?:\s+(?:on|at|every|tomorrow|today|next)\b.*)?$/i)?.[1] ?? "").slice(0, 80) || null : null;
  const past = Boolean(startsOn && startsOn < today && !repeats);
  const isSchedule = Boolean(kind && !past && (repeats || startsOn) && !(kind === "out" && !slot && !repeats && !startsOn));
  return { isSchedule, kind, member, slot: kind === "out" ? slot ?? "lunch" : null, repeatDays: repeats ? weekdays : null, startsOn, endsOn: kind === "travel" ? endsOn : null, atTime, title, past, text };
}
