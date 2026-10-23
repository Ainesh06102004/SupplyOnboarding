// ============================================================================
// What KOI tells a household, in words: one template per kind. Pure.
//
// Every notification is written once, here, and sent on each channel the
// household chose (00093): in the app now, on WhatsApp next. So each kind also
// names the WhatsApp message template it maps to and that template's
// parameters, in order: a WhatsApp business message outside a conversation
// must be a pre-approved template, and these are the ones KOI submits. Figures
// come from the planner's report, never a model.
// ============================================================================

const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export const NOTIFICATION_KINDS = Object.freeze({
  autoplan_ready: Object.freeze({
    title: () => "Next week's plan is ready",
    body: (p) => `KOI drafted ${p.days} days from ${p.startsLabel}: ${p.products} products, about ${rupees(p.cost)}. Review it; nothing goes in your cart until you say so.`,
    href: (p) => `/store/plan?review=${p.planId}`,
    template: "koi_plan_ready",
    params: (p) => [p.startsLabel, String(p.days), String(p.products), rupees(p.cost)],
  }),
  autoplan_failed: Object.freeze({
    title: () => "KOI couldn't draft next week's plan",
    body: (p) => `${p.reason} Open the Plan to make it yourself.`,
    href: () => "/store/plan",
    template: "koi_plan_failed",
    params: (p) => [p.reason],
  }),
  reminder: Object.freeze({
    title: (p) => String(p.title ?? "A reminder").slice(0, 120),
    body: () => "A reminder you set on your KOI calendar.",
    href: () => "/store/calendar",
    template: "koi_reminder",
    params: (p) => [String(p.title ?? "A reminder").slice(0, 120)],
  }),
  plan_day: Object.freeze({
    title: () => "Time to plan next week",
    body: () => "You marked today on your calendar to plan the week. KOI can draft it in a minute.",
    href: () => "/store/plan",
    template: "koi_plan_day",
    params: () => [],
  }),
  shop_day: Object.freeze({
    title: () => "Shopping day",
    body: () => "You marked today on your calendar for shopping. Your plan's cart is ready when you are.",
    href: () => "/store/cart",
    template: "koi_shop_day",
    params: () => [],
  }),
});

/**
 * A notification row's words for a kind.
 * @returns {{ kind, title, body, href, template, template_params }}
 */
export function notificationFor(kind, params = {}) {
  const k = NOTIFICATION_KINDS[kind];
  if (!k) throw new Error(`No notification kind ${kind}.`);
  return { kind, title: k.title(params), body: k.body(params), href: k.href(params), template: k.template, template_params: k.params(params) };
}

/**
 * The WhatsApp Cloud API message for a notification: its approved template with
 * the parameters in order.
 * @param {{ template: string, template_params: string[] }} notification
 * @param {{ to: string, language?: string }} opts the recipient's number (E.164 digits), the template's language
 */
export function whatsappPayload(notification, { to, language = "en" }) {
  const params = notification.template_params ?? [];
  return {
    messaging_product: "whatsapp",
    to: String(to).replace(/[^\d]/g, ""),
    type: "template",
    template: {
      name: notification.template,
      language: { code: language },
      ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: String(text) })) }] } : {}),
    },
  };
}
