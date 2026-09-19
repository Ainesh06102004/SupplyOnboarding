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
//   * a member never eats a SKU they cannot eat. An allergen they avoid, a
//     product unsafe for their age (ageSafety.js: whole nuts under 5, caffeine
//     for children), or a diet their food must respect, means there is no
//     eats[s][m] for them at all — not a penalty — and the reason is recorded
//     in meta.refusals. The
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

import { ageRefusal, AGE_SAFETY_VERSION } from "./ageSafety";

// v6: age-band safety refusals (ageSafety.js).
// v7: goals (GOAL_MODEL): a deficit as an energy ceiling, a surplus weighted,
//     keto and low carb as carbohydrate ceilings.
// v8: this week's choices (PREFERENCE: what they feel like, what to skip), and
//     portions that follow a member's appetite and the meals they eat at home.
// v9: a change keeps the plan it changes (CONTINUITY), and a product asked for
//     by name is always a candidate.
// v10: the kitchen's own rules (KITCHEN, migration 00052): brands refused and
//     preferred, spice tolerance, what is already in the pantry, how much of a
//     pack may go unfinished, and how much of the last plan may come back.
// v11: what the household wants protected first (PRIORITY, migration 00054):
//     budget, targets, familiar food, less processed, variety, in their order.
// v12: targets that hold when a few unverified labels under-deliver (ROBUST).
// v13: the kitchen a household leans towards (KITCHEN.cuisineBonus, 00061).
export const MODEL_VERSION = "plan-model-v13";

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

/**
 * How a member's goal shapes their targets (plan-model-v7, goals.js).
 *
 *   lose       the energy target is a ceiling: `over` is fixed at 0, so the
 *              plan can fall short of it but never pass it. Always feasible,
 *              because eating less always is.
 *   gain       a shortfall on energy costs `gainShortfallMultiplier` times
 *              more, so the plan works harder to reach the surplus.
 *   keto,      carbohydrate over the plan is capped at the pattern's daily
 *   low carb   ceiling × days, as a hard row; a product with no declared
 *              carbohydrate is refused for that member.
 */
export const GOAL_MODEL = Object.freeze({ gainShortfallMultiplier: 5 });

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
  version: "portion-cap-v2",
  occasionsPerDay: Object.freeze({ meal_base: 2 }),
  defaultOccasions: 1,
  referenceKcal: 2000,
  unreferencedEnergyShare: 0.1,
  // Which meals a staple can appear at, and what a member eating fewer of them
  // from home needs (household_member.meals_from_home, 00050). With nothing
  // stated the occasions above stand.
  mainMeals: Object.freeze(["breakfast", "tiffin", "lunch", "dinner"]),
  fewestOccasions: 0.5,
  // A big eater is planned a fifth more of a product than a small one
  // (household_member.appetite). Editorial, and versioned with the rule.
  appetiteScale: Object.freeze({ small: 0.8, usual: 1, large: 1.2 }),
});

/**
 * A day's occasions for this kind of food, given the meals a member eats from
 * home: a staple at up to two of them, anything else once if they eat from
 * home at all. Someone who eats only breakfast at home is planned less.
 *
 * @param {string|null} role a taxonomy meal role
 * @param {string[]} [mealsFromHome]
 * @returns {number}
 */
export function occasionsFor(role, mealsFromHome = []) {
  const stated = (mealsFromHome ?? []).length > 0;
  const base = PORTION_RULE.occasionsPerDay[role] ?? PORTION_RULE.defaultOccasions;
  if (!stated) return base;
  if (role === "meal_base") {
    const meals = PORTION_RULE.mainMeals.filter((m) => mealsFromHome.includes(m)).length;
    return Math.min(base, Math.max(PORTION_RULE.fewestOccasions, meals));
  }
  return mealsFromHome.includes("snacks") ? base : PORTION_RULE.fewestOccasions;
}

/**
 * What a member feels like eating this week, as the model reads it (v8).
 *
 * `prefer` takes a little off the cost of a pack that member eats, so a
 * preference decides between products that are otherwise close and never
 * against a target: one gram of protein short costs 6, and this costs 0.05.
 * `skip` is a refusal for that member alone, reported like any other.
 */
export const PREFERENCE = Object.freeze({ bonusPerPack: 0.05 });

