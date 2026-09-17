// ============================================================================
// KOI PLANNER — The constraint model
//
// Phase 3.2. Pure: a household and a catalogue in, a solver-neutral program
// out. No solver is imported here, so the solver can be chosen (and changed)
// without touching what KOI actually means by a plan.
//
// THE VARIABLES
//   packs[s]       whole packs of SKU s to buy. Integer, because half a pack
//                  cannot be bought — this is what makes the program a MIP.
//   eats[s][m]     how much of SKU s member m eats, in packs. Continuous: a
//                  pack is shared, and a third of a jar is a real thing.
//   short[m][n]    how far member m falls below their target for nutrient n.
//   over[m][n]     how far they go above it.
//
// THE HARD CONSTRAINTS — never traded away, never relaxed:
//   * a member never eats a SKU they cannot eat. An allergen they avoid, or a
//     diet their food must respect, means there is no eats[s][m] for them at
//     all — not a penalty — and the reason is recorded in meta.refusals. The
//     SKU can still be bought for the others: one child's nut allergy used to
//     take nuts off everyone's plan, and a wife's gluten-free diet her
//     husband's atta. A SKU no member can eat is not in the program, and
//     `excluded` says why.
//   * what the household keeps out of the house (keepOutFlags: a severe
//     allergy, a shared kitchen) is not in the program for anyone.
//   * what is bought is what is eaten: sum over members of eats[s][m] equals
//     packs[s]. Nothing is planned into a basket and left uneaten.
//   * budget, when given.
//   * availability, when the caller requires it (see `availability` below).
//   * portions: nobody is planned more of one product than they could eat
//     (PORTION_RULE). Without it the program is Stigler's diet problem: a
//     live four-person plan on ₹4,000 was 13 kg of rice and nothing else,
//     because rice was the cheapest energy and the cheapest protein.
//   * a product whose nutrition is priced far beyond the catalogue's is not
//     planned with (PRICE_SANITY), or the solver buys saffron for protein.
//
// THE SOFT CONSTRAINTS — the macro targets, as goal programming. Each target
// becomes an equality with a shortfall and an excess variable, and the
// objective minimises the weighted deviations. A target is a goal, so the
// solver may miss it; an allergen is not, so it cannot.
//
// Deliberately NOT here: any notion of "healthier". The plan is a basket that
// meets stated targets within a budget without feeding anyone something they
// avoid. What is good food is the screening engine's business.
// ============================================================================

export const MODEL_VERSION = "plan-model-v5";

/**
 * A tiebreak toward food KOI screened better (plan-model-v2).
 *
 * v1 had no notion of quality, so it met macros with the cheapest calories:
 * a live basket carried Mango Mysore Pak (KOI score 10) and Chocolate Biscuits
 * (14). Each pack now costs QUALITY_TIEBREAK x (1 - score/100) in the
 * objective. That is deliberately tiny beside the targets: at most 0.1 per
 * pack, which is 5 kcal or 0.017 g of protein of shortfall. So it decides
 * between plans that meet the targets about equally, and can never buy a
 * better score with a real miss. A product KOI has not scored earns no
 * preference: it is not assumed good.
 */
export const QUALITY_TIEBREAK = 0.1;

const isScore = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/**
 * A tiebreak toward spending less (plan-model-v2).
 *
 * Without a price in the objective, every basket that met the targets was
 * equally optimal — so with no budget the solver bought 45 packs for ₹14,570,
 * five of them saffron at ₹1,250 each, to fine-tune a few kcal. Each rupee now
 * costs SPEND_TIEBREAK: ₹1,000 is worth 0.1, the same 5 kcal of shortfall as
 * the quality tiebreak, so the cheapest of equally good plans wins and no
 * real target is traded for a saving.
 */
export const SPEND_TIEBREAK = 0.0001;

