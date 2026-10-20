// Prune the amazon-products bucket down to what KOI reads (20 Oct 2026).
//
// The scrape stored every listing image: 18,501 files, 2.41 GB, against the
// Free plan's 1 GB. Kept:
//   - every panel photo (kind nutrition / label / ingredients) — labels.mjs reads these;
//   - anything not classified yet (kind is null) — images.mjs still has to look at it;
//   - each product's first gallery image — its packshot, should a page ever want one.
// Everything else (other packshots, description banners) is deleted through the
// Storage API, and its row is marked pruned_at with storage_path cleared
// (00086). amazon_url stays, so any of them can be fetched again.
//
//   node --env-file=.env.local scripts/amazon/prune.mjs            # dry run: what would go
//   node --env-file=.env.local scripts/amazon/prune.mjs --apply    # delete

import { selectAll, update } from "./db.mjs";

const BUCKET = "amazon-products";
const PANEL = new Set(["nutrition", "label", "ingredients"]);
const APPLY = process.argv.includes("--apply");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const rows = await selectAll("image", "select=id,asin,role,position,kind,bytes,storage_path,pruned_at&storage_path=not.is.null");
const firstGallery = new Map();
for (const r of rows) {
  if (r.role !== "gallery") continue;
  const at = firstGallery.get(r.asin);
  if (!at || r.position < at.position) firstGallery.set(r.asin, r);
}
const keep = (r) => !r.kind || PANEL.has(r.kind) || firstGallery.get(r.asin)?.id === r.id;
const going = rows.filter((r) => !keep(r));
const mb = (list) => (list.reduce((s, r) => s + (r.bytes ?? 0), 0) / 1048576).toFixed(0);
console.log(`stored ${rows.length} (${mb(rows)} MB) · keeping ${rows.length - going.length} (${mb(rows.filter(keep))} MB) · pruning ${going.length} (${mb(going)} MB)`);
if (!APPLY) {
  console.log("Dry run. Add --apply to delete.");
  process.exit(0);
}

// Storage deletes take up to 1000 paths a call; rows are marked only after their files are gone.
let done = 0;
for (let i = 0; i < going.length; i += 500) {
  const batch = going.slice(i, i + 500);
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: batch.map((r) => r.storage_path) }),
  });
  if (!res.ok) throw new Error(`delete batch ${i / 500 + 1}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const at = new Date().toISOString();
  for (let j = 0; j < batch.length; j += 100) {
    const ids = batch.slice(j, j + 100).map((r) => r.id).join(",");
    await update("image", `id=in.(${ids})`, { storage_path: null, pruned_at: at });
  }
  done += batch.length;
  console.log(`pruned ${done}/${going.length}`);
}
console.log("Done.");
