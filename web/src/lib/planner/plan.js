// ============================================================================
// KOI PLANNER — Making a plan for a household, and saying what it could not do
//
// Phase 3.3 and 3.4. SERVER ONLY.
//
// The household is read as the signed-in shopper (lib/supabase/server.js), so
// row-level security decides what this can see: a caller can only plan for a
// household they own. The household id arrives from the request, the identity
// never does.
//
// WHEN NOTHING FITS. A plan that says "impossible" and stops is useless, so
// the soft constraints are relaxed in a fixed order and the shopper is told
// which one gave way:
//
//   1. budget      the cheapest thing to give up is the ceiling, and a
//                  shopper can decide to spend more
//   2. variety     allow more packs of fewer products
//   3. macros      admit the shortfall, and name it per member
//
// ALLERGENS AND DIET ARE NEVER RELAXED. They are not in this ladder at any
// step. If a household cannot be fed without giving someone what they avoid,
// KOI says so and offers nothing rather than quietly feeding them.
// ============================================================================

import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config";
import { buildPlanModel, MAX_PACKS_PER_SKU } from "./model";
import { plannableFrom, memberFor } from "./candidates";
import { solvePlanModel } from "./solve";
import { planReport } from "./report";

export const PLAN_RULE_VERSION = "plan-v1";

/** How many products may enter the program. See CANDIDATE_RULE. */
export const CANDIDATE_LIMIT = 120;

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const CATALOGUES = { avoidByKey: AVOID_BY_KEY, dietExclusions: DIET_EXCLUSIONS };

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
    gave_up: "variety: more packs of fewer products",
    apply: (base) => ({ ...base, budget: null, maxPacksPerSku: MAX_PACKS_PER_SKU * 2 }),
  },
];

/**
 * Read a household, plan for it, store the plan, and return it.
 *
 * @param {object} input
 * @param {string} input.householdId
 * @param {number} [input.days]
 * @param {number|null} [input.budget] rupees for the whole period
 * @param {string|null} [input.zoneId]
 * @param {"allow_unknown"|"require_available"} [input.availability]
 * @returns {Promise<object>} the stored plan, its report, and what it gave up
 */
export async function planForHousehold({
  householdId,
  days = 7,
  budget = null,
  zoneId = null,
  availability = "allow_unknown",
}) {
  if (!householdId) throw new Error("A household id is required.");
  const db = await getServerSupabase();

  // RLS does the authorising: no rows means not yours (or not there).
  const { data: household, error: householdError } = await db
    .from("household")
    .select("id, label, household_member(*)")
    .eq("id", householdId)
    .maybeSingle();
  if (householdError) throw householdError;
  if (!household) throw new Error("No such household for this shopper.");

  const memberRows = household.household_member ?? [];
  if (!memberRows.length) throw new Error("This household has no members yet.");

  const { data: avoidRows, error: avoidError } = await db
    .from("household_member_avoid")
    .select("member_id, avoid_key")
    .in("member_id", memberRows.map((m) => m.id));
  if (avoidError) throw avoidError;

  const avoidsByMember = new Map();
  for (const row of avoidRows ?? []) {
    if (!avoidsByMember.has(row.member_id)) avoidsByMember.set(row.member_id, []);
    avoidsByMember.get(row.member_id).push(row.avoid_key);
  }

  const members = memberRows.map((row) =>
    memberFor({ ...row, avoidKeys: avoidsByMember.get(row.id) ?? [] }, CATALOGUES));

  const { catalogue, unplannable } = plannableFrom(await fetchAllProducts());

  // Climb the ladder until something can be shown.
  const base = { members, catalogue, days, budget, availability, candidateLimit: CANDIDATE_LIMIT };
  let attempt = null;
  let model = null;
  let solution = null;
  for (const rung of LADDER) {
    model = buildPlanModel(rung.apply(base));
    solution = await solvePlanModel(model);
    attempt = rung;
    if (solution.usable) break;
  }

  const report = planReport({
    members,
    catalogue: catalogue.filter((item) => model.meta.skus.includes(item.skuId)),
    solution,
    days,
    budget,
  });

  const status = solution.usable ? "solved" : "infeasible";
  const explanation = {
    reached: attempt.step,
    gave_up: attempt.gave_up,
    solver_status: solution.status,
    // Every member's allergens and diet held at every step. Said out loud
    // because it is the one promise the ladder never trades.
    never_relaxed: ["allergens", "diet"],
    products_refused: model.excluded.filter((e) => e.reason === "refused"),
    products_not_plannable: unplannable,
    products_not_candidates: model.excluded.filter((e) => e.reason === "not_a_candidate").length,
    unmet: report.unmet,
  };

  const { data: stored, error: planError } = await db
    .from("plan")
    .insert({
      household_id: household.id,
      days,
      budget_rupees: budget,
      zone_id: zoneId,
      status,
      constraints: {
        members: members.map((m) => ({
          id: m.id,
          label: m.label,
          targets: m.targets,
          avoid_flags: m.avoidFlags,
          // Recorded, and deliberately not enforced: a preference does not get
          // to decide whether a household can be fed.
          noted_not_enforced: m.softAvoidFlags,
          diet_excludes: m.dietExcludes,
        })),
        availability,
        candidate_limit: CANDIDATE_LIMIT,
        candidate_rule: model.meta.candidateRule,
        model_version: model.meta.version,
        catalogue_size: catalogue.length,
      },
      achieved: { per_member: report.perMember, cost: report.cost, within_budget: report.withinBudget, summary: report.summary },
      explanation,
      solver: solution.solver,
      solver_version: solution.solverVersion,
      rule_version: PLAN_RULE_VERSION,
    })
    .select("id, created_at")
    .single();
  if (planError) throw planError;

  if (report.basket.length) {
    const { error: itemError } = await db.from("plan_item").insert(
      report.basket.map((line) => ({
        plan_id: stored.id,
        sku_id: line.skuId,
        packs: line.packs,
        shares: line.shares,
      })));
    if (itemError) throw itemError;
  }

  return {
    planId: stored.id,
    createdAt: stored.created_at,
    status,
    days,
    budget,
    report,
    explanation,
    solver: { name: solution.solver, version: solution.solverVersion, status: solution.status, ms: solution.ms },
  };
}
