// Pull the photo behind every pending review item, so a reader can look at it.
//
//   node --experimental-websocket --env-file=.env.local scripts/fetchQueueLabels.mjs <outDir>
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const out = process.argv[2];
if (!out) {
  console.error("Where should the photos go? scripts/fetchQueueLabels.mjs <outDir>");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db.schema("engine")
  .from("review_queue")
  .select("output_id, status, extraction_outputs!inner(upload_id, sku_id)")
  .eq("status", "pending");
if (error) throw error;

const uploadIds = [...new Set((data ?? []).map((r) => r.extraction_outputs.upload_id))];
const { data: uploads, error: uploadError } = await db
  .from("uploads")
  .select("id, storage_path, sku_id, skus(products(product_name))")
  .in("id", uploadIds);
if (uploadError) throw uploadError;

mkdirSync(out, { recursive: true });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

for (const u of uploads ?? []) {
  const { data: file, error: dlError } = await db.storage.from("product-labels").download(u.storage_path);
  if (dlError) {
    console.log(`${u.id}: ${dlError.message}`);
    continue;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = `${slug(u.skus?.products?.product_name ?? u.id)}.${u.storage_path.endsWith(".png") ? "png" : "jpg"}`;
  writeFileSync(`${out}/${name}`, bytes);
  console.log(`${name}  ${Math.round(bytes.length / 1024)} KB  upload=${u.id}`);
}
