// ============================================================================
// KOI SCREENING — The figures Open Food Facts disagrees with KOI on
//
// Plan §11.2, action 4. SERVER ONLY, service role: engine.off_matches is
// internal. Phase 1.7 matched KOI's SKUs to Open Food Facts and recorded, per
// SKU, which declared figures disagree beyond tolerance.
//
// A disputed figure cannot carry a comparative claim: Chocolate Biscuits is
// matched to "Open Secret Chocolate Biscuit", which disagrees on six figures
// including the sugar its only "In context" line was about. So the metrics
// named here are left out of the comparison until the label is read again.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";

/**
 * The metrics Open Food Facts disputes for this SKU, as relative.js names them
 * (they are the same keys engine.off_matches records).
 *
 * @param {string} skuId
 * @returns {Promise<string[]>} empty when nothing is matched or nothing disagrees
 */
export async function disputedMetrics(skuId) {
  const db = getServiceClient();
  if (!db || !skuId) return [];
  const { data, error } = await db
    .schema("engine")
    .from("off_matches")
    .select("status, disagreements")
    .eq("sku_id", skuId)
    .maybeSingle();
  if (error || !data || data.status !== "matched") return [];
  return (data.disagreements ?? []).filter((metric) => typeof metric === "string");
}
