// ============================================================================
// KOI — Fulfilment intents
//
// The storefront's record of what KOI did on a shopper's behalf. NOT an order
// ledger: KOI is not merchant of record, takes no payment and receives no
// delivery webhook. See supabase/migrations/00011_fulfilment_intents.sql for
// why `orders` is the wrong table for this.
//
// Every function here is bounded by RLS — koi_uid() must equal profile_id — so
// none of them re-check ownership. The database refuses anything else, and a
// second check in JavaScript would only be a second place to get it wrong.
//
// What this module will not do:
//   - record a payment (KOI never observes one)
//   - record a delivery (only the shopper can report one)
//   - infer a state from elapsed time
// ============================================================================

import { getSupabaseClient } from "./client";

const INTENTS = "fulfilment_intents";
const ITEMS = "fulfilment_intent_items";

const NO_ROWS = "PGRST116";

/** The states KOI can actually observe. Mirrors the fulfilment_state enum. */
export const FULFILMENT = Object.freeze({
  DRAFT: "draft",
  HANDED_OFF: "handed_off",
  ABANDONED: "abandoned",
  REPORTED_DELIVERED: "reported_delivered",
});

/** What the shopper told us, if anything. */
export const DELIVERY_REPORT = Object.freeze({
  ARRIVED: "arrived",
  DID_NOT_ARRIVE: "did_not_arrive",
  PARTIAL: "partial",
});

/**
 * Label an intent for display.
 *
 * Deliberately verb-shaped and past-tense: "Handed off to Swiggy" describes an
 * act KOI performed. "Out for delivery" would describe a state KOI cannot see.
 * The UI must never invent a warmer word than the data supports.
 */
export function describeState(state) {
  switch (state) {
    case FULFILMENT.DRAFT:
      return { label: "Basket open", tone: "neutral" };
    case FULFILMENT.HANDED_OFF:
      return { label: "Handed off to Swiggy", tone: "active" };
    case FULFILMENT.ABANDONED:
      return { label: "Not completed", tone: "muted" };
    case FULFILMENT.REPORTED_DELIVERED:
      return { label: "You marked this arrived", tone: "done" };
    default:
      return { label: "Unknown", tone: "muted" };
  }
}

/** Numeric, or null. Never coerces a missing value to 0 — see lib/score.js. */
const numOrNull = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Snapshot a cart line for the historical record.
 *
 * Names, prices and scores are copied rather than referenced because a SKU can
 * later be renamed, re-priced, re-scored or delisted, and none of that may
 * retroactively change what was handed off on the day.
 */
function toIntentItem(intentId, line) {
  return {
    intent_id: intentId,
    // Cart ids are product ids, which are not always SKU ids. Send it only
    // when it is a uuid; otherwise the line still records what was handed off,
    // just without the foreign key.
    koi_sku_id: /^[0-9a-f-]{36}$/i.test(String(line.id ?? "")) ? String(line.id) : null,
    product_name: line.name || "Unnamed product",
    brand_name: line.brand || null,
    quantity: Math.max(1, Number(line.quantity) || 1),
    unit_mrp_at_handoff: numOrNull(line.price),
    koi_score_at_handoff: numOrNull(line.score),
    // 'unknown' until a provider actually reports per-line results. Defaulting
    // to 'added' would claim the hand-off succeeded before it happened.
    handoff_outcome: "unknown",
  };
}

