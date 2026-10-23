import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationFor, whatsappPayload, NOTIFICATION_KINDS } from "./templates";

test("every kind has words, a store link and a WhatsApp template", () => {
  for (const [kind, k] of Object.entries(NOTIFICATION_KINDS)) {
    const n = notificationFor(kind, { days: 7, startsLabel: "Mon 26 Oct", products: 9, cost: 1450, planId: "p1", reason: "The planner found nothing to buy.", title: "Order atta" });
    assert.ok(n.title.length > 0 && n.title.length <= 120, kind);
    assert.ok(n.body.length > 0 && n.body.length <= 600, kind);
    assert.match(n.href, /^\/store\//, kind);
    assert.match(k.template, /^koi_[a-z_]+$/, kind);
    assert.ok(Array.isArray(n.template_params), kind);
  }
  assert.throws(() => notificationFor("nope"));
});

test("a plan ready says what was drafted, from the report, and never fills the cart", () => {
  const n = notificationFor("autoplan_ready", { days: 7, startsLabel: "Mon 26 Oct", products: 9, cost: 1450.4, planId: "p1" });
  assert.equal(n.href, "/store/plan?review=p1");
  assert.match(n.body, /7 days from Mon 26 Oct: 9 products, about ₹1,450\. Review it; nothing goes in your cart until you say so\./);
  assert.deepEqual(n.template_params, ["Mon 26 Oct", "7", "9", "₹1,450"]);
});

test("a WhatsApp message is the approved template with its parameters in order", () => {
  const n = notificationFor("autoplan_ready", { days: 5, startsLabel: "Tue 27 Oct", products: 6, cost: 900, planId: "p2" });
  const body = whatsappPayload(n, { to: "+91 99999 99999" });
  assert.deepEqual(body, {
    messaging_product: "whatsapp",
    to: "919999999999",
    type: "template",
    template: { name: "koi_plan_ready", language: { code: "en" }, components: [{ type: "body", parameters: ["Tue 27 Oct", "5", "6", "₹900"].map((text) => ({ type: "text", text })) }] },
  });
  assert.equal(whatsappPayload(notificationFor("plan_day"), { to: "91999" }).template.components, undefined, "a template without parameters sends none");
});
