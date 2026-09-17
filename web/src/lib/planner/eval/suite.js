// ============================================================================
// KOI PLANNER — The reference-household suite
//
// Plan §9.10.4, C8. Runs every household through the planner shoppers get
// (solvePlan.js#solvePlan, passed in so this stays free of the solver and the
// database), checks each plan (properties.js), and decides whether the rule
// version passes:
//
//   * not one safety or integrity finding, in any household;
//   * every reference household gets a usable plan that feeds every member.
//
// A random household that cannot be fed from the catalogue is reported, not
// failed: the catalogue, not the planner, may be what is missing.
// ============================================================================

import { memberFor, keepOutFlagsFor } from "../candidates";
import { checkPlan, planMetrics, PROPERTIES_VERSION } from "./properties";
import { HOUSEHOLDS_VERSION } from "./households";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config";

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const CATALOGUES = { avoidByKey: AVOID_BY_KEY, dietExclusions: DIET_EXCLUSIONS };

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

/**
 * @param {object} input
 * @param {Array} input.catalogue plannable rows (plannableFrom)
 * @param {Array} input.reference households whose plan must be usable and feed everyone
 * @param {Array} [input.random] households checked for safety and integrity only
 * @param {(base: object) => Promise<{attempt, model, solution, report}>} input.solvePlan
 * @param {number} [input.candidateLimit]
 * @param {() => number} [input.now] clock, for timing
 * @returns {Promise<{ passed: boolean, cases: Array, metrics: object, failures: Array }>}
 */
export async function runPlannerSuite({ catalogue, reference = [], random = [], solvePlan, candidateLimit = 120, now = Date.now }) {
  const cases = [];
  const all = [...reference.map((h) => ({ household: h, kind: "reference" })), ...random.map((h) => ({ household: h, kind: "random" }))];

  for (const { household, kind } of all) {
    const members = household.members.map((row) => memberFor(row, CATALOGUES));
    const keepOutFlags = keepOutFlagsFor(household.keepOut ?? [], AVOID_BY_KEY);
    const base = {
      members,
      catalogue,
      days: household.days,
      budget: household.budget,
      availability: "allow_unknown",
      candidateLimit,
      excludeSkus: [],
      keepOutFlags,
    };
    const started = now();
    let findings;
    let result = null;
    try {
      result = await solvePlan(base);
      findings = checkPlan({ members, catalogue, keepOutFlags, budget: household.budget, ...result, ms: now() - started });
    } catch (err) {
      findings = [{ kind: "integrity", property: "planner_threw", detail: { message: String(err?.message ?? err) } }];
    }
    const ms = now() - started;
    const blocking = findings.filter((f) => f.kind === "safety" || f.kind === "integrity" || (kind === "reference" && f.kind === "quality" && f.property !== "slow_solve"));
    cases.push({
      id: household.id,
      kind,
      about: household.about,
      passed: blocking.length === 0,
      findings,
      metrics: result ? {
        reached: result.attempt?.step ?? null,
        status: result.solution?.status ?? null,
        cost: result.report?.cost ?? null,
        budget: household.budget,
        products: result.report?.basket?.length ?? 0,
        ms,
        ...planMetrics(result.report),
      } : { ms },
    });
  }

  const count = (kind) => cases.reduce((sum, c) => sum + c.findings.filter((f) => f.kind === kind).length, 0);
  const referenceCases = cases.filter((c) => c.kind === "reference");
  const times = cases.map((c) => c.metrics.ms).filter(Number.isFinite);
  const worst = (nutrient) => {
    const values = referenceCases.map((c) => c.metrics.worstShortShare?.[nutrient]).filter(Number.isFinite);
    return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000 : null;
  };

  const metrics = {
    properties_version: PROPERTIES_VERSION,
    households_version: HOUSEHOLDS_VERSION,
    reference_households: referenceCases.length,
    random_households: cases.length - referenceCases.length,
    catalogue_size: catalogue.length,
    safety_findings: count("safety"),
    integrity_findings: count("integrity"),
    quality_findings: count("quality"),
    reference_passed: referenceCases.filter((c) => c.passed).length,
    budget_given_up: cases.filter((c) => c.metrics.reached && c.metrics.reached !== "as_asked").map((c) => c.id),
    mean_worst_short_share_reference: { kcal: worst("kcal"), protein: worst("protein") },
    ms: { median: percentile(times, 0.5), p95: percentile(times, 0.95), max: times.length ? Math.max(...times) : null },
  };

  return {
    passed: cases.every((c) => c.passed),
    cases,
    metrics,
    failures: cases.filter((c) => !c.passed).map((c) => ({ id: c.id, kind: c.kind, findings: c.findings })),
  };
}
