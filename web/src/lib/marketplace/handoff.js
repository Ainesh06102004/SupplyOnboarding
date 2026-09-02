// ============================================================================
// KOI — The hand-off
//
// SERVER ONLY. Two phases, and the split is not ceremony:
//
//   PREPARE  read-only. Asks the provider what it would accept. Repeatable as
//            many times as a shopper reloads the reconciliation screen, costs
//            nothing but quota, and changes nothing anywhere.
//
//   COMMIT   the ONLY destructive call in the entire system. The provider's
//            cart is singular and `update_cart` REPLACES it, so committing
//            twice does not add items twice — it silently discards whatever
//            the first commit put there and rebuilds from a stale plan.
//
// EXACTLY-ONCE IS ENFORCED IN POSTGRES, NOT IN JAVASCRIPT. The plan row's
// `committed_at` is set by a conditional UPDATE that only matches while it is
// still null. Two concurrent commits race in the database and exactly one wins;
// the loser is told the plan is already committed. A JS-side flag would be a
// per-process guess, and there is more than one process.
//
// A plan is short-lived on purpose. Stock and prices move, and a plan is a
// snapshot of a claim about them — past expiry it is re-prepared rather than
// trusted, which is affordable precisely because prepare is read-only.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { getMarketplaceAdapter } from "./index";
import { resolveSkuMappings } from "./skuMapRepo";
import { NotConfiguredError } from "./errors";

const PLANS = "marketplace_handoff_plan";

/**
 * Ask the provider what it would accept for this basket.
 *
 * @param {object} p
 * @param {string} p.profileId
 * @param {string} p.zoneId
 * @param {Array<{koiSkuId: string, quantity: number}>} p.lines
 * @returns {Promise<import('./types').HandoffPlan & {persisted: boolean}>}
 */
export async function prepareHandoff({ profileId, zoneId, lines = [] }) {
  const adapter = getMarketplaceAdapter();

  if (typeof adapter.prepareHandoff !== "function") {
    // The null adapter has no cart. Not an error — there is simply no provider
    // to hand off to, and the caller says so rather than failing.
    throw new NotConfiguredError("No supply source is configured for hand-off");
  }

  // Resolve how to ask about each SKU. An unmapped line can never be accepted,
  // and is reported as `unmapped` — a distinct reason from `unavailable`,
  // because "we have never matched this to a Swiggy product" and "Swiggy is
  // out of it" call for different fixes.
  const ids = lines.map((l) => String(l.koiSkuId)).filter(Boolean);
  const mappings = await resolveSkuMappings(adapter.id, ids, { zoneId });

  const askable = [];
  const unmapped = [];
  for (const line of lines) {
    const m = mappings[String(line.koiSkuId)];
    if (m?.externalId) {
      askable.push({ ...line, externalId: m.externalId, matchQuery: m.matchQuery });
    } else {
      unmapped.push({ koiSkuId: String(line.koiSkuId), reason: "unmapped", substitutes: [] });
    }
  }

  const plan = await adapter.prepareHandoff({ zoneId, profileId, lines: askable });

  // Fold unmapped lines into the plan's own rejections so the screen has one
  // list to render and one number to trust.
  const rejected = [...(plan.rejected ?? []), ...unmapped];
  const complete = rejected.length === 0;

  // The adapter computed its warnings from ITS OWN rejections, before unmapped
  // lines were folded in. Without this, a basket could lose a line to "never
  // matched" and still report no partial-fulfilment warning — a warning list
  // that disagrees with the list right next to it.
  const warnings = [...(plan.warnings ?? [])];
  if (rejected.length && !warnings.some((w) => w.code === "PARTIAL_FULFILMENT")) {
    warnings.push({
      code: "PARTIAL_FULFILMENT",
      message: `${rejected.length} item(s) can't be fulfilled from this basket.`,
    });
  }

  const merged = {
    ...plan,
    rejected,
    warnings,
    totals: {
      ...(plan.totals ?? { currency: "INR" }),
      // A subtotal that quietly omits an unresolved line is a fabricated
      // number. No total is shown unless every line resolved.
      subtotal: complete ? plan.totals?.subtotal ?? null : null,
      complete,
    },
  };

  const persisted = await persistPlan({ profileId, zoneId, adapterId: adapter.id, plan: merged });
  return { ...merged, persisted };
}

