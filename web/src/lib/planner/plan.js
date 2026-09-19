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
// The solving itself, and the relaxation ladder that never gives up
// allergens, age safety or diet, is solvePlan.js: free of the database, so the
// reference-household suite runs exactly what this stores.
// ============================================================================

import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { isTestSku } from "@/lib/data/testCatalogue";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config";
import { buildPlanModel, targetsBeforeBudget } from "./model";
import { plannableFrom, memberFor, keepOutFlagsFor } from "./candidates";
import { solvePlanModel } from "./solve";
import { solvePlan, solveWithLadder, NEVER_RELAXED } from "./solvePlan";
import { planReport, basketDiff, materiallyShort, atPortionLimit, refusalReason } from "./report";
import { describeEdge } from "@/lib/food/substitutions";
import { applyFollowUp, productsNamed } from "./followup";
import { findConflicts } from "./conflicts";
import { readFollowUpWithModel } from "./followUpModel";

export const PLAN_RULE_VERSION = "plan-v1";

/** How many products may enter the program. See CANDIDATE_RULE. */
export const CANDIDATE_LIMIT = 120;

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const CATALOGUES = { avoidByKey: AVOID_BY_KEY, dietExclusions: DIET_EXCLUSIONS };

/** Excluded rows with the product's name, for the page. */
const named = (rows, catalogue) =>
  rows.map((e) => ({ ...e, name: catalogue.find((i) => i.skuId === e.skuId)?.name ?? null }));

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
  memberIds = null,
  thisWeek = {},
}) {
  if (!householdId) throw new Error("A household id is required.");
  const db = await getServerSupabase();

  // RLS does the authorising: no rows means not yours (or not there).
  const { data: household, error: householdError } = await db
    .from("household")
    .select("id, label, keep_out, refused_brands, preferred_brands, waste_tolerance, repeat_tolerance, priorities, processing_ceiling, shelf_stable_only, household_member(*)")
    .eq("id", householdId)
    .maybeSingle();
  if (householdError) throw householdError;
  if (!household) throw new Error("No such household for this shopper.");

  // Who is eating this week: the members the shopper picked, or everyone. The
  // ids are only ever used to narrow this household's own rows.
  const wanted = Array.isArray(memberIds) && memberIds.length ? new Set(memberIds.map(String)) : null;
  const memberRows = (household.household_member ?? []).filter((row) => !wanted || wanted.has(String(row.id)));
  if (!memberRows.length) throw new Error("This household has no members yet.");

  const { data: avoidRows, error: avoidError } = await db
    .from("household_member_avoid")
    .select("member_id, avoid_key, severity")
    .in("member_id", memberRows.map((m) => m.id));
  if (avoidError) throw avoidError;

  const avoidsByMember = new Map();
  for (const row of avoidRows ?? []) {
    if (!avoidsByMember.has(row.member_id)) avoidsByMember.set(row.member_id, []);
    avoidsByMember.get(row.member_id).push({ key: row.avoid_key, severity: row.severity ?? null });
  }

  // This plan's own choices, which never reach the saved profile: a diet for
  // this plan, what they feel like eating, and what to leave out for them.
  const members = memberRows.map((row) => {
    const choices = thisWeek?.[String(row.id)] ?? {};
    const targets = choices.targets ?? {};
    return memberFor({
      ...row,
      // A target asked for in one plan ("75 g protein for my wife") stands for
      // that plan; their profile keeps what it had.
      ...(Number(targets.protein) > 0 ? { target_protein_g: Number(targets.protein) } : {}),
      ...(Number(targets.kcal) > 0 ? { target_kcal: Number(targets.kcal) } : {}),
      avoids: avoidsByMember.get(row.id) ?? [],
      dietForThisPlan: choices.dietType ?? null,
      preferCategories: choices.prefer ?? [],
      skipCategories: choices.skip ?? [],
    }, CATALOGUES);
  });

  // Kept out of the house (00047): hard avoids only, as their contains-flags.
  const keepOutFlags = keepOutFlagsFor(household.keep_out, AVOID_BY_KEY);
  const { catalogue, unplannable } = plannableFrom(await fetchAllProducts());
  // The kitchen's own standing rules (00052), and what it already has. It
  // needs the catalogue: a cupboard holds "atta", not a SKU id.
  const kitchen = await kitchenRulesFor(db, household, catalogue);
  return solveAndStore({ db, householdId: household.id, zoneId, availability, members, catalogue, unplannable, days, budget, keepOutFlags, kitchen });
}