/** @param {number|null} score @param {number} weight @returns {number} */
export function qualityCost(score, weight = QUALITY_TIEBREAK) {
  const s = isScore(score) ? Math.min(100, Math.max(0, Number(score))) : 0;
  return Math.round(weight * (1 - s / 100) * 10000) / 10000;
}

/**
 * How much a miss costs, per gram or kcal, in the objective.
 *
 * Shortfalls cost more than excesses: a plan that leaves someone 20 g of
 * protein short has failed them, while 20 g over is a fuller plate. Protein
 * is weighted above energy because it is the target shoppers set and the one
 * a basket of snacks misses. Editorial, and versioned with the model.
 */
export const DEVIATION_COST = Object.freeze({
  protein: { short: 6, over: 0.5 },
  kcal: { short: 0.02, over: 0.02 },
  carbs: { short: 0.2, over: 0.4 },
  fat: { short: 0.2, over: 0.6 },
});

/**
 * A product is planned with for its nutrition only when that nutrition is not
 * priced far beyond the rest of the catalogue (plan-model-v3).
 *
 * A shortfall costs 6 per gram of protein and a rupee costs 0.0001, so once
 * portions bind the solver will pay ₹60,000 for a gram — and with no budget a
 * live plan bought seven 1 g packs of saffron (₹8,750) for under a gram of
 * protein. So a product enters the program only if its energy or its protein
 * costs at most `multiple` times the catalogue's median rupees for the same.
 * Saffron's energy is about ₹4 lakh per 1,000 kcal against a median near
 * ₹200. What is left out, and the figures that left it out, are recorded.
 */
export const PRICE_SANITY = Object.freeze({ multiple: 10 });

const median = (values) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Rupees for 1,000 kcal and for 100 g of protein, where the pack declares them. */
function nutritionPrices(item) {
  const price = Number(item?.price);
  const kcal = Number(item?.perPack?.kcal);
  const protein = Number(item?.perPack?.protein);
  return {
    per1000kcal: price > 0 && kcal > 0 ? (1000 * price) / kcal : null,
    per100gProtein: price > 0 && protein > 0 ? (100 * price) / protein : null,
  };
}

/**
 * Who goes short, when someone has to (plan-model-v4).
 *
 * A shortfall costs the same per gram whoever it belongs to, so when a budget
 * binds the solver does not care who misses: a live ₹4,000 plan left Kid 1
 * 49% short of energy while Me was 26% short, and one re-plan gave Kid 1
 * nothing at all. So for each nutrient that two or more members have a target
 * for, the largest share any of them falls short (shortfall ÷ target) is
 * charged too — extended goal programming, which weighs the worst miss
 * against the total (Romero, "Extended lexicographic goal programming: a
 * unifying approach", Omega 29(1), 2001).
 *
 * `weight`: taking one percentage point off the worst-off member's shortfall
 * is worth half a percentage point of the household's whole target for that
 * nutrient. Enough to share a shortfall out; not enough to leave the
 * household much hungrier overall to do it.
 */
export const FAIRNESS = Object.freeze({ weight: 0.5 });

/** The nutrients a target may be set for, and their per-pack field. */
export const NUTRIENTS = Object.freeze(["kcal", "protein", "carbs", "fat"]);

/** A pack cap keeps the search finite; 14 of one product is already odd. */
export const MAX_PACKS_PER_SKU = 14;

/**
 * How much of one product one member may be planned to eat (plan-model-v3).
 *
 * A day's ceiling is the category's largest realistic serving
 * (food.portion_norm.plausible_max: twice the US FDA reference amount, 21 CFR
 * 101.12(b)) times the meals a day that kind of food appears in: a staple at
 * lunch and dinner, anything else once. So rice, 90 g dry a serving, is at
 * most 180 g a day; cookies, 60 g.
 *
 * The ceiling scales with the member's stated energy target against the
 * 2,000 kcal reference diet nutrition labels are read against (21 CFR
 * 101.9(c)(9)): a child asking for 1,400 kcal gets 70% of an adult's portion.
 * With no energy target, the adult portion stands.
 *
 * A product whose category has no reference portion may supply at most a
 * tenth of the member's energy over the period (of 2,000 kcal a day when no
 * target is stated), and one with no energy figure at most one pack.
 *
 * These are planning rules, not nutrition advice: they stop a basket being
 * built from one cheap product, and a plan held back by them says so.
 */
