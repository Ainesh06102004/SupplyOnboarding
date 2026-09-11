// ============================================================================
// KOI - Import the label graphics KOI already holds as label uploads
//
// public/media holds one "-label" image per live product: the brand's own
// nutrition-panel graphic, shown on the product page. The label engine reads
// from Storage via public.uploads, which was empty, so there was nothing to
// read. This puts each graphic in the product-labels bucket and records it as
// a nutrition_label upload on the product's SKU.
//
// What these images are matters: they carry the nutrition table and NOT the
// ingredient list or allergen statement. Reading them can verify nutrition; it
// cannot verify allergens. Those need back-of-pack photos from the brands.
//
// Idempotent: an upload whose storage_path already exists is skipped.
//
// Usage, from web/:
//   node --env-file=.env.local scripts/importLabelPhotos.mjs --dry-run
//   node --env-file=.env.local scripts/importLabelPhotos.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "product-labels";
const MEDIA = path.resolve(process.cwd(), "public", "media");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, "");
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

// Image -> product, the inverse of the mapping in lib/data/productFetcher.js.
const LABELS = [
  ["troovy-butter-label.jpg", "The Healthy Butter Cookies"],
  ["troovy-chocolate-label.jpg", "The Healthy Chocolate Cookies"],
  ["troovy-chips-label.jpg", "The Healthy Potato Chips"],
  ["skc-madras-label.jpg", "Madras Mixture"],
  ["skc-mango-label.jpg", "Mango Mysore Pak"],
  ["skc-ragi-label.jpg", "Ragi Hot Chocolate Milk Mix"],
  ["skc-golden-label.jpg", "Golden Milk Mix"],
  ["os-dfm-label.jpg", "Daily Dry Fruit Mix"],
  ["os-cb-label.jpg", "Chocolate Biscuits"],
  ["os-ca-label.jpg", "California Almonds"],
  ["os-dates-label.jpg", "Dates"],
  ["kisaansay-honey-label.jpg", "Uttrakhand Honey"],
  ["kisaansay-saffron-label.jpg", "Premium Pampore Saffron"],
  ["kisaansay-rice-label.jpg", "Gorakhpur Kalanamak Rice"],
  ["thb-crispies-label.jpg", "Moringa Jowar Crispies - Indian Masala"],
  ["thb-combo-label.jpg", "Healthy Snack Combo - Pack of 6"],
  ["mn-chivda-label.jpg", "Chivda Mix - Patal Poha"],
  ["mn-laddubar-label.jpg", "Dryfruit Instant Energy Laddubar"],
];

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...HEADERS, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${pathAndQuery} -> ${res.status} ${await res.text()}`);
  return res.status === 201 || res.status === 204 ? null : res.json();
}

const products = await rest("products?select=id,product_name,brand_id,skus(id)&status=eq.approved");
const byName = new Map(products.map((p) => [p.product_name, p]));

let imported = 0;
for (const [file, name] of LABELS) {
  const product = byName.get(name);
  const skuId = product?.skus?.[0]?.id;
  const source = path.join(MEDIA, file);
  if (!product || !skuId) { console.warn(`skip  ${file}: no approved product "${name}" with a SKU`); continue; }
  if (!fs.existsSync(source)) { console.warn(`skip  ${file}: not in public/media`); continue; }

  const storagePath = `koi-seed/${skuId}/${file}`;
  const existing = await rest(`uploads?select=id&storage_path=eq.${encodeURIComponent(storagePath)}`);
  if (existing.length) { console.log(`have  ${name}`); continue; }

  const bytes = fs.readFileSync(source);
  if (DRY_RUN) { console.log(`would ${name} <- ${file} (${Math.round(bytes.length / 1024)} KB)`); continue; }

  const put = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`Storage upload of ${file} failed: ${put.status} ${await put.text()}`);

  await rest("uploads", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      brand_id: product.brand_id, product_id: product.id, sku_id: skuId, bucket_name: BUCKET,
      file_type: "nutrition_label", file_name: file, mime_type: "image/jpeg",
      file_size_bytes: bytes.length, storage_path: storagePath, is_deleted: false,
    }),
  });
  imported += 1;
  console.log(`added ${name}`);
}

console.log(DRY_RUN ? "\nDRY RUN - nothing written." : `\nImported ${imported} label photo(s).`);