/**
 * A change is a change, not a new plan (plan-model-v9).
 *
 * "Take out the brown rice and add oats" used to re-solve from nothing, and
 * came back having also dropped the chocolate, the cashews and the chikki —
 * every one of them a product the shopper had already agreed to. The solver was
 * right and the answer was useless: a follow-up has to leave alone what it was
 * not asked about.
 *
 * So a pack already in the plan is not re-priced. What it saves is exactly
 * what the tiebreaks would charge to buy it again — its rupees (SPEND_TIEBREAK)
 * plus a preference-sized 0.05 — because the tiebreaks are how KOI picks
 * between baskets that are equally good, and a basket the shopper already has
 * is the better of two equally good baskets. A flat bonus was not enough: at
 * 0.05 a pack, dropping a ₹899 chocolate still paid, and the first version of
 * this rule re-did the basket anyway.
 *
 * It is capped, so continuity can never outweigh a real miss: at most 0.25 a
 * pack, against 6 for a gram of protein short. And it cannot buy a pack nobody
 * eats — everything bought is eaten, and eating past a target costs far more
 * than this saves.
 */
export const CONTINUITY = Object.freeze({ bonusPerPack: 0.05, cap: 0.25 });

/** What keeping this pack is worth against the tiebreaks that would replace it. */
export const continuityBonus = (price, spendTiebreak = SPEND_TIEBREAK) =>
  Math.min(CONTINUITY.cap, CONTINUITY.bonusPerPack + spendTiebreak * (Number(price) || 0));

/**
 * Targets that survive a label being wrong (plan-model-v12).
 *
 * Every gram in a plan comes from a number printed on a pack. KOI has verified
 * the ingredient list of none of the 63 products it sells, so "1,008 of 1,008 g
 * protein" is exactly as true as labels nobody has checked — and a plan built
 * to the declared figure to three decimal places is precise about a number it
 * cannot vouch for.
 *
 * The fix is not to assume every label is wrong at once. That is the classic
 * over-conservative robust model: it would price the week as if the whole shop
 * short-changed the shopper, and nobody would buy that basket. Bertsimas and
 * Sim's budget of uncertainty (Operations Research 52(1), 2004) asks the
 * honest question instead — protect the plan against at most `budget` of the
 * unverified products falling `margin` short, not all of them.
 *
 * Written into the program by their linearisation: one protection variable z
 * per member and nutrient, one p per uncertain product, and
 *
 *     supply - (budget x z + sum p) + short - over = target
 *     z + p_s >= margin x supplied_s x eats_s          for each uncertain s
 *
 * Nothing pushes protection down except that it makes the target harder to
 * meet, and a shortfall costs, so the solver settles at exactly the worst case
 * over any `budget` products and no more.
 *
 * A verified label is not uncertain and gets no p at all, so this rule quietly
 * relaxes itself as the label engine catches up — which is the behaviour you
 * want from a rule about not knowing things.
 */
export const ROBUST = Object.freeze({
  // How far short one pack may fall of what it says. 10% is inside what
  // rounding on a panel can hide, before anyone is accused of anything.
  margin: 0.1,
  // How many may do it at once. Two is a bad batch, not a conspiracy.
  budget: 2,
});

/** A label KOI has read in full is not a guess; anything else is (ROBUST). */
export const isUncertain = (item) => item?.ingredientEvidence !== "verified";

/**
 * What the household wants protected first (plan-model-v11, migration 00054).
 *
 * Every plan trades one thing against another, and until now the trade was
 * KOI's: the budget a ceiling, the targets goals, the tiebreaks deciding the
 * rest. The same basket is right or wrong depending on who is shopping, and
 * how the goals are combined changes the diet that comes out (Gerdessen & de
 * Vries, EJCN 2015), so the order is the household's answer.
 *
 * WHAT EACH ONE MEANS, as something the program can hold:
 *   budget          the rupees the basket comes to
 *   targets         everyone's shortfalls and excesses, weighted
 *   familiar        packs this household already buys (CONTINUITY, repeats)
 *   less_processed  the quality tiebreak: better-screened food
 *   variety         packs beyond the first of any one product
 *
 * HOW AN ORDER BECOMES ARITHMETIC. Each rank multiplies what that goal already
 * costs — four times at the top, a quarter at the bottom. The weights are not
 * separated by orders of magnitude, which is the textbook way to fake a
 * lexicographic solve and the reliable way to wreck a MIP's numerics. The
 * order is made true instead by solving twice (solvePlan.js): the first
 * priority is solved for, then held within LEXICOGRAPHIC.tolerance while the
 * rest are improved underneath it.
 *
 * A household that has said nothing gets multipliers of 1 and no variety term,
 * which is exactly the plan it would have got before this rule existed.
 */
