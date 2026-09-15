// ============================================================================
// KOI — Cross-check KOI's figures against Open Food Facts
//
// SERVER ONLY. Phase 1.5. For every approved SKU: find its Open Food Facts
// product (lib/off/match.js — barcode, or same brand and name), compare the
// per-100 figures, and record the result in engine.off_matches.
//
// Recorded, never acted on. KOI's figures came from the pack; the community's
// may describe an older recipe or be mistyped. A disagreement is a reason to
// look, and the evaluation set (Phase 1.7) is where it gets used.
// ============================================================================

import "server-only";

import { engineDb } from "@/lib/engine/pipeline";
import { findOffMatch, compareWithOff, brandSlug } from "./match";

const COLUMNS = "code, product_name, brand_tags, nutrients_per_100";

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

  const summary = { skus: skus.length, matched: 0, ambiguous: 0, disagreeing: [] };
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
    if (comparison?.disagreements.length) summary.disagreeing.push({ product: sku.products.product_name, fields: comparison.disagreements });
  }
  return summary;
}