/**
 * A household's standing kitchen rules (00052), and what its last basket held.
 *
 * The pantry and the last basket are read here rather than carried on the
 * plan, because both are about the kitchen today: a week-old plan should not
 * keep buying around a jar that has since been used up. What the plan does
 * record is which of them it applied, so its basket can always be explained.
 *
 * @param {object} db the shopper's Supabase client (RLS applies)
 * @param {object} household the row, with its rule columns
 * @param {Array} catalogue the plannable catalogue, to read the pantry's words
 */
async function kitchenRulesFor(db, household, catalogue = []) {
  const { data: pantryRows, error: pantryError } = await db
    .from("household_pantry")
    .select("sku_id, label")
    .eq("household_id", household.id);
  if (pantryError) throw pantryError;

  // Only the latest counts as a repeat: the week before last is not this
  // week's sameness, and a household that plans every week would otherwise be
  // charged for its whole history.
  const { data: last, error: lastError } = await db
    .from("plan")
    .select("achieved")
    .eq("household_id", household.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  return {
    refusedBrands: household.refused_brands ?? [],
    preferredBrands: household.preferred_brands ?? [],
    wasteTolerance: household.waste_tolerance ?? "some",
    repeatTolerance: household.repeat_tolerance ?? "usual",
    // What to protect first (00054). Empty is KOI's own order.
    priorities: household.priorities ?? [],
    // How processed, and whether anything may need a fridge (00057).
    processingCeiling: household.processing_ceiling ?? null,
    shelfStableOnly: Boolean(household.shelf_stable_only),
    // A cupboard is written in words. The same reader that understands "add
    // oats" turns "atta" into the products it would have bought.
    pantrySkus: [...new Set((pantryRows ?? []).flatMap((row) => (
      row.sku_id ? [String(row.sku_id)] : productsNamed(row.label, catalogue).map((item) => String(item.skuId))
    )))],
    lastPlanSkus: (last?.achieved?.basket ?? []).map((l) => String(l.skuId)),
  };
}

/** A plan's stored members, in the shape the model plans with. */
function membersFromSnapshot(snapshot) {
  return (snapshot?.members ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    // This week's choices and the profile's own eating pattern travel with the
    // plan, so a follow-up changes the basket and not what was asked for.
    dietType: m.diet_for_this_plan ?? null,
    appetite: m.appetite ?? null,
    mealsFromHome: m.meals_from_home ?? [],
    preferCategories: m.prefer_categories ?? [],
    skipCategories: m.skip_categories ?? [],
    // Plans stored before plan-model-v6 have no age band, and so no age rules;
    // before v7, no goal.
    ageBand: m.age_band ?? null,
    energyGoal: m.energy_goal ?? "maintain",
    eatingPattern: m.eating_pattern ?? "balanced",
    carbsMax: m.carbs_max ?? null,
    profileVersion: m.profile_version ?? null,
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
 * @param {string[]} [input.keepSkus] the basket this plan changes: kept where it can be
 * @param {object} [input.kitchen] the household's standing rules (00052)
 * @param {object} [input.extra] recorded in the constraints: `follows`, `change`
 */
async function solveAndStore({ db, householdId, zoneId, availability, members, catalogue, unplannable, days, budget, excludeSkus = [], includeSkus = [], keepSkus = [], keepOutFlags = [], kitchen = {}, extra = {} }) {
  const base = { members, catalogue, days, budget, availability, candidateLimit: CANDIDATE_LIMIT, excludeSkus, includeSkus, keepSkus, keepOutFlags, ...kitchen };
  let solved = await solvePlan(base);

  // "Hit the targets" means hit them (C2). A budget that leaves someone short
  // is not a failed plan to goal programming — it is a plan with a miss in it —
  // so a household that ranked the targets above the budget has KOI find what
  // meeting them costs and spend it, rather than being handed the shortfall
  // and told what it would have taken. A household that said the opposite, or
  // said nothing, keeps its ceiling and is told the difference instead.
  let raisedForTargets = null;
  if (targetsBeforeBudget(base.priorities)) {
    const needed = await costToMeetTargets({ base, report: solved.report });
    if (needed && needed.extra > 0) {
      const again = await solvePlan({ ...base, budget: needed.cost });
      if (again.solution.usable && !materiallyShort(again.report)) {
        raisedForTargets = { from: Number(budget), to: needed.cost, extra: needed.extra };
        solved = again;
      }
    }
  }
  const { attempt, model, solution, report, held } = solved;

  // Which of the shopper's own asks cannot all be had at once, and what one
  // change would fix it (C7). Proved by re-solving without each ask, never
  // guessed, and only worth the extra solves when something is actually short.
  const conflicts = materiallyShort(report)
    ? await findConflicts({
      base,
      solve: (relaxed) => solvePlan(relaxed),
      stillShort: (r) => materiallyShort(r),
    })
    : null;

  const status = solution.usable ? "solved" : "infeasible";
  const explanation = {
    reached: attempt.step,
    gave_up: attempt.gave_up,
    // What the household asked to be protected first, what it reached, and how
    // much of that was given back so the rest could improve (C2).
    priority_held: held ?? null,
    // The household ranked its targets above its budget, so KOI spent what it
    // took to meet them instead of reporting a shortfall (C2).
    budget_raised_for_targets: raisedForTargets,
    // The asks that are in each other's way, and the smallest change that
    // clears them (C7). Empty when nothing is short.
    conflicts,
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
    // Keto and low carb: the ceiling each member was held to, and how much of
    // the catalogue could not be shown to fit it. A shortfall next to this is
    // the catalogue's, not the plan's.
    carb_ceilings: members.filter((m) => m.carbsMax).map((m) => {
      const forThem = (refusal) => String(refusal.member) === String(m.id) && refusal.flag === "carbs_not_declared";
      const inProgram = Object.values(model.meta.refusals ?? {}).filter((rs) => rs.some(forThem)).length;
      const leftOut = model.excluded.filter((e) => (e.refusedBy ?? []).some(forThem)).length;
      return { member: m.id, label: m.label, pattern: m.eatingPattern, perDay: m.carbsMax, undeclared: inProgram + leftOut };
    }),
    // What each member asked to do without this week (v8).
    skipped_this_week: members
      .filter((m) => (m.skipCategories ?? []).length)
      .map((m) => ({ member: m.id, label: m.label, categories: m.skipCategories })),
    unmet: report.unmet,
    budget_blocked: await costToMeetTargets({ base, report }),
  };

  const { data: stored, error: planError } = await db
    .from("plan")
    .insert({
      household_id: householdId,
      days,
      // The budget this plan was actually solved under. When the household
      // ranked its targets first and KOI spent more to meet them, that is the
      // figure, or a follow-up would re-impose a ceiling this plan already
      // passed and report itself over budget.
      budget_rupees: raisedForTargets ? raisedForTargets.to : budget,
      zone_id: zoneId,
      status,
      constraints: {
        members: members.map((m) => ({
          id: m.id,
          label: m.label,
          age_band: m.ageBand ?? null,
          energy_goal: m.energyGoal ?? "maintain",
          eating_pattern: m.eatingPattern ?? "balanced",
          carbs_max: m.carbsMax ?? null,
          // What this plan was asked for, beyond the profile.
          diet_for_this_plan: m.dietType ?? null,
          // The targets this plan was solved against, whatever the profile says.
          targets_for_this_plan: m.targets,
          prefer_categories: m.preferCategories ?? [],
          skip_categories: m.skipCategories ?? [],
          appetite: m.appetite ?? null,
          meals_from_home: m.mealsFromHome ?? [],
          // The saved profile version this plan was made from (00050).
          profile_version: m.profileVersion ?? null,
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
        // Products the shopper asked for by name: at least one pack each,
        // carried into every follow-up so "add oats" stays added.
        included_skus: [...new Set(includeSkus.map(String))],
        // What this plan kept from the one it changes (CONTINUITY).
        kept_skus: model.meta.keptFromLastPlan ?? [],
        // The kitchen's standing rules as this plan applied them (00052), so a
        // basket can be explained later even if the rules have since changed.
        kitchen_rules: model.meta.kitchen ?? null,
        // The order the household asked for, and what each goal was worth
        // (00054). Stored with the plan, so a follow-up keeps the same order.
        priorities: model.meta.priorities ?? [],
        priority_weights: model.meta.priorityWeights ?? null,
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
    budget: raisedForTargets ? raisedForTargets.to : budget,
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

  // Asked before? Then it is already worked out (00058). Precomputing every
  // line at plan time was measured at 7.0 s on top of a 1.8 s plan, so the
  // answer is found when it is wanted and kept once it is.
  const { data: kept } = await db
    .from("plan_backup")
    .select("answer")
    .eq("plan_id", planId)
    .eq("sku_id", String(skuId))
    .maybeSingle();
  if (kept?.answer) return kept.answer;

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
    includeSkus: (snapshot.included_skus ?? []).filter((id) => String(id) !== String(skuId)),
    // One product could not be had. That is no reason to re-do the rest.
    keepSkus: (plan.plan_item ?? []).map((l) => String(l.sku_id)).filter((id) => id !== String(skuId)),
    keepOutFlags: snapshot.keep_out_flags ?? [],
    // The rules this plan was made under, not whatever they are now: a
    // question about a basket is answered in the terms that basket was built
    // in. Repeats are not charged, because this is the same week.
    ...(snapshot.kitchen_rules ?? {}),
    priorities: snapshot.priorities ?? [],
    lastPlanSkus: [],
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

  const answer = {
    planId: plan.id,
    status: solution.usable ? "solved" : "infeasible",
    reached: attempt.step,
    gave_up: attempt.gave_up,
    never_relaxed: NEVER_RELAXED,
    budget_blocked: await costToMeetTargets({ base, report }),
    diff,
    report,
  };

  // Keep it, so asking again is instant and the answer survives a reload. It
  // holds no new facts: everything in it came from the plan and can be thrown
  // away and worked out again. Failing to keep it is not worth failing on.
  try {
    await db.from("plan_backup").upsert({ plan_id: plan.id, sku_id: String(skuId), answer }, { onConflict: "plan_id,sku_id" });
  } catch (err) {
    console.error("[plan_backup]", err?.message ?? err);
  }

  return answer;
}

/**
 * Keep the wording of a follow-up KOI could not fully apply (00055).
 *
 * Only for a household that switched it on, and only when something was not
 * applied: a message KOI understood is nobody's business but the shopper's.
 * The plan's own record still holds KOI's words for the change and never the
 * shopper's, so this is the one place a sentence is stored, by request.
 *
 * It never fails a plan. A shopper asking for a change does not care that a
 * diagnostic table was unreachable, and losing a plan over one would be worse
 * than losing the row.
 */
async function keepTheWording({ db, plan, text, applied, notApplied }) {
  if (!notApplied?.length) return;
  try {
    const { data: household } = await db
      .from("household")
      .select("log_failed_phrases")
      .eq("id", plan.household_id)
      .maybeSingle();
    if (!household?.log_failed_phrases) return;
    await db.from("followup_miss").insert({
      household_id: plan.household_id,
      plan_id: plan.id,
      said: String(text).slice(0, 600),
      applied,
      not_applied: notApplied,
    });
  } catch (err) {
    console.error("[followup_miss]", err?.message ?? err);
  }
}

/**
 * Why a product the shopper asked for by name is not in the basket.
 *
 * The model already recorded the reason; this is that reason in the shopper's
 * words. Anything it cannot account for is reported as exactly that, because a
 * product that quietly went missing is worse than an awkward sentence.
 *
 * @param {{ skuId: string, name: string }} want
 * @param {object} explanation the new plan's own explanation
 * @param {number} days
 */
export function whyNotPlanned(want, explanation = {}, days = 0) {
  const is = (entry) => String(entry?.skuId) === String(want.skuId);
  const keptOut = (explanation.products_kept_out ?? []).find(is);
  if (keptOut) return `${want.name} is kept out of your house: ${keptOut.because}`;
  if ((explanation.products_refused ?? []).find(is)) return `No one in this plan can eat ${want.name}`;
  if ((explanation.products_too_big ?? []).find(is)) return `A pack of ${want.name} is more than this household can eat in ${days} days`;
  if ((explanation.products_priced_out ?? []).find(is)) return `${want.name} costs far more for what it feeds than the rest of the shelf, so KOI does not plan with it`;
  return `KOI could not fit ${want.name} into this plan`;
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
    includedSkus: snapshot.included_skus ?? [],
    cost: Number(plan.achieved?.cost ?? 0),
  }, reading, catalogue);

  if (!change.applied.length) {
    await keepTheWording({ db, plan, text, applied: [], notApplied: change.notApplied });
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
    includeSkus: change.includedSkus,
    // A change is a change, not a new plan: what the shopper did not ask about
    // stays (CONTINUITY), minus anything this change takes out.
    keepSkus: (plan.achieved?.basket ?? [])
      .map((l) => String(l.skuId))
      .filter((id) => !change.excludedSkus.map(String).includes(id)),
    keepOutFlags: snapshot.keep_out_flags ?? [],
    // The rules this plan was made under. The plan being changed is not last
    // week's plan, so repeats are not charged against it — CONTINUITY above is
    // what decides how much of it stays.
    kitchen: { ...(snapshot.kitchen_rules ?? {}), priorities: snapshot.priorities ?? [], lastPlanSkus: [] },
    extra: { follows: plan.id, change: change.applied },
  });

  // KOI said "Added Oats" before the solver had a say, and the basket came back
  // without any. A promise the plan does not keep is not reported as kept — and
  // the shopper is told why, because "could not fit" hid the real answer: oats
  // have gluten in them, and this household keeps gluten out of the house.
  const inBasket = new Set((next.report.basket ?? []).map((l) => String(l.skuId)));
  const broken = (change.wants ?? []).filter((w) => !inBasket.has(String(w.skuId)));
  const applied = change.applied.filter((line) => !broken.some((w) => w.line === line));
  const notApplied = [...change.notApplied, ...broken.map((w) => whyNotPlanned(w, next.explanation, change.days))];

  const before = (plan.achieved?.basket ?? []).map((l) => ({ skuId: l.skuId, name: l.name ?? null, packs: l.packs }));
  const { added, changed, dropped } = basketDiff({ removedSkuId: null, before, after: next.report.basket, edges: [] });

  await keepTheWording({ db, plan, text, applied, notApplied });

  return {
    ...next,
    changed: true,
    follows: plan.id,
    applied,
    notApplied,
    // Offered to the shopper to save to their household; never saved here.
    householdChanges: change.householdChanges,
    basketChange: { added, changed, dropped, costBefore: Number(plan.achieved?.cost ?? 0) },
  };
}
