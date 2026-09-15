// ============================================================================
// KOI - How often the category classifier agrees with Open Food Facts
//
// Phase 2.3. Classifies the name of every staged Indian Open Food Facts
// product (engine.off_products) and compares the answer with the category
// that product's own tags map to through food.taxonomy_node.off_categories.
// Internal measurement only: nothing from Open Food Facts is written or shown.
//
// A product counts when its tags point at exactly one KOI category. Reports:
//   same category   the classifier's category is that one
//   same aisle      a different category in the same aisle (or the aisle itself)
//   other aisle     a different aisle
//   unplaced        the name named no category KOI knows
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/checkTaxonomy.mjs
// ============================================================================

import { categorise } from "@/lib/food/taxonomy.js";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

async function readAll(profile, table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${BASE}/rest/v1/${table}?select=${select}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": profile, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${profile}.${table} -> ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const [nodes, products] = await Promise.all([
  readAll("food", "taxonomy_node", "key,off_categories"),
  readAll("engine", "off_products", "product_name,categories_tags"),
]);

const byTag = new Map();
for (const n of nodes) for (const tag of n.off_categories) byTag.set(tag, [...(byTag.get(tag) ?? []), n.key]);

// The most specific KOI category a product's tags name, or null when they name
// two that are not one inside the other.
function expectedFor(tags) {
  const keys = [...new Set((tags ?? []).flatMap((t) => byTag.get(t) ?? []))];
  if (!keys.length) return null;
  const deepest = keys.filter((k) => !keys.some((o) => o !== k && o.startsWith(`${k}.`)));
  return deepest.length === 1 ? deepest[0] : null;
}

const aisle = (key) => key.split(".")[0];
const tally = { same: 0, sameAisle: 0, otherAisle: 0, unplaced: 0 };
const misses = new Map();

for (const p of products) {
  if (!p.product_name) continue;
  const expected = expectedFor(p.categories_tags);
  if (!expected) continue;
  const got = categorise({ name: p.product_name });
  if (!got) tally.unplaced += 1;
  else if (got.key === expected) tally.same += 1;
  // One is the aisle and the other a category in it, or two categories in one aisle.
  else if (aisle(got.key) === aisle(expected)) tally.sameAisle += 1;
  else {
    tally.otherAisle += 1;
    const pair = `${expected} -> ${got.key}`;
    misses.set(pair, [...(misses.get(pair) ?? []), p.product_name].slice(0, 3));
  }
}

const counted = tally.same + tally.sameAisle + tally.otherAisle + tally.unplaced;
const placed = counted - tally.unplaced;
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
console.log(`Open Food Facts products with one KOI category: ${counted}`);
console.log(`  placed by name:   ${placed} (${pct(placed, counted)})`);
console.log(`  same category:    ${tally.same} (${pct(tally.same, placed)} of placed)`);
console.log(`  same aisle:       ${tally.sameAisle} (${pct(tally.sameAisle, placed)} of placed)`);
console.log(`  other aisle:      ${tally.otherAisle} (${pct(tally.otherAisle, placed)} of placed)`);
console.log(`  unplaced:         ${tally.unplaced}`);
const worst = [...misses.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25);
if (worst.length) {
  console.log("\nOther-aisle examples:");
  for (const [pair, names] of worst) console.log(`  ${pair}: ${names.join(" | ")}`);
}
