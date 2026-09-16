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
//   * a SKU any member cannot eat is not in the program at all. An allergen
//     they avoid, or a diet their food must respect, removes the SKU rather
//     than penalising it, and the reason is recorded in `excluded`.
//   * what is bought is what is eaten: sum over members of eats[s][m] equals
//     packs[s]. Nothing is planned into a basket and left uneaten.
//   * budget, when given.
//   * availability, when the caller requires it (see `availability` below).
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

export const MODEL_VERSION = "plan-model-v1";

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

/** The nutrients a target may be set for, and their per-pack field. */
export const NUTRIENTS = Object.freeze(["kcal", "protein", "carbs", "fat"]);

/** A pack cap keeps the search finite; 14 of one product is already odd. */
export const MAX_PACKS_PER_SKU = 14;

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
}) {
  const columns = [];
  const rows = [];
  const excluded = [];

  const allowed = [];
  for (const item of catalogue) {
    if (!item?.skuId) continue;
    const quantifiable = NUTRIENTS.some((n) => isNum(item.perPack?.[n]));
    if (!quantifiable) {
      excluded.push({ skuId: item.skuId, reason: "not_quantifiable" });
      continue;
    }
    if (!isNum(item.price)) {
      excluded.push({ skuId: item.skuId, reason: "no_price" });
      continue;
    }
    if (availability === "require_available" && item.availability !== "available") {
      excluded.push({ skuId: item.skuId, reason: "not_confirmed_available", availability: item.availability ?? "unknown" });
      continue;
    }
    const refusal = members.map((m) => refusedBy(item, m)).find(Boolean);
    if (refusal) {
      excluded.push({ skuId: item.skuId, reason: "refused", ...refusal });
      continue;
    }
    allowed.push(item);
  }

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
    columns.push({ name: packsName(item.skuId), lower: 0, upper: maxPacksPerSku, integer: true, cost: 0 });
    const eaten = { name: `eaten_${item.skuId}`, lower: 0, upper: 0, coefficients: { [packsName(item.skuId)]: -1 } };
    for (const m of members) {
      columns.push({ name: eatsName(item.skuId, m.id), lower: 0, upper: maxPacksPerSku, integer: false, cost: 0 });
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
        if (supplied) row.coefficients[eatsName(item.skuId, m.id)] = supplied;
      }
      columns.push({ name: shortName(m.id, n), lower: 0, upper: Infinity, integer: false, cost: DEVIATION_COST[n].short });
      columns.push({ name: overName(m.id, n), lower: 0, upper: Infinity, integer: false, cost: DEVIATION_COST[n].over });
      row.coefficients[shortName(m.id, n)] = 1;
      row.coefficients[overName(m.id, n)] = -1;
      rows.push(row);
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
    },
  };
}

/** The names a solution is read back through. */
export const nameOf = Object.freeze({ packs: packsName, eats: eatsName, short: shortName, over: overName });
