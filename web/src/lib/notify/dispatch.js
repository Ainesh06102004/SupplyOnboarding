// ============================================================================
// Sending a notification on the household's channels. SERVER ONLY.
//
// The in-app inbox is the notification row itself (00093). Every other channel
// is an adapter with one job, send(), and says what happened in the row's
// `sent`: when, the provider's id, or why it was skipped. WhatsApp is written
// against the Cloud API and stays inert until it is configured
// (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) and the person has opted in
// (notify_consent): it never sends to anyone who hasn't said yes.
//
// `ref` makes a notification once-only: the same run or reminder twice is
// one row, and the second dispatch does nothing.
// ============================================================================

import "server-only";

import { notificationFor, whatsappPayload } from "./templates";

const now = () => new Date().toISOString();

const ADAPTERS = Object.freeze({
  whatsapp: Object.freeze({
    async send({ db, recipientId, notification }) {
      const token = process.env.WHATSAPP_TOKEN;
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneId) return { skipped: "WhatsApp is not set up yet." };
      const { data: consent } = await db.from("notify_consent").select("opted_in_at, opted_out_at").eq("account_id", recipientId).eq("channel", "whatsapp").maybeSingle();
      const optedIn = consent?.opted_in_at && !(consent.opted_out_at && consent.opted_out_at > consent.opted_in_at);
      if (!optedIn) return { skipped: "They haven't opted in to WhatsApp." };
      const { data: found } = await db.auth.admin.getUserById(recipientId);
      const phone = found?.user?.phone ?? null;
      if (!phone) return { skipped: "No phone number on their account." };
      const version = process.env.WHATSAPP_API_VERSION || "v21.0";
      const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(whatsappPayload(notification, { to: phone })),
      });
      const body = await response.json().catch(() => ({}));
      return response.ok ? { at: now(), id: body?.messages?.[0]?.id ?? null } : { error: body?.error?.message ?? `WhatsApp said ${response.status}.` };
    },
  }),
});

/**
 * @param {object} db a service-role Supabase client (notifications are written by the server only)
 * @param {object} input
 * @param {string} input.recipientId the person's auth user id (household.owner_id)
 * @param {string|null} [input.householdId]
 * @param {string} input.kind a NOTIFICATION_KINDS key
 * @param {object} [input.params] the kind's parameters
 * @param {string[]} [input.channels] in_app always, plus whatever the household chose
 * @param {string} input.ref once-only key
 * @returns {Promise<{ id: string|null, duplicate?: boolean, sent: object }>}
 */
export async function dispatch(db, { recipientId, householdId = null, kind, params = {}, channels = ["in_app"], ref }) {
  const notification = notificationFor(kind, params);
  const all = [...new Set(["in_app", ...channels])];
  const sent = { in_app: { at: now() } };
  const { data, error } = await db
    .from("notification")
    .insert({ ...notification, recipient_id: recipientId, household_id: householdId, channels: all, ref, sent })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return { id: null, duplicate: true, sent: {} };
  if (error) throw error;
  for (const channel of all.filter((c) => c !== "in_app")) {
    const adapter = ADAPTERS[channel];
    try {
      sent[channel] = adapter ? await adapter.send({ db, recipientId, notification }) : { skipped: `No ${channel} adapter.` };
    } catch (err) {
      sent[channel] = { error: err?.message ?? "Failed." };
    }
  }
  if (all.length > 1) await db.from("notification").update({ sent }).eq("id", data.id);
  return { id: data.id, sent };
}
