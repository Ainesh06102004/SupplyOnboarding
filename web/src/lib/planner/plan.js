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
//   2. variety     allow twice the portions, and more packs of fewer products
//   3. macros      admit the shortfall, and name it per member
//
// ALLERGENS, AGE SAFETY AND DIET ARE NEVER RELAXED. They are not in this
// ladder at any step. If a household cannot be fed without giving someone what
// they avoid, or what is unsafe at their age, KOI says so and offers nothing
// rather than quietly feeding them.
// ============================================================================

import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { isTestSku } from "@/lib/data/testCatalogue";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config";
import { buildPlanModel, MAX_PACKS_PER_SKU } from "./model";
import { plannableFrom, memberFor } from "./candidates";
import { solvePlanModel } from "./solve";
import { planReport, basketDiff, materiallyShort, atPortionLimit, whoEatsWhat, refusalReason } from "./report";
import { describeEdge } from "@/lib/food/substitutions";
import { applyFollowUp } from "./followup";
import { readFollowUpWithModel } from "./followUpModel";

export const PLAN_RULE_VERSION = "plan-v1";

/** What no step of the ladder gives up, in the words the plan page shows. */
const NEVER_RELAXED = Object.freeze(["allergens", "age safety", "diet"]);

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
    gave_up: "variety: twice the usual portions, and more packs of fewer products",
    apply: (base) => ({ ...base, budget: null, maxPacksPerSku: MAX_PACKS_PER_SKU * 2, portionRelax: 2 }),
  },
];

/** Excluded rows with the product's name, for the page. */
const named = (rows, catalogue) =>
  rows.map((e) => ({ ...e, name: catalogue.find((i) => i.skuId === e.skuId)?.name ?? null }));

/** Climb the ladder until something can be shown. Allergens and diet are never on it. */
async function solveWithLadder(base) {
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
 * When the budget is what stands between a household and its targets, what
 * meeting them would cost. Goal programming never reports "infeasible" — it
 * misses targets — so a plan materially short under a budget is checked
 * against the same plan without one, and the shopper is told the difference
 * rather than having it spent for them.
 *
 * @returns {Promise<{cost, extra, unmet}|null>}
 */
async function costToMeetTargets({ base, report }) {
  if (base.budget === null || base.budget === undefined || !materiallyShort(report)) return null;
  const model = buildPlanModel({ ...base, budget: null });
  const solution = await solvePlanModel(model);
  if (!solution.usable) return null;
  const free = planReport({
    members: base.members,
    catalogue: base.catalogue.filter((item) => model.meta.skus.includes(item.skuId)),
    solution,
    days: base.days,
    budget: null,
  });
  return { cost: free.cost, extra: Math.round((free.cost - Number(base.budget)) * 10) / 10, unmet: free.unmet };
}

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
    .select("id, label, keep_out, household_member(*)")
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

  // Kept out of the house (00047): hard avoids only, as their contains-flags.
  const keepOutFlags = (household.keep_out ?? [])
    .map((key) => AVOID_BY_KEY[key])
    .filter((entry) => entry?.mode === "hard")
    .map((entry) => entry.flag);

  const { catalogue, unplannable } = plannableFrom(await fetchAllProducts());
  return solveAndStore({ db, householdId: household.id, zoneId, availability, members, catalogue, unplannable, days, budget, keepOutFlags });
}

/** A plan's stored members, in the shape the model plans with. */
function membersFromSnapshot(snapshot) {
  return (snapshot?.members ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    // Plans stored before plan-model-v6 have no age band, and so no age rules.
    ageBand: m.age_band ?? null,
    targets: m.targets ?? {},
    avoidFlags: m.avoid_flags ?? [],
    softAvoidFlags: m.noted_not_enforced ?? [],
    dietExcludes: m.diet_excludes ?? [],
  }));
}

/**
 * Solve, explain and store one plan. Shared by a first plan and a follow-up,
 * so both are stored with the same snapshot and read back the same way.
 *
 * @param {object} input
 * @param {object} input.db the shopper's Supabase client (RLS applies)
 * @param {string[]} [input.excludeSkus] products this plan must do without
 * @param {string[]} [input.keepOutFlags] contains-flags kept out of the house
 * @param {object} [input.extra] recorded in the constraints: `follows`, `change`
 */
