// ============================================================================
// KOI - Load India's products from the Open Food Facts CSV export, once
//
// Phase 1.5. The daily sync (/api/engine/off-sync) only reads each day's
// changes, so the first load comes from the full export: about 1.3 GB
// gzipped, rebuilt by Open Food Facts every day. This streams it, keeps the
// lines that mention India (a substring test before any line is split),
// normalises each with lib/off/record.js, and upserts in batches through
// engine.upsert_off_products — which never lets an older version replace a
// newer one, so running it again later is safe.
//
// Staging only. Nothing loaded here reaches the storefront or KOI's own tables.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/importOpenFoodFacts.mjs --dry-run --limit=50
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/importOpenFoodFacts.mjs
// ============================================================================

import zlib from "node:zlib";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fromCsv } from "@/lib/off/record.js";

const EXPORT_URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";
const USER_AGENT = "KOI-catalogue/1.0 (https://koinorth.com)";
const BATCH = 500;

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

async function upsert(rows) {
  if (DRY_RUN || !rows.length) return rows.length;
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/upsert_off_products`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "engine",
    },
    body: JSON.stringify({ p_rows: rows }),
  });
  if (!res.ok) throw new Error(`upsert_off_products -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return Number(await res.json()) || 0;
}

const started = Date.now();
const res = await fetch(EXPORT_URL, { headers: { "User-Agent": USER_AGENT } });
if (!res.ok) throw new Error(`Open Food Facts answered ${res.status} for the export.`);
console.log(`Export: ${Math.round(Number(res.headers.get("content-length")) / 1e6)} MB, built ${res.headers.get("last-modified")}`);

const lines = readline.createInterface({ input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
let columns = null;
let seen = 0;
let indian = 0;
let stored = 0;
let batch = [];

for await (const line of lines) {
  if (!columns) {
    columns = new Map(line.split("\t").map((name, i) => [name, i]));
    for (const needed of ["code", "countries_tags", "last_modified_t", "product_name"]) {
      if (!columns.has(needed)) throw new Error(`The export has no "${needed}" column; its format has changed.`);
    }
    continue;
  }
  seen += 1;
  if (seen % 500_000 === 0) console.log(`  ${seen.toLocaleString()} lines, ${indian.toLocaleString()} Indian, ${Math.round((Date.now() - started) / 1000)} s`);
  if (!line.includes("en:india")) continue;

  const row = fromCsv(columns, line.split("\t"), "csv_export");
  if (!row) continue;
  indian += 1;
  batch.push(row);
  if (batch.length >= BATCH) {
    stored += await upsert(batch);
    batch = [];
  }
  if (indian >= LIMIT) break;
}
stored += await upsert(batch);

console.log(`${DRY_RUN ? "DRY RUN - nothing written. " : ""}${seen.toLocaleString()} lines read, ${indian.toLocaleString()} Indian products, ${stored.toLocaleString()} ${DRY_RUN ? "would be stored" : "stored"}, ${Math.round((Date.now() - started) / 1000)} s.`);
process.exit(0);
