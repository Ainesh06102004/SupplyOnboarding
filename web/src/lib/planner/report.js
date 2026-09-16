// ============================================================================
// KOI PLANNER — Achieved against asked
//
// Phase 3.4. Pure. What the plan actually delivers each member, next to what
// they asked for, computed from the allocation the solver returned and the
// pack figures KOI holds.
//
// NOT from the solver's own deviation variables. Those are how the objective
// is expressed, and reading a result back out of the thing being minimised is
// how a rounding difference becomes a promise. The figures here are arithmetic
// on the basket: how much of each pack each member eats, times what that pack
// supplies. A shortfall is a shortfall, and it is never rounded away.
// ============================================================================

import { NUTRIENTS } from "./model";

const round1 = (v) => Math.round(v * 10) / 10;
const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/** A miss smaller than this is arithmetic noise, not a shortfall. */
export const TOLERANCE = 0.5;

/**
 * @param {object} input
 * @param {Array} input.members from memberFor()
 * @param {Array} input.catalogue the rows that were planned with
 * @param {object} input.solution from solvePlanModel()
 * @param {number} input.days
 * @param {number|null} [input.budget]
 * @returns {{ basket, cost, budget, withinBudget, perMember, unmet, summary }}
 */
export function planReport({ members = [], catalogue = [], solution = {}, days = 7, budget = null }) {
  const bySku = new Map(catalogue.map((item) => [String(item.skuId), item]));
  const packs = solution.packs ?? {};
  const eats = solution.eats ?? {};

  const basket = Object.entries(packs).map(([skuId, count]) => {
    const item = bySku.get(String(skuId));
    const shares = {};
    for (const [member, amount] of Object.entries(eats[skuId] ?? {})) {
      if (count > 0) shares[member] = Math.round((amount / count) * 100) / 100;
    }
    return {
      skuId,
      name: item?.name ?? null,
      packs: count,
      packSize: item?.packSize ?? null,
      cost: item ? round1(item.price * count) : null,
      shares,
    };
  }).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));

  const cost = round1(basket.reduce((sum, line) => sum + (line.cost ?? 0), 0));

  const perMember = members.map((member) => {
    const asked = {};
    const achieved = {};
    const shortfall = {};
    const excess = {};
    for (const nutrient of NUTRIENTS) {
      const perDay = member.targets?.[nutrient];
      let supplied = 0;
      for (const [skuId, byMember] of Object.entries(eats)) {
        const amount = Number(byMember[member.id] ?? 0);
        if (!amount) continue;
        const perPack = bySku.get(String(skuId))?.perPack?.[nutrient];
        if (isNum(perPack)) supplied += amount * Number(perPack);
      }
      achieved[nutrient] = round1(supplied);
      if (!isNum(perDay)) continue;
      const target = Number(perDay) * days;
      asked[nutrient] = round1(target);
      const difference = round1(supplied - target);
      if (difference < -TOLERANCE) shortfall[nutrient] = Math.abs(difference);
      else if (difference > TOLERANCE) excess[nutrient] = difference;
    }
    return { id: member.id, label: member.label ?? null, asked, achieved, shortfall, excess };
  });

  const unmet = perMember.flatMap((m) =>
    Object.entries(m.shortfall).map(([nutrient, amount]) => ({ member: m.id, label: m.label, nutrient, short: amount })));

  return {
    basket,
    cost,
    budget: isNum(budget) ? Number(budget) : null,
    withinBudget: isNum(budget) ? cost <= Number(budget) : null,
    perMember,
    unmet,
    summary: {
      products: basket.length,
      packs: basket.reduce((sum, line) => sum + line.packs, 0),
      days,
      membersFed: perMember.length,
      everyTargetMet: unmet.length === 0,
    },
  };
}
