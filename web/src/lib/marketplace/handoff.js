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
import { getMarketplaceAdapter, verifyItems } from "./index";
import { resolveSkuMappings } from "./skuMapRepo";
import {
  NotConfiguredError, AuthExpiredError, NotServiceableError,
  RateLimitError, HandoffUnconfirmedError,
} from "./errors";
import { AVAILABILITY } from "./types";
import { pickSubstituteCandidates, keepAvailable } from "@/lib/recommendation/substitutes";
import { fetchAllProducts } from "@/lib/data/productFetcher";

const PLANS = "marketplace_handoff_plan";

/**
 * Is it CERTAIN the provider changed nothing?
 *
 * Only a refusal counts. Each of these is the provider (or KOI) declining the
 * request before a cart could be touched: nothing configured to call, a
 * credential rejected, an area not served, a quota refusing the request at the
 * door. Anything else — a timeout, a 5xx, a socket closing, an unrecognised
 * error — is ambiguous, and ambiguity must not be read as failure.
 *
 * `checkout` is not idempotent and KOI never calls it; the only non-idempotent
 * call KOI does make is `update_cart`, which is what this protects.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function definitelyNoEffect(err) {
  return (
    err instanceof NotConfiguredError ||
    err instanceof AuthExpiredError ||
    err instanceof NotServiceableError ||
    err instanceof RateLimitError
  );
}

// Each substitute costs a provider search, and prepare is repeatable, so this
// is a spending limit rather than a display preference. Two per rejected line
// is enough to be a choice without becoming a second shop.
const SUBSTITUTES_PER_LINE = 2;
const MAX_SUBSTITUTE_LOOKUPS = 6;

/**
 * Offer KOI-screened alternatives for the lines that cannot be sent.
 *
 * The reconciliation screen has always rendered these; nothing ever filled
 * them in, so the "Screened alternatives in stock" block could not appear. The
 * picker existed for the product page and was simply never wired to the
 * hand-off.
 *
 * Candidates come from KOI's OWN catalogue, never the provider's
 * `similarProducts` — see the banner in lib/recommendation/substitutes.js. The
 * provider is asked exactly one question about them, "can this be bought right
 * now", and only confirmed-available ones are shown: the heading says in
 * stock, so anything less than a definite yes would make the screen lie.
 *
 * Failure here is never fatal. A rejected line with no alternatives is a
 * poorer screen; a hand-off that fell over because the suggestion engine had a
 * bad day is a broken one.
 */
async function attachSubstitutes({ zoneId, rejected, basketSkuIds }) {
  if (!rejected.length || !zoneId) return rejected;

  try {
    const catalogue = await fetchAllProducts();
    if (!catalogue?.length) return rejected;

    const bySkuId = new Map();
    for (const p of catalogue) if (p?.skuId) bySkuId.set(String(p.skuId), p);

    // Never suggest something already in the basket, and never suggest a line
    // this same plan has just rejected.
    const excluded = new Set([...basketSkuIds, ...rejected.map((r) => String(r.koiSkuId))]);

    // Rank first, spend second: choose every candidate before asking the
    // provider anything, so the budget is applied to a considered list rather
    // than to whatever the first line happened to want.
    const wanted = [];
    for (const r of rejected) {
      const target = bySkuId.get(String(r.koiSkuId)) ?? null;
      // No profile is loaded here: this runs on the service role, which is not
      // the shopper, and reading their goals would need a second identity.
      // Ranking still uses category and KOI score, which is honest if generic.
      const picked = pickSubstituteCandidates(target, catalogue, {}, SUBSTITUTES_PER_LINE + 2)
        .filter((p) => p?.skuId && !excluded.has(String(p.skuId)));
      wanted.push({ koiSkuId: String(r.koiSkuId), candidates: picked });
    }

    const ids = [];
    for (const w of wanted) {
      for (const c of w.candidates) {
        const id = String(c.skuId);
        if (!ids.includes(id) && ids.length < MAX_SUBSTITUTE_LOOKUPS) ids.push(id);
      }
    }
    if (!ids.length) return rejected;

    const adapter = getMarketplaceAdapter();
    const mappings = await resolveSkuMappings(adapter.id, ids, { zoneId });
    const results = await verifyItems({
      zoneId,
      items: ids.map((id) => ({
        koiSkuId: id,
        externalId: mappings[id]?.externalId ?? null,
        matchQuery: mappings[id]?.matchQuery ?? null,
      })),
    });

    // keepAvailable() wants {availability, price, deliveryEta} per key.
    const signals = {};
    for (const [id, r] of Object.entries(results)) {
      signals[id] = {
        availability: r?.availability ?? AVAILABILITY.UNKNOWN,
        price: r?.item?.price ?? null,
        deliveryEta: r?.item?.deliveryEta ?? null,
      };
    }

    return rejected.map((r) => {
      const w = wanted.find((x) => x.koiSkuId === String(r.koiSkuId));
      if (!w) return r;
      const live = keepAvailable(w.candidates, signals, (p) => String(p.skuId));
      return {
        ...r,
        // Projected deliberately. The whole catalogue product would carry
        // nutrition, screening and ingredient detail into a payload the
        // browser reads, none of which this screen needs.
        substitutes: live.slice(0, SUBSTITUTES_PER_LINE).map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand ?? null,
          score: p.score ?? null,
          price: p.price ?? null,
        })),
      };
    });
  } catch (err) {
    console.error("attachSubstitutes:", err?.message);
    return rejected;
  }
}

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
  const foldedRejections = [...(plan.rejected ?? []), ...unmapped];
  const rejected = await attachSubstitutes({
    zoneId,
    rejected: foldedRejections,
    basketSkuIds: ids,
  });
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
    // ── Releasing the claim is itself a claim ────────────────────────────────
    // Releasing means "this plan may be committed again", which is only true if
    // the provider definitely did nothing. This used to release on ANY error —
    // including a timeout, which is precisely the case where update_cart is
    // most likely to have replaced the cart and simply not told us. A second
    // attempt would then replace it AGAIN, from a plan already acted on, which
    // is the exact outcome the Postgres claim exists to prevent.
    //
    // So the question is not "did it fail" but "is it certain nothing
    // happened". Only rejections certain to have been refused before the cart
    // was touched qualify.
    if (definitelyNoEffect(err)) {
      await supabase.from(PLANS).update({ committed_at: null }).eq("plan_id", planId);
      throw err;
    }

    // Ambiguous. The claim STAYS, so nothing can replace the cart a second
    // time, and the uncertainty is recorded rather than smoothed over — a
    // support question about this hand-off deserves an answer, and "we do not
    // know" is one.
    await supabase
      .from(PLANS)
      .update({
        payload: {
          ...plan,
          status: "unconfirmed",
          committedAt: claimedAt,
          unconfirmedReason: err?.code || err?.name || "UNKNOWN",
        },
      })
      .eq("plan_id", planId);

    throw new HandoffUnconfirmedError(
      "The hand-off was sent but not confirmed. The cart may or may not have been replaced.",
      err
    );
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
