"use client";

// ============================================================================
// KOI STORE — Fulfilment history
//
// What this page used to be: two hardcoded orders for brands KOI has never
// screened (The Whole Truth, Epigamia, Farmley, Borécha), each with an
// invented KOI score, a four-step delivery tracker reading "Out for Delivery",
// an ETA of "Delivered by 7:30 PM", a payment method, and a sidebar asserting
// "Avg KOI Score 89" and "Avg Protein/Order 74g".
//
// KOI can observe none of that. It is not merchant of record, gets no delivery
// webhook and holds no payment record. The tracker was the worst of it: four
// states, three of which KOI has no way to know.
//
// So this page shows fulfilment intents — the record of what KOI actually did
// — and its status vocabulary stops exactly where KOI's knowledge stops. The
// last step is "Handed off to Swiggy", and the only thing that can move an
// intent past it is the shopper telling us it arrived.
// ============================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Package, MapPin, ChevronRight, ShoppingBag, ExternalLink,
  RotateCcw, Check, CircleDashed, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import {
  fulfilmentService, FULFILMENT, DELIVERY_REPORT, describeState,
} from "@/lib/supabase/fulfilmentService";

// ─── KOI SCORE RING ───
// Renders nothing without a score. An unscored line is not a zero-scoring one.
function KoiScore({ score, size = 32 }) {
  const value = Number(score);
  if (score === null || score === undefined || !Number.isFinite(value)) return null;
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 90 ? "#0E4032" : value >= 80 ? "#2D7A5E" : "#B8860B";
  return (
    <div
      className="relative flex items-center justify-center bg-[#F2F6EC] rounded-full shadow-[0_2px_8px_rgba(14,64,50,0.08)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8D8" strokeWidth="2" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2"
          strokeDasharray={circ} strokeDashoffset={circ - (value / 100) * circ} strokeLinecap="round"
        />
      </svg>
      <span className="text-[9px] font-bold" style={{ color, fontFamily: "var(--font-koi-heading)" }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

// ─── PROGRESS ───
// Three steps, because KOI knows three things. There is deliberately no
// "Packed" and no "Out for delivery": those happen inside Swiggy, which does
// not tell KOI about them. Showing them would be a guess dressed as tracking.
const STEPS = [
  { key: "assembled", label: "Basket assembled", knownBy: "KOI" },
  { key: "handed_off", label: "Handed off to Swiggy", knownBy: "KOI" },
  { key: "reported", label: "You confirm arrival", knownBy: "you" },
];

function stepIndex(state) {
  if (state === FULFILMENT.REPORTED_DELIVERED) return 2;
  if (state === FULFILMENT.HANDED_OFF) return 1;
  return 0;
}

function Progress({ state }) {
  const current = stepIndex(state);
  return (
    <div className="mt-6 mb-2 relative px-2">
      <div className="absolute top-3 left-6 right-6 h-0.5 bg-[#E2E8D8] rounded-full z-0" />
      <div
        className="absolute top-3 left-6 h-0.5 bg-[#0E4032] rounded-full z-0 transition-all duration-700 ease-out"
        style={{ width: `${(current / (STEPS.length - 1)) * 100}%` }}
      />
      <div className="relative z-10 flex justify-between">
        {STEPS.map((step, idx) => {
          const done = idx <= current;
          const active = idx === current;
          return (
            <div key={step.key} className="flex flex-col items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500 ${done ? "bg-[#0E4032] shadow-md" : "bg-white border-2 border-[#E2E8D8]"}`}>
                {done ? <Check className="w-3.5 h-3.5 text-[#C8F23E]" strokeWidth={3} />
                      : <CircleDashed className="w-3 h-3 text-[#E2E8D8]" />}
              </div>
              <span className={`text-[10px] uppercase tracking-wider font-bold text-center w-20 leading-tight ${active ? "text-[#0E4032]" : done ? "text-[#5A6B5A]" : "text-[#5A6B5A]/40"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-[11px] text-[#5A6B5A]/70 leading-relaxed">
        KOI can see the first two. What happens inside Swiggy — packing, dispatch, delivery —
        is theirs to show you.
      </p>
    </div>
  );
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const addToCart = useCartStore((s) => s.addToCart);
  const clearCart = useCartStore((s) => s.clearCart);

  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!user?.uid) { setIntents([]); setLoading(false); return; }
    setLoading(true);
    const rows = await fulfilmentService.listIntents(user.uid);
    setIntents(rows);
    setLoading(false);
  }, [user]);

  // Deferred by a tick, the same way AddressManager loads: `load` flips
  // `loading` synchronously, and React's set-state-in-effect rule (correctly)
  // rejects that as a render-phase update.
  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // "Active" is anything KOI still considers open — a basket it holds, or one
  // handed off that the shopper has not yet confirmed arrived.
  const isActive = (i) => i.state === FULFILMENT.DRAFT || i.state === FULFILMENT.HANDED_OFF;
  const shown = intents.filter((i) => (activeTab === "active" ? isActive(i) : !isActive(i)));

  const handleReport = async (intent, report) => {
    setBusyId(intent.id);
    await fulfilmentService.reportDelivery(intent.id, report);
    await load();
    setSelected(null);
    setBusyId(null);
  };

  const handleReorder = (intent) => {
    clearCart();
    // Rebuild from the snapshot. Prices and scores are as they were on the day
    // — the cart store resolves them against the live catalogue on load, so a
    // stale figure never survives to checkout.
    (intent.items || []).forEach((line) => {
      addToCart({
        id: line.koi_sku_id || line.id,
        brand: line.brand_name,
        name: line.product_name,
        price: line.unit_mrp_at_handoff,
        score: line.koi_score_at_handoff,
        quantity: line.quantity,
        tags: [], dietary: [],
      });
    });
    router.push("/store/cart");
  };

  // ─── SIGNED OUT ───
  if (!loading && !user?.uid) {
    return (
      <EmptyShell
        title="Sign in to see your baskets"
        body="Your fulfilment history is tied to your KOI account."
        cta="Go to the shop"
        onCta={() => router.push("/store/shop")}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F6EC] flex items-center justify-center">
        <p className="text-[#5A6B5A] font-semibold text-sm">Loading your baskets…</p>
      </div>
    );
  }

  if (intents.length === 0) {
    return (
      <EmptyShell
        title="No baskets yet"
        body="Start discovering products that earned their place through independent screening."
        cta="Start shopping"
        onCta={() => router.push("/store/shop")}
      />
    );
  }

  return (
    <div className="min-h-screen pb-32 md:pb-16 bg-[#F2F6EC] relative">
      {/* ── TABS ── */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F2F6EC]/85 border-b border-[#E2E8D8]/60 pt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 border-b border-[#E2E8D8]/60">
          {[["active", "Active"], ["past", "Past"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`pb-3 text-[14px] font-bold uppercase tracking-wider transition-colors relative ${activeTab === key ? "text-[#0E4032]" : "text-[#5A6B5A]/60 hover:text-[#5A6B5A]"}`}
            >
              {label}
              {activeTab === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0E4032] rounded-t-full" />}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          <div className="lg:col-span-8 space-y-6">
            {shown.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E2E8D8]">
                <p className="text-[#5A6B5A] font-bold">No {activeTab} baskets.</p>
              </div>
            ) : (
              shown.map((intent) => {
                const desc = describeState(intent.state);
                const lines = intent.items || [];
                return (
                  <div key={intent.id} className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
                    <div className="flex justify-between items-start mb-4 pb-4 border-b border-[#E2E8D8] gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider mb-1">
                          {fmtDate(intent.created_at)}
                        </p>
                        <h3 className="text-lg font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
                          {desc.label}
                        </h3>
                        {intent.external_order_ref && (
                          <p className="text-[12px] font-semibold text-[#2D7A5E] mt-0.5">
                            Swiggy ref {intent.external_order_ref}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {intent.subtotal_at_handoff !== null && (
                          <span className="text-[18px] font-bold text-[#0E4032] tabular-nums" style={{ fontFamily: "var(--font-koi-heading)" }}>
                            ₹{Number(intent.subtotal_at_handoff).toLocaleString()}
                          </span>
                        )}
                        <p className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider mt-1">
                          {intent.item_count} {intent.item_count === 1 ? "item" : "items"}
                        </p>
                      </div>
                    </div>

                    {lines.length > 0 && (
                      <p className="text-[13px] text-[#5A6B5A] leading-relaxed line-clamp-2 pr-4 font-medium mb-6">
                        <span className="font-bold text-[#0E4032]">Contains: </span>
                        {lines.map((l) => `${l.product_name} ×${l.quantity}`).join(", ")}
                      </p>
                    )}

                    {isActive(intent) && <Progress state={intent.state} />}

                    <div className="mt-6 pt-4 border-t border-[#E2E8D8] flex gap-3 flex-col sm:flex-row">
                      <button
                        onClick={() => setSelected(intent)}
                        className="flex-1 py-3 rounded-xl bg-[#F2F6EC] text-[#0E4032] font-bold text-[14px] hover:bg-[#E2E8D8] transition-colors border border-[#E2E8D8]"
                      >
                        View details
                      </button>

                      {intent.state === FULFILMENT.HANDED_OFF ? (
                        <button
                          onClick={() => handleReport(intent, DELIVERY_REPORT.ARRIVED)}
                          disabled={busyId === intent.id}
                          className="flex-1 py-3 rounded-xl bg-[#0E4032] disabled:opacity-50 text-white font-bold text-[14px] shadow-md hover:bg-[#0E4032]/90 transition-all flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4 text-[#C8F23E]" strokeWidth={3} />
                          {busyId === intent.id ? "Saving…" : "This arrived"}
                        </button>
                      ) : intent.state === FULFILMENT.DRAFT ? (
                        <button
                          onClick={() => router.push("/store/checkout")}
                          className="flex-1 py-3 rounded-xl bg-[#0E4032] text-white font-bold text-[14px] shadow-md hover:bg-[#0E4032]/90 transition-all flex items-center justify-center gap-2"
                        >
                          <ShoppingBag className="w-4 h-4 text-[#C8F23E]" /> Finish this basket
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReorder(intent)}
                          className="flex-1 py-3 rounded-xl bg-[#0E4032] text-white font-bold text-[14px] shadow-md hover:bg-[#0E4032]/90 transition-all flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4 text-[#C8F23E]" /> Build this basket again
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT: what KOI can and cannot tell you.
              Replaces the old "Your KOI Insights" panel, which asserted an
              average score and an average protein per order that were both
              literals unconnected to any basket. */}
          <div className="lg:col-span-4">
            <div className="sticky top-[140px] bg-[#0E4032] text-white rounded-2xl p-6 shadow-[0_8px_30px_rgba(14,64,50,0.15)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
              <h3 className="text-[18px] font-bold text-white tracking-wide mb-4 relative z-10" style={{ fontFamily: "var(--font-koi-heading)" }}>
                Where your order lives
              </h3>
              <p className="text-[13px] text-white/75 leading-relaxed relative z-10">
                KOI curates and hands off. Once a basket reaches Swiggy, they own the
                delivery — and they hold the live tracking, the payment record and support.
              </p>
              <a
                href="https://www.swiggy.com/instamart"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-white/15 relative z-10"
              >
                Track on Swiggy <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <p className="mt-4 text-[11px] text-white/45 leading-relaxed relative z-10">
                Need to cancel? Swiggy has no cancellation API — call their support on
                080-67466729.
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* ─── DETAIL DRAWER ─── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-[#0E4032]/20 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md bg-[#F2F6EC] h-full shadow-2xl flex flex-col overflow-hidden border-l border-[#E2E8D8]">
            <div className="px-6 py-5 border-b border-[#E2E8D8] bg-white flex items-center justify-between shrink-0">
              <div>
                <p className="text-[10px] font-bold text-[#5A6B5A] uppercase tracking-wider">Basket</p>
                <h2 className="text-xl font-bold text-[#0E4032] mt-0.5" style={{ fontFamily: "var(--font-koi-heading)" }}>
                  {describeState(selected.state).label}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-10 h-10 rounded-full bg-[#F2F6EC] hover:bg-[#E2E8D8] flex items-center justify-center text-[#0E4032]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {selected.address_snapshot && (
                <div className="bg-white rounded-xl border border-[#E2E8D8] p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-[#2D7A5E]" />
                    <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider">Delivering to</span>
                  </div>
                  <p className="text-[13px] font-medium text-[#0E4032] leading-relaxed">
                    {[selected.address_snapshot.street, selected.address_snapshot.city,
                      selected.address_snapshot.state, selected.address_snapshot.pincode]
                      .filter(Boolean).join(", ")}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-[14px] font-bold text-[#0E4032] mb-3" style={{ fontFamily: "var(--font-koi-heading)" }}>
                  Items ({(selected.items || []).length})
                </h3>
                <div className="space-y-3">
                  {(selected.items || []).map((line) => (
                    <div key={line.id} className="flex gap-3 bg-white p-3 rounded-xl border border-[#E2E8D8]">
                      <div className="w-14 h-14 rounded-lg bg-[#F2F6EC] border border-[#E2E8D8] flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-[#0E4032]/20" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {line.brand_name && (
                          <p className="text-[9px] uppercase tracking-wider font-bold text-[#5A6B5A]">{line.brand_name}</p>
                        )}
                        <p className="text-[13px] font-bold text-[#0E4032] leading-tight mt-0.5 line-clamp-1">{line.product_name}</p>
                        <div className="flex items-center justify-between mt-1 gap-2">
                          <span className="text-[11px] text-[#5A6B5A] font-semibold">Qty: {line.quantity}</span>
                          {line.unit_mrp_at_handoff !== null && (
                            <span className="text-[13px] font-bold text-[#0E4032] tabular-nums">
                              ₹{(Number(line.unit_mrp_at_handoff) * line.quantity).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center">
                        <KoiScore score={line.koi_score_at_handoff} size={28} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Basket value, explicitly not a bill. */}
              <div className="bg-white rounded-xl border border-[#E2E8D8] p-4">
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
                    Basket value
                  </span>
                  <span className="text-[16px] font-bold text-[#0E4032] tabular-nums" style={{ fontFamily: "var(--font-koi-heading)" }}>
                    {selected.subtotal_at_handoff !== null ? `₹${Number(selected.subtotal_at_handoff).toLocaleString()}` : "—"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-[#5A6B5A] leading-relaxed">
                  KOI&apos;s listed prices at hand-off. What you paid is on your Swiggy receipt.
                </p>
              </div>

              {selected.state === FULFILMENT.HANDED_OFF && (
                <div className="bg-white rounded-xl border border-[#E2E8D8] p-4">
                  <h3 className="text-[13px] font-bold text-[#0E4032] mb-1">Did this arrive?</h3>
                  <p className="text-[12px] text-[#5A6B5A] leading-relaxed mb-3">
                    KOI doesn&apos;t get delivery updates from Swiggy, so this is the only way we know.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReport(selected, DELIVERY_REPORT.ARRIVED)}
                      disabled={busyId === selected.id}
                      className="flex-1 py-2.5 rounded-lg bg-[#0E4032] disabled:opacity-50 text-white font-bold text-[13px]"
                    >
                      Yes, it arrived
                    </button>
                    <button
                      onClick={() => handleReport(selected, DELIVERY_REPORT.PARTIAL)}
                      disabled={busyId === selected.id}
                      className="flex-1 py-2.5 rounded-lg bg-[#F2F6EC] disabled:opacity-50 text-[#0E4032] font-bold text-[13px] border border-[#E2E8D8]"
                    >
                      Partly
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
}

function EmptyShell({ title, body, cta, onCta }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F2F6EC]">
      <div className="pt-6" />
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-6 border border-[#E2E8D8]">
          <Package className="w-10 h-10 text-[#0E4032]/30" />
        </div>
        <h2 className="text-2xl font-bold text-[#0E4032] mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>{title}</h2>
        <p className="text-[#5A6B5A] font-medium mb-8 max-w-md">{body}</p>
        <button onClick={onCta} className="px-8 py-3.5 rounded-xl font-bold text-white bg-[#0E4032] hover:bg-[#0E4032]/90 shadow-md transition-all inline-flex items-center gap-2">
          {cta} <ChevronRight className="w-4 h-4" />
        </button>
      </main>
    </div>
  );
}
