"use client";

// ============================================================================
// KOI — Reconciliation
//
// The screen between "here is my basket" and "KOI has handed it to Swiggy".
// It exists because two things are true at once and a shopper deserves to see
// both before anything happens:
//
//   1. Swiggy will not necessarily accept the whole basket. Stock moves
//      between browsing and checking out, and some KOI products have never
//      been matched to a Swiggy product at all.
//
//   2. Continuing REPLACES whatever is already in their Swiggy cart. That is
//      destructive, irreversible from KOI's side, and invisible from here —
//      so it is stated plainly and gated behind an explicit tick, not buried
//      in a sentence under a button.
//
// NOTHING IS SUBSTITUTED SILENTLY. Where a line cannot be fulfilled, KOI shows
// screened alternatives and the shopper chooses. Swapping food into someone's
// basket on their behalf — however good the match looks to a scoring function
// — is not a decision KOI gets to make for them.
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";
import {
  Check, CircleSlash, CircleHelp, AlertTriangle, ArrowUpRight, Link2Off, Loader2,
} from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { hasScore } from "@/lib/score";

const REASON_COPY = {
  unavailable: {
    icon: CircleSlash,
    label: "Out of stock near you",
    detail: "Swiggy doesn't have this at your address right now.",
  },
  unmapped: {
    icon: Link2Off,
    label: "Not matched yet",
    // The honest version. KOI has never established which Swiggy product
    // corresponds to the thing it screened, and guessing from the name could
    // put different food in someone's basket.
    label2: true,
    detail: "KOI hasn't confirmed which Swiggy product this is, so we won't guess.",
  },
  quantity_capped: {
    icon: AlertTriangle,
    label: "Quantity limited",
    detail: "Swiggy caps how many of these you can order.",
  },
  unknown: {
    icon: CircleHelp,
    label: "Couldn't check",
    detail: "We couldn't get an answer about this one, so we're not claiming either way.",
  },
};

