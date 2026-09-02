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
// ============================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ShieldCheck, ChevronRight, Sparkles, Lock, ArrowUpRight, Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import { averageScore } from "@/lib/score";
import { fetchCapabilities, fetchZone, prepareHandoff, commitHandoff } from "@/lib/marketplace/browser";
import { useLocation } from "@/contexts/LocationContext";
import HandoffReview from "@/components/store/checkout/HandoffReview";
import { fulfilmentService } from "@/lib/supabase/fulfilmentService";
import AddressManager from "@/components/store/AddressManager";

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
  const { pincode } = useLocation();

  const items = useCartStore((state) => state.items);
  const hydrated = useCartStore((state) => state.hydrated);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);

  // Only redirect once the cart has actually been restored. Redirecting on a
  // still-hydrating cart bounced shoppers with a full basket back to the shop.
  useEffect(() => {
    if (hydrated && items.length === 0) router.push("/store/shop");
  }, [hydrated, items.length, router]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCapabilities(controller.signal).then(setCaps);
    return () => controller.abort();
  }, []);

  const onSelectAddress = useCallback((a) => setAddress(a), []);

  // The plan speaks in KOI SKU ids; the screen needs names, brands and scores.
  // Built from the cart, which already holds resolved catalogue products.
  const productsBySkuId = React.useMemo(() => {
    const map = {};
    for (const i of items) {
      const key = i.skuId ?? i.id;
      if (key) map[String(key)] = i;
    }
    return map;
  }, [items]);

  // ─── KOI SCORE SUMMARY ───
  // Speaks only to what the score means. It previously claimed the basket was
  // "extremely clean, high in protein, and low in added sugar" purely because
  // the average score cleared 90 — a nutrition claim inferred from a proxy,
  // with no macro ever read. A KOI score is evidence of screening, not of
  // protein content.
  const averageKoiScore = averageScore(items);

  let cartQuality = "Screened";
  let intelligenceMessage = "Every product here cleared KOI's ingredient and nutrition review.";
  if (averageKoiScore !== null && averageKoiScore >= 90) {
    cartQuality = "Excellent";
    intelligenceMessage = "These products sit near the top of KOI's screening range.";
  } else if (averageKoiScore !== null && averageKoiScore >= 80) {
    cartQuality = "Great";
    intelligenceMessage = "A basket scoring well above KOI's minimum standard.";
  }

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
      const lines = items
        .map((i) => ({ koiSkuId: i.skuId ?? i.id, quantity: i.quantity }))
        .filter((l) => l.koiSkuId);

      const { ok, plan: prepared, code } = await prepareHandoff(zone.zoneId, lines);
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
    try {
      const { ok, result, code } = await commitHandoff(planId);
      if (!ok) {
        setHandoffError(
          code === "REAUTH" ? "Your Swiggy connection expired. Please reconnect and try again."
          : code === "RATE_LIMITED" ? "Swiggy is rate-limiting us. Give it a moment and try again."
          : "We couldn't hand this basket over. Nothing has been ordered."
        );
        return;
      }
      if (intentId) {
        await fulfilmentService.markHandedOff(intentId, {
          marketplace: caps.adapter,
          planId,
          externalOrderRef: result?.externalCartRef ?? null,
        });
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

  if (!hydrated || items.length === 0) return null;

  const blocked = !user?.uid || !address || isProcessing;

  const ctaLabel = isProcessing
    ? "Working…"
    : capsLoading
      ? "Checking availability…"
      : canHandOff
        ? "Review what Swiggy has"
        : "Save this basket";

  return (
    <div className="min-h-screen pb-32 md:pb-16 bg-[#F2F6EC]">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#F2F6EC]/85 border-b border-[#E2E8D8]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60 border border-[#E2E8D8] hover:bg-white transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-[#0E4032]" />
            </button>
            <h1 className="text-lg md:text-xl font-bold text-[#0E4032] leading-tight" style={{ fontFamily: "var(--font-koi-heading)" }}>Checkout</h1>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[#5A6B5A]">
            <span className="opacity-50">Cart</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            <span className="text-[#0E4032]">Checkout</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            <span className="opacity-50">Hand-off</span>
          </div>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* LEFT: the flow.
              Once a plan exists the reconciliation screen REPLACES this rather
              than appearing beneath it: it is a decision point, and leaving the
              address picker and the explainer above it invites a shopper to
              scroll past the one thing they need to read. */}
          <div className="lg:col-span-7 space-y-6">

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
            {/* Delivery address — the shopper's real saved addresses. */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
              <h2 className="text-lg font-bold text-[#0E4032] mb-5" style={{ fontFamily: "var(--font-koi-heading)" }}>Deliver To</h2>
              <AddressManager onSelect={onSelectAddress} selectedAddressId={address?.id} />
            </section>

            {/* How this actually works.
                Replaces the payment-method picker entirely. KOI is not
                merchant of record, so offering UPI/Card/COD here was offering
                something KOI cannot process. */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
              <h2 className="text-lg font-bold text-[#0E4032] mb-5" style={{ fontFamily: "var(--font-koi-heading)" }}>
                How this order completes
              </h2>

              <ol className="space-y-4">
                {[
                  {
                    n: "01",
                    title: "KOI hands your basket to Swiggy Instamart",
                    body: "We match each product to what Swiggy has in stock near you and load it into your Swiggy cart.",
                  },
                  {
                    n: "02",
                    title: "You pay and confirm on Swiggy",
                    body: "Payment, delivery and support are Swiggy's. KOI never handles your payment details and never charges you.",
                  },
                  {
                    n: "03",
                    title: "Swiggy delivers",
                    body: "Prices and availability are Swiggy's at the moment you check out, so they may differ from what you see here.",
                  },
                ].map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#2D7A5E] mt-0.5">{s.n}</span>
                    <div>
                      <h4 className="text-[14px] font-bold text-[#0E4032]">{s.title}</h4>
                      <p className="mt-1 text-[13px] text-[#5A6B5A] leading-relaxed">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* No delivery window is promised. The previous copy claimed
                  "Delivered fresh within 2-4 hours", which KOI has no
                  fulfilment source to back. */}
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-[#F2F6EC] p-4 border border-[#E2E8D8]">
                <Info className="w-4 h-4 text-[#2D7A5E] shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-[#5A6B5A] leading-relaxed">
                  KOI does not set delivery times. Swiggy shows your delivery window at their checkout.
                </p>
              </div>
            </section>

            {/* Honest state when no supply source is connected. */}
            {!capsLoading && !canHandOff && (
              <section className="rounded-2xl border border-[#B8860B]/30 bg-[#B8860B]/[0.06] p-5 md:p-6">
                <h2 className="text-[15px] font-bold text-[#0E4032]">Swiggy checkout isn&apos;t connected yet</h2>
                <p className="mt-2 text-[13px] text-[#5A6B5A] leading-relaxed">
                  KOI can&apos;t send this basket to a delivery partner right now. You can still save it —
                  it will be waiting under your orders, and nothing has been charged or ordered.
                </p>
              </section>
            )}

            {handoffError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] font-medium text-red-800">
                {handoffError}
              </div>
            )}
              </>
            )}
          </div>

          {/* RIGHT: summary */}
          <div className="lg:col-span-5">
            <div className="sticky top-[100px] space-y-6">

              <div className="bg-[#0E4032] text-white rounded-2xl p-6 shadow-[0_8px_30px_rgba(14,64,50,0.15)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />

                <div className="flex items-center gap-2.5 mb-6 relative z-10">
                  <Sparkles className="w-5 h-5 text-[#C8F23E]" />
                  <h3 className="text-[18px] font-bold text-white tracking-wide" style={{ fontFamily: "var(--font-koi-heading)" }}>KOI Basket Summary</h3>
                </div>

                <div className="flex items-center justify-between mb-5 relative z-10 border-b border-white/10 pb-5">
                  <div className="flex flex-col gap-1 text-center">
                    <span className="text-[28px] font-bold text-white leading-none" style={{ fontFamily: "var(--font-koi-heading)" }}>{totalItems}</span>
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Products</span>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="flex flex-col gap-1 text-center">
                    <span className="text-[28px] font-bold text-[#C8F23E] leading-none" style={{ fontFamily: "var(--font-koi-heading)" }}>{averageKoiScore ?? "—"}</span>
                    <span className="text-[10px] font-bold text-[#C8F23E]/80 uppercase tracking-wider">Avg Score</span>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="flex flex-col gap-1 text-center">
                    <span className="text-[18px] font-bold text-white leading-tight mt-1">{cartQuality}</span>
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Quality</span>
                  </div>
                </div>

                <div className="bg-white/10 rounded-xl p-4 border border-white/5 relative z-10 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#C8F23E] shrink-0 mt-0.5" />
                  <p className="text-[13px] text-white/90 leading-relaxed font-medium">{intelligenceMessage}</p>
                </div>
              </div>

              {/* Basket value — labelled as KOI's listed prices, not a bill. */}
              <div className="bg-white rounded-2xl border border-[#E2E8D8] p-6 shadow-[0_4px_20px_rgba(14,64,50,0.04)]">
                <h3 className="text-[18px] font-bold text-[#0E4032] mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>Basket value</h3>
                <p className="text-[12px] text-[#5A6B5A] mb-5 leading-relaxed">
                  KOI&apos;s listed prices. Swiggy charges its own prices, plus any delivery
                  and handling fees, at their checkout.
                </p>

                <div className="flex justify-between items-center text-[14px] mb-5">
                  <span className="text-[#5A6B5A] font-semibold">{totalItems} {totalItems === 1 ? "product" : "products"}</span>
                  <span className="text-[#0E4032] font-bold tabular-nums">₹{subtotal.toLocaleString()}</span>
                </div>

                {/* No "Delivery Fee: Free" line. KOI does not set it and cannot
                    waive it — Swiggy's fees are Swiggy's to state. */}

                <div className="hidden lg:block">
                  <button
                    onClick={handleReview}
                    disabled={blocked}
                    className="w-full py-4 rounded-xl bg-[#0E4032] disabled:bg-[#5A6B5A]/40 text-white font-bold text-[15px] shadow-[0_4px_12px_rgba(14,64,50,0.2)] hover:bg-[#0E4032]/90 disabled:hover:shadow-none transition-all flex items-center justify-center gap-2"
                  >
                    {ctaLabel}
                    {canHandOff && !isProcessing && <ArrowUpRight className="w-4 h-4" />}
                  </button>

                  {!user?.uid && (
                    <p className="mt-3 text-center text-[12px] font-semibold text-[#5A6B5A]">Sign in to continue</p>
                  )}
                  {user?.uid && !address && (
                    <p className="mt-3 text-center text-[12px] font-semibold text-[#5A6B5A]">Add a delivery address to continue</p>
                  )}

                  <div className="flex items-center justify-center gap-1.5 mt-4">
                    <Lock className="w-3 h-3 text-[#5A6B5A]" />
                    <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wide">
                      Payment is handled by Swiggy
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* ─── MOBILE STICKY BAR ───
          Hidden during reconciliation: that screen owns its own actions, and a
          second "review" button that silently re-prepares would spend provider
          quota every time a thumb landed near it. */}
      <div className={`lg:hidden ${plan ? "hidden" : ""} fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8D8] shadow-[0_-8px_30px_rgba(14,64,50,0.06)] p-4 pb-safe z-40`}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider">Basket value</span>
            <span className="text-xl font-bold text-[#0E4032] tabular-nums" style={{ fontFamily: "var(--font-koi-heading)" }}>₹{subtotal.toLocaleString()}</span>
          </div>

          <button
            onClick={handleReview}
            disabled={blocked}
            className="flex-1 py-3.5 rounded-xl bg-[#0E4032] disabled:bg-[#5A6B5A]/40 text-white font-bold text-[14px] hover:bg-[#0E4032]/90 shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            {ctaLabel}
            {canHandOff && !isProcessing && <ArrowUpRight className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3 text-[#5A6B5A]/60" />
          <span className="text-[9px] font-bold text-[#5A6B5A]/80 uppercase tracking-widest">Payment is handled by Swiggy</span>
        </div>
      </div>

      <style jsx global>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
}
