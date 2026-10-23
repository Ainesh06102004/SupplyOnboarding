// ============================================================================
// Today: a person's plates for a day, and what they have eaten so far. Pure.
//
// The plate in each meal is the week's (schedule.js): the person's sized grams
// when they plan to their own numbers (portions.js), the recipe's serving for
// everyone else, plus their daily additions (a scoop of whey) in that slot. A
// Take 2's swap ("have the spare box on Thursday") replaces their plate there.
//
// The ledger reads the person's meal log (00091) against those plates: a meal
// eaten as planned counts the plate; part of it, half; skipped, nothing; and
// something else counts KOI's estimate of it (lib/food/estimate.js). A meal not
// logged yet is still expected as planned. So the day always says three things:
// eaten so far, the day as it will end if the rest goes to plan, and the gap
// against the person's numbers.
// ============================================================================

import { recipeFor, dishNutrition } from "@/lib/food/recipes";
import { addNutrients, scaleNutrients, zero, MACROS } from "@/lib/food/foods";
import { dailyFigures } from "./projection";
import { SLOT_KEYS, SLOT_LABELS } from "./schedule";

export const MEAL_STATUSES = Object.freeze(["ate", "partial", "skipped", "other"]);
/** "I had some of it": half the plate, unless the log says how much. */
export const PARTIAL_SHARE = 0.5;

const order = (slot) => { const i = SLOT_KEYS.indexOf(slot); return i < 0 ? SLOT_KEYS.length : i; };
const eatsAt = (cell, id) => Boolean(cell?.shared?.eaters?.map(String).includes(id));

/** The dishes a person eats in a cell: the table's if they are at it, else their own. */
export function dishesFor(cell, memberId) {
  const id = String(memberId);
  if (eatsAt(cell, id)) return cell.shared.dishes;
  return cell?.own?.[id]?.dishes ?? [];
}

/**
 * A person's plates for one day of the week.
 * @param {object} input
 * @param {object} input.week from buildWeek
 * @param {object|null} [input.sized] the person's sizePortions result, when they plan to their own numbers
 * @param {string} input.memberId
 * @param {number} input.dayIndex
 * @param {Array} [input.swaps] Take 2 swaps: { cellKey, memberId, dishes, nutrition, from }
 * @returns {Array<{ slot, label, cellKey, dishes, nutrition, sized, batch, shared, swap, extras }>}
 */
export function platesOfDay({ week, sized = null, memberId, dayIndex, swaps = [] }) {
  const id = String(memberId);
  const day = sized?.days?.find((d) => d.index === dayIndex) ?? null;
  const plates = [];
  for (const slot of week?.slots ?? []) {
    const cellKey = `${dayIndex}:${slot}`;
    const cell = week.cells[cellKey];
    if (!cell) continue;
    const swap = swaps.find((s) => s.cellKey === cellKey && String(s.memberId) === id) ?? null;
    const dishes = dishesFor(cell, id);
    if (!dishes.length && !swap) continue;
    const items = (day?.items ?? []).filter((i) => i.cellKey === cellKey && i.kind !== "addition");
    const nutrition = swap ? { ...zero(), ...swap.nutrition }
      : items.length ? items.reduce((acc, i) => addNutrients(acc, i.nutrition), zero())
        : dishes.reduce((acc, d) => { const r = recipeFor(d.key); return r ? addNutrients(acc, dishNutrition(r)) : acc; }, zero());
    plates.push({
      slot,
      label: SLOT_LABELS[slot] ?? slot,
      cellKey,
      dishes: (swap ? swap.dishes : dishes).map((d) => ({ key: d.key, name: d.name })),
      nutrition,
      sized: Boolean(items.length) && !swap,
      batch: eatsAt(cell, id) ? cell.shared.batch ?? null : null,
      shared: eatsAt(cell, id) && cell.shared.eaters.length > 1,
      swap: swap?.from ?? null,
      extras: [],
    });
  }
  // A sized person's daily additions sit in their slot's plate (or make one).
  for (const a of (day?.items ?? []).filter((i) => i.kind === "addition")) {
    let plate = plates.find((p) => p.slot === a.slot);
    if (!plate) {
      plate = { slot: a.slot, label: SLOT_LABELS[a.slot] ?? a.slot, cellKey: null, dishes: [], nutrition: zero(), sized: true, batch: null, shared: false, swap: null, extras: [] };
      plates.push(plate);
    }
    plate.extras.push({ skuId: a.skuId, name: a.name, grams: a.grams });
    plate.nutrition = addNutrients(plate.nutrition, a.nutrition);
  }
  return plates.sort((a, b) => order(a.slot) - order(b.slot));
}

/** What a logged meal counts for, against the plate planned there. */
export function countedOf(planned, log) {
  if (!log) return planned;
  if (log.status === "ate") return planned;
  if (log.status === "partial") return scaleNutrients(planned, 100 * (Number(log.other?.share) > 0 ? Number(log.other.share) : PARTIAL_SHARE));
  if (log.status === "skipped") return zero();
  return { ...zero(), ...(log.estimate?.point ?? {}) };
}

/** The person's numbers for a day: the sized day's target, or their daily figures (kcal and protein, carbs and fat if stated). */
export function targetFor(person, sizedDay = null) {
  if (sizedDay?.target) return sizedDay.target;
  const f = person ? dailyFigures(person) : null;
  if (!f || !(f.kcal > 0)) return null;
  return { kcal: f.kcal, protein: f.protein ?? null, carbs: f.carbs ?? null, fat: f.fat ?? null };
}

const diff = (a, b) => Object.fromEntries(MACROS.map((n) => [n, Number.isFinite(b?.[n]) ? Math.round((a[n] ?? 0) - b[n]) : null]));

/**
 * @param {object} input
 * @param {Array} input.plates from platesOfDay
 * @param {Array} [input.logs] the person's log rows for the day: { slot, status, other, estimate }
 * @param {object|null} [input.target] from targetFor
 * @param {number} [input.tolerancePct] within this of every stated number, the day is on target
 */
export function dayLedger({ plates, logs = [], target = null, tolerancePct = 5 }) {
  const bySlot = new Map(logs.map((l) => [l.slot, l]));
  const rows = plates.map((p) => {
    const log = bySlot.get(p.slot) ?? null;
    return { ...p, log, done: Boolean(log), counted: countedOf(p.nutrition, log) };
  });
  // A meal logged where the plan had nothing (a snack the week didn't have).
  for (const l of logs) {
    if (rows.some((r) => r.slot === l.slot)) continue;
    rows.push({ slot: l.slot, label: SLOT_LABELS[l.slot] ?? l.slot, cellKey: null, dishes: [], nutrition: zero(), sized: false, batch: null, shared: false, swap: null, extras: [], log: l, done: true, counted: countedOf(zero(), l), unplanned: true });
  }
  rows.sort((a, b) => order(a.slot) - order(b.slot));
  const sum = (pick) => rows.reduce((acc, r) => addNutrients(acc, pick(r)), zero());
  const eaten = sum((r) => (r.done ? r.counted : zero()));
  const expected = sum((r) => r.counted);
  const planned = sum((r) => r.nutrition);
  const gap = target ? diff(expected, target) : null;
  const within = target ? MACROS.every((n) => !Number.isFinite(target[n]) || !(target[n] > 0) || Math.abs((expected[n] - target[n]) / target[n]) * 100 <= tolerancePct) : null;
  return { rows, eaten, expected, planned, target, gap, within, logged: rows.filter((r) => r.done).length };
}
