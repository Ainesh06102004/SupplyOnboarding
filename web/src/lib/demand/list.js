// ============================================================================
// KOI DEMAND — The "what to onboard next" list
//
// SERVER ONLY. Reads engine.demand_queue with the service role and returns
// only terms with at least PUBLISH_AT occurrences; below that, a count of how
// many are waiting and nothing else.
//
// Each term also says whether KOI now answers it, worked out on every read
// rather than stored, so nobody has to mark anything done:
//   not_stocked    an approved product's name, brand or category contains it
//   cannot_filter  "no <term>" now reads as an avoid KOI can enforce
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { interpret } from "@/lib/ai/intent";
import { PUBLISH_AT } from "@/lib/demand/terms";

function answeredNow(row, catalogue) {
  if (row.kind === "not_stocked") return catalogue.some((hay) => hay.includes(row.term));
  const intent = interpret(`no ${row.term}`);
  return intent.profile.foodsAvoid.length > 0 && !intent.unresolved.length;
}

/**
 * @returns {Promise<{ publishAt: number, waiting: number, terms: Array }>}
 */
export async function listDemand() {
  const db = getServiceClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the demand queue cannot be read.");

  const queue = db.schema("engine").from("demand_queue");
  const [shown, waiting, products] = await Promise.all([
    queue.select("term, kind, occurrences, first_seen, last_seen")
      .gte("occurrences", PUBLISH_AT)
      .order("occurrences", { ascending: false })
      .order("last_seen", { ascending: false })
      .limit(200),
    db.schema("engine").from("demand_queue").select("term", { count: "exact", head: true }).lt("occurrences", PUBLISH_AT),
    db.from("products").select("product_name, category_l1, brands(brand_name)").eq("status", "approved"),
  ]);
  const failed = shown.error || waiting.error || products.error;
  if (failed) throw failed;

  const catalogue = (products.data || []).map((p) =>
    [p.product_name, p.category_l1, p.brands?.brand_name].filter(Boolean).join(" ").toLowerCase());

  return {
    publishAt: PUBLISH_AT,
    waiting: waiting.count ?? 0,
    terms: (shown.data || []).map((row) => ({ ...row, answeredNow: answeredNow(row, catalogue) })),
  };
}