export const PRIORITY = Object.freeze({
  // KOI's own order, and the order unnamed priorities fall into underneath the
  // named ones.
  order: Object.freeze(["targets", "budget", "less_processed", "familiar", "variety"]),
  weightByRank: Object.freeze([4, 2, 1, 0.5, 0.25]),
  // What one pack beyond the first of the same product costs when variety is
  // ranked. Preference-sized at rank 3; four times that at the top.
  varietyPerExtraPack: 0.05,
});

/** How much the first priority may give up so the rest can be improved. */
export const LEXICOGRAPHIC = Object.freeze({ tolerance: 0.05 });

/**
 * An order of priorities as a multiplier for each goal.
 *
 * Named priorities rank first, in the order given; the rest follow in KOI's
 * own order. Nothing named at all means nothing changes.
 *
 * @param {string[]} priorities most important first
 * @returns {{targets:number, budget:number, less_processed:number, familiar:number, variety:number}}
 */
export function priorityWeights(priorities = []) {
  const named = (priorities ?? []).filter((p) => PRIORITY.order.includes(p));
  if (!named.length) return { targets: 1, budget: 1, less_processed: 1, familiar: 1, variety: 0 };
  const ranked = [...new Set([...named, ...PRIORITY.order])];
  const weights = {};
  ranked.forEach((name, i) => {
    weights[name] = PRIORITY.weightByRank[Math.min(i, PRIORITY.weightByRank.length - 1)];
  });
  return weights;
}

/** Is meeting the targets to be protected before the budget is? */
export const targetsBeforeBudget = (priorities = []) => {
  const targets = (priorities ?? []).indexOf("targets");
  const budget = (priorities ?? []).indexOf("budget");
  return targets >= 0 && (budget < 0 || targets < budget);
};

/** Is the budget to be protected before the targets are? (It decides the ladder.) */
export const budgetBeforeTargets = (priorities = []) => {
  const budget = (priorities ?? []).indexOf("budget");
  const targets = (priorities ?? []).indexOf("targets");
  return budget >= 0 && (targets < 0 || budget < targets);
};

/**
 * The kitchen's own rules (plan-model-v10, migration 00052).
 *
 * These are standing facts about a household rather than about this week, and
 * each is the smallest thing that honours what the shopper said:
 *
 *   refused brands    a refusal. Nobody is talked into a brand they will not
 *                     buy, so the product is not in the program at all.
 *   preferred brands  a bonus the size of a preference. It decides between
 *                     products that are otherwise close, and never against a
 *                     target.
 *   spice tolerance   "none" is a refusal for that member, like an avoid;
 *                     "mild" is a cost on their eating it, so KOI reaches for
 *                     it last. The spicy flag is an attribute in the avoid list
 *                     already (config.js) — this puts it on the profile.
 *   the pantry        what is in the house is not bought again.
 *   waste             "none" sizes packs by the normal serving instead of the
 *                     largest one, so a pack is what the household actually
 *                     eats rather than what it could eat at a stretch.
 *   repeats           "low" charges for a pack that was in the last plan;
 *                     "high" pays for it. It is the opposite end of the same
 *                     stick as CONTINUITY, which is about one plan being
 *                     changed rather than the next week being planned.
 */
export const KITCHEN = Object.freeze({
  preferredBrandBonus: 0.05,
  // A shelf that belongs to the kitchen this household leans towards costs a
  // preference less. Never a refusal: the plan doc is explicit that cuisine is
  // soft, and most shelves belong to no kitchen at all, so this decides between
  // a namkeen and a crisp and touches nothing else (00061).
  cuisineBonus: 0.05,
  mildSpiceCost: 0.05,
  repeat: Object.freeze({ low: 0.08, usual: 0, high: -0.08 }),
  wasteNoneUsesServing: true,
});

