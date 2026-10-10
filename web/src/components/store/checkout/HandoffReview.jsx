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
//
// Drawn in the store's one in-app language (components/store/system/tokens).
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";
import { CircleSlash, CircleHelp, AlertTriangle, ArrowUpRight, Link2Off, Loader2 } from "lucide-react";
import { C } from "@/components/store/system/tokens";
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

function Line({ name, brand, quantity, price, score }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: `1px solid ${C.divider}` }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d="M5 12l5 5 9-10" /></svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {brand && <div className="ks-mono" style={{ letterSpacing: ".08em" }}>{brand}</div>}
        <div style={{ font: "600 14px var(--koi-sans-stack)", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      </div>
      {hasScore(score) && (
        <span className="ks-num" style={{ flex: "none", borderRadius: 999, padding: "1px 8px", fontSize: 11, background: C.tint, color: C.primary }}>{Math.round(Number(score))}</span>
      )}
      <span className="ks-mono" style={{ flex: "none", letterSpacing: ".06em" }}>× <span className="ks-num">{quantity}</span></span>
      {price !== null && price !== undefined && (
        <span className="ks-num" style={{ flex: "none", width: 64, textAlign: "right", fontSize: 14, color: C.ink }}>₹{price}</span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* What Swiggy will take */}
      <section className="ks-card" data-tone="selected" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 6 }}>
          <h2 style={{ margin: 0, font: "700 17px var(--koi-sans-stack)", color: C.ink }}>Going to Swiggy</h2>
          <span className="ks-mono"><span className="ks-num">{accepted.length}</span> {accepted.length === 1 ? "product" : "products"}</span>
        </div>

        {accepted.length ? (
          <div>
            {accepted.map((a) => {
              const p = look(a.koiSkuId);
              return <Line key={a.koiSkuId} name={p.name ?? "Item"} brand={p.brand} quantity={a.quantity} price={a.unitPrice} score={p.score} />;
            })}
          </div>
        ) : (
          <p style={{ margin: "8px 0 0", font: "400 13.5px/1.55 var(--koi-sans-stack)", color: C.ink2 }}>
            None of this basket can go to Swiggy right now. Each item says why below, and nothing leaves your cart.
          </p>
        )}

        {/* A total is shown only when every line resolved. A subtotal that
            quietly omits an unresolved line is a number KOI cannot stand
            behind — so when it is incomplete we say why instead. */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.divider}` }}>
          {plan.totals?.complete && plan.totals?.subtotal !== null ? (
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ font: "600 13.5px var(--koi-sans-stack)", color: C.ink2 }}>Swiggy&apos;s prices, this basket</span>
              <span className="ks-num" style={{ fontSize: 20, color: C.ink }}>₹{plan.totals.subtotal.toLocaleString("en-IN")}</span>
            </div>
          ) : (
            <p style={{ margin: 0, font: "400 12.5px/1.55 var(--koi-sans-stack)", color: C.ink2 }}>
              No total yet — some items below couldn&apos;t be priced. Swiggy shows the final amount at their checkout.
            </p>
          )}
        </div>
      </section>

      {/* What it won't, and what KOI would get instead */}
      {rejected.length > 0 && (
        <section style={{ borderRadius: 22, border: `1px solid ${C.warmBorder}`, background: "#fdf6f0", padding: 20 }}>
          <h2 style={{ margin: "0 0 4px", font: "700 17px var(--koi-sans-stack)", color: C.warmInk }}>Not going · <span className="ks-num">{rejected.length}</span></h2>
          <p style={{ margin: "0 0 14px", font: "400 13px/1.55 var(--koi-sans-stack)", color: C.ink2 }}>
            These stay in your KOI cart. We won&apos;t swap anything in without you choosing it.
          </p>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {rejected.map((r) => {
              const p = look(r.koiSkuId);
              const copy = REASON_COPY[r.reason] ?? REASON_COPY.unknown;
              const Icon = copy.icon;
              const subs = r.substitutes ?? [];
              return (
                <li key={r.koiSkuId} style={{ borderRadius: 14, background: "#fff", padding: 14, border: `1px solid ${C.line}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <Icon style={{ width: 16, height: 16, marginTop: 2, flex: "none", color: C.warm }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {p.brand && <div className="ks-mono" style={{ letterSpacing: ".08em" }}>{p.brand}</div>}
                      <div style={{ font: "600 14px var(--koi-sans-stack)", color: C.ink }}>{p.name ?? "Item"}</div>
                      <div style={{ marginTop: 4, font: "700 12.5px var(--koi-sans-stack)", color: C.warm }}>{copy.label}</div>
                      <p style={{ margin: "2px 0 0", font: "400 12.5px/1.5 var(--koi-sans-stack)", color: C.ink2 }}>{copy.detail}</p>
                    </div>
                  </div>

                  {subs.length > 0 && (
                    <div style={{ marginTop: 12, paddingLeft: 26 }}>
                      <p className="ks-mono" style={{ margin: 0 }}>Screened alternatives in stock</p>
                      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        {subs.map((s) => (
                          <li key={s.id ?? s.externalId}>
                            <Link href={`/store/product/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, border: `1px solid ${C.line2}`, background: "#fff", padding: "8px 12px", textDecoration: "none" }}>
                              <span style={{ flex: 1, minWidth: 0, font: "600 13px var(--koi-sans-stack)", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                              {hasScore(s.score) && (
                                <span className="ks-num" style={{ flex: "none", borderRadius: 999, padding: "1px 7px", fontSize: 10, background: C.tint, color: C.primary }}>{Math.round(Number(s.score))}</span>
                              )}
                              <ArrowUpRight style={{ width: 14, height: 14, flex: "none", color: C.muted }} />
                            </Link>
                            {/* Why KOI offers this one: the recorded reason and its
                                figures (food.substitution_edge), never "healthier". */}
                            {(s.why ?? []).length > 0 && (
                              <p style={{ margin: "4px 0 0", padding: "0 12px", font: "400 11.5px/1.5 var(--koi-sans-stack)", color: C.ink2 }}>{s.why.join(" · ")}</p>
                            )}
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
        <section style={{ borderRadius: 18, background: C.quiet, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <AlertTriangle style={{ width: 20, height: 20, marginTop: 1, flex: "none", color: C.warnText }} />
            <div>
              <h3 style={{ margin: 0, font: "700 15px var(--koi-sans-stack)", color: C.ink }}>This replaces your Swiggy cart</h3>
              <p style={{ margin: "4px 0 0", font: "400 13px/1.55 var(--koi-sans-stack)", color: C.ink2 }}>
                Swiggy keeps one cart per account. Continuing clears whatever is in it now and
                puts this basket there instead. Anything you had saved on Swiggy will be gone.
              </p>
              <label style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 18, height: 18, accentColor: C.primary }} />
                <span style={{ font: "600 13.5px var(--koi-sans-stack)", color: C.ink }}>I understand — replace my Swiggy cart</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" style={{ borderRadius: 14, border: `1px solid ${C.redBorder}`, background: C.redBg, padding: "12px 14px", font: "500 13.5px/1.5 var(--koi-sans-stack)", color: C.redText }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap-reverse", gap: 10 }}>
        <button type="button" onClick={onBack} disabled={committing} className="ks-btn" data-variant="secondary" style={{ flex: "1 1 160px" }}>
          Back to checkout
        </button>
        <button
          type="button"
          onClick={() => onCommit(plan.planId)}
          disabled={committing || nothingToSend || (replaces && !confirmed) || !plan.persisted}
          className="ks-btn"
          data-variant="primary"
          data-size="lg"
          style={{ flex: "2 1 220px" }}
        >
          {committing ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Send to Swiggy <span aria-hidden="true">→</span></>}
        </button>
      </div>
      <p style={{ margin: 0, textAlign: "center", font: "400 12.5px var(--koi-sans-stack)", color: C.ink2 }}>Opens Swiggy to pay. KOI never takes payment.</p>

      {/* `persisted` false means the plan was not stored, so exactly-once
          cannot be guaranteed. Better to refuse than to risk replacing a cart
          twice from a plan nothing is tracking. */}
      {!plan.persisted && (
        <p style={{ margin: 0, textAlign: "center", font: "600 12.5px var(--koi-sans-stack)", color: C.warnText }}>
          Couldn&apos;t save this hand-off, so we won&apos;t send it. Please try again.
        </p>
      )}
    </div>
  );
}
