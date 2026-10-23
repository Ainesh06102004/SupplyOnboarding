// ============================================================================
// Take 2: after a meal that wasn't the plan, what the rest of the week could do.
// Pure. KOI offers; the person picks; nothing changes until they do.
//
// Two questions, answered apart:
//
//   THE NUMBERS — the day now ends over or under the person's numbers.
//     leave   always offered. One meal doesn't undo a week.
//     today   resize the meals still to come today. Someone on their own
//             numbers gets the portion engine (portions.js) with what they
//             ate fixed; everyone else a smaller or bigger plate, within
//             plateScale. Offered when a later meal today can change.
//     spread  move the difference over the week's remaining days, each day by
//             at most spreadCapPct of its calories (and spreadCapKcal), never
//             under the calorie floor (goals.js). What doesn't fit is left.
//     Protein is never cut to pay for a meal out; it is only topped up.
//
//   THE MEAL THAT WASN'T EATEN — what happens to it depends on what it is:
//     box        a batch box (batch.js), already cooked: eat it another day
//                before its use-by, or freeze it.
//     leftovers  a dish cooked for the table anyway: pack the plate for a later
//                meal while it keeps.
//     fresh      a dish only this person eats, not cooked yet: cook it on a
//                later day instead (that day's dish moves to next week), or move
//                it to next week.
//     keeps      anything else: nothing to move.
//
// Every option says what it does in figures from these engines, never the
// model's. Applied options are kept on the week (plan_week.adjustments, 00091)
// and undone the same way; applyAdjustments re-derives the week from them.
// ============================================================================

import { sizePortions } from "./portions";
import { platesOfDay, dayLedger, targetFor, dishesFor } from "./today";
import { mealKeeps } from "./batch";
import { SLOT_KEYS } from "./schedule";
import { GOAL_RULES } from "@/lib/planner/goals";
import { recipeFor } from "@/lib/food/recipes";
import { foodOf, addNutrients, zero, MACROS } from "@/lib/food/foods";

export const REBALANCE_RULES = Object.freeze({
  /** Within this of the day's calories, the advice is to leave it. */
  withinPct: 5,
  /** A gap up to this share of the day can be fixed in today's remaining meals. */
  fixTodayMaxPct: 20,
  /** Spreading moves a later day by at most this share of its calories… */
  spreadCapPct: 10,
  /** …and at most this many kcal. */
  spreadCapKcal: 300,
  /** A remaining plate, for someone without their own numbers, is scaled within this. */
  plateScale: Object.freeze([0.6, 1.3]),
  /** An option must close at least this share of the gap to be worth offering. */
  minCloses: 0.3,
});

const order = (slot) => SLOT_KEYS.indexOf(slot);
const MAIN_SLOTS = new Set(["lunch", "dinner"]);
const k = (n) => Math.round(n).toLocaleString("en-IN");
const quarterWords = (f) => {
  const q = Math.round(f * 4) / 4;
  return q === 1 ? "your usual plate" : q === 0.75 ? "about ¾ of your usual plate" : q === 0.5 ? "about half your usual plate" : q === 1.25 ? "about a quarter more than usual" : `about ${Math.round(f * 100)}% of your usual plate`;
};
const overUnder = (gapKcal) => `${k(Math.abs(gapKcal))} kcal ${gapKcal > 0 ? "over" : "under"}`;
const dishNames = (dishes) => dishes.map((d) => d.name).join(" with ");

/** The week trimmed to one day, for resizing that day alone. */
const oneDay = (week, dayIndex) => ({ ...week, days: week.days.filter((d) => d.index === dayIndex) });

/** Swaps, shifts and plate scales from every adjustment still in force. */
export function activeEffects(adjustments = []) {
  const live = adjustments.filter((a) => !a.undone);
  const shift = {};
  const scale = {};
  const resize = new Set();
  for (const a of live) {
    for (const [day, s] of Object.entries(a.effect?.shift ?? {})) {
      const t = (shift[day] ??= {});
      for (const n of MACROS) if (Number.isFinite(s[n])) t[n] = (t[n] ?? 0) + s[n];
    }
    for (const [cell, f] of Object.entries(a.effect?.scale ?? {})) scale[cell] = Math.round((scale[cell] ?? 1) * f * 100) / 100;
    for (const d of a.effect?.resize ?? []) resize.add(Number(d));
  }
  return {
    shift,
    scale,
    resize,
    swaps: live.flatMap((a) => a.effect?.swaps ?? []),
    carry: live.flatMap((a) => a.effect?.carry ?? []),
    freeze: live.flatMap((a) => a.effect?.freeze ?? []),
  };
}

