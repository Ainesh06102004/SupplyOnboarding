// ============================================================================
// Auto-plan: when KOI drafts a household's next plan, and for which days. Pure.
//
// A job (00093) is a weekday and a time in India ("every Sunday at 6 pm") and
// the plan's rules (how many days, a budget, who is eating, when it starts).
// The hourly job (/api/engine/autoplan) runs every job whose next run has come,
// keeps what it plans as a DRAFT, and tells the household; the next run is set
// from here. India has no daylight saving, so IST is always UTC+5:30.
// ============================================================================

const IST_MINUTES = 330;
const DAY = 86400000;
const WEEKDAYS = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);

export const AUTOPLAN_DAYS = Object.freeze([7, 5, 3, 14]);
export const AUTOPLAN_STARTS = Object.freeze([
  Object.freeze({ key: "next_day", label: "The day after" }),
  Object.freeze({ key: "next_monday", label: "The Monday after" }),
]);
export const AUTOPLAN_DEFAULTS = Object.freeze({
  weekday: 0,
  local_time: "18:00",
  rules: Object.freeze({ days: 7, budget: null, member_ids: null, start: "next_day" }),
  channels: Object.freeze(["in_app"]),
});

/** The rules as the planner takes them, whatever the row holds. */
export function rulesOf(job = {}) {
  const r = job.rules ?? {};
  const days = AUTOPLAN_DAYS.includes(Number(r.days)) ? Number(r.days) : Math.max(1, Math.min(14, Math.round(Number(r.days) || 7)));
  const budget = Number(r.budget) > 0 ? Math.round(Number(r.budget)) : null;
  const memberIds = Array.isArray(r.member_ids) && r.member_ids.length ? r.member_ids.map(String) : null;
  return { days, budget, memberIds, start: AUTOPLAN_STARTS.some((s) => s.key === r.start) ? r.start : "next_day" };
}

const istParts = (date) => {
  const t = new Date(date.getTime() + IST_MINUTES * 60000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), weekday: t.getUTCDay() };
};
const isoOf = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/**
 * The next run after `now`: the job's weekday at its time, in India.
 * @param {{ weekday: number, local_time: string }} job
 * @param {Date} [now]
 * @returns {Date}
 */
export function nextRunAt(job, now = new Date()) {
  const [h, min] = String(job.local_time ?? "18:00").slice(0, 5).split(":").map(Number);
  const today = istParts(now);
  for (let i = 0; i <= 7; i++) {
    const wall = Date.UTC(today.y, today.m, today.d + i, h, min);
    const at = new Date(wall - IST_MINUTES * 60000);
    if (new Date(wall).getUTCDay() === Number(job.weekday) && at > now) return at;
  }
  return new Date(now.getTime() + 7 * DAY);
}

/** The first day of the plan a run drafts, in India: the day after it, or the Monday after. */
export function startsOnFor(runAt, { start = "next_day" } = {}) {
  const p = istParts(runAt);
  let ahead = 1;
  if (start === "next_monday") ahead = ((1 - p.weekday + 7) % 7) || 7;
  return isoOf(p.y, p.m, p.d + ahead);
}

/** "Every Sunday at 6 pm". */
export function jobWords(job) {
  const [h, min] = String(job.local_time ?? "18:00").slice(0, 5).split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `Every ${WEEKDAYS[Number(job.weekday)] ?? "week"} at ${hour12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

/** The jobs whose run has come, oldest first. */
export function dueJobs(jobs = [], now = new Date()) {
  return jobs
    .filter((j) => !j.paused && j.next_run_at && new Date(j.next_run_at) <= now)
    .sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)));
}