function Line({ name, brand, quantity, price, score, muted = false }) {
  return (
    <div className={`flex items-center gap-3 py-2.5 ${muted ? "opacity-70" : ""}`}>
      <div className="min-w-0 flex-1">
        {brand && (
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">{brand}</div>
        )}
        <div className="truncate text-[13.5px] font-bold text-[#0E4032]" style={HEADING}>{name}</div>
      </div>
      {hasScore(score) && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: C.mint, color: C.forest }}>
          {Math.round(Number(score))}
        </span>
      )}
      <span className="shrink-0 text-[12px] font-semibold text-[#5A6B5A]">×{quantity}</span>
      {price !== null && price !== undefined && (
        <span className="shrink-0 w-16 text-right text-[13px] font-extrabold tabular-nums text-[#0E4032]" style={HEADING}>
          ₹{price}
        </span>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.plan       from /api/marketplace/handoff/prepare
 * @param {Map|object} props.byId   KOI products keyed by SKU id, for names
 * @param {(planId: string) => void} props.onCommit
 * @param {() => void} props.onBack
 * @param {boolean} props.committing
 * @param {string|null} props.error
 */
export default function HandoffReview({ plan, byId = {}, onCommit, onBack, committing = false, error = null }) {
  const [confirmed, setConfirmed] = useState(false);
  if (!plan) return null;

  const look = (id) => byId[String(id)] ?? {};
  const accepted = plan.accepted ?? [];
  const rejected = plan.rejected ?? [];
  const replaces = (plan.warnings ?? []).some((w) => w.code === "CART_REPLACED");

  // Nothing to send. Committing an empty cart would replace the shopper's real
  // one with nothing, which is destruction dressed as a hand-off.
  const nothingToSend = accepted.length === 0;

  return (
    <div className="space-y-6">

      {/* What Swiggy will take */}
      <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <h2 className="text-lg font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Going to Swiggy
          </h2>
          <span className="text-[12px] font-bold uppercase tracking-wider text-[#5A6B5A]">
            {accepted.length} {accepted.length === 1 ? "item" : "items"}
          </span>
        </div>

        {accepted.length ? (
          <div className="divide-y divide-[#E2E8D8]">
            {accepted.map((a) => {
              const p = look(a.koiSkuId);
              return (
                <Line key={a.koiSkuId} name={p.name ?? "Item"} brand={p.brand}
                      quantity={a.quantity} price={a.unitPrice} score={p.score} />
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-[#5A6B5A]" style={BODY}>
            None of this basket can be fulfilled from Swiggy right now.
          </p>
        )}

        {/* A total is shown only when every line resolved. A subtotal that
            quietly omits an unresolved line is a number KOI cannot stand
            behind — so when it is incomplete we say why instead. */}
        <div className="mt-4 pt-4 border-t border-[#E2E8D8]">
          {plan.totals?.complete && plan.totals?.subtotal !== null ? (
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-[#5A6B5A]">Swiggy&apos;s prices, this basket</span>
              <span className="text-[18px] font-extrabold tabular-nums text-[#0E4032]" style={HEADING}>
                ₹{plan.totals.subtotal.toLocaleString()}
              </span>
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-[#5A6B5A]" style={BODY}>
              No total yet — some items below couldn&apos;t be priced. Swiggy shows the final
              amount at their checkout.
            </p>
          )}
        </div>
      </section>

      {/* What it won't, and what KOI would get instead */}
      {rejected.length > 0 && (
        <section className="rounded-2xl border p-5 md:p-6" style={{ borderColor: `${C.orange}33`, background: "#FFF6F0" }}>
          <h2 className="text-lg font-bold text-[#0E4032] mb-1" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Can&apos;t be sent
          </h2>
          <p className="text-[12.5px] leading-relaxed text-[#5A6B5A] mb-4" style={BODY}>
            These stay in your KOI basket. We won&apos;t swap anything in without you choosing it.
          </p>

          <ul className="space-y-4">
            {rejected.map((r) => {
              const p = look(r.koiSkuId);
              const copy = REASON_COPY[r.reason] ?? REASON_COPY.unknown;
              const Icon = copy.icon;
              const subs = r.substitutes ?? [];
              return (
                <li key={r.koiSkuId} className="rounded-xl bg-white/70 p-3.5 border border-[#083D2D]/6">
                  <div className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.orange }} />
                    <div className="min-w-0 flex-1">
                      {p.brand && (
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">{p.brand}</div>
                      )}
                      <div className="text-[13.5px] font-bold text-[#0E4032]" style={HEADING}>{p.name ?? "Item"}</div>
                      <div className="mt-1 text-[12px] font-semibold" style={{ color: C.orange }}>{copy.label}</div>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[#5A6B5A]" style={BODY}>{copy.detail}</p>
                    </div>
                  </div>

                  {subs.length > 0 && (
                    <div className="mt-3 pl-7">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#5A6B5A]">
                        Screened alternatives in stock
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {subs.map((s) => (
                          <li key={s.id ?? s.externalId}>
                            <Link href={`/store/product/${s.id}`}
                                  className="group flex items-center gap-2.5 rounded-lg border border-[#083D2D]/8 bg-white px-3 py-2 transition-colors hover:border-[#083D2D]/20">
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[#0E4032]" style={HEADING}>
                                {s.name}
                              </span>
                              {hasScore(s.score) && (
                                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
                                      style={{ background: C.mint, color: C.forest }}>
                                  {Math.round(Number(s.score))}
                                </span>
                              )}
                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#083D2D]/25 group-hover:text-[#083D2D]/60" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The destructive bit, said out loud */}
      {replaces && !nothingToSend && (
        <section className="rounded-2xl border border-[#B8860B]/35 bg-[#B8860B]/[0.07] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#B8860B" }} />
            <div>
              <h3 className="text-[14px] font-bold text-[#0E4032]">This replaces your Swiggy cart</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#5A6B5A]" style={BODY}>
                Swiggy keeps one cart per account. Continuing clears whatever is in it now and
                puts this basket there instead. Anything you had saved on Swiggy will be gone.
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-[#0E4032]/30 accent-[#0E4032]"
                />
                <span className="text-[12.5px] font-semibold text-[#0E4032]">
                  I understand — replace my Swiggy cart
                </span>
              </label>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] font-medium text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button
          onClick={onBack}
          disabled={committing}
          className="flex-1 py-3.5 rounded-xl bg-white text-[#0E4032] font-bold text-[14px] border border-[#E2E8D8] hover:bg-[#F2F6EC] transition-colors disabled:opacity-50"
        >
          Back to basket
        </button>
        <button
          onClick={() => onCommit(plan.planId)}
          disabled={committing || nothingToSend || (replaces && !confirmed) || !plan.persisted}
          className="flex-1 py-3.5 rounded-xl bg-[#0E4032] disabled:bg-[#5A6B5A]/40 text-white font-bold text-[14px] shadow-md hover:bg-[#0E4032]/90 transition-all flex items-center justify-center gap-2"
        >
          {committing ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                      : <><Check className="h-4 w-4 text-[#C8F23E]" strokeWidth={3} /> Send to Swiggy</>}
        </button>
      </div>

      {/* `persisted` false means the plan was not stored, so exactly-once
          cannot be guaranteed. Better to refuse than to risk replacing a cart
          twice from a plan nothing is tracking. */}
      {!plan.persisted && (
        <p className="text-center text-[12px] font-semibold text-[#B8860B]">
          Couldn&apos;t save this hand-off, so we won&apos;t send it. Please try again.
        </p>
      )}
    </div>
  );
}