/**
 * What is already decided on a day, for resizing it: logged meals, cooked
 * boxes and swapped plates, and — on the day being lived — the meals before the
 * last one logged (eaten as planned unless logged otherwise).
 */
function fixedFor({ week, memberId, dayIndex, base, logs, swaps, outs = {}, upTo = null }) {
  const plates = platesOfDay({ week, sized: base, memberId, dayIndex, swaps, outs });
  const bySlot = new Map(logs.map((l) => [l.slot, l]));
  const ledger = dayLedger({ plates, logs });
  const fixed = {};
  for (const row of ledger.rows) {
    if (!row.cellKey) continue;
    const before = upTo !== null && order(row.slot) <= upTo;
    // A meal out on the Calendar is held at a typical meal out until it is logged.
    if (bySlot.has(row.slot) || row.batch || row.swap || row.out || before) {
      fixed[row.cellKey] = { name: row.dishes.map((d) => d.name).join(", ") || null, nutrition: row.counted };
    }
  }
  // A meal logged where the week had no plate still counts towards the day.
  for (const row of ledger.rows.filter((r) => r.unplanned)) fixed[`${dayIndex}:${row.slot}`] = { name: null, nutrition: row.counted };
  return fixed;
}

/**
 * The week as the person's adjustments leave it: resized days for someone on
 * their own numbers, plate scales for everyone else, swaps, what was moved to
 * next week and what is in the freezer.
 * @param {object} input
 * @param {object} input.week
 * @param {object} input.person profile form
 * @param {object|null} input.base the person's sizePortions result for the week as planned
 * @param {Array} input.adjustments plan_week.adjustments
 * @param {Object<string, Array>} [input.logsByDate] the person's meal log rows by date
 * @param {object} [input.sizing] { labels, basket, trainingDays } as the week was sized with
 * @param {object} [input.outs] cell key → the Calendar's meals out for this person
 */
export function applyAdjustments({ week, person, base = null, adjustments = [], logsByDate = {}, sizing = {}, outs = {} }) {
  const effects = activeEffects(adjustments);
  const memberId = String(person.memberId);
  const mine = { ...effects, swaps: effects.swaps.filter((s) => String(s.memberId) === memberId) };
  if (!base || !week) return { sized: base, ...mine };
  const days = base.days.map((day) => {
    if (!mine.resize.has(day.index)) return day;
    const logs = logsByDate[day.date] ?? [];
    const lastLogged = logs.reduce((m, l) => Math.max(m, order(l.slot)), -1);
    const fixed = fixedFor({ week, memberId, dayIndex: day.index, base, logs, swaps: mine.swaps, outs, upTo: lastLogged >= 0 ? lastLogged : null });
    const resized = sizePortions({ week: oneDay(week, day.index), person, ...sizing, fixed: { ...(sizing.fixed ?? {}), ...fixed }, shift: mine.shift });
    return resized.days[0] ?? day;
  });
  return { sized: { ...base, days, within: days.every((d) => d.within) }, ...mine };
}

