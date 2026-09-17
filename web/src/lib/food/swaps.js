// ============================================================================
// KOI FOOD — Swaps with numbers
//
// Phase 5.1. Pure. "Same shelf · 40% less sugar per 100 g · ₹10 more a pack":
// what a shopper looking at one product could have instead, said only in the
// figures behind a recorded edge (food.substitution_edge, Phase 2.5).
//
// The rules the edges already keep hold here too. A nutrient difference is
// only an edge at 25% or more — the comparative-claim threshold in the FSS
// (Advertising and Claims) Regulations, 2018 — so every percentage shown is at
// least that. "Without milk" needs a complete list on both sides, and says
// what the alternative adds. And nothing is called healthier or better: the
// shopper reads the figures and decides.
//
// Price is compared like for like. Two packs of different sizes are compared
// per 100 g (or ml), because "₹10 more" for twice the food is not ₹10 more.
// ============================================================================

import { parseAmount } from "@/lib/nutrition/basis";
import { describeEdge } from "./substitutions";

export const MAX_SWAPS = 3;

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** A difference in words, from an edge's recorded basis. null when it is not a difference. */
export function swapFact({ reason, basis = {} }) {
  switch (reason) {
    case "less_sugar": {
      const p = pct(basis.less, basis.from);
      return p !== null ? `${p}% less sugar per ${basis.per}` : describeEdge(reason, basis);
    }
    case "more_protein": {
      const p = pct(basis.more, basis.from);
      return p !== null ? `${p}% more protein per ${basis.per}` : describeEdge(reason, basis);
    }
    case "cheaper_per_g_protein": {
      const p = pct(basis.less, basis.from);
      return p !== null ? `${p}% less per gram of protein` : describeEdge(reason, basis);
    }
    case "less_processed":
    case "without_allergen":
      return describeEdge(reason, basis);
    default:
      return null;
  }
}

const rupees = (n) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

/**
 * The alternative's price against this product's, like for like.
 * @returns {string|null} "₹10 more a pack", "₹4 less per 100 g", "Same price a pack"
 */
export function priceDifference(from, to) {
  const fromPrice = Number(from?.price);
  const toPrice = Number(to?.price);
  if (!(fromPrice > 0) || !(toPrice > 0)) return null;
  const fromPack = parseAmount(from.weight);
  const toPack = parseAmount(to.weight);
  const samePack = fromPack && toPack && fromPack.unit === toPack.unit && fromPack.value === toPack.value;
  if (samePack || !fromPack || !toPack || fromPack.unit !== toPack.unit) {
    if (!samePack && (!fromPack || !toPack || fromPack.unit !== toPack.unit)) return null;
    const diff = toPrice - fromPrice;
    return Math.round(diff) === 0 ? "Same price a pack" : `${rupees(diff)} ${diff > 0 ? "more" : "less"} a pack`;
  }
  const diff = (100 * toPrice) / toPack.value - (100 * fromPrice) / fromPack.value;
  return Math.round(diff) === 0
    ? `Same price per 100 ${toPack.unit}`
    : `${rupees(diff)} ${diff > 0 ? "more" : "less"} per 100 ${toPack.unit}`;
}

/**
 * Swaps for one product.
 *
 * @param {object} input
 * @param {object} input.product the storefront product on screen (skuId, price, weight)
 * @param {Array<{to_sku, reason, comparability, basis}>} input.edges edges FROM its SKU
 * @param {Array<object>} input.catalogue storefront products (skuId, id, name, brand, price, weight)
 * @param {number} [input.max]
 * @returns {Array<{ id, skuId, name, brand, shelf, facts: string[], price: string|null }>}
 */
export function swapsFor({ product, edges = [], catalogue = [], max = MAX_SWAPS }) {
  if (!product?.skuId) return [];
  const bySku = new Map(catalogue.map((p) => [String(p.skuId), p]));
  const byTarget = new Map();
  for (const edge of edges) {
    const target = bySku.get(String(edge.to_sku));
    if (!target || String(edge.to_sku) === String(product.skuId)) continue;
    const entry = byTarget.get(target.skuId) ?? { target, comparability: 0, facts: [] };
    entry.comparability = Math.max(entry.comparability, Number(edge.comparability) || 0);
    const fact = swapFact(edge);
    if (fact && !entry.facts.includes(fact)) entry.facts.push(fact);
    byTarget.set(target.skuId, entry);
  }
  return [...byTarget.values()]
    // Being on the same shelf is not a reason on its own: a swap has a figure to show.
    .filter((entry) => entry.facts.length > 0)
    .sort((a, b) => b.comparability - a.comparability || b.facts.length - a.facts.length || Number(a.target.price) - Number(b.target.price))
    .slice(0, max)
    .map(({ target, comparability, facts }) => ({
      id: target.id,
      skuId: target.skuId,
      name: target.name,
      brand: target.brand ?? null,
      shelf: comparability >= 1 ? "Same shelf" : "Nearby shelf",
      facts,
      price: priceDifference(product, target),
    }));
}
