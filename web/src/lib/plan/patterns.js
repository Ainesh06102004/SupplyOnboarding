// ============================================================================
// A habit in the meal log: the same meal eaten out on the same weekday, week
// after week ("lunch out every Tuesday"). Pure.
//
// KOI notices it and offers to plan that meal as out (a weekly Calendar event,
// lib/calendar): the week then leaves that slot empty and keeps room for it,
// instead of cooking a lunch nobody eats. It is an offer; nothing changes until
// the person takes it, and "Not now" is remembered for that habit.
// ============================================================================

export const PATTERN_RULES = Object.freeze({
  /** Read the last this many weeks… */
  weeks: 4,
  /** …and call it a habit at this many of them. */
  atLeast: 3,
});

const WEEKDAYS = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
const DAY = 86400000;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const mostOf = (list) => {
  const n = new Map();
  for (const x of list.filter(Boolean)) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * @param {Array<{ eaten_on: string, slot: string, status: string, other?: object }>} rows the person's meal log
 * @param {{ today: string, dismissed?: string[] }} opts today's date (YYYY-MM-DD); habits already said no to
 * @returns {Array<{ key, weekday, weekdayName, slot, weeks, setting, dish }>}
 */
export function eatOutPatterns(rows = [], { today, dismissed = [] } = {}) {
  const end = dayNumber(today);
  const start = end - PATTERN_RULES.weeks * 7;
  const groups = new Map();
  for (const r of rows) {
    if (r.status !== "other" || (r.other?.setting ?? "restaurant") === "home") continue;
    const d = dayNumber(r.eaten_on);
    if (!(d > start && d <= end)) continue;
    const weekday = new Date(d * DAY).getUTCDay();
    const key = `${weekday}:${r.slot}`;
    const g = groups.get(key) ?? { weekday, slot: r.slot, weeks: new Set(), settings: [], dishes: [] };
    g.weeks.add(Math.floor((end - d) / 7));
    g.settings.push(r.other?.setting ?? null);
    g.dishes.push(r.other?.items?.[0]?.dish_key ?? null);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([key, g]) => g.weeks.size >= PATTERN_RULES.atLeast && !dismissed.includes(key))
    .map(([key, g]) => ({ key, weekday: g.weekday, weekdayName: WEEKDAYS[g.weekday], slot: g.slot, weeks: g.weeks.size, setting: mostOf(g.settings), dish: mostOf(g.dishes) }))
    .sort((a, b) => b.weeks - a.weeks || a.weekday - b.weekday);
}
