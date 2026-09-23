// ============================================================================
// KOI PLANNER — Solving a household's plan, and saying what gave way
//
// Phase 3.3 and 3.4. SERVER ONLY (it loads the solver), and free of the
// database: plan.js stores what this returns, and the reference-household
// suite (eval/suite.js, scripts/evalPlanner.mjs) checks it, so both run the
// same planner.
//
// WHEN NOTHING FITS. A plan that says "impossible" and stops is useless, so
// the soft constraints are relaxed in a fixed order and the shopper is told
// which one gave way:
//
//   1. budget      the cheapest thing to give up is the ceiling, and a
//                  shopper can decide to spend more
//   2. variety     allow twice the portions, and more packs of fewer products
//   3. macros      admit the shortfall, and name it per member
//
// ALLERGENS, AGE SAFETY AND DIET ARE NEVER RELAXED. They are not in this
// ladder at any step. If a household cannot be fed without giving someone what
// they avoid, or what is unsafe at their age, KOI says so and offers nothing
// rather than quietly feeding them.
// ============================================================================

import "server-only";

import { buildPlanModel, MAX_PACKS_PER_SKU, LEXICOGRAPHIC, budgetBeforeTargets } from "./model";
import { solvePlanModel } from "./solve";
import { planReport, whoEatsWhat } from "./report";

/** What no step of the ladder gives up, in the words the plan page shows. */
export const NEVER_RELAXED = Object.freeze(["allergens", "age safety", "diet"]);

/**
 * The relaxation ladder, in the order the plan doc fixes.
 *
 * Each step says what it gave up, so the explanation is written from what
 * actually happened rather than from a template.
 */
const LADDER = [
  { step: "as_asked", gave_up: null, apply: (base) => base },
  {
    step: "budget_raised",
    gave_up: "the budget",
    apply: (base) => ({ ...base, budget: null }),
  },
  {
    step: "variety_relaxed",
    gave_up: "variety: twice the usual portions, and more packs of fewer products",
    apply: (base) => ({ ...base, budget: null, maxPacksPerSku: MAX_PACKS_PER_SKU * 2, portionRelax: 2 }),
  },
];

/**
 * The ladder for this household.
 *
 * A household that asked for the budget to be protected before the targets is
 * not helped by a step that raises the budget first: it said it would rather
 * go short than overspend. So for them the cheaper portions are tried first,
 * and the budget gives way only when there is nothing else left.
 */
function ladderFor(base) {
  if (!budgetBeforeTargets(base.priorities)) return LADDER;
  const by = Object.fromEntries(LADDER.map((rung) => [rung.step, rung]));
  return [by.as_asked, by.variety_relaxed, by.budget_raised];
}

/**
 * Hold the household's first priority, and improve the rest underneath it.
 *
 * This is what makes an order an order rather than a set of weights: the value
 * the first priority reached is measured in the solution, written back as one
 * more row with LEXICOGRAPHIC.tolerance of slack, and the program solved again.
 * Every lower priority is then free to improve, but only within what the first
 * one allows. Two solves, and only for a household that asked for an order.
 *
 * If the second solve cannot be used, the first answer stands: a tolerance is
 * not worth losing a plan over.
 */
async function holdFirstPriority(model, solution, base) {
  const first = model.firstPriority;
  if (!first || !solution.usable) return { model, solution, held: null };

  const value = Object.entries(first.coefficients)
    .reduce((sum, [name, coefficient]) => sum + coefficient * (solution.values?.[name] ?? 0), 0);
  const slack = Math.abs(value) * LEXICOGRAPHIC.tolerance;
  const bound = first.sense === "min"
    ? { lower: -Infinity, upper: value + slack }
    : { lower: value - slack, upper: Infinity };

  const held = {
    ...model,
    rows: [...model.rows, { name: `priority_${first.name}`, ...bound, coefficients: first.coefficients }],
  };
  const again = await solvePlanModel(held);
  if (!again.usable) return { model, solution, held: null };
  return {
    model: held,
    solution: again,
    held: { priority: first.name, sense: first.sense, reached: Math.round(value * 1000) / 1000, tolerance: LEXICOGRAPHIC.tolerance },
  };
}

/** How many products each exclusion reason took out, for a progress line. */
function excludedCounts(model) {
  const counts = {};
  for (const e of model.excluded ?? []) counts[e.reason] = (counts[e.reason] ?? 0) + 1;
  return counts;
}

/**
 * Climb the ladder until something can be shown. Allergens, age safety and diet are never on it.
 *
 * @param {object} base buildPlanModel's input
 * @param {{ onStep?: (event: object) => void }} [options] onStep hears each rung as
 *   it is built and solved. Facts only (counts, statuses, ms): the words are the page's templates.
 */
export async function solveWithLadder(base, { onStep = null } = {}) {
  const emit = (event) => { try { onStep?.(event); } catch { /* a listener never breaks a plan */ } };
  let attempt = null;
  let model = null;
  let solution = null;
  for (const rung of ladderFor(base)) {
    emit({ stage: "rung", step: rung.step, status: "running" });
    model = buildPlanModel(rung.apply(base));
    emit({ stage: "rung", step: rung.step, status: "built", candidates: model.meta.skus.length, excluded: excludedCounts(model) });
    solution = await solvePlanModel(model);
    attempt = rung;
    emit({ stage: "rung", step: rung.step, status: "solved", usable: solution.usable, solverStatus: solution.status, ms: solution.ms });
    if (solution.usable) break;
  }
  // The order the household asked for, made true rather than approximated.
  if (model.firstPriority && solution.usable) emit({ stage: "priority", status: "running", priority: model.firstPriority.name });
  const lexicographic = await holdFirstPriority(model, solution, base);
  if (lexicographic.held) emit({ stage: "priority", status: "done", priority: lexicographic.held.priority });
  return { attempt, model: lexicographic.model, solution: lexicographic.solution, held: lexicographic.held };
}

/**
 * Plan without storing anything: the ladder, the report, and who eats what.
 *
 * @param {object} base buildPlanModel's input
 * @param {{ onStep?: (event: object) => void }} [options] progress, see solveWithLadder;
 *   also hears the solved basket as a draft before anything is explained or stored
 * @returns {Promise<{ attempt, model, solution, report }>}
 */
export async function solvePlan(base, { onStep = null } = {}) {
  const { attempt, model, solution, held } = await solveWithLadder(base, { onStep });
  const report = planReport({
    members: base.members,
    catalogue: base.catalogue.filter((item) => model.meta.skus.includes(item.skuId)),
    solution,
    days: base.days,
    budget: base.budget ?? null,
  });
  // Per person: what in the basket each may eat and how much, and what is not for them.
  report.whoEatsWhat = whoEatsWhat({ members: base.members, catalogue: base.catalogue, basket: report.basket, refusals: model.meta.refusals });
  if (onStep && solution.usable) {
    try {
      onStep({
        stage: "draft",
        status: "done",
        basket: report.basket.map(({ skuId, name, packs, packSize, cost }) => ({ skuId, name, packs, packSize, cost })),
        cost: report.cost,
        everyTargetMet: report.summary?.everyTargetMet ?? null,
      });
    } catch { /* a listener never breaks a plan */ }
  }
  return { attempt, model, solution, report, held };
}