export const fulfilmentService = {
  /**
   * The shopper's open basket, if one exists. At most one per shopper —
   * enforced by a partial unique index, not by hoping.
   *
   * @param {string} uid Firebase UID
   */
  async getOpenDraft(uid) {
    if (!uid) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(INTENTS)
      .select("*")
      .eq("profile_id", uid)
      .eq("state", FULFILMENT.DRAFT)
      .maybeSingle();

    if (error && error.code !== NO_ROWS) {
      console.error("getOpenDraft:", error);
      return null;
    }
    return data ?? null;
  },

  /**
   * Every intent for a shopper, newest first, with their lines.
   *
   * @param {string} uid
   * @returns {Promise<Array>} [] on failure — the orders page renders its
   *   empty state, which is honest, rather than showing invented history.
   */
  async listIntents(uid) {
    if (!uid) return [];
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(INTENTS)
      .select(`*, ${ITEMS} (*)`)
      .eq("profile_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listIntents:", error);
      return [];
    }
    return (data ?? []).map((row) => ({ ...row, items: row[ITEMS] ?? [] }));
  },

  /**
   * Open a basket, or reuse the one already open.
   *
   * Idempotent by design: checkout can render more than once, and each render
   * must not open another basket. The unique index is the real guarantee; this
   * lookup just avoids provoking it.
   *
   * @param {string} uid
   * @param {Array} items cart lines
   * @param {{ addressId?: string|null, address?: object|null, zoneId?: string|null }} [context]
   */
  async openDraft(uid, items = [], context = {}) {
    if (!uid) return null;
    const supabase = getSupabaseClient();

    const existing = await this.getOpenDraft(uid);
    const subtotal = items.reduce(
      (sum, i) => sum + (numOrNull(i.price) ?? 0) * (Number(i.quantity) || 1),
      0
    );

    const payload = {
      profile_id: uid,
      state: FULFILMENT.DRAFT,
      item_count: items.reduce((n, i) => n + (Number(i.quantity) || 1), 0),
      subtotal_at_handoff: subtotal || null,
      address_id: context.addressId ?? null,
      address_snapshot: context.address ?? null,
      zone_id: context.zoneId ?? null,
    };

    const { data, error } = existing
      ? await supabase.from(INTENTS).update(payload).eq("id", existing.id).select().single()
      : await supabase.from(INTENTS).insert(payload).select().single();

    if (error) {
      console.error("openDraft:", error);
      return null;
    }

    // Replace the lines wholesale: the basket is the cart's current contents,
    // not an append-only log.
    await supabase.from(ITEMS).delete().eq("intent_id", data.id);
    if (items.length) {
      const { error: itemError } = await supabase
        .from(ITEMS)
        .insert(items.map((line) => toIntentItem(data.id, line)));
      if (itemError) console.error("openDraft items:", itemError);
    }

    return data;
  },

  /**
   * Record that KOI handed this basket to a provider.
   *
   * This is the LAST thing KOI observes. Everything after it — payment,
   * picking, delivery — happens on the provider's side, and KOI learns about
   * it only if the shopper says so.
   *
   * @param {string} intentId
   * @param {{ marketplace: string, planId?: string|null, externalOrderRef?: string|null }} details
   */
  async markHandedOff(intentId, { marketplace, planId = null, externalOrderRef = null }) {
    if (!intentId || !marketplace) return null;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(INTENTS)
      .update({
        state: FULFILMENT.HANDED_OFF,
        marketplace,
        plan_id: planId,
        external_order_ref: externalOrderRef,
        handed_off_at: new Date().toISOString(),
      })
      .eq("id", intentId)
      // Only a draft can be handed off. Without this an accidental double
      // submit would stamp a new hand-off time over a completed intent.
      .eq("state", FULFILMENT.DRAFT)
      .select()
      .maybeSingle();

    if (error) {
      console.error("markHandedOff:", error);
      return null;
    }
    return data ?? null;
  },

  /**
   * The shopper says what happened. KOI records who said it and when.
   *
   * There is no automatic transition into this state, and there must never be
   * one: a timer expiring is not evidence that food arrived.
   *
   * @param {string} intentId
   * @param {'arrived'|'did_not_arrive'|'partial'} report
   */
  async reportDelivery(intentId, report) {
    if (!intentId || !Object.values(DELIVERY_REPORT).includes(report)) return null;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(INTENTS)
      .update({
        state: FULFILMENT.REPORTED_DELIVERED,
        delivery_report: report,
        delivery_reported_at: new Date().toISOString(),
      })
      .eq("id", intentId)
      .eq("state", FULFILMENT.HANDED_OFF)
      .select()
      .maybeSingle();

    if (error) {
      console.error("reportDelivery:", error);
      return null;
    }
    return data ?? null;
  },

  /**
   * Close a basket that never went anywhere. Explicit, never inferred from
   * inactivity — an abandoned basket is one the shopper walked away from, and
   * only they can tell us that by starting again.
   */
  async abandon(intentId) {
    if (!intentId) return null;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(INTENTS)
      .update({ state: FULFILMENT.ABANDONED, abandoned_at: new Date().toISOString() })
      .eq("id", intentId)
      .eq("state", FULFILMENT.DRAFT)
      .select()
      .maybeSingle();

    if (error) {
      console.error("abandon:", error);
      return null;
    }
    return data ?? null;
  },
};
