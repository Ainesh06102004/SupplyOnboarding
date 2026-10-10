"use client";

// ============================================================================
// KOI STORE — Checkout
//
// This page used to offer UPI, Card, Net Banking and Cash on Delivery, over a
// hardcoded Hyderabad address, ending in a setTimeout that routed to a list of
// invented orders. Every one of those was a claim KOI cannot support: KOI is
// NOT merchant of record. The shopper pays Swiggy, at Swiggy's prices, through
// Swiggy's checkout. KOI never sees a payment event.
//
// So checkout does the only thing KOI can actually do — assemble a basket,
// record the intent, and hand it off — and says so plainly. The capabilities
// contract decides what is offered (`merchantOfRecord`, `paymentHandoff`),
// never a hardcoded provider name.
//
// It is the one checkout for the one cart: the shop's items and the week's
// plan go together. The intent records which household plan filled it (00085)
// so Orders can link back to it. After a successful hand-off ONLY the lines
// Swiggy accepted leave the cart; what it could not take stays, so nothing the
// shopper chose is lost. The header is the store's `focused` one (no nav, no
// tab bar, no dock) — StoreChrome picks it for this route.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCartStore, isDescribable } from "@/store/cartStore";
import { useLoginUi } from "@/store/loginUiStore";
import { useAuth } from "@/contexts/AuthContext";
import { averageScore } from "@/lib/score";
import { packs, totals } from "@/lib/cart/lines";
import { fetchCapabilities, fetchZone, prepareHandoff, commitHandoff } from "@/lib/marketplace/browser";
import { useLocation } from "@/contexts/LocationContext";
import HandoffReview from "@/components/store/checkout/HandoffReview";
import { fulfilmentService } from "@/lib/supabase/fulfilmentService";
import AddressManager from "@/components/store/AddressManager";
import ConnectSwiggy from "@/components/store/marketplace/ConnectSwiggy";
import { SWIGGY_NOTE } from "@/components/store/cart/CartView";
import { Button, Money, MonoLabel, ProductThumb, Icon } from "@/components/store/system/primitives";

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [address, setAddress] = useState(null);
  const [caps, setCaps] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [handoffError, setHandoffError] = useState(null);
  // The reconciliation step. Null until the shopper asks what Swiggy would
  // take; rendering it replaces the basket view rather than sitting under it,
  // because it is a decision point, not extra detail.
  const [plan, setPlan] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [intentId, setIntentId] = useState(null);
  const [zoneId, setZoneId] = useState(null);
  // Set once Swiggy has the basket. From then on this page only says where it
  // went — the cart may be empty now, and that must not bounce the shopper.
  const [sent, setSent] = useState(null);
  const { pincode } = useLocation();

  const lines = useCartStore((state) => state.items);
  const cartPlan = useCartStore((state) => state.plan);
  const hydrated = useCartStore((state) => state.hydrated);
  const resolved = useCartStore((state) => state.resolved);
  const removeLines = useCartStore((state) => state.removeLines);
  const openLogin = useLoginUi((state) => state.openLogin);

  // Hand-off lines must carry a real SKU and price, so an unresolved reference
  // cannot be checked out — but it must not be mistaken for an empty basket
  // either. See isDescribable in cartStore.
  const items = useMemo(() => lines.filter(isDescribable), [lines]);
  const planItems = useMemo(() => items.filter((i) => packs(i.fromPlan) > 0), [items]);
  const ownItems = useMemo(() => items.filter((i) => packs(i.fromPlan) === 0), [items]);
  const all = totals(items);

  // Only redirect once the cart has been restored AND described. Redirecting on
  // a still-hydrating cart bounced shoppers with a full basket back to the shop;
  // redirecting on a hydrated-but-unresolved one does the same thing later.
  useEffect(() => {
    if (!sent && hydrated && resolved && items.length === 0) router.push("/store/cart");
  }, [sent, hydrated, resolved, items.length, router]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCapabilities(controller.signal).then(setCaps);
    return () => controller.abort();
  }, []);

  const onSelectAddress = useCallback((a) => setAddress(a), []);

  // The plan speaks in KOI SKU ids; the screen needs names, brands and scores.
  // Built from the cart, which already holds resolved catalogue products.
  const productsBySkuId = useMemo(() => {
    const map = {};
    for (const i of items) {
      const key = i.skuId ?? i.id;
      if (key) map[String(key)] = i;
    }
    return map;
  }, [items]);

  // ─── KOI's read ───
  // Speaks only to what the score means. It previously claimed the basket was
  // "extremely clean, high in protein, and low in added sugar" purely because
  // the average score cleared 90 — a nutrition claim inferred from a proxy,
  // with no macro ever read. A KOI score is evidence of screening, not of
  // protein content.
  const averageKoiScore = averageScore(items);
  let intelligenceMessage = "Every product here cleared KOI's ingredient and nutrition review.";
  if (averageKoiScore !== null && averageKoiScore >= 90) intelligenceMessage = "These products sit near the top of KOI's screening range.";
  else if (averageKoiScore !== null && averageKoiScore >= 80) intelligenceMessage = "A basket scoring well above KOI's minimum standard.";

  // Whether a hand-off is possible at all is the adapter's answer, not a
  // guess. `none` means no supply source is connected, and the page says that
  // rather than offering a button that cannot work.
  const canHandOff = caps?.capabilities?.paymentHandoff === "external_redirect";
  const capsLoading = caps === null;

  // STEP 1 — record the basket, then ask what the partner would accept.
  // Read-only at the provider: nothing is reserved and no cart is touched.
  const handleReview = async () => {
    if (!user?.uid || !address) return;
    setIsProcessing(true);
    setHandoffError(null);

    try {
      const intent = await fulfilmentService.openDraft(user.uid, items, {
        addressId: address.id,
        address: {
          label: address.label, street: address.street, city: address.city,
          state: address.state, pincode: address.pincode, phone: address.phone,
        },
        // Which week's plan filled this basket, for Orders' link back to it.
        nutritionPlanId: planItems.length ? cartPlan?.planId ?? null : null,
      });
      if (!intent) {
        setHandoffError("Could not save your basket. Please try again.");
        return;
      }
      setIntentId(intent.id);

      if (!canHandOff) {
        // Nowhere to send it. The basket is saved as a draft rather than
        // marked handed off to nobody.
        router.push("/store/orders");
        return;
      }

      const zone = await fetchZone(address.pincode || pincode);
      if (!zone.zoneId) {
        setHandoffError("We couldn't work out which store serves your address yet.");
        return;
      }
      setZoneId(zone.zoneId);

      // Availability is a property of a pack, so the hand-off asks about SKUs.
      const handoffLines = items
        .map((i) => ({ koiSkuId: i.skuId ?? i.id, quantity: i.quantity }))
        .filter((l) => l.koiSkuId);

      const { ok, plan: prepared, code } = await prepareHandoff(zone.zoneId, handoffLines);
      if (!ok) {
        setHandoffError(
          code === "NOT_CONFIGURED"
            ? "No delivery partner is connected yet, so we can't send this basket."
            : "We couldn't check availability just now. Please try again."
        );
        return;
      }
      setPlan(prepared);
    } catch (err) {
      console.error("review:", err);
      setHandoffError("Something went wrong. Your basket has not been sent.");
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 2 — the destructive one. Reachable only from the reconciliation
  // screen's explicit confirmation, never on mount and never on a retry timer.
  const handleCommit = async (planId) => {
    setCommitting(true);
    setHandoffError(null);
    // What Swiggy took. Only these leave the cart afterwards.
    const accepted = (plan?.accepted ?? []).map((a) => String(a.koiSkuId));
    try {
      const { ok, result, code } = await commitHandoff(planId);
      if (!ok) {
        setHandoffError(
          code === "REAUTH" ? "Your Swiggy connection expired. Please reconnect and try again."
          : code === "RATE_LIMITED" ? "Swiggy is rate-limiting us. Give it a moment and try again."
          // "Nothing has been ordered" is a claim, and for an unconfirmed
          // hand-off it is one KOI cannot make: the request went out and the
          // cart may already hold this basket. Sending them to look is the only
          // honest instruction, and trying again is exactly the wrong move.
          : code === "UNCONFIRMED" ? "We sent this to Swiggy but couldn't confirm it arrived. Check your Swiggy cart before trying again — it may already be there."
          : "We couldn't hand this basket over. Nothing has been ordered."
        );
        return;
      }
      // The basket is with Swiggy now: what it took leaves the KOI cart, what
      // it could not take stays for the shopper to decide about.
      setSent({ url: result?.handoffUrl ?? null, kept: Math.max(0, items.length - accepted.length) });
      removeLines(accepted);
      if (intentId) {
        const recorded = await fulfilmentService.markHandedOff(intentId, {
          marketplace: caps.adapter,
          planId,
          externalOrderRef: result?.externalCartRef ?? null,
          zoneId,
          // Only when the plan considered itself complete. A subtotal that
          // omits an unresolved line is a number KOI cannot stand behind, and
          // recording it here would give it a second life in the order history.
          providerSubtotal: plan?.totals?.complete ? plan.totals.subtotal ?? null : null,
        });
        // The basket is already with the provider — the plan committed before
        // this line ran. So a failure here is a hole in KOI's own records, not
        // a failed hand-off, and it must never be reported as one: sending
        // them back to try again would replace the cart a second time. Say
        // where the basket actually is and leave the retry alone.
        if (!recorded) {
          console.error("markHandedOff: hand-off completed but was not recorded", { intentId, planId });
          setHandoffError(
            "Your basket is in your Swiggy cart — go and check out there. We couldn't add it to your KOI order history, so it may not appear below."
          );
          if (result?.handoffUrl) window.open(result.handoffUrl, "_blank", "noopener");
          return;
        }
      }
      // Swiggy is where the shopper finishes: they confirm and pay there.
      if (result?.handoffUrl) window.open(result.handoffUrl, "_blank", "noopener");
      router.push("/store/orders");
    } catch (err) {
      console.error("commit:", err);
      setHandoffError("We couldn't hand this basket over. Nothing has been ordered.");
    } finally {
      setCommitting(false);
    }
  };

  if (sent) return <Sent sent={sent} error={handoffError} />;
  if (!hydrated || !resolved || items.length === 0) return null;

  const blocked = !user?.uid || !address || isProcessing;
  const ctaLabel = isProcessing
    ? "Working…"
    : capsLoading
      ? "Checking availability…"
      : canHandOff
        ? "Review what Swiggy has"
        : "Save this basket";
  // Signed out (a session that lapsed after proxy.js let them in), the button
  // itself signs in — a sentence saying "sign in" with nothing to press was a
  // dead end.
  const signedOut = !user?.uid;
  const onCta = signedOut ? () => openLogin() : handleReview;
  const cta = signedOut ? "Sign in to continue" : ctaLabel;
  const why = signedOut ? null : !address ? "Add a delivery address to continue" : null;

  return (
    <main className="ks-page" style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: plan ? 64 : 140 }}>
      <h1 className="ks-h1" style={{ fontSize: 34 }}>Checkout</h1>

      <div className="ks-split">
        {/* LEFT: the flow.
            Once a plan exists the reconciliation screen REPLACES this rather
            than appearing beneath it: it is a decision point, and leaving the
            address picker and the explainer above it invites a shopper to
            scroll past the one thing they need to read. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {plan ? (
            <HandoffReview
              plan={plan}
              byId={productsBySkuId}
              onCommit={handleCommit}
              onBack={() => { setPlan(null); setHandoffError(null); }}
              committing={committing}
              error={handoffError}
            />
          ) : (
            <>
              <StepCard n={1} title="Deliver to" done={Boolean(address)}>
                <AddressManager onSelect={onSelectAddress} selectedAddressId={address?.id} />
              </StepCard>

              {/* The hand-off writes to the shopper's OWN Swiggy cart, so it
                  cannot happen on a KOI house account. Renders nothing when KOI
                  has no Swiggy client credentials, or when the shopper is
                  already connected and the connection is healthy. */}
              <ConnectSwiggy next="/store/checkout" />

              {/* How this actually works. Replaces the payment-method picker
                  entirely: KOI is not merchant of record. */}
              <StepCard n={canHandOff ? 2 : null} title="How this order completes">
                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    ["KOI hands your basket to Swiggy Instamart", "We match each product to what Swiggy has in stock near you and load it into your Swiggy cart."],
                    ["You pay and confirm on Swiggy", "Payment, delivery and support are Swiggy's. KOI never handles your payment details and never charges you."],
                    ["Swiggy delivers", "Prices and availability are Swiggy's at the moment you check out, so they may differ from what you see here."],
                  ].map(([title, body], i) => (
                    <li key={title} style={{ display: "flex", gap: 14 }}>
                      <span className="ks-num" style={{ fontSize: 12, color: "var(--koi-accent)", marginTop: 2 }}>0{i + 1}</span>
                      <div>
                        <div style={{ font: "700 14px var(--koi-sans-stack)" }}>{title}</div>
                        <p style={{ margin: "3px 0 0", font: "400 13px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {/* No delivery window is promised: KOI has no fulfilment source to back one. */}
                <p style={{ margin: "14px 0 0", background: "var(--koi-quiet)", borderRadius: 12, padding: "11px 13px", font: "400 12.5px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
                  KOI does not set delivery times. Swiggy shows your delivery window at their checkout.
                </p>
              </StepCard>

              {/* Honest state when no supply source is connected. */}
              {!capsLoading && !canHandOff && (
                <section style={{ background: "#fff8e6", border: "1px solid #f0dca6", borderRadius: 18, padding: "16px 18px" }}>
                  <div style={{ font: "700 15px var(--koi-sans-stack)" }}>Swiggy checkout isn&apos;t connected yet</div>
                  <p style={{ margin: "6px 0 0", font: "400 13px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
                    KOI can&apos;t send this basket to a delivery partner right now. You can still save it — it will be waiting under your orders, and nothing has been charged or ordered.
                  </p>
                </section>
              )}

              {handoffError && (
                <div role="alert" style={{ background: "var(--koi-red-bg)", border: "1px solid #f3cec9", borderRadius: 14, padding: "12px 14px", font: "500 13.5px/1.5 var(--koi-sans-stack)", color: "var(--koi-red)" }}>
                  {handoffError}
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: what is being sent */}
        <aside className="ks-rail">
          <section className="ks-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <MonoLabel>Your cart</MonoLabel>
            {planItems.length > 0 && (
              <SummaryRow icon={<span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--koi-tint)", color: "var(--koi-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon.Calendar /></span>}
                title="This week's plan" meta={`${cartPlan?.members ? `For ${cartPlan.members} · ` : ""}${planItems.length} ${planItems.length === 1 ? "product" : "products"}`} total={totals(planItems).total} />
            )}
            {ownItems.length > 0 && (
              <SummaryRow icon={<ProductThumb src={ownItems[0].image?.hero || null} size={34} radius={10} />}
                title={planItems.length ? "Also in your cart" : "Your products"} meta={`${ownItems.length} ${ownItems.length === 1 ? "product" : "products"}`} total={totals(ownItems).total} />
            )}
            <div style={{ borderTop: "1px solid var(--koi-divider)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ font: "700 14px var(--koi-sans-stack)" }}>MRP total</span>
              <Money value={all.total} size={24} />
            </div>
            <p style={{ margin: 0, font: "400 12.5px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>{SWIGGY_NOTE}</p>
            {!plan && (
              <div className="ks-hide-phone" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Button size="lg" block onClick={onCta} disabled={!signedOut && blocked} busy={isProcessing}>{cta}</Button>
                {why && <span style={{ textAlign: "center", font: "600 12.5px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>{why}</span>}
              </div>
            )}
            <MonoLabel style={{ textAlign: "center" }}>Payment is handled by Swiggy</MonoLabel>
          </section>
          <section className="ks-card" data-tone="deep" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <MonoLabel tone="mint">KOI&apos;s read</MonoLabel>
            <span style={{ font: "400 13.5px/1.5 var(--koi-sans-stack)", color: "rgba(255,255,255,.85)" }}>{intelligenceMessage}</span>
            {averageKoiScore !== null && <span style={{ font: "500 12px var(--koi-sans-stack)", color: "rgba(255,255,255,.65)" }}>Average KOI score <span className="ks-num" style={{ color: "#fff" }}>{averageKoiScore}</span></span>}
          </section>
        </aside>
      </div>

      {/* One sticky bar on phones. Hidden during reconciliation: that screen
          owns its own actions, and a second "review" button that silently
          re-prepares would spend provider quota every time a thumb landed
          near it. */}
      {!plan && (
        <div className="ks-show-phone" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "#fff", borderTop: "1px solid var(--koi-line2)", padding: "12px 16px calc(14px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <MonoLabel>MRP total</MonoLabel>
              <Money value={all.total} size={19} />
            </div>
            <Button size="lg" onClick={onCta} disabled={!signedOut && blocked} busy={isProcessing} style={{ flex: 1 }}>{cta}</Button>
          </div>
          {why && <span style={{ textAlign: "center", font: "600 12px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>{why}</span>}
        </div>
      )}
    </main>
  );
}

/** After the hand-off: where the basket is, and what stayed in the cart. */
function Sent({ sent, error }) {
  return (
    <main className="ks-page" style={{ maxWidth: 640 }}>
      <section className="ks-card" style={{ padding: 26, display: "flex", flexDirection: "column", gap: 12, animation: "koiUp .35s ease" }}>
        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--koi-primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon.Check style={{ width: 18, height: 18 }} /></span>
        <h1 style={{ margin: 0, font: "800 26px var(--koi-sans-stack)", letterSpacing: "-.02em" }}>Sent to Swiggy</h1>
        <p style={{ margin: 0, font: "400 15px/1.55 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
          Your basket is in your Swiggy cart. Confirm and pay there.
          {sent.kept > 0 ? ` The ${sent.kept} ${sent.kept === 1 ? "product" : "products"} Swiggy couldn't take stayed in your KOI cart.` : ""}
        </p>
        {error && <p role="alert" style={{ margin: 0, background: "var(--koi-red-bg)", borderRadius: 12, padding: "10px 12px", font: "500 13.5px/1.5 var(--koi-sans-stack)", color: "var(--koi-red)" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          {sent.url && <Button href={sent.url} target="_blank" rel="noopener">Open Swiggy</Button>}
          <Button href="/store/orders" variant="secondary">See it in Orders</Button>
        </div>
      </section>
    </main>
  );
}

function StepCard({ n, title, done = false, children }) {
  return (
    <section className="ks-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {n !== null && n !== undefined && (
          <span className="ks-num" style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, background: done ? "var(--koi-primary)" : "var(--koi-tint)", color: done ? "#fff" : "var(--koi-primary)" }}>
            {done ? <Icon.Check /> : n}
          </span>
        )}
        <h2 style={{ margin: 0, font: "700 17px var(--koi-sans-stack)", letterSpacing: "-.01em" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SummaryRow({ icon, title, meta, total }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ font: "600 14px var(--koi-sans-stack)" }}>{title}</span>
        <MonoLabel style={{ letterSpacing: ".06em" }}>{meta}</MonoLabel>
      </div>
      <Money value={total} size={15} />
    </div>
  );
}