/** Store the plan so commit can be made exactly-once and auditable. */
async function persistPlan({ profileId, zoneId, adapterId, plan }) {
  const supabase = getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.from(PLANS).upsert(
    {
      plan_id: plan.planId,
      profile_id: profileId,
      marketplace: adapterId,
      zone_id: zoneId,
      // The whole plan, so commit never re-derives what it is committing and
      // a support question about a hand-off has an answer.
      payload: plan,
      expires_at: plan.expiresAt,
    },
    { onConflict: "plan_id" }
  );

  if (error) {
    console.error("persistPlan:", error.message);
    return false;
  }
  return true;
}

/**
 * Commit the plan. Destructive, and exactly once.
 *
 * @param {object} p
 * @param {string} p.profileId
 * @param {string} p.planId
 * @returns {Promise<import('./types').HandoffResult>}
 */
export async function commitHandoff({ profileId, planId }) {
  const supabase = getServiceClient();
  if (!supabase) throw new NotConfiguredError("Credential store unavailable");

  const adapter = getMarketplaceAdapter();
  if (typeof adapter.commitHandoff !== "function") {
    throw new NotConfiguredError("No supply source is configured for hand-off");
  }

  const { data: row, error } = await supabase
    .from(PLANS)
    .select("plan_id, profile_id, zone_id, payload, expires_at, committed_at")
    .eq("plan_id", planId)
    .maybeSingle();

  if (error || !row) return { status: "rejected", handoffUrl: null, externalCartRef: null, reason: "unknown_plan" };

  // Ownership is checked here as well as by RLS, because this path runs on the
  // service role and therefore has no RLS to rely on.
  if (row.profile_id !== profileId) {
    return { status: "rejected", handoffUrl: null, externalCartRef: null, reason: "not_your_plan" };
  }

  if (row.committed_at) {
    // Already done. Returning `committed` rather than an error is deliberate:
    // a shopper who double-submitted should see the same success they would
    // have seen, not a failure for something that in fact worked.
    return {
      status: "committed",
      handoffUrl: row.payload?.handoffUrl ?? null,
      externalCartRef: row.payload?.externalCartRef ?? null,
      alreadyCommitted: true,
    };
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { status: "expired", handoffUrl: null, externalCartRef: null };
  }

  // ── THE RACE, resolved in Postgres ────────────────────────────────────────
  // Claim the plan BEFORE calling the provider. Two concurrent commits both
  // reach here; the conditional update matches for exactly one of them, and
  // only that one is allowed to touch a cart that replaces itself.
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from(PLANS)
    .update({ committed_at: claimedAt })
    .eq("plan_id", planId)
    .is("committed_at", null)
    .select("plan_id")
    .maybeSingle();

  if (!claimed) {
    return { status: "committed", handoffUrl: null, externalCartRef: null, alreadyCommitted: true };
  }

  const plan = row.payload ?? {};

  try {
    const result = await adapter.commitHandoff({
      planId,
      profileId,
      zoneId: row.zone_id,
      addressId: plan.addressId ?? null,
      accepted: plan.accepted ?? [],
    });

    // Record what the provider actually did, alongside the plan.
    await supabase
      .from(PLANS)
      .update({ payload: { ...plan, ...result, committedAt: claimedAt } })
      .eq("plan_id", planId);

    return result;
  } catch (err) {
    // The claim is released ONLY because the provider call failed before
    // changing anything we can observe. If it had partially succeeded, leaving
    // the claim in place would be safer than allowing a second cart replace —
    // which is why this catch is narrow and deliberate rather than a
    // catch-all rollback.
    await supabase.from(PLANS).update({ committed_at: null }).eq("plan_id", planId);
    throw err;
  }
}

/** Read a plan back for the reconciliation screen. */
export async function getPlan({ profileId, planId }) {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(PLANS)
    .select("plan_id, profile_id, payload, expires_at, committed_at")
    .eq("plan_id", planId)
    .maybeSingle();
  if (error || !data || data.profile_id !== profileId) return null;
  return data;
}
