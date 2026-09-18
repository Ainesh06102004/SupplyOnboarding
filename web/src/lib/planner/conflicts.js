// ============================================================================
// KOI PLANNER — Which of the shopper's own asks are in the way (C7)
//
// A plan that says "Me 5,023 kcal short" has told the truth and helped nobody.
// The useful answer is which of the things this household asked for cannot all
// be had at once, and what one change would fix it.
//
// HOW IT IS FOUND. Deletion filtering (Chinneck, "Feasibility and Infeasibility
// in Optimization", 2008): take one ask away, solve again, and see whether the
// problem goes away. An ask whose removal fixes the plan is in the conflict;
// one whose removal changes nothing is not, whatever it looked like. So the
// answer is never a guess about which rule "probably" bound — it is proved by
// re-solving, the same way a substitute is proved (plan.js).
//
// WHY IT IS NOT AN IIS. Goal programming does not come back infeasible, it
// comes back short, so there is no infeasible set to reduce. "Infeasible" here
// means "materially short of what was asked" (report.js MATERIAL_SHORTFALL),
// and the relaxations are the asks a shopper can actually change.
//
// WHAT IT COSTS. One extra solve per ask tried, so the order matters: the
// household's own priorities decide what is offered first — whatever they
// ranked lowest is the thing to give up first — and the search stops as soon
// as it has enough to say. A household that has asked for nothing unusual
// tries one or two.
// ============================================================================

import { PRIORITY } from "./model";

/** How many fixes are worth offering. More than two is a list, not an answer. */
export const MOST_FIXES = 2;

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const rupees = (n) => `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;

/**
 * Every ask a shopper could take back, with the smallest version of taking it
 * back. Each one is a real setting on a real screen: an answer a shopper cannot
 * act on is not an answer.
 *
 * `priority` ties the ask to what the household said matters, so the order of
 * the offers follows the order they chose (model.js PRIORITY).
 */
export const RELAXATIONS = Object.freeze([
  {
    key: "budget",
    priority: "budget",
    applies: (base) => isNum(base.budget),
    apply: (base) => ({ ...base, budget: null }),
    says: (base, after) => `Spend about ${rupees(after.report.cost)} instead of ${rupees(base.budget)}`,
  },
  {
    key: "skipped_this_week",
    priority: "targets",
    applies: (base) => base.members.some((m) => (m.skipCategories ?? []).length),
    apply: (base) => ({ ...base, members: base.members.map((m) => ({ ...m, skipCategories: [] })) }),
    says: (base) => {
      const who = base.members.filter((m) => (m.skipCategories ?? []).length).map((m) => m.label ?? "someone");
      return `Let ${who.join(" and ")} have what they asked to skip this week`;
    },
  },
  {
    key: "refused_brands",
    priority: "less_processed",
    applies: (base) => (base.refusedBrands ?? []).length > 0,
    apply: (base) => ({ ...base, refusedBrands: [] }),
    says: (base) => `Allow ${base.refusedBrands.join(", ")} back in`,
  },
  {
    key: "pantry",
    priority: "budget",
    applies: (base) => (base.pantrySkus ?? []).length > 0,
    apply: (base) => ({ ...base, pantrySkus: [] }),
    says: () => "Buy more of something the cupboard already has",
  },
  {
    key: "waste_tolerance",
    priority: "budget",
    applies: (base) => base.wasteTolerance === "none",
    apply: (base) => ({ ...base, wasteTolerance: "some" }),
    says: () => "Allow bigger packs, with some left over at the end of the week",
  },
  {
    key: "kept_out_of_house",
    priority: "targets",
    applies: (base) => (base.keepOutFlags ?? []).length > 0,
    apply: (base) => ({ ...base, keepOutFlags: [] }),
    // Never offered as a fix: see `offerable` below. It is found and reported,
    // because a household that cannot be fed around an allergy needs to know
    // that is why — and then the answer is a wider shelf, not a smaller rule.
    says: (base) => `What is kept out of the house (${base.keepOutFlags.join(", ")}) is what leaves the targets short`,
  },
  {
    key: "days",
    priority: "targets",
    applies: (base) => Number(base.days) > 2,
    apply: (base) => ({ ...base, days: Math.max(1, Math.ceil(Number(base.days) / 2)) }),
    says: (base) => `Plan ${Math.max(1, Math.ceil(Number(base.days) / 2))} days instead of ${base.days}, and shop again sooner`,
  },
]);

/**
 * A safety rule is never offered as a fix.
 *
 * KOI will say that keeping gluten out of the house is what leaves the targets
 * short, because that is true and worth knowing. It will not suggest letting it
 * back in. The same line KOI has held everywhere else: allergens, age safety
 * and diet are not on the ladder, and they are not on this list either.
 */
const offerable = (key) => key !== "kept_out_of_house";

/** The order to try asks in: what the household ranked lowest, first. */
export function orderFor(priorities = []) {
  const ranked = [...new Set([...(priorities ?? []).filter((p) => PRIORITY.order.includes(p)), ...PRIORITY.order])];
  const rankOf = (relaxation) => {
    const i = ranked.indexOf(relaxation.priority);
    return i < 0 ? ranked.length : i;
  };
  // Lowest priority first: the thing they care least about is the thing to give
  // up first. Ties keep the order they are written in, which runs from the ask
  // most shoppers would rather change to the one they would rather not.
  return [...RELAXATIONS].sort((a, b) => rankOf(b) - rankOf(a));
}

/**
 * Which of this household's asks are in the way, and what fixes them.
 *
 * @param {object} input
 * @param {object} input.base what was solved (buildPlanModel's input)
 * @param {(base: object) => Promise<{report: object}>} input.solve one more solve
 * @param {(report: object) => boolean} input.stillShort is this plan still short?
 * @param {number} [input.most] how many fixes to look for
 * @returns {Promise<{fixes: Array, tried: string[], safety: object|null}>}
 *   `fixes` are asks that, taken back, meet every target. `safety` is a rule
 *   KOI will not offer to break but will name.
 */
export async function findConflicts({ base, solve, stillShort, most = MOST_FIXES }) {
  const fixes = [];
  const tried = [];
  let safety = null;

  for (const relaxation of orderFor(base.priorities)) {
    if (fixes.length >= most) break;
    if (!relaxation.applies(base)) continue;
    tried.push(relaxation.key);

    const after = await solve(relaxation.apply(base));
    if (!after?.report || stillShort(after.report)) continue;

    const found = { key: relaxation.key, says: relaxation.says(base, after), cost: after.report.cost };
    if (offerable(relaxation.key)) fixes.push(found);
    else safety = found;
  }

  return { fixes, tried, safety };
}