async function solveAndStore({ db, householdId, zoneId, availability, members, catalogue, unplannable, days, budget, excludeSkus = [], keepOutFlags = [], extra = {} }) {
  const base = { members, catalogue, days, budget, availability, candidateLimit: CANDIDATE_LIMIT, excludeSkus, keepOutFlags };
  const { attempt, model, solution } = await solveWithLadder(base);

  const report = planReport({
    members,
    catalogue: catalogue.filter((item) => model.meta.skus.includes(item.skuId)),
    solution,
    days,
    budget,
  });
  // Per person: what in the basket each may eat and how much, and what is not for them.
  report.whoEatsWhat = whoEatsWhat({ members, catalogue, basket: report.basket, refusals: model.meta.refusals });

  const status = solution.usable ? "solved" : "infeasible";
  const explanation = {
    reached: attempt.step,
    gave_up: attempt.gave_up,
    solver_status: solution.status,
    // Every member's allergens, age safety and diet held at every step. Said
    // out loud because it is the one promise the ladder never trades.
    never_relaxed: NEVER_RELAXED,
    // Products no member can eat. One some members cannot eat stays in the
    // program for the others, and shows in report.whoEatsWhat.
    products_refused: model.excluded.filter((e) => e.reason === "refused"),
    // Kept out of the house for everyone (household.keep_out), with the reason in words.
    products_kept_out: named(model.excluded.filter((e) => e.reason === "kept_out_of_house"), catalogue)
      .map((e) => ({ ...e, because: refusalReason({ flag: e.flag, rule: "avoided" }) })),
    products_not_plannable: unplannable,
    products_not_candidates: model.excluded.filter((e) => e.reason === "not_a_candidate").length,
    // Packs bigger than the household can eat in the period (PORTION_RULE).
    products_too_big: named(model.excluded.filter((e) => e.reason === "pack_outlasts_the_plan"), catalogue),
    // Nutrition priced far beyond the catalogue's (PRICE_SANITY).
    products_priced_out: named(model.excluded.filter((e) => e.reason === "priced_beyond_its_nutrition"), catalogue),
    portion_limited: atPortionLimit({ meta: model.meta, solution, catalogue, members }),
    unmet: report.unmet,
    budget_blocked: await costToMeetTargets({ base, report }),
  };

  const { data: stored, error: planError } = await db
    .from("plan")
    .insert({
      household_id: householdId,
      days,
      budget_rupees: budget,
      zone_id: zoneId,
      status,
      constraints: {
        members: members.map((m) => ({
          id: m.id,
          label: m.label,
          age_band: m.ageBand ?? null,
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
        portion_rule: model.meta.portionRule,
        portion_relax: model.meta.portionRelax,
        model_version: model.meta.version,
        catalogue_size: catalogue.length,
        // Carried into every follow-up, so "swap the oats" stays swapped.
        excluded_skus: [...new Set(excludeSkus.map(String))],
        keep_out_flags: [...new Set(keepOutFlags)],
        // For a follow-up: the plan it changed and KOI's words for the change.
        // The shopper's own message is not stored.
        ...(extra.follows ? { follows: extra.follows, change: extra.change ?? [] } : {}),
      },
      // The whole basket, by name. plan_item holds only catalogue SKUs, so a
      // line from the local test catalogue is recorded here alone.
      achieved: {
        per_member: report.perMember,
        cost: report.cost,
        within_budget: report.withinBudget,
        summary: report.summary,
        basket: report.basket.map(({ skuId, name, packs, packSize, cost, shares }) => ({ skuId, name, packs, packSize, cost, shares })),
      },
      explanation,
      solver: solution.solver,
      solver_version: solution.solverVersion,
      rule_version: PLAN_RULE_VERSION,
    })
    .select("id, created_at")
    .single();
  if (planError) throw planError;

  // plan_item.sku_id references skus(id); test catalogue SKUs are not there.
  const catalogueLines = report.basket.filter((line) => !isTestSku(line.skuId));
  if (catalogueLines.length) {
    const { error: itemError } = await db.from("plan_item").insert(
      catalogueLines.map((line) => ({
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

/**
 * The same plan, without one item (Phase 3.5).
 *
 * When a shopper cannot get something — not on Instamart in their zone, out of
 * stock, or simply not wanted — KOI re-solves the plan as it was asked, from
 * the plan's own stored constraints, with that product removed. A replacement
 * is proven by the re-solve, not asserted: whatever the new basket contains
 * still keeps every member's allergens and diet, and the targets are
 * re-reported as they now stand.
 *
 * Nothing is stored. This is a question about a plan, and the shopper decides
 * whether to plan again.
 *
 * @param {{ planId: string, skuId: string }} input
 */
export async function planWithout({ planId, skuId }) {
  if (!planId || !skuId) throw new Error("A plan id and a SKU id are required.");
  const db = await getServerSupabase();

  const { data: plan, error } = await db
    .from("plan")
    .select("id, days, budget_rupees, constraints, achieved, plan_item(sku_id, packs)")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  if (!plan) throw new Error("No such plan for this shopper.");

  const snapshot = plan.constraints ?? {};
  const members = membersFromSnapshot(snapshot);
  if (!members.length) throw new Error("This plan has no members to plan for.");

  const days = plan.days;
  const budget = plan.budget_rupees === null ? null : Number(plan.budget_rupees);
  const { catalogue } = plannableFrom(await fetchAllProducts());
  const nameOf = new Map(catalogue.map((i) => [String(i.skuId), i.name]));

  const base = {
    members,
    catalogue,
    days,
    budget,
    availability: snapshot.availability ?? "allow_unknown",
    candidateLimit: CANDIDATE_LIMIT,
    // What earlier follow-ups left out stays out, and so does what the house keeps out.
    excludeSkus: [...(snapshot.excluded_skus ?? []), skuId],
    keepOutFlags: snapshot.keep_out_flags ?? [],
  };
  const { attempt, model, solution } = await solveWithLadder(base);
  const report = planReport({
    members,
    catalogue: catalogue.filter((item) => model.meta.skus.includes(item.skuId)),
    solution,
    days,
    budget,
  });

  const { data: edgeRows } = await db
    .schema("food")
    .from("substitution_edge")
    .select("to_sku, reason, basis")
    .eq("from_sku", skuId);
  const why = new Map();
  for (const e of edgeRows ?? []) {
    const words = describeEdge(e.reason, e.basis);
    if (words) why.set(String(e.to_sku), [...(why.get(String(e.to_sku)) ?? []), words]);
  }

  // The stored basket when the plan kept one (it includes test catalogue
  // lines); plan_item for plans made before it did.
  const before = Array.isArray(plan.achieved?.basket)
    ? plan.achieved.basket.map((l) => ({ skuId: l.skuId, name: l.name ?? nameOf.get(String(l.skuId)) ?? null, packs: l.packs }))
    : (plan.plan_item ?? []).map((i) => ({ skuId: i.sku_id, name: nameOf.get(String(i.sku_id)) ?? null, packs: i.packs }));
  const diff = basketDiff({
    removedSkuId: skuId,
    before,
    after: report.basket,
    edges: [...why.entries()].map(([to_sku, words]) => ({ to_sku, why: words.slice(0, 2) })),
  });

  return {
    planId: plan.id,
    status: solution.usable ? "solved" : "infeasible",
    reached: attempt.step,
    gave_up: attempt.gave_up,
    never_relaxed: NEVER_RELAXED,
    budget_blocked: await costToMeetTargets({ base, report }),
    diff,
    report,
  };
}

/**
 * A follow-up on a stored plan (Phase 4.3): "cheaper", "swap the oats".
 *
 * The message is read (followup.js, with a model when configured), applied to
 * the plan's own stored constraints, solved again, and stored as a new plan
 * that records the plan it follows and KOI's words for the change. The
 * shopper's message is not stored: the conversation lives in the page, for
 * the session. When nothing in the message could be applied, nothing is
 * solved and the shopper is told why.
 *
 * @param {{ planId: string, text: string }} input
 */
export async function planFollowUp({ planId, text }) {
  if (!planId || !text) throw new Error("A plan id and a message are required.");
  const db = await getServerSupabase();

  const { data: plan, error } = await db
    .from("plan")
    .select("id, household_id, days, budget_rupees, zone_id, constraints, achieved")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  if (!plan) throw new Error("No such plan for this shopper.");

  const snapshot = plan.constraints ?? {};
  const members = membersFromSnapshot(snapshot);
  if (!members.length) throw new Error("This plan has no members to plan for.");

  const { catalogue, unplannable } = plannableFrom(await fetchAllProducts());
  const reading = await readFollowUpWithModel(text);
  const change = applyFollowUp({
    members,
    days: plan.days,
    budget: plan.budget_rupees === null ? null : Number(plan.budget_rupees),
    excludedSkus: snapshot.excluded_skus ?? [],
    cost: Number(plan.achieved?.cost ?? 0),
  }, reading, catalogue);

  if (!change.applied.length) {
    return { planId: plan.id, changed: false, applied: [], notApplied: change.notApplied };
  }

  const next = await solveAndStore({
    db,
    householdId: plan.household_id,
    zoneId: plan.zone_id,
    availability: snapshot.availability ?? "allow_unknown",
    members: change.members,
    catalogue,
    unplannable,
    days: change.days,
    budget: change.budget,
    excludeSkus: change.excludedSkus,
    keepOutFlags: snapshot.keep_out_flags ?? [],
    extra: { follows: plan.id, change: change.applied },
  });

  const before = (plan.achieved?.basket ?? []).map((l) => ({ skuId: l.skuId, name: l.name ?? null, packs: l.packs }));
  const { added, changed, dropped } = basketDiff({ removedSkuId: null, before, after: next.report.basket, edges: [] });

  return {
    ...next,
    changed: true,
    follows: plan.id,
    applied: change.applied,
    notApplied: change.notApplied,
    // Offered to the shopper to save to their household; never saved here.
    householdChanges: change.householdChanges,
    basketChange: { added, changed, dropped, costBefore: Number(plan.achieved?.cost ?? 0) },
  };
}
