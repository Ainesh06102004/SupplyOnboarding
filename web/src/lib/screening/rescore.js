// ============================================================================
// KOI SCREENING — Recompute and record KOI scores
//
// SERVER ONLY, service client. Reads what KOI holds for each SKU — nutrition,
// the published ingredient list, the brand's claims from the latest report —
// scores it with lib/screening/score.js, and records the result through
// engine.record_screening(), which versions the report and skips no-change
// writes.
//
// Called after every automatic publish (lib/engine/pipeline.js), and for the
// whole catalogue from /api/engine/run?rescore=all when the rubric changes.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { buildMasterIndex, screen } from "./score";
import { isLabelCurrent } from "@/lib/recommendation/verification";

/**
 * @param {string[]|null} skuIds null = every SKU of an approved product
 * @returns {Promise<Array<{ skuId, product, final?, verdict?, changed?, error? }>>}
 */
export async function rescoreSkus(skuIds = null) {
  const db = getServiceClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set; scores cannot be recorded.");

  let skuQuery = db
    .from("skus")
    .select("id, products!inner(product_name, status), sku_nutrition(*), screening_reports(flags, is_latest)");
  skuQuery = skuIds ? skuQuery.in("id", skuIds) : skuQuery.eq("products.status", "approved");

  const [{ data: skus, error: e1 }, { data: master, error: e2 }, { data: labels, error: e3 }] = await Promise.all([
    skuQuery,
    db.schema("food").from("ingredients_master").select("canonical_name, aliases, ingredient_category, risk_level, is_blocked"),
    db.schema("food").from("sku_ingredients").select("sku_id, parsed_ingredients, evidence, confirmed_at"),
  ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;

  const index = buildMasterIndex(master);
  const labelBySku = new Map(labels.map((l) => [l.sku_id, l]));
  const results = [];

  for (const sku of skus) {
    const nutrition = [].concat(sku.sku_nutrition || [])[0] || null;
    const latest = [].concat(sku.screening_reports || []).find((r) => r.is_latest);
    const label = labelBySku.get(sku.id);
    const report = screen({
      nutrition,
      // A list nobody has seen on a pack for a year is no longer the complete
      // list, so the score is capped as if none had been read.
      label: label
        ? { evidence: isLabelCurrent(label.confirmed_at) ? label.evidence : "partial", parsed: label.parsed_ingredients }
        : null,
      claims: latest?.flags?.claims ?? [],
      index,
    });

    const { data, error } = await db.schema("engine").rpc("record_screening", { p_sku_id: sku.id, p_report: report });
    results.push(error
      ? { skuId: sku.id, product: sku.products.product_name, error: error.message }
      : { skuId: sku.id, product: sku.products.product_name, final: report.final_score, verdict: report.verdict, changed: data.changed, previous: data.previous_final ?? null });
  }
  return results;
}