export const PORTION_RULE = Object.freeze({
  version: "portion-cap-v1",
  occasionsPerDay: Object.freeze({ meal_base: 2 }),
  defaultOccasions: 1,
  referenceKcal: 2000,
  unreferencedEnergyShare: 0.1,
});

const round1 = (v) => Math.round(v * 10) / 10;
const round4 = (v) => Math.round(v * 10000) / 10000;

/**
 * The most packs of `item` that `member` may eat over `days`, and why.
 *
 * @param {object} item a catalogue row: packAmount, packUnit, role, portion, perPack
 * @param {object} member from memberFor(): targets
 * @param {number} days
 * @param {number} [relax] 1 as asked; the ladder's variety step doubles it
 * @returns {{ packs: number, basis: "reference_portion"|"energy_share"|"one_pack", perDay: number|null, unit: string|null }}
 */
export function portionCap(item, member, days, relax = 1) {
  const kcalTarget = isNum(member?.targets?.kcal) && Number(member.targets.kcal) > 0 ? Number(member.targets.kcal) : null;
  const portion = item?.portion;
  const packAmount = Number(item?.packAmount);
  if (portion && isNum(portion.max) && packAmount > 0 && portion.unit === item.packUnit) {
    const occasions = PORTION_RULE.occasionsPerDay[item.role] ?? PORTION_RULE.defaultOccasions;
    const scale = kcalTarget ? kcalTarget / PORTION_RULE.referenceKcal : 1;
    const perDay = occasions * Number(portion.max) * scale * relax;
    return { packs: round4((perDay * days) / packAmount), basis: "reference_portion", perDay: round1(perDay), unit: portion.unit };
  }
  const kcalPerPack = Number(item?.perPack?.kcal);
  if (kcalPerPack > 0) {
    const perDay = (kcalTarget ?? PORTION_RULE.referenceKcal) * PORTION_RULE.unreferencedEnergyShare * relax;
    return { packs: round4((perDay * days) / kcalPerPack), basis: "energy_share", perDay: round1(perDay), unit: "kcal" };
  }
  return { packs: relax, basis: "one_pack", perDay: null, unit: null };
}

/**
 * How many products may enter the program, and how they are chosen.
 *
 * A mixed-integer program grows with the number of products, and the solver's
 * job is to be answered in seconds while a shopper waits: 200 products took
 * HiGHS ten seconds to prove optimal (scripts/benchmarkSolvers.mjs). So when
 * the catalogue is larger than `candidateLimit`, the most protein per rupee
 * enter it — protein is the target shoppers actually set, and the one a
 * basket misses.
 *
 * This can only make a plan worse, never unsafe: every product it drops was
 * already allowed for every member. The rule, the limit and the count dropped
 * are recorded in the model's meta and in `excluded`, so a plan can be
 * re-solved without it.
 */
export const CANDIDATE_RULE = "protein_per_rupee";

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const packsName = (s) => `packs_${s}`;
const eatsName = (s, m) => `eats_${s}_${m}`;
const shortName = (m, n) => `short_${m}_${n}`;
const overName = (m, n) => `over_${m}_${n}`;
const worstName = (n) => `worst_share_short_${n}`;

/**
 * Why a member cannot eat this product, or null when they can.
 *
 * `contains` is the flag set from extractFacts: allergens, diet flags and the
 * rest. A hard avoid or a diet exclusion is a fact about this pairing, not a
 * preference to be scored.
 */
