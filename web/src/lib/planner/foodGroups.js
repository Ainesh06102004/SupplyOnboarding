// ============================================================================
// KOI PLANNER — What a basket covers, and what KOI cannot sell you (C6)
//
// Plan §9.10.4 (C6): coverage of ICMR-NIN's "My Plate for the Day", and a plain
// line when KOI cannot supply a group.
//
// THE HONEST PART FIRST. KOI sells packaged groceries. Of the eight food groups
// on the plate, it has no aisle at all for three of them — milk and milk
// products, vegetables, and flesh foods and eggs — and only dried fruit for a
// fourth. So the line about what KOI cannot supply is not an edge case here,
// it is the main finding, and it is written that way: a shopper meeting every
// macro target out of packets is not eating a balanced week, and KOI is the
// only one in a position to say so.
//
// That is why the two kinds of gap are never merged:
//
//   missing        a group KOI stocks and this basket happens not to have.
//                  The shopper can fix it by asking for it.
//   cannot supply  a group KOI does not sell. Nothing the shopper does to this
//                  plan will fix it, so telling them to "add vegetables" would
//                  be sending them round a shop that has none. The line names
//                  it and sends them elsewhere.
//
// A group is counted as covered when the basket actually contains a product in
// it — not when a product could have been bought, and not by weight, which the
// plate does specify but which KOI cannot honestly check against a basket meant
// to last a week and be eaten by several people in unequal shares.
// ============================================================================

import { nodeInfo } from "@/lib/food/taxonomy";

/** The reference this is checked against, recorded with every plan. */
export const FOOD_GROUPS_VERSION = "icmr-nin-my-plate-2024";

/**
 * The eight groups on the plate, each with the KOI categories that serve it.
 *
 * `koiSells` is false where KOI has no aisle for the group at all. It is a fact
 * about the shop, not about the shopper, and it is what separates "your basket
 * is missing this" from "you will not find this here".
 */
export const FOOD_GROUPS = Object.freeze([
  {
    key: "cereals",
    label: "Cereals & millets",
    koiSells: true,
    categories: ["staples.rice", "staples.flours", "staples.millets", "staples.breakfast_cereals"],
  },
  {
    key: "pulses",
    label: "Pulses & legumes",
    koiSells: true,
    categories: ["staples.pulses", "supplements.protein_powder"],
  },
  {
    key: "nuts_oilseeds",
    label: "Nuts & oilseeds",
    koiSells: true,
    categories: ["nuts_seeds.nuts", "nuts_seeds.seeds", "nuts_seeds.nut_butters", "nuts_seeds.mixes"],
  },
  {
    key: "fats_oils",
    label: "Fats & oils",
    koiSells: true,
    categories: ["fats_oils.oils", "fats_oils.ghee"],
  },
  {
    key: "fruits",
    label: "Fruit",
    koiSells: true,
    // Dried only. The plate means fresh, so a basket that covers this from a
    // packet is told as much.
    categories: ["nuts_seeds.dried_fruit"],
    onlyAs: "dried",
  },
  { key: "vegetables", label: "Vegetables", koiSells: false, categories: [] },
  { key: "milk", label: "Milk & milk products", koiSells: false, categories: [] },
  { key: "flesh_eggs", label: "Eggs, fish & meat", koiSells: false, categories: [] },
]);

const BY_CATEGORY = new Map();
for (const group of FOOD_GROUPS) {
  for (const category of group.categories) BY_CATEGORY.set(category, group.key);
}

/**
 * Which group a product's category serves, or null.
 *
 * A category under another ("staples.rice" under "staples") answers for its
 * parent's group only when the parent is mapped, which it deliberately is not:
 * "staples" alone says nothing about whether something is a cereal or a pulse.
 */
export function groupOf(categoryKey) {
  if (!categoryKey) return null;
  const key = String(categoryKey);
  if (BY_CATEGORY.has(key)) return BY_CATEGORY.get(key);
  // A deeper key still answers to the category it sits under.
  const parent = [...BY_CATEGORY.keys()].find((mapped) => key.startsWith(`${mapped}.`));
  return parent ? BY_CATEGORY.get(parent) : null;
}

/**
 * What this basket covers of the plate.
 *
 * @param {Array} basket report.basket
 * @param {Array} catalogue the plannable catalogue, for each line's category
 * @returns {{covered: Array, missing: Array, cannotSupply: Array, version: string}}
 */
export function coverageOf(basket = [], catalogue = []) {
  const categoryOf = new Map(catalogue.map((item) => [String(item.skuId), item.categoryKey ?? null]));
  const found = new Set();
  for (const line of basket) {
    const group = groupOf(categoryOf.get(String(line.skuId)));
    if (group) found.add(group);
  }

  const covered = [];
  const missing = [];
  const cannotSupply = [];
  for (const group of FOOD_GROUPS) {
    const entry = { key: group.key, label: group.label, ...(group.onlyAs ? { onlyAs: group.onlyAs } : {}) };
    if (!group.koiSells) cannotSupply.push(entry);
    else if (found.has(group.key)) covered.push(entry);
    else missing.push(entry);
  }
  return { covered, missing, cannotSupply, of: FOOD_GROUPS.length, version: FOOD_GROUPS_VERSION };
}

/**
 * The coverage in one sentence, for a shopper rather than a report.
 *
 * It never says "add vegetables" for a group KOI does not stock: that would be
 * sending someone round a shop with no vegetable aisle.
 */
export function coverageWords(coverage) {
  const { covered, missing, cannotSupply, of } = coverage;
  const parts = [`Covers ${covered.length} of the ${of} food groups on ICMR-NIN's plate`];
  if (missing.length) parts.push(`KOI stocks ${missing.map((g) => g.label.toLowerCase()).join(" and ")} — ask for them and the next plan will have them`);
  if (cannotSupply.length) parts.push(`${cannotSupply.map((g) => g.label.toLowerCase()).join(", ")} are not things KOI sells: buy them fresh`);
  return `${parts.join(". ")}.`;
}
