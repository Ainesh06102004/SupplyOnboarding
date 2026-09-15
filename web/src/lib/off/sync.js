// ============================================================================
// KOI — Keep the Open Food Facts staging current, every day
//
// SERVER ONLY. Phase 1.5. Open Food Facts publishes a delta file for each day:
// every product changed that day, worldwide, as gzipped JSON lines (about
// 30 MB, 7,500 products, 4 seconds to stream). This reads the ones not yet
// processed, oldest first, keeps the Indian products (a substring test before
// any JSON is parsed), and upserts them through engine.upsert_off_products,
// which never lets an older version replace a newer one. Each file is recorded
// in engine.off_sync_files once done; one the run had no time for waits for
// the next run.
//
// The first load comes from the full CSV export instead
// (scripts/importOpenFoodFacts.mjs); the deltas only have to keep up.
//
// Only one fixed host is fetched, and only files whose names match the
// published pattern.
// ============================================================================

import "server-only";

import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { engineDb } from "@/lib/engine/pipeline";
import { fromProduct } from "./record";

const DELTA_BASE = "https://static.openfoodfacts.org/data/delta/";
const DELTA_NAME = /^openfoodfacts_products_(\d+)_(\d+)\.json\.gz$/;
const USER_AGENT = "KOI-catalogue/1.0 (https://koinorth.com)";
const MAX_DELTA_BYTES = 250 * 1024 * 1024;
const MAX_LINE_CHARS = 2_000_000;
const BATCH = 200;
const FILE_TIMEOUT_MS = 45_000;

const brief = (err) => String(err?.message || err).slice(0, 200);

async function store(engine, rows) {
  if (!rows.length) return 0;
  const { data, error } = await engine.rpc("upsert_off_products", { p_rows: rows });
  if (error) throw error;
  return data ?? 0;
}

async function ingest(engine, file) {
  const res = await fetch(DELTA_BASE + file, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status} for ${file}.`);
  if (Number(res.headers.get("content-length") || 0) > MAX_DELTA_BYTES) throw new Error(`${file} is larger than a delta should be.`);

  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  const counts = { lines: 0, indian: 0, stored: 0 };
  let batch = [];
  for await (const line of lines) {
    counts.lines += 1;
    if (line.length > MAX_LINE_CHARS || !line.includes("en:india")) continue;
    let doc;
    try {
      doc = JSON.parse(line);
    } catch {
      continue;
    }
    const row = fromProduct(doc, `delta:${file}`);
    if (!row) continue;
    counts.indian += 1;
    batch.push(row);
    if (batch.length >= BATCH) {
      counts.stored += await store(engine, batch);
      batch = [];
    }
  }
  counts.stored += await store(engine, batch);
  return counts;
}

/**
 * @param {{ deadline?: number }} [opts] epoch ms after which no new file is started
 */
export async function syncOpenFoodFacts({ deadline = Date.now() + 30_000 } = {}) {
  const engine = engineDb().schema("engine");

  const res = await fetch(`${DELTA_BASE}index.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status} for the delta index.`);
  const files = (await res.text())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => DELTA_NAME.test(line))
    .sort((a, b) => Number(a.match(DELTA_NAME)[1]) - Number(b.match(DELTA_NAME)[1]));

  const { data: done, error } = await engine.from("off_sync_files").select("file");
  if (error) throw error;
  const processed = new Set(done.map((d) => d.file));

  const report = { deltas: [], waiting: 0 };
  for (const file of files.filter((f) => !processed.has(f))) {
    if (Date.now() > deadline) { report.waiting += 1; continue; }
    try {
      const counts = await ingest(engine, file);
      const { error: logError } = await engine.from("off_sync_files").insert({ file, ...counts });
      if (logError) throw logError;
      report.deltas.push({ file, ...counts });
    } catch (err) {
      report.deltas.push({ file, error: brief(err) });
    }
  }
  return report;
}