function refusedBy(item, member) {
  const contains = new Set(item.contains ?? []);
  for (const flag of member.avoidFlags ?? []) {
    if (contains.has(flag)) return { member: member.id, flag, rule: "avoided" };
  }
  for (const flag of member.dietExcludes ?? []) {
    if (contains.has(flag)) return { member: member.id, flag, rule: "diet" };
  }
  return null;
}

/**
 * @param {object} input
 * @param {Array} input.members  [{ id, targets: {kcal, protein, carbs, fat}, avoidFlags, dietExcludes }]
 *   Targets are per day, per member, and any of them may be absent.
 * @param {Array} input.catalogue [{ skuId, price, contains, availability, perPack: {kcal, protein, carbs, fat} }]
 *   `perPack` is what one pack supplies, from the declared figures and the net
 *   weight. A SKU KOI cannot quantify is not plannable and is excluded.
 * @param {number} input.days
 * @param {number|null} [input.budget] rupees for the whole period
 * @param {"allow_unknown"|"require_available"} [input.availability]
 *   The plan's rule is that unknown is not available. It holds once a
 *   marketplace is connected; with none, requiring it would make every plan
 *   infeasible, so the caller states which it wants and the choice is recorded.
 * @param {number|null} [input.candidateLimit] most products to admit (see CANDIDATE_RULE)
 * @param {number} [input.maxPacksPerSku]
 * @param {number} [input.portionRelax] multiplies every portion ceiling (PORTION_RULE)
 * @param {number} [input.fairness] the weight on the worst-off member's shortfall (FAIRNESS); 0 turns it off
 * @param {string[]} [input.keepOutFlags] contains-flags no product may carry, for anyone (household.keep_out)
 * @returns {{ columns, rows, meta, excluded }}
 */