/** A brand, compared the way a shopper types it. */
export const sameBrand = (a, b) => normaliseBrand(a) !== "" && normaliseBrand(a) === normaliseBrand(b);
// "Grand Sweets & Snacks" and "Grand Sweets and Snacks" are one brand.
const normaliseBrand = (v) => String(v ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
/** Is this product's brand in that list of brand names? */
export const brandIn = (brand, brands = []) => (brands ?? []).some((b) => sameBrand(b, brand));

/** Does this product sit in that category, or under it ("snacks" covers "snacks.namkeen")? */
export const inCategory = (categoryKey, wanted = []) =>
  Boolean(categoryKey) && wanted.some((key) => categoryKey === key || String(categoryKey).startsWith(`${key}.`));

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
export function portionCap(item, member, days, relax = 1, wasteTolerance = "some") {
  const kcalTarget = isNum(member?.targets?.kcal) && Number(member.targets.kcal) > 0 ? Number(member.targets.kcal) : null;
  const appetite = PORTION_RULE.appetiteScale[member?.appetite] ?? 1;
  const portion = item?.portion;
  const packAmount = Number(item?.packAmount);
  if (portion && isNum(portion.max) && packAmount > 0 && portion.unit === item.packUnit) {
    const occasions = occasionsFor(item?.role, member?.mealsFromHome);
    const scale = kcalTarget ? kcalTarget / PORTION_RULE.referenceKcal : 1;
    // A household that wants nothing left over is planned by what it normally
    // eats, not by the most it could (KITCHEN).
    const serving = wasteTolerance === "none" && isNum(portion.amount) ? Number(portion.amount) : Number(portion.max);
    const perDay = occasions * serving * scale * appetite * relax;
    return { packs: round4((perDay * days) / packAmount), basis: "reference_portion", perDay: round1(perDay), unit: portion.unit };
  }
  const kcalPerPack = Number(item?.perPack?.kcal);
  if (kcalPerPack > 0) {
    const perDay = (kcalTarget ?? PORTION_RULE.referenceKcal) * PORTION_RULE.unreferencedEnergyShare * appetite * relax;
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
// Packs of one product beyond the first (PRIORITY, variety). readSolution
// ignores it: it is a way of writing the objective, not part of the answer.
const extraName = (s) => `extra_${s}`;

const colUpper = (columns, name) => columns.find((c) => c.name === name)?.upper ?? 0;

/**
 * The household's first priority, written as something a solution can be
 * measured against and then held (LEXICOGRAPHIC, solvePlan.js).
 *
 * `sense` says which way is better: "min" for money spent, shortfalls, quality
 * cost and repeats of one product; "max" for packs the household already buys.
 * The coefficients are over the program's own columns, so the value of a
 * solution is the dot product of the two, and holding it is one more row.
 *
 * @returns {{name: string, sense: "min"|"max", coefficients: object}|null}
 */
function firstPriorityOf(priorities, { eligible, members, columns, weight, varietyCost }) {
  const first = (priorities ?? []).find((p) => PRIORITY.order.includes(p));
  if (!first) return null;
  const coefficients = {};
  if (first === "budget") {
    for (const item of eligible) coefficients[packsName(item.skuId)] = Number(item.price);
  } else if (first === "targets") {
    for (const m of members) {
      for (const n of NUTRIENTS) {
        const short = columns.find((c) => c.name === shortName(m.id, n));
        const over = columns.find((c) => c.name === overName(m.id, n));
        if (short) coefficients[short.name] = short.cost;
        if (over && over.upper > 0) coefficients[over.name] = over.cost;
      }
    }
  } else if (first === "less_processed") {
    for (const item of eligible) {
      const cost = qualityCost(item.score, QUALITY_TIEBREAK * weight.less_processed);
      if (cost > 0) coefficients[packsName(item.skuId)] = cost;
    }
  } else if (first === "familiar") {
    // Maximised: the packs this household already buys.
    for (const item of eligible) {
      const bonus = columns.find((c) => c.name === packsName(item.skuId));
      if (bonus) coefficients[bonus.name] = 1;
    }
  } else if (first === "variety") {
    if (!(varietyCost > 0)) return null;
    for (const item of eligible) {
      if (columns.some((c) => c.name === extraName(item.skuId))) coefficients[extraName(item.skuId)] = 1;
    }
  }
  if (!Object.keys(coefficients).length) return null;
  return { name: first, sense: first === "familiar" ? "max" : "min", coefficients };
}

/**
 * Why a member cannot eat this product, or null when they can.
 *
 * `contains` is the flag set from extractFacts: allergens, diet flags and the
 * rest. A hard avoid, an age rule (ageSafety.js) or a diet exclusion is a fact
 * about this pairing, not a preference to be scored.
 */
function refusedBy(item, member) {
  const contains = new Set(item.contains ?? []);
  for (const flag of member.avoidFlags ?? []) {
    if (contains.has(flag)) return { member: member.id, flag, rule: "avoided" };
  }
  const forAge = ageRefusal(item, member.ageBand ?? null);
  if (forAge) return { member: member.id, ...forAge };
  for (const flag of member.dietExcludes ?? []) {
    if (contains.has(flag)) return { member: member.id, flag, rule: "diet" };
  }
  // A carbohydrate ceiling (keto, low carb) cannot be kept with a product whose
  // carbohydrate is not declared: "no figure, no claim" again.
  if (isNum(member.carbsMax) && !isNum(item.perPack?.carbs)) {
    return { member: member.id, flag: "carbs_not_declared", rule: "pattern" };
  }
  // Spice they will not eat (v10). "mild" is a cost, not a refusal, and is
  // charged on their eating it rather than kept from them.
  if (member.spiceTolerance === "none" && contains.has("spicy")) {
    return { member: member.id, flag: "spicy", rule: "spice" };
  }
  // Not this week, for them: what they said they don't feel like (v8).
  if (inCategory(item.categoryKey, member.skipCategories ?? [])) {
    return { member: member.id, flag: "not_this_week", rule: "this_week" };
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
 * @param {string[]} [input.keepSkus] the basket a change is changing (CONTINUITY)
 * @param {string[]} [input.refusedBrands] brand names never to plan with
 * @param {string[]} [input.preferredBrands] brand names to lean towards
 * @param {string[]} [input.pantrySkus] already in the house, so not bought again
 * @param {"none"|"some"|"any"} [input.wasteTolerance] how much of a pack may go unfinished
 * @param {"low"|"usual"|"high"} [input.repeatTolerance] how much of the last plan may come back
 * @param {string[]} [input.lastPlanSkus] what the last plan bought, for repeatTolerance
 * @param {string[]} [input.priorities] what to protect first (PRIORITY); empty is KOI's own order
 * @param {string[]} [input.includeSkus] products the shopper asked for: at least one
 *   pack of each, when the plan can have it at all ("add oats", "swap the rice
 *   for atta"). A product nobody in the household may eat cannot be included,
 *   and `excluded` says so rather than the plan quietly ignoring the ask.
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
  includeSkus = [],
  keepSkus = [],
  // The kitchen's own rules (KITCHEN, migration 00052).
  refusedBrands = [],
  preferredBrands = [],
  pantrySkus = [],
  wasteTolerance = "some",
  repeatTolerance = "usual",
  // How processed a household will go, and whether it can keep things cold
  // (KITCHEN, migration 00057).
  processingCeiling = null,
  shelfStableOnly = false,
  // Which kitchen this household leans towards (00061). Null is no leaning.
  cuisineLeaning = null,
  // Protect the targets against a few unverified labels (ROBUST). 0 turns it off.
  robustBudget = ROBUST.budget,
  robustMargin = ROBUST.margin,
  lastPlanSkus = [],
  // What the household wants protected first (PRIORITY, migration 00054).
  priorities = [],
}) {
  // A solution is read back from eats_<sku>_<member>, split at the last "_"
  // (lp.js). Real member ids are uuids; an id with "_" would be read as a
  // different member and silently lose everything they eat.
  const unreadable = members.find((m) => String(m.id).includes("_"));
  if (unreadable) throw new Error(`A member id may not contain "_": ${unreadable.id}`);

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

  const pantry = new Set((pantrySkus ?? []).map(String));
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
    // A brand the household will not buy (KITCHEN). Nobody is talked into it.
    if (brandIn(item.brand, refusedBrands)) {
      excluded.push({ skuId: item.skuId, reason: "brand_refused", brand: item.brand ?? null });
      continue;
    }
    // Already in the house. Buying it again is the waste this is here to stop.
    if (pantry.has(String(item.skuId))) {
      excluded.push({ skuId: item.skuId, reason: "already_in_your_kitchen" });
      continue;
    }
    // More processed than this household buys. Only a product KOI has actually
    // established a group for can break the rule: "KOI has not read the list"
    // is not "it is fine", and the count of those is reported beside the plan
    // so nobody reads this basket as a clean one.
    if (isNum(processingCeiling) && isNum(item.novaGroup) && Number(item.novaGroup) > Number(processingCeiling)) {
      excluded.push({ skuId: item.skuId, reason: "too_processed", novaGroup: Number(item.novaGroup), ceiling: Number(processingCeiling) });
      continue;
    }
    // Needs a fridge, in a house that asked for nothing that does. Again only
    // when the pack actually says so.
    if (shelfStableOnly && item.keepRefrigerated === true) {
      excluded.push({ skuId: item.skuId, reason: "needs_cold_storage" });
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
      refusing.has(m.id) ? { packs: 0, basis: "refused", perDay: 0, unit: null } : portionCap(item, m, days, portionRelax, wasteTolerance),
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

  // What the shopper asked for by name, and what the plan already holds.
  const wanted = new Set((includeSkus ?? []).map(String));
  const keep = new Set((keepSkus ?? []).map(String));
  const lastPlan = new Set((lastPlanSkus ?? []).map(String));
  // What the household wants protected first, as a multiplier on each goal.
  const weight = priorityWeights(priorities);
  const repeatCost = (KITCHEN.repeat[repeatTolerance] ?? 0) * weight.familiar;

  // Only so many products may enter the program (CANDIDATE_RULE) — but never
  // at the cost of the one thing that was asked for by name. Ranking by protein
  // per rupee, a jar of oats loses to the dals, and "add oats" then came back
  // saying KOI could not get any.
  let eligible = allowed;
  if (isNum(candidateLimit) && allowed.length > candidateLimit) {
    const perRupee = (item) => (Number(item.perPack?.protein ?? 0) || 0) / Number(item.price);
    const asked = (item) => wanted.has(String(item.skuId));
    const ranked = [...allowed].sort((a, b) => (asked(b) ? 1 : 0) - (asked(a) ? 1 : 0) || perRupee(b) - perRupee(a) || String(a.skuId).localeCompare(String(b.skuId)));
    eligible = ranked.slice(0, candidateLimit);
    ranked.slice(candidateLimit).forEach((item, i) => {
      excluded.push({ skuId: item.skuId, reason: "not_a_candidate", rule: CANDIDATE_RULE, rank: candidateLimit + i + 1 });
    });
  }

  // At least one pack of it, where it can be had.
  const included = [];
  for (const skuId of wanted) {
    if (eligible.some((item) => String(item.skuId) === skuId)) included.push(skuId);
    else excluded.push({ skuId, reason: "asked_for_but_not_possible" });
  }

  // Packs, and who eats them.
  for (const item of eligible) {
    // Already in the plan: cheaper to keep than to replace (CONTINUITY). A
    // brand the household likes costs a little less, and last week's packs cost
    // what the household said repeats are worth to them (KITCHEN).
    const packCost = qualityCost(item.score, qualityTiebreak * weight.less_processed) + spendTiebreak * weight.budget * Number(item.price)
      - (keep.has(String(item.skuId)) ? continuityBonus(item.price, spendTiebreak) * weight.familiar : 0)
      - (brandIn(item.brand, preferredBrands) ? KITCHEN.preferredBrandBonus : 0)
      - (cuisineLeaning && item.cuisine === cuisineLeaning ? KITCHEN.cuisineBonus : 0)
      + (lastPlan.has(String(item.skuId)) ? repeatCost : 0);
    const caps = portionCaps[item.skuId] ?? {};
    // No more whole packs than the household can eat between them.
    const canEat = Object.values(caps).reduce((sum, cap) => sum + cap.packs, 0);
    const packUpper = members.length ? Math.min(maxPacksPerSku, Math.floor(canEat + 1e-9)) : maxPacksPerSku;
    const askedFor = wanted.has(String(item.skuId)) && packUpper >= 1;
    columns.push({ name: packsName(item.skuId), lower: askedFor ? 1 : 0, upper: packUpper, integer: true, cost: Math.round(packCost * 1e6) / 1e6 });
    const eaten = { name: `eaten_${item.skuId}`, lower: 0, upper: 0, coefficients: { [packsName(item.skuId)]: -1 } };
    for (const m of members) {
      if (!mayEat(item.skuId, m.id)) continue;
      const upper = Math.min(maxPacksPerSku, caps[m.id]?.packs ?? maxPacksPerSku);
      // What they feel like this week costs a little less to give them (PREFERENCE).
      const wanted = inCategory(item.categoryKey, m.preferCategories ?? []);
      // Spicy, for someone who eats mild: reached for last, not kept from them.
      const tooSpicy = m.spiceTolerance === "mild" && (item.contains ?? []).includes("spicy");
      columns.push({
        name: eatsName(item.skuId, m.id),
        lower: 0,
        upper,
        integer: false,
        cost: (wanted ? -PREFERENCE.bonusPerPack : 0) + (tooSpicy ? KITCHEN.mildSpiceCost : 0),
      });
      eaten.coefficients[eatsName(item.skuId, m.id)] = 1;
    }
    rows.push(eaten);
  }

  // Each member's targets, as goals — shaped by their goal (GOAL_MODEL).
  for (const m of members) {
    for (const n of NUTRIENTS) {
      const perDay = m.targets?.[n];
      if (!isNum(perDay)) continue;
      const target = Number(perDay) * days;
      const row = { name: `target_${m.id}_${n}`, lower: target, upper: target, coefficients: {} };
      const uncertain = [];
      for (const item of eligible) {
        const supplied = Number(item.perPack?.[n] ?? 0);
        if (!supplied || !mayEat(item.skuId, m.id)) continue;
        row.coefficients[eatsName(item.skuId, m.id)] = supplied;
        if (isUncertain(item)) uncertain.push({ item, supplied });
      }

      // Hold the target against `robustBudget` of those labels falling short
      // (ROBUST). Nothing pushes the protection down but the cost of a
      // shortfall, so it settles at the worst case over any `robustBudget`
      // products and no further.
      // Never a ceiling. For someone losing weight the energy target is a limit,
      // not a goal, and protection buys *more* of the nutrient so a short label
      // still reaches it — which is precisely how the reference suite caught
      // this: gym_cutting and senior_losing came back over their deficit. A
      // floor can be defended by buying more; a ceiling cannot.
      const isCeiling = n === "kcal" && m.energyGoal === "lose";
      if (!isCeiling && robustBudget > 0 && robustMargin > 0 && uncertain.length) {
        const z = `robustz_${m.id}_${n}`;
        columns.push({ name: z, lower: 0, upper: Infinity, integer: false, cost: 0 });
        row.coefficients[z] = -robustBudget;
        for (const { item, supplied } of uncertain) {
          const pName = `robustp_${m.id}_${n}_${item.skuId}`;
          columns.push({ name: pName, lower: 0, upper: Infinity, integer: false, cost: 0 });
          row.coefficients[pName] = -1;
          rows.push({
            name: `robust_${m.id}_${n}_${item.skuId}`,
            lower: 0,
            upper: Infinity,
            coefficients: { [z]: 1, [pName]: 1, [eatsName(item.skuId, m.id)]: -round4(robustMargin * supplied) },
          });
        }
      }
      const losing = n === "kcal" && m.energyGoal === "lose";
      const gaining = n === "kcal" && m.energyGoal === "gain";
      const shortCost = DEVIATION_COST[n].short * (gaining ? GOAL_MODEL.gainShortfallMultiplier : 1) * weight.targets;
      columns.push({ name: shortName(m.id, n), lower: 0, upper: Infinity, integer: false, cost: shortCost });
      // Losing: the energy target is a ceiling. Nothing over it, ever.
      columns.push({ name: overName(m.id, n), lower: 0, upper: losing ? 0 : Infinity, integer: false, cost: DEVIATION_COST[n].over * weight.targets });
      row.coefficients[shortName(m.id, n)] = 1;
      row.coefficients[overName(m.id, n)] = -1;
      rows.push(row);
    }
    // Keto and low carb: carbohydrate over the plan never passes the ceiling.
    if (isNum(m.carbsMax)) {
      const row = { name: `carbs_ceiling_${m.id}`, lower: -Infinity, upper: Number(m.carbsMax) * days, coefficients: {} };
      for (const item of eligible) {
        const carbs = Number(item.perPack?.carbs ?? 0);
        if (carbs && mayEat(item.skuId, m.id)) row.coefficients[eatsName(item.skuId, m.id)] = carbs;
      }
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
      columns.push({ name: worstName(n), lower: 0, upper: Infinity, integer: false, cost: round4(fairness * DEVIATION_COST[n].short * weight.targets * household) });
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

  // Variety, when the household asked for it: everything past the first pack
  // of a product costs. extra[s] >= packs[s] - 1, and the cost pushes it down
  // to exactly that, so nothing has to be made integer.
  const varietyCost = round4(PRIORITY.varietyPerExtraPack * weight.variety);
  if (varietyCost > 0) {
    for (const item of eligible) {
      const upper = colUpper(columns, packsName(item.skuId));
      if (!(upper > 1)) continue;
      columns.push({ name: extraName(item.skuId), lower: 0, upper: upper - 1, integer: false, cost: varietyCost });
      rows.push({
        name: `variety_${item.skuId}`,
        lower: -Infinity,
        upper: 1,
        coefficients: { [packsName(item.skuId)]: 1, [extraName(item.skuId)]: -1 },
      });
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
    // What the household asked to be protected first, as something that can be
    // measured in a solution and then held (solvePlan.js).
    firstPriority: firstPriorityOf(priorities, { eligible, members, columns, weight, varietyCost }),
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
      // Asked for by name, and in the program (the rest are in `excluded`).
      includedByShopper: included,
      // Kept from the plan this one changes (CONTINUITY).
      keptFromLastPlan: [...keep].filter((id) => eligible.some((item) => String(item.skuId) === id)),
      // What the targets were protected against (ROBUST): this many unverified
      // labels falling this far short, and how many products were uncertain.
      robust: {
        budget: robustBudget,
        margin: robustMargin,
        uncertainProducts: eligible.filter(isUncertain).length,
        ofProducts: eligible.length,
      },
      // The order the household asked for, and what each goal was worth.
      priorities: [...(priorities ?? [])],
      priorityWeights: weight,
      // The kitchen's own rules, as this plan applied them (KITCHEN).
      kitchen: {
        cuisineLeaning: cuisineLeaning ?? null,
        processingCeiling: isNum(processingCeiling) ? Number(processingCeiling) : null,
        // How many products KOI could even apply that ceiling to, counted over
        // everything it looked at rather than everything that survived — the
        // figure must not shrink because the rule worked. A rule that reaches
        // a twelfth of the shop has to say so.
        processingKnownFor: catalogue.filter((item) => isNum(item?.novaGroup)).length,
        processingUnknownFor: catalogue.filter((item) => item?.skuId && !isNum(item?.novaGroup)).length,
        shelfStableOnly: Boolean(shelfStableOnly),
        refusedBrands: [...(refusedBrands ?? [])],
        preferredBrands: [...(preferredBrands ?? [])],
        pantrySkus: [...pantry],
        wasteTolerance,
        repeatTolerance,
      },
      portionRule: PORTION_RULE.version,
      portionRelax,
      portionCaps: Object.fromEntries(eligible.map((i) => [i.skuId, portionCaps[i.skuId] ?? {}])),
      refusals: Object.fromEntries(eligible.filter((i) => refusals[i.skuId]).map((i) => [i.skuId, refusals[i.skuId]])),
      keepOutFlags: [...keptOut],
      ageSafety: AGE_SAFETY_VERSION,
      // Each member's goal as planned (children are always maintain and balanced).
      goals: Object.fromEntries(members.map((m) => [m.id, {
        energyGoal: m.energyGoal ?? "maintain",
        eatingPattern: m.eatingPattern ?? "balanced",
        carbsMax: isNum(m.carbsMax) ? Number(m.carbsMax) : null,
      }])),
      // What each member chose for this plan alone (v8).
      thisWeek: Object.fromEntries(members.map((m) => [m.id, {
        dietType: m.dietType ?? null,
        prefer: m.preferCategories ?? [],
        skip: m.skipCategories ?? [],
        appetite: m.appetite ?? null,
        mealsFromHome: m.mealsFromHome ?? [],
      }])),
      fairness: fairFor.length ? fairness : 0,
      fairnessNutrients: fairFor,
    },
  };
}

/** The names a solution is read back through. */
export const nameOf = Object.freeze({ packs: packsName, eats: eatsName, short: shortName, over: overName, worst: worstName });
