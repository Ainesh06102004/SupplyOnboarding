// ============================================================================
// KOI ENGINE — Measuring the label reader against labels whose facts are known
//
// Phase 1.7. The engine publishes what it reads with nobody looking, so how far
// it can be trusted is a measurement, made here. Each case (./eval/cases.js) is
// a label whose contents are known. scripts/runEval.mjs reads it exactly as
// production does — two readings, checks, planAutoPublish — and this compares
// what the engine WOULD publish with the truth:
//
//   allergen misses  an allergen the food contains (or may contain) that a
//                    published ingredient group does not declare. The one
//                    failure that can hurt someone, so the pass mark is zero.
//                    A group the engine blocked is not a miss: blocked facts
//                    are never published, and the storefront says so.
//   nutrition        published figures against the printed ones, field by
//                    field. A wrong number fails; a figure left out (the
//                    readings disagreed on it) is reported, not failed.
//   coverage         cases where anything was published. Blocking is always
//                    safe, but a reader that blocks everything is broken.
//   false alarms     allergens declared that the food does not contain.
//                    Reported, not failed: over-declaring hides a product from
//                    someone avoiding it, which is the safe direction.
//
// Pure.
// ============================================================================

import { printedTable } from "./eval/render";

export const EVAL_THRESHOLDS = Object.freeze({
  errors: 0,
  allergenMisses: 0,
  nutritionAccuracy: 0.98,
  coverage: 0.5,
});

export const COMPARED_FIELDS = Object.freeze([
  "energy_kcal", "protein_g", "carbs_g", "sugars_g", "fibre_g",
  "total_fat_g", "saturated_fat_g", "trans_fat_g", "sodium_mg",
]);

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * @param {object} testCase an evaluation case
 * @param {{ ingredients: object|null, nutrition: object|null, blocked: Array<{group}> }} plan planAutoPublish() output
 */
export function scoreCase(testCase, plan) {
  const truth = testCase.truth ?? { contains: [], mayContain: [] };
  const result = {
    id: testCase.id,
    published: [],
    blocked: (plan?.blocked ?? []).map((b) => b.group),
    allergenMisses: [],
    falseAlarms: [],
    nutrition: [],
  };

  if (plan?.ingredients) {
    result.published.push("ingredients");
    const declared = new Set([...(plan.ingredients.allergens ?? []), ...(plan.ingredients.may_contain ?? [])]);
    const present = [...new Set([...truth.contains, ...truth.mayContain])];
    result.allergenMisses = present.filter((flag) => !declared.has(flag));
    result.falseAlarms = [...declared].filter((flag) => !present.includes(flag));
  }

  if (plan?.nutrition) {
    result.published.push("nutrition");
    const printed = printedTable(testCase.nutrition)?.[plan.nutrition.measurement_basis];
    for (const field of COMPARED_FIELDS) {
      // undefined: the published basis was never printed, so nothing on it can be right.
      const want = printed === undefined ? undefined : field in printed ? printed[field] : null;
      const raw = plan.nutrition[field];
      const got = raw === null || raw === undefined ? null : Number(raw);
      const ok = want === undefined ? false : want === null ? got === null : got !== null && Math.abs(got - want) <= 0.051;
      result.nutrition.push({ field, want: want ?? null, got, ok });
    }
  }
  return result;
}

/**
 * @param {Array<object>} results scoreCase() results, or { id, error } for a case that failed to run
 * @returns {{ passed: boolean, metrics: object, failures: Array<object> }}
 */
export function summarise(results) {
  const cases = results.length;
  const errors = results.filter((r) => r.error);
  const scored = results.filter((r) => !r.error);
  const fields = scored.flatMap((r) => r.nutrition);
  const right = fields.filter((f) => f.ok).length;
  const wrong = fields.filter((f) => !f.ok && f.got !== null).length;
  const omitted = fields.filter((f) => !f.ok && f.got === null).length;

  const metrics = {
    cases,
    errors: errors.length,
    coverage: cases ? round3(scored.filter((r) => r.published.length).length / cases) : 0,
    published: {
      ingredients: scored.filter((r) => r.published.includes("ingredients")).length,
      nutrition: scored.filter((r) => r.published.includes("nutrition")).length,
    },
    allergenMisses: scored.reduce((n, r) => n + r.allergenMisses.length, 0),
    falseAlarms: scored.reduce((n, r) => n + r.falseAlarms.length, 0),
    nutritionAccuracy: right + wrong ? round3(right / (right + wrong)) : null,
    nutritionFields: { right, wrong, omitted },
  };

  const passed = metrics.errors <= EVAL_THRESHOLDS.errors
    && metrics.allergenMisses <= EVAL_THRESHOLDS.allergenMisses
    && (metrics.nutritionAccuracy === null || metrics.nutritionAccuracy >= EVAL_THRESHOLDS.nutritionAccuracy)
    && metrics.coverage >= EVAL_THRESHOLDS.coverage;

  const failures = [
    ...errors.map((r) => ({ id: r.id, error: r.error })),
    ...scored.filter((r) => r.allergenMisses.length).map((r) => ({ id: r.id, allergenMisses: r.allergenMisses })),
    ...scored
      .filter((r) => r.nutrition.some((f) => !f.ok && f.got !== null))
      .map((r) => ({ id: r.id, wrongFields: r.nutrition.filter((f) => !f.ok && f.got !== null) })),
  ];

  return { passed, metrics, failures };
}
