// Step 4 — copy every listing image into the private amazon-products bucket
// and say what each one shows (front of pack / nutrition table / ingredients).
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/amazon/images.mjs [--no-classify]
// Bytes are cached on disk; identical images (variants share photos) are
// classified once, by sha256.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as cache from "./cache.mjs";
import { pool, withRateLimit } from "./oxylabs.mjs";
import { selectAll, upsert, update, uploadObject } from "./db.mjs";

const BUCKET = "amazon-products";
const IMG_DIR = join(cache.CACHE, "images");
const classify = !process.argv.includes("--no-classify");

const listings = new Map((await selectAll("listing", "select=asin,is_protein_bar")).map((l) => [l.asin, l]));
const wanted = [];
for (const p of cache.all("product")) {
  if (!listings.get(p.asin)?.is_protein_bar) continue;
  const c = p.content || {};
  (c.images || []).forEach((url, i) => wanted.push({ asin: p.asin, role: "gallery", position: i + 1, amazon_url: url }));
  (c.description_images || []).forEach((url, i) => wanted.push({ asin: p.asin, role: "description", position: i + 1, amazon_url: url }));
}
const have = new Map((await selectAll("image", "select=id,asin,role,position,sha256,kind,storage_path")).map((r) => [`${r.asin}|${r.role}|${r.position}`, r]));
console.log(`images: ${wanted.length} on ${new Set(wanted.map((w) => w.asin)).size} protein bars, ${have.size} already stored`);

const rows = [];
let n = 0;
await pool(wanted, 12, async (w) => {
  const key = `${w.asin}|${w.role}|${w.position}`;
  if (have.get(key)?.storage_path) return;
  const dir = join(IMG_DIR, w.asin);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${w.role}-${w.position}.jpg`);
  let bytes;
  if (existsSync(file)) bytes = readFileSync(file);
  else {
    const res = await fetch(w.amazon_url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`image ${res.status} ${w.amazon_url}`);
    bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, bytes);
  }
  const meta = await sharp(bytes).metadata();
  const mime = meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : "image/jpeg";
  const storage_path = `${w.asin}/${w.role}-${w.position}.${meta.format === "jpeg" ? "jpg" : meta.format}`;
  await uploadObject(BUCKET, storage_path, bytes, mime);
  rows.push({
    ...w, storage_path, width: meta.width ?? null, height: meta.height ?? null,
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  if (++n % 200 === 0) console.log(`  ${n} copied`);
});
await upsert("image", rows, "asin,role,position");
console.log(`images: ${rows.length} copied to ${BUCKET}`);

if (!classify) process.exit(0);

// ── what each unique image shows ─────────────────────────────────────────
const { classifyImage } = await import("../../src/lib/engine/providers/openai.js");
const all = await selectAll("image", "select=id,asin,role,position,sha256,kind,storage_path");
const byHash = new Map();
for (const r of all) if (r.sha256) (byHash.get(r.sha256) || byHash.set(r.sha256, []).get(r.sha256)).push(r);
const todo = [...byHash.entries()].filter(([, rs]) => rs.some((r) => !r.kind));
console.log(`classify: ${todo.length} unique images to look at (${byHash.size} unique of ${all.length})`);

const kindOf = (s) =>
  s.nutrition_table && (s.ingredient_list || s.allergen_statement) ? "label"
  : s.nutrition_table ? "nutrition"
  : s.ingredient_list || s.allergen_statement ? "ingredients"
  : s.printed_product_name ? "front"
  : "other";

let done = 0;
const tally = {};
await pool(todo, 5, async ([hash, rs]) => {
  const r = rs[0];
  const file = join(IMG_DIR, r.asin, `${r.role}-${r.position}.jpg`);
  // Low detail is enough to see whether a panel exists; resize keeps the payload small.
  const small = await sharp(readFileSync(file)).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const { shows, model } = await withRateLimit(() => classifyImage({ imageBase64: small.toString("base64"), mimeType: "image/jpeg" }));
  const kind = kindOf(shows);
  await update("image", `sha256=eq.${hash}`, { kind, kind_model: model });
  tally[kind] = (tally[kind] || 0) + rs.length;
  if (++done % 100 === 0) console.log(`  classified ${done}/${todo.length}`);
});
console.log("classify:", tally);
