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
import { FOODS_AVOID } from "@/lib/recommendation/config";

/** What a diet flag means, in words, when it is why someone cannot eat a product. */
const DIET_FLAG_WORDS = Object.freeze({
  meat: "meat", fish: "fish", shellfish: "shellfish", egg: "egg", honey: "honey", root_veg: "root vegetables", dairy: "dairy",
});

/**
 * Why a product is not for someone, in words: "contains gluten", "not in their diet: egg".
 * @param {{ flag: string, rule: "avoided"|"diet" }} refusal
 * @returns {string}
 */
export function refusalReason({ flag, rule }) {
  if (rule === "diet") return `not in their diet: ${DIET_FLAG_WORDS[flag] ?? flag.replace(/_/g, " ")}`;
  const entry = FOODS_AVOID.find((a) => a.flag === flag);
  return `contains ${(entry?.label ?? flag.replace(/_/g, " ")).toLowerCase()}`;
}

/**
 * Who eats what (per person): for each member, what in the basket they may eat
 * and how much of it the plan gives them, and what in it is not for them and
 * why. A product one person cannot eat is still bought for the others, so a
 * shopper needs to see which is whose.
 *
 * @param {object} input
 * @param {Array} input.members from memberFor()
 * @param {Array} input.catalogue rows with packAmount and packUnit
 * @param {Array} input.basket planReport's basket
 * @param {object} [input.refusals] model.meta.refusals
 * @returns {Array<{ member, label, allowed: Array, notForThem: Array }>}
 */
export function whoEatsWhat({ members = [], catalogue = [], basket = [], refusals = {} }) {
  const bySku = new Map(catalogue.map((item) => [String(item.skuId), item]));
  return members.map((m) => {
    const allowed = [];
    const notForThem = [];
    for (const line of basket) {
      const refusal = (refusals[line.skuId] ?? []).find((r) => String(r.member) === String(m.id));
      if (refusal) {
        notForThem.push({ skuId: line.skuId, name: line.name, because: refusalReason(refusal) });
        continue;
      }
      const item = bySku.get(String(line.skuId));
      const packs = Math.round((line.shares?.[m.id] ?? 0) * line.packs * 100) / 100;
      allowed.push({
        skuId: line.skuId,
        name: line.name,
        packs,
        amount: item?.packAmount ? Math.round(packs * item.packAmount) : null,
        unit: item?.packUnit ?? null,
      });
    }
    allowed.sort((a, b) => b.packs - a.packs);
    return { member: m.id, label: m.label ?? null, allowed, notForThem };
  });
}

const round1 = (v) => Math.round(v * 10) / 10;
const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/**
 * What changes when one item is taken out of a plan (Phase 3.5).
 *
 * An added product is only called a substitute for the removed one when KOI
 * holds a recorded edge between them (food.substitution_edge), and then with
 * that edge's reasons. Anything else the re-solve changed is reported as a
 * change to the basket, not dressed up as a replacement.
 *
 * @param {object} input
 * @param {string} input.removedSkuId
 * @param {Array<{skuId, name, packs}>} input.before the plan's basket
 * @param {Array<{skuId, name, packs}>} input.after the re-solved basket
 * @param {Array<{to_sku, why: string[]}>} [input.edges] edges FROM the removed SKU, already worded
 * @returns {{ removed, substitutes, added, changed, dropped }}
 */
export function basketDiff({ removedSkuId, before = [], after = [], edges = [] }) {
  const was = new Map(before.map((l) => [String(l.skuId), l]));
  const now = new Map(after.map((l) => [String(l.skuId), l]));
  const whyTo = new Map(edges.map((e) => [String(e.to_sku), e.why ?? []]));
  const line = (l) => ({ skuId: String(l.skuId), name: l.name ?? null, packs: l.packs });

  const substitutes = [];
  const added = [];
  const changed = [];
  for (const [skuId, l] of now) {
    const prior = was.get(skuId);
    if (!prior) {
      if (whyTo.has(skuId)) substitutes.push({ ...line(l), why: whyTo.get(skuId) });
      else added.push(line(l));
    } else if (prior.packs !== l.packs) {
      changed.push({ skuId, name: l.name ?? prior.name ?? null, from: prior.packs, to: l.packs });
    }
  }
  const dropped = [...was.entries()]
    .filter(([skuId]) => skuId !== String(removedSkuId) && !now.has(skuId))
    .map(([, l]) => line(l));

  const removedLine = was.get(String(removedSkuId));
  return {
    removed: removedLine ? line(removedLine) : { skuId: String(removedSkuId), name: null, packs: 0 },
    substitutes,
    added,
    changed,
    dropped,
  };
}

/**
 * A plan more than this share short of any target has not met its brief.
 *
 * Goal programming does not fail: it misses targets instead. So "no plan
 * fits" has to be recognised from the misses, or it is never said at all.
 */
export const MATERIAL_SHORTFALL = 0.05;

/** @param {object} report from planReport @param {number} [share] @returns {boolean} */
export function materiallyShort(report, share = MATERIAL_SHORTFALL) {
  return (report?.perMember ?? []).some((m) =>
    Object.entries(m.shortfall).some(([n, short]) => (m.asked[n] ?? 0) > 0 && short / m.asked[n] > share));
}

/** A miss smaller than this is arithmetic noise, not a shortfall. */
export const TOLERANCE = 0.5;

/** A share within this fraction of its ceiling is at the ceiling (solver tolerance). */
const AT_LIMIT = 0.001;

/**
 * Where the portion ceiling decided the plan (model.js PORTION_RULE): every
 * product some member was planned right up to their limit of, and that limit
 * a day. A plan short of a target while rice is at its limit was held back by
 * the rule, not by price, and the shopper is told which.
 *
 * @param {object} input
 * @param {object} input.meta the model's meta (portionCaps)
 * @param {object} input.solution from solvePlanModel()
 * @param {Array} input.catalogue the rows that were planned with
 * @param {Array} input.members from memberFor()
 * @returns {Array<{ skuId, name, members: Array<{ member, label, perDay, unit, basis }> }>}
 */
export function atPortionLimit({ meta = {}, solution = {}, catalogue = [], members = [] }) {
  const caps = meta.portionCaps ?? {};
  const nameOf = new Map(catalogue.map((i) => [String(i.skuId), i.name ?? null]));
  const labelOf = new Map(members.map((m) => [String(m.id), m.label ?? null]));
  const limited = [];
  for (const [skuId, byMember] of Object.entries(solution.eats ?? {})) {
    const held = [];
    for (const [memberId, amount] of Object.entries(byMember ?? {})) {
      const cap = caps[skuId]?.[memberId];
      if (!cap || !(cap.packs > 0) || !(Number(amount) > 0)) continue;
      if (Number(amount) >= cap.packs * (1 - AT_LIMIT)) {
        held.push({ member: memberId, label: labelOf.get(memberId) ?? null, perDay: cap.perDay, unit: cap.unit, basis: cap.basis });
      }
    }
    if (held.length) limited.push({ skuId, name: nameOf.get(String(skuId)) ?? null, members: held });
  }
  return limited;
}

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
