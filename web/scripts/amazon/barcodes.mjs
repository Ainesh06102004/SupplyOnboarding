// Step 6 — barcodes decoded from the pack photos (zxing-wasm), check digit verified.
// Only codes actually read off an image are kept: matching Open Food Facts by
// name was tried and dropped (00065) — it gave one code to many flavours.
//   node --env-file=.env.local scripts/amazon/barcodes.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readBarcodes } from "zxing-wasm/reader";
import * as cache from "./cache.mjs";
import { pool } from "./oxylabs.mjs";
import { selectAll, upsert } from "./db.mjs";

// GS1 check digit for EAN-8 / UPC-A / EAN-13 / GTIN-14.
export function validGtin(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const images = await selectAll("image", "select=id,asin,role,position,sha256");
const byHash = new Map();
for (const r of images) (byHash.get(r.sha256) || byHash.set(r.sha256, []).get(r.sha256)).push(r);
console.log(`barcodes: decoding ${byHash.size} unique images`);

const rows = [];
let n = 0;
await pool([...byHash.values()], 4, async (rs) => {
  const r = rs[0];
  const bytes = readFileSync(join(cache.CACHE, "images", r.asin, `${r.role}-${r.position}.jpg`));
  // Grey, up to 2000 px: small barcodes on a pack shot need the resolution.
  const png = await sharp(bytes).resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).greyscale().png().toBuffer();
  const found = await readBarcodes(new Uint8Array(png), { formats: ["EAN13", "EAN8", "UPCA", "UPCE"], tryHarder: true, maxNumberOfSymbols: 4 });
  for (const f of found) {
    const code = f.text?.trim();
    if (!f.isValid || !code || !validGtin(code)) continue;
    for (const img of rs) rows.push({ asin: img.asin, code, format: f.format, source: "image_decode", image_id: img.id });
  }
  if (++n % 500 === 0) console.log(`  ${n}/${byHash.size}`);
});
const unique = [...new Map(rows.map((x) => [`${x.asin}|${x.code}`, x])).values()];
await upsert("barcode", unique, "asin,code,source");
console.log(`barcodes: ${unique.length} decoded from photos on ${new Set(unique.map((x) => x.asin)).size} listings`);
