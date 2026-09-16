// ============================================================================
// KOI - How often KOI's processing group agrees with Open Food Facts'
//
// Phase 2.4. Reads every staged Indian Open Food Facts product that has both
// an ingredient list and a NOVA group (engine.off_products), classifies the
// list with lib/food/processing.js, and compares. Internal measurement only:
// nothing from Open Food Facts is written or shown.
//
// Open Food Facts assigns NOVA by its own marker lists, so this measures how
// closely KOI's reading of the same published definition matches theirs, not
// ground truth.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/checkNova.mjs
// ============================================================================

import { processingOf } from "@/lib/food/processing.js";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${BASE}/rest/v1/off_products?select=product_name,ingredients_text,nova_group&nova_group=not.is.null&ingredients_text=not.is.null`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "engine", Range: `${from}-${from + 999}` },
  });
  if (!res.ok) throw new Error(`engine.off_products -> ${res.status}`);
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

const matrix = {};
const misses = {};
let counted = 0;
let same = 0;
for (const r of rows) {
  if (!r.ingredients_text?.trim()) continue;
  const theirs = r.nova_group;
  const ours = processingOf(r.ingredients_text).group ?? "none";
  counted += 1;
  if (ours === theirs) same += 1;
  matrix[theirs] ??= {};
  matrix[theirs][ours] = (matrix[theirs][ours] ?? 0) + 1;
  if (ours !== theirs) {
    const pair = `OFF ${theirs} -> KOI ${ours}`;
    misses[pair] ??= [];
    if (misses[pair].length < 4) misses[pair].push(`${r.product_name ?? "?"}: ${r.ingredients_text.slice(0, 110)}`);
  }
}

console.log(`Products with an ingredient list and a NOVA group: ${counted}`);
console.log(`Same group: ${same} (${((100 * same) / counted).toFixed(1)}%)`);
console.log("\nRows: Open Food Facts' group. Columns: KOI's.");
const cols = [1, 2, 3, 4, "none"];
console.log(`       ${cols.map((c) => String(c).padStart(6)).join("")}`);
for (const g of [1, 2, 3, 4]) {
  console.log(`  ${g}    ${cols.map((c) => String(matrix[g]?.[c] ?? 0).padStart(6)).join("")}`);
}
for (const g of [1, 2, 3, 4]) {
  const row = matrix[g] ?? {};
  const total = Object.values(row).reduce((a, b) => a + b, 0);
  const predicted = Object.values(matrix).reduce((a, m) => a + (m[g] ?? 0), 0);
  console.log(`  group ${g}: recall ${total ? ((100 * (row[g] ?? 0)) / total).toFixed(1) : "n/a"}%, precision ${predicted ? ((100 * (row[g] ?? 0)) / predicted).toFixed(1) : "n/a"}%`);
}
console.log("\nExamples of disagreement:");
for (const [pair, list] of Object.entries(misses).sort()) {
  console.log(`  ${pair}`);
  for (const line of list) console.log(`    ${line}`);
}
