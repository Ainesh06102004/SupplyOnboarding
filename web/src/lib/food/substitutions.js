// ============================================================================
// KOI FOOD — What KOI can offer instead, and why (food.substitution_edge)
//
// Phase 2.5. Pure. The screening pass records what this returns.
//
// An edge says one true thing about a pair of KOI's own products: the nearest
// category, less sugar, more protein, less processed, cheaper per gram of
// protein, or without an allergen the first one lists. Nothing here ranks a
// product as "better": the reasons carry their figures and the storefront
// decides what to say.
//
// Two rules keep the reasons honest:
//
//   A comparative nutrient claim under the FSS (Advertising and Claims)
//   Regulations, 2018 needs the foods compared to be identifiable and the
//   relative difference to be at least 25%. Below that there is no edge,
//   because there would be nothing KOI may put in words. A 1 g per 100 floor
//   keeps 0.1 g against 0.05 g out.
//
//   "Without milk" is a promise about absence, so it needs a complete, current
//   ingredient list on BOTH sides. Without one, no allergen edge exists — the
//   same rule the storefront applies to "no ingredients you avoid".
// ============================================================================

export const RULE_VERSION = "subs-v1";

/** FSSAI's comparative-claim threshold, and a floor against noise. */
export const MEANINGFUL = Object.freeze({ relative: 0.25, absoluteG: 1 });

/** How like-for-like a pair is. Never a verdict on the alternative. */
export const COMPARABILITY = Object.freeze({ sameCategory: 1, sameAisleAndRole: 0.6 });

// Rounded where it is recorded: a per-100 figure converted from a per-serving
// row carries float noise (7.37 g in 23 g is 32.043478...), and a basis that
// may end up on a screen should hold the figure KOI would print.
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const aisleOf = (key) => (key ? String(key).split(".")[0] : null);
const round2 = (v) => Math.round(v * 100) / 100;

/** At least 25% apart, and at least 1 g per 100 apart. */
function meaningfully(lower, higher, { floor = MEANINGFUL.absoluteG } = {}) {
  if (lower === null || higher === null || higher <= 0) return null;
  const diff = higher - lower;
  if (diff < floor) return null;
  if (diff / higher < MEANINGFUL.relative) return null;
  return round2(diff);
}

/**
 * Per 100 g and per 100 ml are not the same measurement, and basis.js never
 * converts between them for want of a density. Two products are comparable on
 * a nutrient only within one unit.
 */
const sameBasis = (from, to) => Boolean(from.per100Unit && from.per100Unit === to.per100Unit);

const humanAllergen = (key) => String(key).replace(/_/g, " ");

const joined = (items) => (items.length < 2
  ? items.join("")
  : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/**
 * The reason in words, for a screen that offers the alternative. Figures only:
 * nothing here says the alternative is better.
 * @param {string} reason
 * @param {object} basis
 * @returns {string|null}
 */
export function describeEdge(reason, basis = {}) {
  switch (reason) {
    case "same_category": return "The same kind of product";
    case "less_sugar": return `${basis.less} g less sugar per ${basis.per}`;
    case "more_protein": return `${basis.more} g more protein per ${basis.per}`;
    case "less_processed": return "Less processed, read from the pack";
    case "cheaper_per_g_protein": return `₹${basis.less} less per gram of protein`;
    case "without_allergen": {
      const without = `Without ${joined((basis.allergens ?? []).map(humanAllergen))}`;
      const adds = (basis.adds ?? []).map(humanAllergen);
      return adds.length ? `${without}, but contains ${joined(adds)}` : without;
    }
    default: return null;
  }
}

/**
 * @param {object} from the product that cannot be bought
 * @param {object} to a candidate replacement
 *   Each: { skuId, categoryKey, role, sugarsPer100, proteinPer100,
 *           rupeesPerGProtein, novaGroup, allergens: string[]|null }
 *   `allergens` is null unless a complete, current list was read.
 * @returns {Array<{from_sku, to_sku, reason, comparability, basis, rule_version}>}
 */
export function edgesBetween(from, to) {
  if (!from?.skuId || !to?.skuId || String(from.skuId) === String(to.skuId)) return [];

  const sameCategory = Boolean(from.categoryKey && from.categoryKey === to.categoryKey);
  const sameAisle = Boolean(aisleOf(from.categoryKey) && aisleOf(from.categoryKey) === aisleOf(to.categoryKey)
    && from.role && from.role === to.role);
  if (!sameCategory && !sameAisle) return [];

  const comparability = sameCategory ? COMPARABILITY.sameCategory : COMPARABILITY.sameAisleAndRole;
  const edge = (reason, basis) => ({
    from_sku: String(from.skuId),
    to_sku: String(to.skuId),
    reason,
    comparability,
    basis,
    rule_version: RULE_VERSION,
  });

  const edges = [];
  if (sameCategory) edges.push(edge("same_category", { category: from.categoryKey }));

  const per = sameBasis(from, to) ? `100 ${from.per100Unit}` : null;
  const lessSugar = per ? meaningfully(num(to.sugarsPer100), num(from.sugarsPer100)) : null;
  if (lessSugar !== null) {
    edges.push(edge("less_sugar", { from: num(from.sugarsPer100), to: num(to.sugarsPer100), less: lessSugar, per }));
  }

  const moreProtein = per ? meaningfully(num(from.proteinPer100), num(to.proteinPer100)) : null;
  if (moreProtein !== null) {
    edges.push(edge("more_protein", { from: num(from.proteinPer100), to: num(to.proteinPer100), more: moreProtein, per }));
  }

  // Price per gram of protein has no natural floor in grams, so only the
  // relative rule applies.
  const cheaper = meaningfully(num(to.rupeesPerGProtein), num(from.rupeesPerGProtein), { floor: 0 });
  if (cheaper !== null) {
    edges.push(edge("cheaper_per_g_protein", { from: num(from.rupeesPerGProtein), to: num(to.rupeesPerGProtein), less: cheaper }));
  }

  const fromGroup = num(from.novaGroup);
  const toGroup = num(to.novaGroup);
  if (fromGroup !== null && toGroup !== null && toGroup < fromGroup) {
    edges.push(edge("less_processed", { from: fromGroup, to: toGroup, scale: "nova" }));
  }

  // Absence needs evidence on both sides. What the alternative ADDS is
  // recorded with it: Chivda is without the cookies' dairy, gluten and soy,
  // and brings tree nuts of its own. Anything offering this edge has to be
  // able to see both halves.
  if (Array.isArray(from.allergens) && Array.isArray(to.allergens)) {
    const avoided = from.allergens.filter((a) => !to.allergens.includes(a)).sort();
    const added = to.allergens.filter((a) => !from.allergens.includes(a)).sort();
    if (avoided.length) edges.push(edge("without_allergen", { allergens: avoided, adds: added }));
  }

  return edges;
}

/**
 * Every edge among a set of products, in both directions.
 * @param {Array<object>} products see edgesBetween
 * @returns {Array<object>} rows for food.substitution_edge
 */
export function buildSubstitutionEdges(products = []) {
  const rows = [];
  for (const from of products) {
    for (const to of products) rows.push(...edgesBetween(from, to));
  }
  return rows;
}
