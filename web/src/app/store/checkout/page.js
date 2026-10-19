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
// tab bar) — StoreChrome picks it for this route; its rail (CheckoutRail)
// follows the stage this page reports.
//
// Cinematic storefront (Oct 2026): the canvas's checkout. KOI walks the
// decision points (where it goes, what won't go and why, the tick only the
// shopper can give) and the basket's thumbnails fly to Swiggy on send. The
// hand-off ends on the seal — the confirmation page — instead of a jump to
// Orders: what went, what stayed, what happens next, and the way to Swiggy.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore, isDescribable } from "@/store/cartStore";
import { useLoginUi } from "@/store/loginUiStore";
import { useAuth } from "@/contexts/AuthContext";
import { averageScore } from "@/lib/score";
import { packs, totals } from "@/lib/cart/lines";
import { fetchCapabilities, fetchZone, prepareHandoff, commitHandoff } from "@/lib/marketplace/browser";
import { useLocation } from "@/contexts/LocationContext";
import HandoffReview from "@/components/store/checkout/HandoffReview";
import Seal from "@/components/store/checkout/Seal";
import { fulfilmentService } from "@/lib/supabase/fulfilmentService";
import AddressManager from "@/components/store/AddressManager";
import ConnectSwiggy from "@/components/store/marketplace/ConnectSwiggy";
import { SWIGGY_NOTE } from "@/components/store/cart/CartView";
import { Money, ProductThumb } from "@/components/store/system/primitives";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { useCheckoutStage } from "@/store/checkoutStageStore";

// KOI's lines. No numbers in KOI's mouth.
const LINES = {
  signIn: "Sign in and I’ll check what Swiggy has near you. Nothing moves until you say.",
  address: "Where should it go? Pick an address, then I’ll check Swiggy near you.",
  ready: "Ready when you are. I’ll check what Swiggy has near you before anything moves.",
  noPartner: "Swiggy isn’t connected yet. I can save this basket for you; nothing is ordered.",
  someStay: "Most of this basket can go. What can’t stays in your cart, and I won’t guess a match.",
  allGo: "All of it can go. Swiggy’s own prices apply when you pay.",
  noneGo: "None of it can go right now. Nothing leaves your cart.",
  agree: "Thanks. Send it whenever you’re ready.",
  sending: "Handing your basket to Swiggy.",
  sent: "It’s in your Swiggy cart. Nothing is charged until you pay there.",
};

