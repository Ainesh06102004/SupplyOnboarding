// ============================================================================
// Reconcile: what a portioned week actually uses, against what was bought.
// Pure.
//
// The basket was solved in packs before anyone's plate had grams. Once
// portions.js has sized a person's week, this totals it back up:
//
//   shelf      per KOI product (through schedule.js supplierOf): the grams the
//              plates use against that person's share of the basket — short
//              means "the week needs another pack", spare means it doesn't
//   additions  a scoop of whey a day, totalled the same way
//   fresh      everything bought elsewhere (chicken, eggs, vegetables, curd),
//              by food, in grams and in the way a shop sells it
//
// It changes nothing. The cart only moves when the person takes the offer.
// ============================================================================

import { foodOf } from "@/lib/food/foods";
import { kitchenMeasure, gramsText } from "@/lib/food/measures";

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/**
 * @param {object} input
 * @param {object} input.week from buildWeek (supplierOf, and the report's shares via perServing's source)
 * @param {object} input.portions from sizePortions, for one person
 * @param {Array<{skuId, name, amount, unit}>} [input.share] that person's whoEatsWhat allowed lines
 * @param {Array<{skuId, name, packAmount?, packUnit?}>} [input.basket] for pack sizes and names
 * @returns {{ shelf: Array, fresh: Array, short: Array }}
 */
export function reconcileWeek({ week, portions, share = [], basket = [] }) {
  const memberId = String(portions.memberId);
  const shareOf = new Map(share.map((a) => [String(a.skuId), a]));
  const lineOf = new Map(basket.map((b) => [String(b.skuId), b]));
  const shelf = new Map();
  const fresh = new Map();
  const add = (map, key, grams, extra) => {
    const row = map.get(key) ?? { ...extra, grams: 0 };
    row.grams += grams;
    map.set(key, row);
  };

  for (const day of portions.days) {
    for (const item of day.items) {
      if (item.kind === "addition") {
        add(shelf, item.skuId, item.grams, { skuId: item.skuId, name: item.name });
        continue;
      }
      for (const l of item.lines) {
        const sku = l.supply === "shelf" ? week.supplierOf?.(item.dishKey, l.index, memberId) : null;
        if (sku) add(shelf, String(sku), l.grams, { skuId: String(sku), name: lineOf.get(String(sku))?.name ?? shareOf.get(String(sku))?.name ?? "A product" });
        else if (l.supply !== "kitchen") add(fresh, l.food, l.grams, { food: l.food, name: foodOf(l.food)?.name ?? l.food });
      }
    }
  }

  const shelfRows = [...shelf.values()].map((row) => {
    const held = shareOf.get(row.skuId);
    const have = isNum(held?.amount) ? Number(held.amount) : null;
    const pack = lineOf.get(row.skuId)?.packAmount ?? null;
    const shortGrams = have === null ? null : Math.max(0, Math.round(row.grams - have));
    return {
      skuId: row.skuId,
      name: row.name,
      grams: Math.round(row.grams),
      have,
      shortGrams,
      sparePct: have ? Math.round(((have - row.grams) / have) * 100) : null,
      morePacks: shortGrams && isNum(pack) && pack > 0 ? Math.ceil(shortGrams / Number(pack)) : shortGrams ? 1 : 0,
    };
  }).sort((a, b) => b.grams - a.grams);

  const freshRows = [...fresh.values()].map((row) => ({
    food: row.food,
    name: row.name,
    grams: Math.round(row.grams),
    // How a shop sells it: by count where it has one (eggs, lemons), else by weight.
    text: foodOf(row.food)?.pieceIsName ? kitchenMeasure(row.food, row.grams).text : gramsText(row.grams, { liquid: /milk|water/.test(row.food) }),
  })).sort((a, b) => b.grams - a.grams);

  return { shelf: shelfRows, fresh: freshRows, short: shelfRows.filter((r) => r.shortGrams > 0) };
}
