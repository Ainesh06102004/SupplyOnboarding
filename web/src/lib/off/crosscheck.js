// ============================================================================
// KOI — Cross-check KOI's figures against Open Food Facts
//
// SERVER ONLY. Phase 1.5. For every approved SKU: find its Open Food Facts
// product (lib/off/match.js — barcode, or same brand and name), compare the
// per-100 figures, and record the result in engine.off_matches.
//
// Never used as a correction. KOI's figures came from the pack; the community's
// may describe an older recipe or be mistyped. A disagreement is a reason to
// look again, so it queues a fresh reading of the product's label photos
// (engine.reread_requests), which the scheduled reader takes first.
// ============================================================================

import "server-only";

import { engineDb, LABEL_FILE_TYPES } from "@/lib/engine/pipeline";
import { findOffMatch, compareWithOff, brandSlug, shouldReread } from "./match";

const COLUMNS = "code, product_name, brand_tags, nutrients_per_100";
const MAX_REREAD_PHOTOS = 3;

/**
 * Queue a fresh reading of a doubted product's label photos, newest first.
 * The scheduled reader takes these before anything else (pipeline.runPending).
 * @returns {Promise<number>} photos queued
 */
async function queueReread(db, sku, nutrition, reason) {
  const engine = db.schema("engine");
  const { data: last, error } = await engine
    .from("reread_requests").select("requested_at").eq("sku_id", sku.id)
    .order("requested_at", { ascending: false }).limit(1);
  if (error) throw error;
  if (!shouldReread({ nutritionVerified: Boolean(nutrition?.manually_verified), lastRequestedAt: last[0]?.requested_at ?? null })) return 0;

  const { data: uploads, error: uploadError } = await db
    .from("uploads").select("id").eq("sku_id", sku.id).eq("is_deleted", false).in("file_type", LABEL_FILE_TYPES)
    .order("uploaded_at", { ascending: false }).limit(MAX_REREAD_PHOTOS);
  if (uploadError) throw uploadError;
  if (!uploads.length) return 0;

  const { error: insertError } = await engine
    .from("reread_requests").insert(uploads.map((u) => ({ sku_id: sku.id, upload_id: u.id, reason })));
  // 23505: a request for that photo is already pending, which is the same outcome.
  if (insertError && insertError.code !== "23505") throw insertError;
  return insertError ? 0 : uploads.length;
}

export async function crosscheckSkus() {
  const db = engineDb();
  const engine = db.schema("engine");

  const { data: skus, error } = await db
    .from("skus")
    .select("id, barcode_ean, variant_name, products!inner(product_name, status, brands(brand_name)), sku_nutrition(*)")
    .eq("products.status", "approved");
  if (error) throw error;

  const slugs = [...new Set(skus.map((s) => brandSlug(s.products.brands?.brand_name)).filter(Boolean))];
  const barcodes = [...new Set(skus.map((s) => String(s.barcode_ean ?? "").replace(/\D/g, "")).filter(Boolean))];
  const [byBrand, byCode] = await Promise.all([
    slugs.length ? engine.from("off_products").select(COLUMNS).overlaps("brand_tags", slugs).limit(5000) : { data: [] },
    barcodes.length ? engine.from("off_products").select(COLUMNS).in("code", barcodes) : { data: [] },
  ]);
  if (byBrand.error || byCode.error) throw byBrand.error || byCode.error;
  const candidates = [...new Map([...byBrand.data, ...byCode.data].map((r) => [r.code, r])).values()];

  const summary = { skus: skus.length, matched: 0, ambiguous: 0, disagreeing: [], rereadsQueued: 0 };
  for (const sku of skus) {
    const match = findOffMatch({
      barcode: sku.barcode_ean,
      product: sku.products.product_name,
      brand: sku.products.brands?.brand_name,
      variant: sku.variant_name,
    }, candidates);
    const nutrition = [].concat(sku.sku_nutrition || [])[0] || null;
    const comparison = match.row ? compareWithOff(nutrition, match.row.nutrients_per_100) : null;

    const { error: upsertError } = await engine.from("off_matches").upsert({
      sku_id: sku.id,
      status: match.status,
      off_code: match.row?.code ?? null,
      method: match.method ?? null,
      reason: match.reason,
      comparison,
      disagreements: comparison?.disagreements ?? [],
      checked_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;

    if (match.status === "matched") summary.matched += 1;
    if (match.status === "ambiguous") summary.ambiguous += 1;
    if (comparison?.disagreements.length) {
      summary.disagreeing.push({ product: sku.products.product_name, fields: comparison.disagreements });
      summary.rereadsQueued += await queueReread(db, sku, nutrition,
        `Open Food Facts ${match.row.code} disagrees on ${comparison.disagreements.join(", ")}.`);
    }
  }
  return summary;
}