/** Flies copies of the given thumbnails to a target, inside the store root (the ember's stage). */
function flyThumbs(gsap, thumbs, target, onDone) {
  const stage = target?.closest(".koi-store");
  if (!stage || !thumbs.length) { onDone?.(); return; }
  const S = stage.getBoundingClientRect();
  const T = target.getBoundingClientRect();
  const to = { x: T.left - S.left + 12, y: T.top - S.top + T.height / 2 };
  const tl = gsap.timeline({ onComplete: () => onDone?.() });
  thumbs.forEach((t, i) => {
    const R = t.getBoundingClientRect();
    const from = { x: R.left - S.left + R.width / 2, y: R.top - S.top + R.height / 2 };
    const fly = t.cloneNode(true);
    Object.assign(fly.style, { position: "absolute", left: "0px", top: "0px", width: `${R.width}px`, height: `${R.height}px`, marginLeft: `${-R.width / 2}px`, marginTop: `${-R.height / 2}px`, zIndex: "118", pointerEvents: "none", borderRadius: "12px", overflow: "hidden", boxShadow: "0 14px 26px -12px rgba(15,61,46,.6)" });
    stage.appendChild(fly);
    const mid = { x: (from.x + to.x) / 2 + 60, y: Math.min(from.y, to.y) - 120 };
    const st = { t: 0 };
    gsap.set(fly, { x: from.x, y: from.y });
    tl.to(st, {
      t: 1, duration: 0.95, ease: E.dolly,
      onUpdate: () => {
        const u = 1 - st.t;
        gsap.set(fly, { x: u * u * from.x + 2 * u * st.t * mid.x + st.t * st.t * to.x, y: u * u * from.y + 2 * u * st.t * mid.y + st.t * st.t * to.y, scale: 1 - 0.7 * st.t, rotation: 14 * st.t });
      },
      onComplete: () => fly.remove(),
    }, i * 0.12);
  });
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);
  const setStage = useCheckoutStage((s) => s.setStage);
  const root = useRef(null);

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

  // The rail starts at "review" and the dot lets go when the page leaves.
  useEffect(() => {
    setStage("review");
    return () => { setStage("review"); ember.rest(); };
  }, [setStage, ember]);

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
  const signedOut = !user?.uid;
  const ready = hydrated && resolved && items.length > 0;
  const view = sent ? "sent" : plan ? "reconcile" : "review";

  // ── KOI, and the camera, on each stage ──
  useGSAP(() => {
    if (!ready || view === "sent") return;
    const gsap = setupMotion();
    const q = (s) => root.current?.querySelector(s);
    const qa = (s) => root.current?.querySelectorAll(s) ?? [];
    const reduce = prefersReducedMotion();
    if (!reduce) {
      const tl = gsap.timeline({ defaults: { ease: E.reveal } });
      tl.from(qa("[data-line]"), { yPercent: 115, duration: 1 }, 0.1);
      tl.from(qa("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08 }, 0.15);
      tl.from(qa("[data-card]"), { autoAlpha: 0, y: 34, duration: 0.9, stagger: 0.09, ease: E.dolly }, 0.25);
      if (q("[data-summary]")) tl.from(q("[data-summary]"), { autoAlpha: 0, y: 40, duration: 1, ease: E.dolly }, 0.3);
      tl.from(qa("[data-go]"), { autoAlpha: 0, x: 40, duration: 0.7, stagger: 0.06 }, 0.6);
    }
    if (view === "reconcile") {
      const accepted = plan?.accepted?.length ?? 0, rejected = plan?.rejected?.length ?? 0;
      ember.status(null);
      say(!accepted ? LINES.noneGo : rejected ? LINES.someStay : LINES.allGo);
      const story = gsap.timeline({ delay: reduce ? 0 : 1.2 });
      const st = q("[data-staying]");
      if (st) story.call(() => ember.go(st, ember.perch(st, 6), () => ember.mark(st, "ring", 6)));
      story.call(() => {
        const c = q("[data-consent-tick]");
        if (!c) { if (!st) ember.home(); return; }
        ember.mark(null);
        ember.go(c, { ax: 0, ay: 0.5, x: -14 }, () => ember.heartbeat(true));
      }, null, st ? 3.6 : 0.4);
    }
  }, { scope: root, dependencies: [ready, view] });

  // Stage one: what KOI says depends on what's missing.
  useEffect(() => {
    if (!ready || view !== "review") return undefined;
    const t = setTimeout(() => {
      if (signedOut) { say(LINES.signIn); return; }
      if (!capsLoading && !canHandOff) { say(LINES.noPartner); return; }
      if (!address) {
        say(LINES.address);
        const card = root.current?.querySelector("[data-deliver]");
        if (card) ember.go(card, ember.perch(card, 6), () => { ember.mark(card, "ring", 6); ember.heartbeat(true); });
        return;
      }
      ember.heartbeat(false);
      ember.mark(null);
      say(LINES.ready);
      const cta = root.current?.querySelector("[data-cta]:not([hidden])");
      if (cta && cta.offsetParent) ember.go(cta, { ax: 0, ay: 0.5, x: 18 }, () => ember.bump());
    }, 900);
    return () => clearTimeout(t);
  }, [ready, view, signedOut, capsLoading, canHandOff, address, say, ember]);

  const onConfirm = (on) => {
    ember.heartbeat(false);
    ember.mark(null);
    if (!on) return;
    say(LINES.agree);
    const b = root.current?.querySelector("[data-send]");
    if (b) setTimeout(() => ember.go(b, { ax: 0, ay: 0.5, x: 18 }, () => ember.bump()), 80);
  };

  // STEP 1 — record the basket, then ask what the partner would accept.
  // Read-only at the provider: nothing is reserved and no cart is touched.
  const handleReview = async () => {
    if (!user?.uid || !address) return;
    setIsProcessing(true);
    setHandoffError(null);
    ember.status("Checking near you");

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
      ember.status(null);
    }
  };

  // STEP 2 — the destructive one. Reachable only from the reconciliation
  // screen's explicit confirmation, never on mount and never on a retry timer.
  const handleCommit = async (planId) => {
    setCommitting(true);
    setHandoffError(null);
    setStage("sending");
    ember.heartbeat(false);
    ember.mark(null);
    ember.status("Handing off");
    say(LINES.sending);
    // The basket's thumbnails head for Swiggy while the request is out.
    const node = document.querySelector("[data-node-swiggy]");
    if (node && !prefersReducedMotion()) flyThumbs(setupMotion(), [...(root.current?.querySelectorAll("[data-go-thumb]") ?? [])], node);
    // What Swiggy took. Only these leave the cart afterwards.
    const accepted = (plan?.accepted ?? []).map((a) => String(a.koiSkuId));
    try {
      const { ok, result, code } = await commitHandoff(planId);
      if (!ok) {
        setStage("review");
        ember.status(null);
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
      // it could not take stays for the shopper to decide about. The seal
      // shows both, from the plan Swiggy answered.
      const went = (plan?.accepted ?? []).map((a) => {
        const p = productsBySkuId[String(a.koiSkuId)] ?? {};
        return { id: String(a.koiSkuId), name: p.name ?? "Item", brand: p.brand ?? null, image: p.image?.hero ?? null, quantity: a.quantity, unitPrice: a.unitPrice ?? null, mrp: Number(p.price) || null };
      });
      const stayed = (plan?.rejected ?? []).map((r) => productsBySkuId[String(r.koiSkuId)]?.name ?? "An item");
      setSent({
        url: result?.handoffUrl ?? null,
        kept: Math.max(0, items.length - accepted.length),
        went,
        stayed,
        subtotal: plan?.totals?.complete ? plan.totals.subtotal ?? null : null,
        address: address?.label ?? null,
        at: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      });
      setStage("sent");
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
        }
      }
      // Swiggy is where the shopper finishes: they confirm and pay there. The
      // seal stays on screen with the same link, in case the tab was blocked.
      if (result?.handoffUrl) window.open(result.handoffUrl, "_blank", "noopener");
    } catch (err) {
      console.error("commit:", err);
      setStage("review");
      ember.status(null);
      setHandoffError("We couldn't hand this basket over. Nothing has been ordered.");
    } finally {
      setCommitting(false);
    }
  };

  if (sent) return <Seal sent={sent} error={handoffError} ember={ember} say={say} line={LINES.sent} />;
  if (!ready) return null;

  const blocked = signedOut || !address || isProcessing;
  const ctaLabel = isProcessing
    ? "Checking near you…"
    : capsLoading
      ? "Checking availability…"
      : canHandOff
        ? "Review what Swiggy has"
        : "Save this basket";
  // Signed out (a session that lapsed after proxy.js let them in), the button
  // itself signs in — a sentence saying "sign in" with nothing to press was a
  // dead end.
  const onCta = signedOut ? () => openLogin() : handleReview;
  const cta = signedOut ? "Sign in to continue" : ctaLabel;
  const why = signedOut ? "Opens Swiggy to pay. KOI never takes payment." : !address ? "Add a delivery address to continue" : "Nothing is sent until you confirm on the next step.";
  const thumbs = items.slice(0, 4);

  return (
    <main ref={root} className="mx-auto flex w-full max-w-[1440px] flex-col bg-koi-bg px-[clamp(16px,4vw,52px)] pb-6 pt-6 font-koi-sans text-koi-ink">
      <section className="flex flex-col gap-2.5">
        <div data-rise className="flex items-center gap-3">
          <span className="font-koi-mono text-xs font-semibold text-koi-primary">(06)</span>
          <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Checkout · {plan ? "what Swiggy can take" : "one cart, one hand-off"}</span>
        </div>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Checkout</span></span>
        </h1>
        <p data-rise className="m-0 max-w-[620px] text-base leading-relaxed text-koi-ink2">KOI hands this basket to Swiggy Instamart. You pay, and pick a delivery window, on Swiggy.</p>
      </section>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 pb-10 pt-7 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* LEFT: the flow.
            Once a plan exists the reconciliation screen REPLACES this rather
            than appearing beneath it: it is a decision point, and leaving the
            address picker and the explainer above it invites a shopper to
            scroll past the one thing they need to read. */}
        <div className="flex min-w-0 flex-col gap-5">
          {plan ? (
            <HandoffReview
              plan={plan}
              byId={productsBySkuId}
              onCommit={handleCommit}
              onBack={() => { setPlan(null); setHandoffError(null); ember.heartbeat(false); ember.mark(null); ember.home(); }}
              committing={committing}
              error={handoffError}
              onConfirm={onConfirm}
            />
          ) : (
            <>
              <StepCard n="01" title="Deliver to" done={Boolean(address)} data-deliver>
                <AddressManager onSelect={onSelectAddress} selectedAddressId={address?.id} />
              </StepCard>

              {/* The hand-off writes to the shopper's OWN Swiggy cart, so it
                  cannot happen on a KOI house account. Renders nothing when KOI
                  has no Swiggy client credentials, or when the shopper is
                  already connected and the connection is healthy. */}
              <ConnectSwiggy next="/store/checkout" />

              <StepCard n="02" title="Your basket" aside={<span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted"><span className="font-koi-num">{all.products}</span> products · checked on the next step</span>}>
                <ul className="m-0 flex list-none flex-col p-0">
                  {items.map((i) => (
                    <li key={i.skuId ?? i.id} data-go className="grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-koi-forest/10 py-3 last:border-b-0 sm:gap-4">
                      <ProductThumb src={i.image?.hero || null} alt="" size={56} radius={12} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-bold">{i.name}</span>
                        <span className="truncate font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">{[packs(i.fromPlan) > 0 ? "From your plan" : null, i.brand, i.weight && i.weight !== "N/A" ? i.weight : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="font-koi-num text-sm font-semibold text-koi-ink2">× {packs(i.quantity)}</span>
                      <span className="w-[72px] text-right font-koi-num text-base font-semibold">{Number(i.price) > 0 ? <Money value={Number(i.price) * packs(i.quantity)} /> : "—"}</span>
                    </li>
                  ))}
                </ul>
              </StepCard>

              {/* How this actually works. Replaces the payment-method picker
                  entirely: KOI is not merchant of record. */}
              <StepCard n={canHandOff ? "03" : null} title="How this order completes">
                <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
                  {[
                    ["KOI hands your basket to Swiggy Instamart", "We match each product to what Swiggy has in stock near you and load it into your Swiggy cart."],
                    ["You pay and confirm on Swiggy", "Payment, delivery and support are Swiggy's. KOI never handles your payment details and never charges you."],
                    ["Swiggy delivers", "Prices and availability are Swiggy's at the moment you check out, so they may differ from what you see here."],
                  ].map(([title, body], i) => (
                    <li key={title} className="flex flex-col gap-1.5 rounded-2xl bg-koi-paper p-4">
                      <span className="font-koi-num text-xs font-semibold text-koi-primary">0{i + 1}</span>
                      <span className="text-sm font-bold">{title}</span>
                      <span className="text-[13px] leading-normal text-koi-ink2">{body}</span>
                    </li>
                  ))}
                </ol>
                {/* No delivery window is promised: KOI has no fulfilment source to back one. */}
                <p className="m-0 mt-3.5 rounded-xl bg-koi-tint px-3.5 py-2.5 text-[13px] leading-normal text-koi-ink2">KOI does not set delivery times. Swiggy shows your delivery window at their checkout.</p>
              </StepCard>

              {/* Honest state when no supply source is connected. */}
              {!capsLoading && !canHandOff && (
                <section data-card className="rounded-[22px] border border-koi-amber-border bg-koi-amber-bg px-5 py-4">
                  <div className="text-[15px] font-bold">Swiggy checkout isn’t connected yet</div>
                  <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-koi-ink2">
                    KOI can’t send this basket to a delivery partner right now. You can still save it — it will be waiting under your orders, and nothing has been charged or ordered.
                  </p>
                </section>
              )}

              {handoffError && (
                <div role="alert" className="rounded-2xl border border-koi-red/20 bg-koi-red-bg px-3.5 py-3 text-[13.5px] font-medium leading-normal text-koi-red">
                  {handoffError}
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT: what is being sent */}
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
          <section data-summary aria-label="Order summary" className="rounded-[26px] bg-koi-forest p-6 text-koi-bg">
            <div className="flex items-center justify-between gap-3">
              <span className="font-koi-display text-2xl font-extrabold">Your basket</span>
              <span className="flex">
                {thumbs.map((i) => (
                  <span key={i.skuId ?? i.id} className="-ml-2 overflow-hidden rounded-xl border-2 border-koi-forest bg-white first:ml-0">
                    <ProductThumb src={i.image?.hero || null} alt="" size={40} radius={10} />
                  </span>
                ))}
              </span>
            </div>
            <dl className="m-0 mt-5 flex flex-col gap-3 border-b border-koi-bg/15 pb-5 text-sm">
              {planItems.length > 0 && <div className="flex justify-between"><dt className="text-koi-bg/75">This week’s plan{cartPlan?.members ? ` · for ${cartPlan.members}` : ""}</dt><dd className="m-0 font-koi-num font-semibold"><Money value={totals(planItems).total} /></dd></div>}
              {ownItems.length > 0 && <div className="flex justify-between"><dt className="text-koi-bg/75">{planItems.length ? "Also in your cart" : "Your products"}</dt><dd className="m-0 font-koi-num font-semibold"><Money value={totals(ownItems).total} /></dd></div>}
              <div className="flex justify-between"><dt className="text-koi-bg/75">Products · packs</dt><dd className="m-0 font-koi-num font-semibold">{all.products} · {all.packs}</dd></div>
              {averageKoiScore !== null && <div className="flex justify-between"><dt className="text-koi-bg/75">Average KOI score</dt><dd className="m-0 font-koi-num font-semibold">{averageKoiScore}</dd></div>}
              <div className="flex justify-between"><dt className="text-koi-bg/75">Payment</dt><dd className="m-0 font-semibold">On Swiggy</dd></div>
            </dl>
            <div className="flex items-baseline justify-between pt-5">
              <span className="text-sm text-koi-bg/75">MRP total</span>
              <span className="inline-block font-koi-num text-[38px] font-semibold leading-none text-koi-lime"><Money value={all.total} /></span>
            </div>
            <p className="m-0 mt-3 text-[13px] leading-relaxed text-koi-bg/75">{SWIGGY_NOTE}</p>
            {!plan && (
              <>
                <button
                  data-cta
                  type="button"
                  onClick={onCta}
                  disabled={!signedOut && blocked}
                  aria-busy={isProcessing}
                  className={`mt-6 flex h-[58px] w-full items-center justify-center gap-2.5 rounded-full text-base font-bold transition-colors ${!signedOut && blocked && !isProcessing ? "cursor-not-allowed bg-koi-bg/15 text-koi-bg/60" : "bg-koi-lime text-koi-forest"}`}
                >
                  {cta}
                  {!isProcessing && <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>}
                </button>
                <p className="m-0 mt-3 text-center text-[13px] leading-normal text-koi-bg/75">{why}</p>
              </>
            )}
            <Link href="/store/cart" className="mt-3 flex h-11 items-center justify-center rounded-full text-sm font-semibold text-koi-bg/85 no-underline transition-colors hover:bg-koi-bg/10">Back to cart</Link>
          </section>
          <section className="flex flex-col gap-1.5 rounded-[22px] border border-koi-forest/10 bg-koi-paper px-5 py-4">
            <span className="flex items-center gap-2 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2"><span aria-hidden="true" className="size-[7px] rounded-full bg-koi-ember" />KOI’s read</span>
            <span className="text-[13.5px] leading-normal text-koi-ink2">{intelligenceMessage}</span>
          </section>
        </aside>
      </div>
    </main>
  );
}

function StepCard({ n, title, done = false, aside = null, children, ...rest }) {
  return (
    <section data-card {...rest} className="rounded-[24px] border border-koi-forest/10 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 flex items-center gap-3 text-lg font-bold">
          {n !== null && n !== undefined && (
            done ? (
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-koi-primary text-white"><svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></span>
            ) : <span className="font-koi-num text-xs font-semibold text-koi-primary">{n}</span>
          )}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
