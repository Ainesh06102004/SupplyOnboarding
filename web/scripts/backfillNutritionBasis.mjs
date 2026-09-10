// ============================================================================
// KOI - Backfill the normalized nutrition columns
//
// `sku_nutrition` declares twelve normalized columns (`*_per_100g`,
// `*_per_serving`) plus `servings_per_pack`, and every one of them was NULL on
// every row. The raw label columns were fully populated, so the information was
// there the whole time - only the comparable form of it was missing. That gap
// is why resolveIntent.js excludes per-serving products from numeric macro
// search instead of converting them, and why a "high protein" query silently
// compared a per-serving row against per-100g ones.
//
// This computes nothing new. Every value here is deterministic arithmetic over
// a label-declared figure and its declared basis, which is why re-running is
// safe and why `manually_verified` and `is_ai_extracted` are left alone: no
// human checked these, and no model produced them.
//
// It imports the SAME conversion the storefront uses rather than restating the
// arithmetic, so the stored numbers and the rendered ones cannot drift apart.
// That import is what the `--import ./scripts/testAlias.mjs` below is for: the
// hooks resolve `@/` and mark files under src/ as ESM. They are named for the
// test command because that is where they started, not because they are
// test-only.
//
// On not using @supabase/supabase-js, which the sibling scripts do use: its
// current version builds a RealtimeClient in the constructor and that needs a
// native WebSocket, so it throws on Node 20 (this machine runs v20.12.2). This
// script talks to PostgREST over fetch instead - no dependency, no Node version
// floor, and the two calls it needs are a select and a patch.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local \
//     scripts/backfillNutritionBasis.mjs --dry-run
//   node --import ./scripts/testAlias.mjs --env-file=.env.local \
//     scripts/backfillNutritionBasis.mjs
//
// Needs SUPABASE_SERVICE_ROLE_KEY: migration 00012 revokes INSERT and UPDATE on
// sku_nutrition from anon and authenticated.
// ============================================================================

import { toPer100, toPerServing, servingsPerPack } from "@/lib/nutrition/basis.js";

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Run with --env-file=.env.local from the web/ directory.",
  );
  process.exit(1);
}

const REST = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

/** GET, or throw with the body PostgREST actually returned. */
async function selectRows(path) {
  const res = await fetch(`${REST}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

/** PATCH one row by id. Returns an error string, or null on success. */
async function patchRow(table, id, body) {
  const res = await fetch(`${REST}/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return res.ok ? null : `${res.status} ${await res.text()}`;
}

// Module field name -> the pair of columns it fills.
const COLUMN_MAP = [
  ["energy_kcal", "kcal_per_100g", "kcal_per_serving"],
  ["protein_g", "protein_per_100g", "protein_per_serving"],
  ["carbs_g", "carbs_per_100g", "carbs_per_serving"],
  ["sugars_g", "sugars_per_100g", "sugars_per_serving"],
  ["fibre_g", "fibre_per_100g", "fibre_per_serving"],
  ["total_fat_g", "fat_per_100g", "fat_per_serving"],
];

/** The columns are NUMERIC(8,2); round here so stored and compared agree. */
const round2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
/** servings_per_pack is NUMERIC(6,1). */
const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

/** What this row's normalized columns should hold, given what it declares. */
function computeUpdate(row) {
  const per100 = toPer100(row);
  const perServing = toPerServing(row);

  const update = {};
  for (const [field, col100, colServing] of COLUMN_MAP) {
    update[col100] = round2(per100[field]);
    update[colServing] = round2(perServing[field]);
  }
  update.servings_per_pack = round1(servingsPerPack(row.skus?.net_weight, row.serving_size));
  return update;
}

/** Columns whose stored value differs from what we just computed. */
function changedColumns(row, update) {
  return Object.keys(update).filter((col) => {
    const before = row[col] === null || row[col] === undefined ? null : Number(row[col]);
    const after = update[col];
    if (before === null && after === null) return false;
    if (before === null || after === null) return true;
    return Math.abs(before - after) > 1e-9;
  });
}

async function main() {
  console.log(DRY_RUN ? "DRY RUN - nothing will be written.\n" : "Backfilling sku_nutrition...\n");

  const rows = await selectRows(
    "sku_nutrition?select=*,skus(sku_code,net_weight,products(product_name))",
  );

  let written = 0;
  let unchanged = 0;
  let incomplete = 0;
  let failed = 0;

  for (const row of rows) {
    const name = row.skus?.products?.product_name ?? row.skus?.sku_code ?? row.id;
    const update = computeUpdate(row);
    const changed = changedColumns(row, update);

    // A row we cannot fully normalise is worth naming rather than passing over
    // silently - it means a basis or a serving size needs a human.
    const stillNull = Object.entries(update).filter(([, v]) => v === null).map(([c]) => c);
    if (stillNull.length > 0) incomplete += 1;

    if (changed.length === 0) {
      unchanged += 1;
      console.log(`  = ${name} - already correct`);
      continue;
    }

    console.log(
      `  ${DRY_RUN ? "~" : "+"} ${name} (${row.measurement_basis ?? "no basis"}, ` +
      `serving ${row.serving_size ?? "?"})\n` +
      `      protein ${row.protein_g ?? "-"} -> ${update.protein_per_100g ?? "-"}/100, ` +
      `${update.protein_per_serving ?? "-"}/serving   ` +
      `kcal -> ${update.kcal_per_100g ?? "-"}/100   ` +
      `servings/pack ${update.servings_per_pack ?? "-"}` +
      (stillNull.length > 0 ? `\n      unresolved: ${stillNull.join(", ")}` : ""),
    );

    if (DRY_RUN) continue;

    const writeError = await patchRow("sku_nutrition", row.id, update);
    if (writeError) {
      failed += 1;
      console.error(`      FAILED: ${writeError}`);
    } else {
      written += 1;
    }
  }

  console.log(
    `\n${rows.length} rows: ` +
    `${DRY_RUN ? `${rows.length - unchanged} would change` : `${written} written`}` +
    `, ${unchanged} already correct` +
    (incomplete > 0 ? `, ${incomplete} could not be fully normalised` : "") +
    (failed > 0 ? `, ${failed} FAILED` : ""),
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
