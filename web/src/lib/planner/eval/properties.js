// ============================================================================
// KOI PLANNER — What must be true of every plan, checked from the outside
//
// Plan §9.10.4, C8. Pure. Each check reads the plan the solver returned and
// the catalogue rows it was planned with, and decides for itself. None of
// them trusts the model's own bookkeeping (meta.refusals, excluded): a check
// that asked the model whether the model was right would pass every time.
//
// THREE KINDS
//   safety     someone was planned to eat what they must not: an allergen or
//              ingredient they refuse, a food outside their diet, something
//              unsafe at their age, or a food the household keeps out. Any
//              one of these fails the suite.
//   integrity  the plan contradicts its own rules: over budget when the
//              budget held, a pack bought that nobody eats, a portion past
//              its ceiling. Any one fails the suite.
//   quality    the plan is weak, not wrong: no usable plan, a member given
//              nothing while others eat, a slow solve. Reported, and a
//              reference household with one fails (a random household may
//              genuinely be unfeedable from the catalogue).
// ============================================================================

import { ageRefusal } from "../ageSafety";

export const PROPERTIES_VERSION = "planner-properties-v1";

/** A solve slower than this is reported: three rungs at the 1.8 s limit, and room. */
export const SLOW_MS = 8000;

const EPSILON = 1e-6;
/** readSolution rounds each share to 0.001 of a pack, so comparisons allow for that. */
const ROUNDING = 0.001;

/**
 * @param {object} input
 * @param {Array} input.members from memberFor(): id, ageBand, avoidFlags, dietExcludes
 * @param {Array} input.catalogue the rows planned with: skuId, contains, price
 * @param {string[]} [input.keepOutFlags]
 * @param {number|null} [input.budget]
 * @param {{ step: string }} input.attempt the ladder rung reached
 * @param {object} input.model from buildPlanModel (meta.portionCaps)
 * @param {object} input.solution from solvePlanModel: usable, packs, eats, ms
 * @param {object} input.report from planReport: cost
 * @param {number} [input.ms] wall time for the whole ladder
 * @returns {Array<{ kind: "safety"|"integrity"|"quality", property: string, detail: object }>}
 */
export function checkPlan({ members = [], catalogue = [], keepOutFlags = [], budget = null, attempt, model, solution, report, ms = null }) {
  const findings = [];
  const add = (kind, property, detail) => findings.push({ kind, property, detail });
  const bySku = new Map(catalogue.map((item) => [String(item.skuId), item]));
  const packs = solution?.packs ?? {};
  const eats = solution?.eats ?? {};

  if (!solution?.usable) {
    add("quality", "no_usable_plan", { status: solution?.status ?? null });
    return findings;
  }

  // ── Safety ──────────────────────────────────────────────────────────────
  const keptOut = new Set(keepOutFlags);
  for (const [skuId, count] of Object.entries(packs)) {
    if (!(Number(count) > 0)) continue;
    const item = bySku.get(String(skuId));
    if (!item) {
      add("integrity", "unknown_product_bought", { skuId });
      continue;
    }
    const contains = new Set(item.contains ?? []);
    for (const flag of contains) {
      if (keptOut.has(flag)) add("safety", "kept_out_food_bought", { skuId, flag });
    }
    for (const m of members) {
      const eaten = Number(eats[skuId]?.[m.id] ?? 0);
      if (eaten <= EPSILON) continue;
      for (const flag of m.avoidFlags ?? []) {
        if (contains.has(flag)) add("safety", "avoided_food_eaten", { skuId, member: m.id, flag });
      }
      for (const flag of m.dietExcludes ?? []) {
        if (contains.has(flag)) add("safety", "diet_broken", { skuId, member: m.id, flag });
      }
      const forAge = ageRefusal(item, m.ageBand ?? null);
      if (forAge) add("safety", "unsafe_for_age", { skuId, member: m.id, rule: forAge.flag });
    }
  }

  // ── Integrity ───────────────────────────────────────────────────────────
  for (const [skuId, count] of Object.entries(packs)) {
    const shares = Object.values(eats[skuId] ?? {});
    const eaten = shares.reduce((sum, v) => sum + Number(v), 0);
    if (Math.abs(eaten - Number(count)) > ROUNDING * Math.max(1, shares.length)) {
      add("integrity", "bought_not_eaten", { skuId, packs: Number(count), eaten: Math.round(eaten * 1e4) / 1e4 });
    }
    const caps = model?.meta?.portionCaps?.[skuId] ?? {};
    for (const [memberId, amount] of Object.entries(eats[skuId] ?? {})) {
      const cap = caps[memberId];
      if (cap && Number(amount) > Number(cap.packs) + ROUNDING) {
        add("integrity", "portion_over_ceiling", { skuId, member: memberId, eats: Number(amount), ceiling: Number(cap.packs) });
      }
    }
  }
  if (budget !== null && budget !== undefined && attempt?.step === "as_asked" && Number(report?.cost) > Number(budget) + 0.01) {
    add("integrity", "over_budget", { cost: Number(report.cost), budget: Number(budget) });
  }

  // ── Quality ─────────────────────────────────────────────────────────────
  const anythingEaten = Object.values(packs).some((count) => Number(count) > 0);
  if (anythingEaten) {
    for (const m of members) {
      const hasTarget = Object.values(m.targets ?? {}).some((v) => Number(v) > 0);
      const eatsAnything = Object.values(eats).some((byMember) => Number(byMember?.[m.id] ?? 0) > EPSILON);
      if (hasTarget && !eatsAnything) add("quality", "member_given_nothing", { member: m.id });
    }
  }
  if (ms !== null && ms > SLOW_MS) add("quality", "slow_solve", { ms, limit: SLOW_MS });

  return findings;
}

/**
 * How well a plan met its targets, per member: shortfall ÷ asked, for energy
 * and protein, and the gap between the worst- and best-served member.
 *
 * @param {object} report from planReport
 * @returns {{ shortShares: object, worstShortShare: object, fairnessGap: object }}
 */
export function planMetrics(report) {
  const shortShares = {};
  const worstShortShare = {};
  const fairnessGap = {};
  for (const nutrient of ["kcal", "protein"]) {
    const shares = (report?.perMember ?? [])
      .filter((m) => Number(m.asked?.[nutrient]) > 0)
      .map((m) => {
        const share = Math.round(((m.shortfall?.[nutrient] ?? 0) / m.asked[nutrient]) * 1000) / 1000;
        shortShares[m.id] = { ...(shortShares[m.id] ?? {}), [nutrient]: share };
        return share;
      });
    if (!shares.length) continue;
    worstShortShare[nutrient] = Math.max(...shares);
    fairnessGap[nutrient] = Math.round((Math.max(...shares) - Math.min(...shares)) * 1000) / 1000;
  }
  return { shortShares, worstShortShare, fairnessGap };
}