export function buildPlanModel({
  members = [],
  catalogue = [],
  days = 7,
  budget = null,
  availability = "allow_unknown",
  candidateLimit = null,
  maxPacksPerSku = MAX_PACKS_PER_SKU,
  excludeSkus = [],
  qualityTiebreak = QUALITY_TIEBREAK,
  spendTiebreak = SPEND_TIEBREAK,
  portionRelax = 1,
  fairness = FAIRNESS.weight,
  keepOutFlags = [],
}) {
  const removed = new Set((excludeSkus ?? []).map(String));
  const keptOut = new Set(keepOutFlags ?? []);
  const columns = [];
  const rows = [];
  const excluded = [];
  // skuId -> memberId -> portionCap()
  const portionCaps = {};
  // skuId -> [{ member, flag, rule }] for the members who cannot eat it
  const refusals = {};

  // The catalogue's typical price of energy and of protein (PRICE_SANITY).
  const prices = catalogue.map(nutritionPrices);
  const typical = {
    per1000kcal: median(prices.map((p) => p.per1000kcal ?? NaN)),
    per100gProtein: median(prices.map((p) => p.per100gProtein ?? NaN)),
  };
  const withinReason = (item) => {
    const own = nutritionPrices(item);
    const judged = ["per1000kcal", "per100gProtein"].filter((k) => own[k] !== null && typical[k] !== null);
    return !judged.length || judged.some((k) => own[k] <= PRICE_SANITY.multiple * typical[k]);
  };

  const allowed = [];
  for (const item of catalogue) {
    if (!item?.skuId) continue;
    // The shopper cannot get this one (Phase 3.5): plan as if it were not stocked.
    if (removed.has(String(item.skuId))) {
      excluded.push({ skuId: item.skuId, reason: "removed_by_shopper" });
      continue;
    }
    const quantifiable = NUTRIENTS.some((n) => isNum(item.perPack?.[n]));
    if (!quantifiable) {
      excluded.push({ skuId: item.skuId, reason: "not_quantifiable" });
      continue;
    }
    if (!isNum(item.price)) {
      excluded.push({ skuId: item.skuId, reason: "no_price" });
      continue;
    }
    if (!withinReason(item)) {
      const own = nutritionPrices(item);
      excluded.push({
        skuId: item.skuId,
        reason: "priced_beyond_its_nutrition",
        rupeesPer1000kcal: own.per1000kcal === null ? null : Math.round(own.per1000kcal),
        typicalPer1000kcal: typical.per1000kcal === null ? null : Math.round(typical.per1000kcal),
        rupeesPer100gProtein: own.per100gProtein === null ? null : Math.round(own.per100gProtein),
        typicalPer100gProtein: typical.per100gProtein === null ? null : Math.round(typical.per100gProtein),
      });
      continue;
    }
    if (availability === "require_available" && item.availability !== "available") {
      excluded.push({ skuId: item.skuId, reason: "not_confirmed_available", availability: item.availability ?? "unknown" });
      continue;
    }
    // Kept out of the house: not bought for anyone.
    const keptOutFlag = (item.contains ?? []).find((flag) => keptOut.has(flag));
    if (keptOutFlag) {
      excluded.push({ skuId: item.skuId, reason: "kept_out_of_house", flag: keptOutFlag });
      continue;
    }
    // Kept from the members who cannot eat it; out of the program only when that is everyone.
    const refusedFor = members.map((m) => refusedBy(item, m)).filter(Boolean);
    if (members.length && refusedFor.length === members.length) {
      excluded.push({ skuId: item.skuId, reason: "refused", refusedBy: refusedFor });
      continue;
    }
    const refusing = new Set(refusedFor.map((r) => r.member));
    // Everything bought is eaten, so a pack bigger than the members who may
    // eat it can finish in the period cannot be bought at all.
    const caps = Object.fromEntries(members.map((m) => [
      m.id,
      refusing.has(m.id) ? { packs: 0, basis: "refused", perDay: 0, unit: null } : portionCap(item, m, days, portionRelax),
    ]));
    const canEat = round4(Object.values(caps).reduce((sum, cap) => sum + cap.packs, 0));
    if (members.length && canEat < 1) {
      excluded.push({ skuId: item.skuId, reason: "pack_outlasts_the_plan", canEat });
      continue;
    }
    portionCaps[item.skuId] = caps;
    if (refusedFor.length) refusals[item.skuId] = refusedFor;
    allowed.push(item);
  }
  const mayEat = (skuId, memberId) => portionCaps[skuId]?.[memberId]?.basis !== "refused";

  // Only so many products may enter the program (CANDIDATE_RULE).
  let eligible = allowed;
  if (isNum(candidateLimit) && allowed.length > candidateLimit) {
    const perRupee = (item) => (Number(item.perPack?.protein ?? 0) || 0) / Number(item.price);
    const ranked = [...allowed].sort((a, b) => perRupee(b) - perRupee(a) || String(a.skuId).localeCompare(String(b.skuId)));
    eligible = ranked.slice(0, candidateLimit);
    ranked.slice(candidateLimit).forEach((item, i) => {
      excluded.push({ skuId: item.skuId, reason: "not_a_candidate", rule: CANDIDATE_RULE, rank: candidateLimit + i + 1 });
    });
  }

  // Packs, and who eats them.
  for (const item of eligible) {
    const packCost = qualityCost(item.score, qualityTiebreak) + spendTiebreak * Number(item.price);
    const caps = portionCaps[item.skuId] ?? {};
    // No more whole packs than the household can eat between them.
    const canEat = Object.values(caps).reduce((sum, cap) => sum + cap.packs, 0);
    const packUpper = members.length ? Math.min(maxPacksPerSku, Math.floor(canEat + 1e-9)) : maxPacksPerSku;
    columns.push({ name: packsName(item.skuId), lower: 0, upper: packUpper, integer: true, cost: Math.round(packCost * 1e6) / 1e6 });
    const eaten = { name: `eaten_${item.skuId}`, lower: 0, upper: 0, coefficients: { [packsName(item.skuId)]: -1 } };
    for (const m of members) {
      if (!mayEat(item.skuId, m.id)) continue;
      const upper = Math.min(maxPacksPerSku, caps[m.id]?.packs ?? maxPacksPerSku);
      columns.push({ name: eatsName(item.skuId, m.id), lower: 0, upper, integer: false, cost: 0 });
      eaten.coefficients[eatsName(item.skuId, m.id)] = 1;
    }
    rows.push(eaten);
  }

  // Each member's targets, as goals.
  for (const m of members) {
    for (const n of NUTRIENTS) {
      const perDay = m.targets?.[n];
      if (!isNum(perDay)) continue;
      const target = Number(perDay) * days;
      const row = { name: `target_${m.id}_${n}`, lower: target, upper: target, coefficients: {} };
      for (const item of eligible) {
        const supplied = Number(item.perPack?.[n] ?? 0);
        if (supplied && mayEat(item.skuId, m.id)) row.coefficients[eatsName(item.skuId, m.id)] = supplied;
      }
      columns.push({ name: shortName(m.id, n), lower: 0, upper: Infinity, integer: false, cost: DEVIATION_COST[n].short });
      columns.push({ name: overName(m.id, n), lower: 0, upper: Infinity, integer: false, cost: DEVIATION_COST[n].over });
      row.coefficients[shortName(m.id, n)] = 1;
      row.coefficients[overName(m.id, n)] = -1;
      rows.push(row);
    }
  }

  // The worst-off member's shortfall, per nutrient (FAIRNESS):
  // short[m][n] - target[m][n] x worst[n] <= 0 for every member with a target.
  const fairFor = [];
  if (isNum(fairness) && fairness > 0) {
    for (const n of NUTRIENTS) {
      const targeted = members
        .map((m) => ({ id: m.id, target: isNum(m.targets?.[n]) ? Number(m.targets[n]) * days : 0 }))
        .filter((m) => m.target > 0);
      if (targeted.length < 2) continue;
      const household = targeted.reduce((sum, m) => sum + m.target, 0);
      columns.push({ name: worstName(n), lower: 0, upper: Infinity, integer: false, cost: round4(fairness * DEVIATION_COST[n].short * household) });
      for (const m of targeted) {
        rows.push({
          name: `fair_${m.id}_${n}`,
          lower: -Infinity,
          upper: 0,
          coefficients: { [shortName(m.id, n)]: 1, [worstName(n)]: -m.target },
        });
      }
      fairFor.push(n);
    }
  }

  if (isNum(budget)) {
    const row = { name: "budget", lower: -Infinity, upper: Number(budget), coefficients: {} };
    for (const item of eligible) row.coefficients[packsName(item.skuId)] = Number(item.price);
    rows.push(row);
  }

  return {
    columns,
    rows,
    excluded,
    meta: {
      version: MODEL_VERSION,
      days,
      budget: isNum(budget) ? Number(budget) : null,
      availability,
      members: members.map((m) => m.id),
      skus: eligible.map((i) => i.skuId),
      sense: "minimise",
      maxPacksPerSku,
      candidateLimit: isNum(candidateLimit) ? Number(candidateLimit) : null,
      candidateRule: isNum(candidateLimit) && allowed.length > candidateLimit ? CANDIDATE_RULE : null,
      allowedBeforeLimit: allowed.length,
      qualityTiebreak,
      spendTiebreak,
      removedByShopper: [...removed],
      portionRule: PORTION_RULE.version,
      portionRelax,
      portionCaps: Object.fromEntries(eligible.map((i) => [i.skuId, portionCaps[i.skuId] ?? {}])),
      refusals: Object.fromEntries(eligible.filter((i) => refusals[i.skuId]).map((i) => [i.skuId, refusals[i.skuId]])),
      keepOutFlags: [...keptOut],
      fairness: fairFor.length ? fairness : 0,
      fairnessNutrients: fairFor,
    },
  };
}

/** The names a solution is read back through. */
export const nameOf = Object.freeze({ packs: packsName, eats: eatsName, short: shortName, over: overName, worst: worstName });
