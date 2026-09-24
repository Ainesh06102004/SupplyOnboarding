// ============================================================================
// Track: a person's own weights against the plan's arithmetic. Pure.
//
// What it does, and only this:
//   * the trend: kg a week, a straight line through the last four weeks of
//     check-ins (weight moves with water day to day; a line through several
//     weigh-ins is steadier than any two);
//   * the plan's line: projection.js's energy-balance arithmetic, started from
//     the first check-in;
//   * the difference, and — once there are enough check-ins over enough days —
//     a PROPOSED calorie target that would close it, by the same arithmetic.
//
// What it never does: forecast, give odds, or change a target. A proposal is
// shown with its sums; the person accepts it or doesn't (00077). It moves at
// most MAX_STEP_KCAL at a time and never below goals.js's calorie floor.
// ============================================================================

import { goalsAllowed, GOAL_RULES } from "@/lib/planner/goals";
import { projection, dailyFigures, KCAL_PER_KG } from "./projection";

export const TRACK_RULES = Object.freeze({
  /** Before these, a trend is noise: say so instead of reading it. */
  minCheckins: 3,
  minDays: 14,
  /** The trend is read over the latest four weeks. */
  windowDays: 28,
  /** Within this of the plan's rate, it is on track: no proposal. */
  onTrackKgPerWeek: 0.15,
  /** A target moves at most this much at a time. */
  maxStepKcal: 200,
});

export const TRACK_ASSUMPTION =
  "Arithmetic, not a prediction: about 7,700 kcal is taken as 1 kg, and the trend is a straight line through your last four weeks of weigh-ins. Water, salt and the body adapting all move the scale.";

const DAY = 86400000;
const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const round10 = (n) => Math.round(n / 10) * 10;
const dayOf = (d) => Math.round(new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getTime() / DAY);

/** Check-ins as { date, kg, day }, oldest first, bad rows dropped. */
export function cleanCheckins(rows = []) {
  return rows
    .filter((r) => r && isNum(r.weight_kg) && r.checked_on)
    .map((r) => ({ date: String(r.checked_on).slice(0, 10), kg: Number(r.weight_kg), day: dayOf(r.checked_on) }))
    .sort((a, b) => a.day - b.day);
}

/**
 * The least-squares slope through the latest `windowDays` of check-ins.
 * @returns {{ kgPerWeek: number, days: number, count: number } | null}
 */
export function weightTrend(checkins, { windowDays = TRACK_RULES.windowDays } = {}) {
  if (checkins.length < 2) return null;
  const last = checkins[checkins.length - 1].day;
  const pts = checkins.filter((c) => c.day >= last - windowDays);
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.day, 0) / n;
  const my = pts.reduce((s, p) => s + p.kg, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.day - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((s, p) => s + (p.day - mx) * (p.kg - my), 0) / sxx;
  return { kgPerWeek: round2(slope * 7), days: pts[n - 1].day - pts[0].day, count: n };
}

/**
 * @param {object} form the person's profile form (lib/household/profile.js)
 * @param {Array<{checked_on: string, weight_kg: number}>} rows their check-ins
 * @param {{ today?: Date }} [options]
 * @returns {{
 *   allowed: boolean, checkins: Array, latest: object|null, change: number|null,
 *   trend: object|null, enough: boolean, planned: number|null, difference: number|null,
 *   status: "too_few"|"no_plan"|"on_track"|"behind"|"ahead", planLine: Array,
 *   toTarget: { weeks: number }|null, proposal: object|null, assumption: string
 * }}
 */
export function trackRead(form = {}, rows = [], { today = new Date() } = {}) {
  const base = { allowed: goalsAllowed(form.age_band), assumption: TRACK_ASSUMPTION };
  const checkins = cleanCheckins(rows);
  const latest = checkins.at(-1) ?? null;
  const first = checkins[0] ?? null;
  const trend = weightTrend(checkins);
  const span = first && latest ? latest.day - first.day : 0;
  const enough = checkins.length >= TRACK_RULES.minCheckins && span >= TRACK_RULES.minDays && Boolean(trend);

  // The plan's change a week, in kg (negative: losing). projection.js reports
  // kg lost a week, positive when losing.
  const proj = base.allowed ? projection(form, { today }) : null;
  const planned = proj ? round2(-proj.kgPerWeek) : null;

  const todayDay = dayOf(today.toISOString());
  const planLine = first && planned !== null
    ? [{ date: first.date, kg: first.kg }, { date: today.toISOString().slice(0, 10), kg: round1(first.kg + (planned * (todayDay - first.day)) / 7) }]
    : [];

  const difference = enough && planned !== null ? round2(trend.kgPerWeek - planned) : null;
  const status = !enough ? "too_few"
    : planned === null ? "no_plan"
    : Math.abs(difference) < TRACK_RULES.onTrackKgPerWeek ? "on_track"
    // "Behind" is the scale moving the plan's way more slowly, or the other way.
    : (planned < 0 ? difference > 0 : planned > 0 ? difference < 0 : Math.abs(trend.kgPerWeek) > 0) ? "behind" : "ahead";

  // Weeks to the target weight at the trend's own pace, when it is heading there.
  let toTarget = null;
  const goal = isNum(form.target_weight_kg) ? Number(form.target_weight_kg) : null;
  if (enough && latest && goal !== null && trend.kgPerWeek !== 0) {
    const toGo = goal - latest.kg;
    if (Math.abs(toGo) >= 0.1 && Math.sign(toGo) === Math.sign(trend.kgPerWeek)) {
      const weeks = Math.ceil(Math.abs(toGo) / Math.abs(trend.kgPerWeek));
      if (weeks <= 104) toTarget = { weeks };
    }
  }

  return {
    ...base,
    checkins,
    latest,
    change: first && latest ? round1(latest.kg - first.kg) : null,
    trend,
    enough,
    planned,
    difference,
    status,
    planLine,
    toTarget,
    proposal: status === "behind" || status === "ahead" ? proposalFor(form, difference) : null,
  };
}

/**
 * A new daily target that would close the difference, by the same arithmetic.
 * @param {object} form
 * @param {number} difference trend minus plan, kg a week (positive: heavier than planned)
 * @returns {{ kcal: number, from: number, step: number, gapKcal: number } | null}
 */
export function proposalFor(form, difference) {
  const figures = dailyFigures(form);
  if (!figures || !isNum(figures.kcal) || !isNum(difference)) return null;
  // Heavier than the plan by d kg a week is eating about d × 7,700 / 7 kcal a day more than it assumes.
  const gapKcal = Math.round((difference * KCAL_PER_KG) / 7);
  const step = Math.max(-TRACK_RULES.maxStepKcal, Math.min(TRACK_RULES.maxStepKcal, round10(gapKcal)));
  const sex = form.sex === "male" || form.sex === "female" ? form.sex : "unknown";
  const kcal = Math.max(GOAL_RULES.kcalFloor[sex], figures.kcal - step);
  if (kcal === figures.kcal) return null;
  return { kcal, from: figures.kcal, step: figures.kcal - kcal, gapKcal };
}
