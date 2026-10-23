// ============================================================================
// Batch cooking: cook once on a prep day, eat it for the next few days. Pure.
//
// A household that batch-cooks (household.cooking_style, 00090) gets a week
// where a lunch — and, cooking twice a week, a dinner — is the SAME meal for a
// run of days, cooked on the prep day before them and boxed. This reads the
// week schedule.js already chose and turns it into batches:
//
//   * a batch starts the day after a prep day (the cook is that evening, or
//     that morning before the week's first box) and runs until the next prep
//     day, never longer than the meal keeps in the fridge (recipe keepsDays,
//     at most MAX_BOXES days);
//   * its meal is the first meal in the run whose every dish is batchable and
//     keeps that long; a run with none stays cooked fresh;
//   * the result is `overrides` for buildWeek (the same meal on each day) and
//     `ties` for portions.js, so every box of a batch holds the same grams.
//
// The shopper's own picks always win: a cell they chose is never batched over.
// ============================================================================

import { recipeFor } from "@/lib/food/recipes";

export const COOKING_STYLES = Object.freeze([
  { key: "fresh", label: "Fresh each day", slots: [] },
  { key: "batch", label: "Batch twice a week", slots: ["lunch", "dinner"] },
  { key: "batch_lunch", label: "Batch lunches only", slots: ["lunch"] },
]);
/** Sunday and Wednesday (0 = Sunday … 6 = Saturday), until the Calendar sets them. */
export const DEFAULT_PREP_DAYS = Object.freeze([0, 3]);
export const MAX_BOXES = 4;
const WEEKDAY = Object.freeze({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 });

/** How long a whole meal keeps: its shortest-keeping dish. 0 when any dish can't be batched. */
export function mealKeeps(dishKeys) {
  let keeps = Infinity;
  for (const key of dishKeys) {
    const r = recipeFor(key);
    if (!r?.batchable || !(r.keepsDays > 0)) return 0;
    keeps = Math.min(keeps, r.keepsDays);
  }
  return Number.isFinite(keeps) ? keeps : 0;
}

/**
 * @param {object} input
 * @param {object} input.week from buildWeek (days with labels, cells)
 * @param {"fresh"|"batch"|"batch_lunch"} [input.style]
 * @param {number[]} [input.prepDays] weekdays, 0 = Sunday
 * @param {object} [input.picks] the shopper's own picks ({ "day:slot": … }), never batched over
 * @returns {{ batches: Array<{id, slot, dishes, cookDay, cookDate, cookLabel, cells: string[], boxes: number, eaters: string[]}>, overrides: object, ties: (memberId) => object }}
 */
export function planBatches({ week, style = "fresh", prepDays = DEFAULT_PREP_DAYS, picks = {} }) {
  const slots = COOKING_STYLES.find((s) => s.key === style)?.slots ?? [];
  const empty = { batches: [], overrides: {}, ties: () => ({}) };
  if (!week || !slots.length) return empty;
  const prep = new Set(prepDays.map(Number));
  const days = week.days;
  // A prep day just before the week counts: Sunday's cook feeds a week that starts on Monday.
  const isPrep = (index) => {
    if (index >= 0) return prep.has(WEEKDAY[days[index]?.label]);
    const first = WEEKDAY[days[0]?.label];
    return first !== undefined && prep.has((first + 6) % 7);
  };
  const prepIndexes = [-1, ...days.map((d) => d.index)].filter(isPrep);
  const batches = [];
  const overrides = {};
  let letter = 0;

  for (const slot of slots) {
    if (!week.slots?.includes(slot)) continue;
    for (let i = 0; i < prepIndexes.length; i++) {
      const cook = prepIndexes[i];
      const until = i + 1 < prepIndexes.length ? prepIndexes[i + 1] : days.length - 1;
      // The run: the day after the cook, up to and including the next prep day (its own cook is that evening).
      const run = [];
      for (let d = cook + 1; d <= until && d < days.length; d++) run.push(d);
      // The meal: the first in the run that keeps; the run is cut to how long it keeps.
      let meal = null;
      for (const d of run) {
        const cell = week.cells[`${d}:${slot}`];
        const keys = cell?.shared?.dishes?.map((x) => x.key) ?? [];
        if (!keys.length || picks[cell.key]) continue;
        const keeps = mealKeeps(keys);
        if (keeps > 0) { meal = { keys, dishes: cell.shared.dishes, eaters: cell.shared.eaters, keeps }; break; }
      }
      if (!meal) continue;
      const span = run.filter((d) => !picks[`${d}:${slot}`] && week.cells[`${d}:${slot}`]?.shared).slice(0, Math.min(meal.keeps, MAX_BOXES));
      if (span.length < 2) continue; // one box is just cooking
      const id = String.fromCharCode(65 + letter++);
      const cells = span.map((d) => `${d}:${slot}`);
      for (const key of cells) overrides[key] = { dishes: meal.keys, batch: id };
      const cookDay = cook < 0 ? null : days[cook];
      batches.push({
        id, slot, dishes: meal.dishes, eaters: meal.eaters, cells, boxes: cells.length,
        cookDay: cook, cookDate: cookDay?.date ?? null, cookLabel: cookDay?.label ?? labelBefore(days[0]?.label),
      });
    }
  }

  /** For portions.js: every box of a batch, for this person, is one portion. */
  const ties = (memberId) => {
    const out = {};
    for (const b of batches) {
      if (!b.eaters.map(String).includes(String(memberId))) continue;
      for (const cell of b.cells) for (const dish of b.dishes) out[`${cell}|${dish.key}`] = `batch-${b.id}-${dish.key}`;
    }
    return out;
  };

  return { batches, overrides, ties };
}

/** The weekday before this one ("Mon" → "Sun"): the cook before the week. */
function labelBefore(label) {
  const names = Object.keys(WEEKDAY);
  const i = names.indexOf(label);
  return i < 0 ? null : names[(i + 6) % 7];
}

/** The batch a cell belongs to, if any. */
export const batchOf = (batches, cellKey) => batches.find((b) => b.cells.includes(cellKey)) ?? null;
