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

import { buildPlanModel, MAX_PACKS_PER_SKU } from "./model";
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

/** Climb the ladder until something can be shown. Allergens, age safety and diet are never on it. */
export async function solveWithLadder(base) {
  let attempt = null;
  let model = null;
  let solution = null;
  for (const rung of LADDER) {
    model = buildPlanModel(rung.apply(base));
    solution = await solvePlanModel(model);
    attempt = rung;
    if (solution.usable) break;
  }
  return { attempt, model, solution };
}

/**
 * Plan without storing anything: the ladder, the report, and who eats what.
 *
 * @param {object} base buildPlanModel's input
 * @returns {Promise<{ attempt, model, solution, report }>}
 */
export async function solvePlan(base) {
  const { attempt, model, solution } = await solveWithLadder(base);
  const report = planReport({
    members: base.members,
    catalogue: base.catalogue.filter((item) => model.meta.skus.includes(item.skuId)),
    solution,
    days: base.days,
    budget: base.budget ?? null,
  });
  // Per person: what in the basket each may eat and how much, and what is not for them.
  report.whoEatsWhat = whoEatsWhat({ members: base.members, catalogue: base.catalogue, basket: report.basket, refusals: model.meta.refusals });
  return { attempt, model, solution, report };
}