/** Plate options for the meal that wasn't eaten. */
function mealOptions({ week, batches, memberId, dayIndex, plate, logsByDate, swaps }) {
  if (!plate?.cellKey || !plate.dishes.length) return { kind: null, options: [] };
  const keys = plate.dishes.map((d) => d.key);
  const day = week.days.find((d) => d.index === dayIndex);
  const loggedAt = (cellKey) => {
    const [d, slot] = cellKey.split(":");
    const date = week.days.find((x) => x.index === Number(d))?.date;
    return (logsByDate[date] ?? []).some((l) => l.slot === slot);
  };
  const taken = new Set(swaps.filter((s) => String(s.memberId) === memberId).map((s) => s.cellKey));
  const batchCells = new Set(batches.filter((b) => b.eaters.map(String).includes(memberId)).flatMap((b) => b.cells));
  /** Later main meals this person eats, up to a day, that nothing else has claimed. */
  const laterMeals = (lastDay, { sameSlot = false, alone = false } = {}) => week.days
    .filter((d) => d.index > dayIndex && d.index <= lastDay)
    .flatMap((d) => (week.slots ?? []).filter((s) => MAIN_SLOTS.has(s) && (!sameSlot || s === plate.slot)).map((s) => `${d.index}:${s}`))
    .filter((key) => {
      const cell = week.cells[key];
      if (!cell || !dishesFor(cell, memberId).length || batchCells.has(key) || taken.has(key) || loggedAt(key)) return false;
      return !alone || !(cell.shared?.eaters?.length > 1 && cell.shared.eaters.map(String).includes(memberId));
    });
  const where = (cellKey) => {
    const [d, slot] = cellKey.split(":");
    return `${week.days.find((x) => x.index === Number(d))?.label ?? "later"} ${slot}`;
  };
  const instead = (cellKey) => dishNames(dishesFor(week.cells[cellKey], memberId));
  const swapTo = (cellKey, from) => ({ swaps: [{ cellKey, memberId, dishes: plate.dishes, nutrition: plate.nutrition, from }] });

  if (plate.batch) {
    const batch = batches.find((b) => b.id === plate.batch);
    const useBy = (batch?.cookDay ?? dayIndex) + mealKeeps(keys);
    const targets = laterMeals(useBy).slice(0, 2);
    const byLabel = week.days.find((d) => d.index === Math.min(useBy, week.days.length - 1))?.label;
    return {
      kind: "box",
      options: [
        ...targets.map((t, i) => ({ id: `box:${t}`, title: `Have the spare box on ${where(t)}`, detail: `Instead of ${instead(t)}, which is cooked for one fewer. It keeps until ${byLabel}.`, recommended: i === 0, effect: swapTo(t, "box") })),
        { id: "freeze", title: "Freeze it", detail: `${dishNames(plate.dishes)} freezes for about a month. KOI notes it in your freezer.`, recommended: !targets.length, effect: { freeze: [{ dishes: plate.dishes, from: plate.cellKey, on: day?.date ?? null }] } },
        { id: "drop", title: "Let it go", detail: "Nothing moves.", recommended: false, effect: {} },
      ],
    };
  }

  if (plate.shared) {
    const keeps = mealKeeps(keys);
    if (!(keeps > 0)) return { kind: "keeps", options: [{ id: "drop", title: "Nothing to move", detail: `${dishNames(plate.dishes)} was cooked for the table and doesn't keep.`, recommended: true, effect: {} }] };
    const targets = laterMeals(dayIndex + keeps).slice(0, 2);
    return {
      kind: "leftovers",
      options: [
        ...targets.map((t, i) => ({ id: `pack:${t}`, title: `Pack your plate for ${where(t)}`, detail: `Your ${dishNames(plate.dishes).toLowerCase()} instead of ${instead(t)}, which is cooked for one fewer.`, recommended: i === 0, effect: swapTo(t, "leftovers") })),
        { id: "drop", title: targets.length ? "Let it go" : "Nothing to move", detail: targets.length ? "Nothing moves." : `It keeps ${keeps} day${keeps === 1 ? "" : "s"}, and there's no meal of yours to put it in.`, recommended: !targets.length, effect: {} },
      ],
    };
  }

  if (MAIN_SLOTS.has(plate.slot)) {
    // Not cooked yet: it can be cooked on another day, if its fresh things keep that long.
    const recipe = keys.map(recipeFor).filter(Boolean);
    const fresh = recipe.flatMap((r) => r.lines.filter((l) => l.supply === "fresh").map((l) => foodOf(l.food)).filter((f) => f?.fridgeDays > 0));
    const keepsFor = fresh.length ? Math.min(...fresh.map((f) => f.fridgeDays)) : 7;
    const shortest = fresh.find((f) => f.fridgeDays === keepsFor);
    const targets = laterMeals(week.days.length - 1, { sameSlot: false, alone: true }).slice(0, 2);
    return {
      kind: "fresh",
      options: [
        ...targets.map((t, i) => {
          const daysAway = Number(t.split(":")[0]) - dayIndex;
          const risky = daysAway > keepsFor;
          return {
            id: `cook:${t}`,
            title: `Cook it on ${where(t)}`,
            detail: `Instead of ${instead(t)}, which moves to next week.${risky ? ` The ${shortest.name.toLowerCase().replace(/\s*\(.*?\)/g, "")} may not keep ${daysAway} days.` : ""}`,
            recommended: i === 0 && !risky,
            effect: { picks: { [t]: { dishes: keys } }, carry: [{ dishes: dishesFor(week.cells[t], memberId).map((d) => ({ key: d.key, name: d.name })), from: t }] },
          };
        }),
        { id: "next_week", title: "Move it to next week", detail: `${dishNames(plate.dishes)} goes on next week's plan.`, recommended: !targets.length, effect: { carry: [{ dishes: plate.dishes, from: plate.cellKey }] } },
      ],
    };
  }

  return { kind: "keeps", options: [{ id: "drop", title: "Nothing to move", detail: `${dishNames(plate.dishes)} keeps, or is quick to make another time.`, recommended: true, effect: {} }] };
}

