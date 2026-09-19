// ============================================================================
// KOI FOOD — Which aisle a product belongs to, and what a realistic serving is
//
// Phase 2.3. Answers from the category tree (food.taxonomy_node,
// food.taxonomy_term, food.portion_norm), compiled into ./taxonomyData.js by
// scripts/buildTaxonomy.mjs, so the storefront and the screening job place a
// product in the same category.
//
// A brand's own category is typed free text ("Healthy Snacks", "Farm Foods",
// "protein_powder"). The storefront used to print it as the aisle, which put
// the word "healthy", a claim FSSAI prohibits, on the shelf. The aisle now
// comes from the tree, and the brand's text is only a fallback for finding it.
//
// How a product is placed:
//   1. Its name, without the variant after a dash ("Moringa Jowar Crispies -
//      Indian Masala" is read as "Moringa Jowar Crispies").
//   2. Failing that, the brand's second-level category; then its first.
// In each, the known name that ENDS LAST wins, because in an English product
// name the head noun comes last: "Chocolate Biscuits" is biscuits, "Ragi Hot
// Chocolate Milk Mix" is a drink mix. Ties go to the longer name.
//
// Each name has a kind (migration 00039), because flavours come last too:
//   form        the product itself ("biscuit", "muesli", "tea"). Any form in
//               the name beats every ingredient: "Muesli Cranberry" is muesli.
//   ingredient  often only a flavour ("chocolate", "honey", "almond"). Places a
//               product only when its name has no form, and never when a
//               flavour word follows it: "Kool Badam Flavour" is not nuts.
//   marker      a flavour word ("flavour", "flv").
//   ignore      looks like a category and is not ("sugar free", "hair oil").
// Measured against Open Food Facts by scripts/checkTaxonomy.mjs.
//
// Pure.
// ============================================================================

import { buildIndex, scan } from "./phrases";
import { NODES, TERMS, PORTIONS, OCCASIONS, TAXONOMY_VERSION } from "./taxonomyData";

export { NODES, PORTIONS, TAXONOMY_VERSION };

/**
 * The meal occasions a category serves (the storefront's MEALS keys), from
 * food.category_occasion. A category without its own takes its aisle's.
 * Since Phase 2.4 this replaces MEAL_MATCH's substring lists.
 * @param {string|null} key
 * @returns {string[]}
 */
export function occasionsOf(key) {
  if (!key) return [];
  return OCCASIONS[key] ?? OCCASIONS[key.split(".")[0]] ?? [];
}

/** @param {string|null} key @param {string} occasion @returns {boolean} */
export const servesOccasion = (key, occasion) => occasionsOf(key).includes(occasion);

const INDEX = buildIndex(TERMS.map(([term, key, kind]) => [term, { key, term, kind }]));

// The variant follows a spaced dash, bar or colon.
const VARIANT = /\s[-–—|:]\s/;

const later = (a, b) => a.end > b.end || (a.end === b.end && a.end - a.start > b.end - b.start);

function headOf(text) {
  const hits = scan(text, INDEX);
  const markers = hits.filter((h) => h.kind === "marker");
  const flavoured = (h) => markers.some((m) => m.piece === h.piece && m.start >= h.end);
  const forms = hits.filter((h) => h.kind === "form");
  const pool = forms.length ? forms : hits.filter((h) => h.kind === "ingredient" && !flavoured(h));
  let best = null;
  for (const hit of pool) if (!best || later(hit, best)) best = hit;
  return best;
}

/**
 * @param {string} key a node key, e.g. "snacks.biscuits_cookies"
 * @returns {object|null} the node with its aisle and reference portion
 */
export function nodeInfo(key) {
  const node = NODES[key];
  if (!node) return null;
  const aisleKey = key.split(".")[0];
  return {
    key,
    label: node.label,
    aisleKey,
    aisle: NODES[aisleKey]?.label ?? node.label,
    subcategory: key === aisleKey ? null : node.label,
    // What it is in a meal (snack, meal_base, drink...), set on aisles.
    role: node.role ?? NODES[aisleKey]?.role ?? null,
    // Tier 2 (00061). Facts about the shelf, not the pack: rice needs cooking
    // whoever sells it. `cuisine` is null wherever a shelf belongs to no one
    // kitchen, which is most of a staples aisle — rice and dal are food, not
    // Indian food — and it is a soft preference that can never refuse a
    // product.
    form: node.form ?? NODES[aisleKey]?.form ?? null,
    lunchbox: node.box ?? NODES[aisleKey]?.box ?? null,
    cuisine: node.cuisine ?? NODES[aisleKey]?.cuisine ?? null,
    occasions: occasionsOf(key),
    // { amount, unit, max, measure } or null: 21 CFR 101.12 reference amounts,
    // recorded only where one exists for the category.
    portion: PORTIONS[key] ?? null,
  };
}

/**
 * @param {{ name?: string, categoryL2?: string|null, categoryL1?: string|null }} product
 * @returns {object|null} nodeInfo plus `matchedOn` (name | category_l2 |
 *   category_l1), the `term` that placed it and the tree's `version`; null when
 *   nothing names a category KOI knows
 */
export function categorise({ name, categoryL2, categoryL1 } = {}) {
  const fields = [
    ["name", String(name ?? "").split(VARIANT)[0]],
    ["category_l2", categoryL2],
    ["category_l1", categoryL1],
  ];
  for (const [matchedOn, text] of fields) {
    if (!text) continue;
    const hit = headOf(text);
    if (hit) return { ...nodeInfo(hit.key), matchedOn, term: hit.term, version: TAXONOMY_VERSION };
  }
  return null;
}
