// ============================================================================
// Fasting festivals KOI can plan around. Pure.
//
// Dates checked against published panchang calendars (27 Sep 2026; sources in
// docs/agent-mode/PLAN.md). A date is only ever one of these rows: never
// computed, never guessed. Add next year's before this list runs out.
//
// `days` is how long a plan for it runs; `fastWord` is how people say it.
// KOI plans the fasting person's food with the `fasting` diet for the whole
// plan (DIET_EXCLUSIONS.fasting): a one-day fast inside a normal week is not
// something the planner can do yet.
// ============================================================================

export const FESTIVALS = Object.freeze([
  { key: "sharad_navratri_2026", name: "Navratri", start: "2026-10-11", end: "2026-10-19", days: 9, words: /\b(navratri|navaratri|navratre|sharad navratri)\b/ },
  { key: "karva_chauth_2026", name: "Karva Chauth", start: "2026-10-29", end: "2026-10-29", days: 1, words: /\b(karva|karwa)\s*chauth\b/ },
  { key: "maha_shivratri_2027", name: "Maha Shivratri", start: "2027-03-06", end: "2027-03-06", days: 1, words: /\b(maha\s*)?shiv(a)?ratri\b/ },
  { key: "chaitra_navratri_2027", name: "Chaitra Navratri", start: "2027-04-07", end: "2027-04-15", days: 9, words: /\bchaitra navratri\b|\bnavratri\b/ },
]);

/** Words that say someone is fasting. */
export const FAST_WORDS = /\b(fast|fasts|fasting|vrat|vart|upvas|upavas|upwas|vrath|roza)\b/;

const DAY = 86_400_000;
const at = (iso) => new Date(`${iso}T00:00:00+05:30`).getTime();

/**
 * Fasting festivals starting within `withinDays` of today, or running now.
 * @param {Date} [today]
 * @param {number} [withinDays]
 */
export function upcomingFasts(today = new Date(), withinDays = 21) {
  const now = today.getTime();
  return FESTIVALS
    .filter((f) => at(f.end) + DAY > now && at(f.start) - now <= withinDays * DAY)
    .map((f) => ({ ...f, inDays: Math.max(0, Math.ceil((at(f.start) - now) / DAY)), running: at(f.start) <= now }));
}

/** The festival a message names, if it's one KOI knows is coming (or running). */
export function festivalNamed(text, today = new Date()) {
  const t = String(text ?? "").toLowerCase();
  return upcomingFasts(today, 200).find((f) => f.words.test(t)) ?? null;
}

/** "Sun 11 Oct" */
export const dayLabel = (iso) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