/**
 * @param {object} input
 * @param {object} input.week
 * @param {Array} [input.batches]
 * @param {object} input.person profile form (memberId, targets, sex)
 * @param {object|null} [input.sized] the person's sizing as things stand (applyAdjustments().sized), or null
 * @param {object} input.entry the meal just logged: { eaten_on, slot, status, other, estimate }
 * @param {Object<string, Array>} [input.logsByDate] the person's log rows by date, before this entry
 * @param {Array} [input.swaps] swaps already in force
 * @param {object} [input.shift] day shifts already in force (activeEffects().shift)
 * @param {object} [input.sizing] { labels, basket, trainingDays }
 * @param {object} [input.outs] cell key → the Calendar's meals out for this person
 * @returns {{ inWeek: boolean, ledger, gap, numbers: Array, meal: { kind, options: Array } }}
 */
export function takeTwo({ week, batches = [], person, sized = null, entry, logsByDate = {}, swaps = [], shift: shifted = {}, sizing = {}, outs = {} }) {
  const R = REBALANCE_RULES;
  const memberId = String(person.memberId);
  const day = week?.days?.find((d) => d.date === entry.eaten_on) ?? null;
  const leaveOnly = (detail) => ({ id: "leave", title: "Leave it", detail, recommended: true, effect: {} });
  if (!day) return { inWeek: false, ledger: null, gap: null, numbers: [leaveOnly("This week's plan doesn't cover that day, so there is nothing to rebalance.")], meal: { kind: null, options: [] } };

  const logs = [...(logsByDate[day.date] ?? []).filter((l) => l.slot !== entry.slot), entry];
  const plates = platesOfDay({ week, sized, memberId, dayIndex: day.index, swaps, outs });
  const sizedDay = sized?.days?.find((d) => d.index === day.index) ?? null;
  const target = targetFor(person, sizedDay);
  const ledger = dayLedger({ plates, logs, target, tolerancePct: Number(person.target_tolerance_pct) || 5 });
  const plate = plates.find((p) => p.slot === entry.slot) ?? null;
  const meal = ["other", "skipped"].includes(entry.status)
    ? mealOptions({ week, batches, memberId, dayIndex: day.index, plate, logsByDate, swaps })
    : { kind: null, options: [] };

  // What the day is measured against. On their own numbers, the day was sized to
  // them, so the target. Otherwise the plate is the recipe's serving, not sized
  // to anyone: the day is measured against the plan, and the gap is what the
  // meal changed. Their target, if KOI has one, only keeps a day off the floor.
  const ref = sized ? target : ledger.planned;
  if (!(ref?.kcal > 0)) return { inWeek: true, ledger, gap: null, numbers: [leaveOnly("There's nothing planned for that day to rebalance against.")], meal };
  const gapOf = (n) => (Number.isFinite(ref[n]) ? ledger.expected[n] - ref[n] : null);
  const gapK = gapOf("kcal");
  const withinK = (R.withinPct / 100) * ref.kcal;
  const numbers = [];
  const inside = Math.abs(gapK) <= withinK;
  numbers.push({
    id: "leave",
    title: "Leave it",
    detail: inside
      ? `You're within ${R.withinPct}% of ${sized ? "your numbers" : "the day's plan"}. Nothing needs to change.`
      : `The day ends ${overUnder(gapK)}${sized ? "" : " the plan"}. One meal doesn't undo a week; nothing changes.`,
    recommended: false,
    effect: {},
    after: { kcal: Math.round(gapK) },
  });

  // ── Today: resize the meals still to come ─────────────────────────────
  const remaining = ledger.rows.filter((r) => !r.done && r.cellKey && !r.batch && !r.swap && !r.out && order(r.slot) > order(entry.slot) && r.nutrition.kcal > 0);
  if (!inside && remaining.length) {
    if (sized) {
      const fixed = { ...(sizing.fixed ?? {}), ...fixedFor({ week, memberId, dayIndex: day.index, base: sized, logs, swaps, outs, upTo: order(entry.slot) }) };
      // Protein the meal out brought beyond the plate it replaced raises the day's protein, so the
      // meals still to come keep theirs: protein is never cut to pay for a meal out.
      const extraProtein = Math.max(0, Math.round((ledger.rows.find((r) => r.slot === entry.slot)?.counted.protein ?? 0) - (plate?.nutrition.protein ?? 0)));
      const dayShift = { ...(shifted[day.index] ?? {}) };
      if (extraProtein) dayShift.protein = (dayShift.protein ?? 0) + extraProtein;
      const resized = sizePortions({ week: oneDay(week, day.index), person, ...sizing, fixed, shift: { [day.index]: dayShift } }).days[0];
      const after = Math.round(resized.totals.kcal - resized.target.kcal);
      if (Math.abs(after) <= Math.abs(gapK) * (1 - R.minCloses)) {
        const changes = resized.items.filter((i) => i.kind === "dish" && remaining.some((r) => r.cellKey === i.cellKey));
        const words = remaining.map((r) => {
          const kcal = changes.filter((i) => i.cellKey === r.cellKey).reduce((a, i) => a + i.nutrition.kcal, 0);
          return `${r.label}: ${k(kcal)} kcal (was ${k(r.nutrition.kcal)})`;
        });
        numbers.push({
          id: "today",
          title: gapK > 0 ? "Lighter meals for the rest of today" : "More at the rest of today's meals",
          detail: `${words.join("; ")}. Protein stays. The day lands ${Math.abs(after) <= withinK ? `within ${R.withinPct}%` : overUnder(after)}.`,
          recommended: false,
          effect: { resize: [day.index], ...(extraProtein ? { shift: { [day.index]: { protein: extraProtein } } } : {}) },
          after: { kcal: after },
          preview: changes,
        });
      }
    } else {
      const remK = remaining.reduce((a, r) => a + r.nutrition.kcal, 0);
      const [lo, hi] = R.plateScale;
      const f = Math.min(hi, Math.max(lo, (remK - gapK) / remK));
      const after = Math.round(gapK - remK * (1 - f));
      if (Math.abs(after) <= Math.abs(gapK) * (1 - R.minCloses)) {
        numbers.push({
          id: "today",
          title: gapK > 0 ? "Smaller plates for the rest of today" : "Bigger plates for the rest of today",
          detail: `${remaining.map((r) => r.label).join(" and ")}: ${quarterWords(f)}. The day lands ${Math.abs(after) <= withinK ? `within ${R.withinPct}%` : overUnder(after)}.`,
          recommended: false,
          effect: { scale: Object.fromEntries(remaining.map((r) => [r.cellKey, Math.round(f * 100) / 100])) },
          after: { kcal: after },
        });
      }
    }
  }

  // ── Spread: the week's remaining days take a little each ────────────────
  const later = week.days.filter((d) => d.index > day.index);
  if (!inside && later.length) {
    const floor = GOAL_RULES.kcalFloor[person.sex] ?? GOAL_RULES.kcalFloor.unknown;
    const share = gapK / later.length;
    const shift = {};
    const scale = {};
    let covered = 0;
    for (const d of later) {
      const dayPlates = sized ? [] : platesOfDay({ week, sized: null, memberId, dayIndex: d.index, swaps, outs });
      const dayRef = sized ? sized.days.find((x) => x.index === d.index)?.target?.kcal ?? ref.kcal : dayPlates.reduce((a, p) => a + p.nutrition.kcal, 0);
      if (!(dayRef > 0)) continue;
      const cap = Math.min((R.spreadCapPct / 100) * dayRef, R.spreadCapKcal);
      let take = Math.max(-cap, Math.min(cap, share));
      // A lighter day never takes the person under the calorie floor (by their target, when KOI has one).
      if (take > 0) take = Math.min(take, Math.max(0, (sized ? dayRef : target?.kcal ?? dayRef) - floor));
      if (Math.abs(take) < 1) continue;
      covered += take;
      const ratio = take / gapK;
      const s = { kcal: -Math.round(take) };
      for (const n of ["carbs", "fat"]) if (Number.isFinite(gapOf(n))) s[n] = -Math.round(gapOf(n) * ratio);
      // Protein is topped up when the meal out was short of it, never cut.
      if (Number.isFinite(gapOf("protein")) && gapOf("protein") < 0) s.protein = -Math.round(gapOf("protein") * ratio);
      shift[d.index] = s;
      if (!sized) {
        const free = dayPlates.filter((p) => p.cellKey && !p.batch && !p.swap && !p.out);
        const freeK = free.reduce((a, p) => a + p.nutrition.kcal, 0);
        const f = freeK > 0 ? Math.min(R.plateScale[1], Math.max(R.plateScale[0], (freeK - take) / freeK)) : 1;
        for (const p of free) scale[p.cellKey] = Math.round(f * 100) / 100;
      }
    }
    const days = Object.keys(shift).length;
    // Worth offering when it moves more than the day's own margin, even if a party is more than a week takes.
    if (days && Math.abs(covered) >= withinK) {
      const each = Math.round(Math.abs(covered) / days);
      const first = week.days.find((d) => d.index === Number(Object.keys(shift)[0]))?.label;
      const last = week.days.find((d) => d.index === Number(Object.keys(shift).at(-1)))?.label;
      const rest = Math.round(gapK - covered);
      numbers.push({
        id: "spread",
        title: `Spread it over ${days === 1 ? "tomorrow" : `the next ${days} days`}`,
        detail: `About ${k(each)} kcal ${gapK > 0 ? "less" : "more"} a day${days > 1 ? `, ${first}–${last}` : ""}, from carbs and fat; protein stays.${Math.abs(rest) > withinK ? ` ${k(Math.abs(rest))} kcal is more than KOI moves in a week, so that much is left.` : ""}`,
        recommended: false,
        effect: sized ? { shift, resize: Object.keys(shift).map(Number) } : { shift, scale },
        after: { kcal: Math.round(gapK - covered) },
      });
    }
  }

  // The recommendation: leave a day that's close; fix a small gap today; spread a big one.
  const today = numbers.find((o) => o.id === "today");
  const spread = numbers.find((o) => o.id === "spread");
  const pick = inside ? "leave"
    : today && Math.abs(gapK) <= (R.fixTodayMaxPct / 100) * ref.kcal ? "today"
      : spread ? "spread" : today ? "today" : "leave";
  for (const o of numbers) o.recommended = o.id === pick;

  const gapProtein = gapOf("protein");
  return { inWeek: true, ledger, against: sized ? "target" : "plan", gap: { kcal: Math.round(gapK), protein: Number.isFinite(gapProtein) ? Math.round(gapProtein) : null }, numbers, meal };
}

/** One adjustment record for plan_week.adjustments, from the options picked. */
export function adjustmentFrom({ entry, numbers = null, meal = null, picksBefore = {}, at = new Date().toISOString(), id = null }) {
  const effect = {};
  for (const o of [numbers, meal].filter(Boolean)) {
    for (const [key, value] of Object.entries(o.effect ?? {})) {
      if (Array.isArray(value)) effect[key] = [...(effect[key] ?? []), ...value];
      else if (value && typeof value === "object") effect[key] = { ...(effect[key] ?? {}), ...value };
    }
  }
  return {
    id: id ?? `${entry.eaten_on}:${entry.slot}:${at}`,
    at,
    on: entry.eaten_on,
    slot: entry.slot,
    numbers: numbers?.id ?? null,
    meal: meal?.id ?? null,
    title: [numbers?.id !== "leave" ? numbers?.title : null, meal && meal.id !== "drop" ? meal.title : null].filter(Boolean).join(" · ") || "Left as it was",
    effect,
    picksBefore,
    undone: false,
  };
}

export { addNutrients, zero };
