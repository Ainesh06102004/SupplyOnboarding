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
// Cinematic storefront (Oct 2026): drawn in the koi-* Tailwind tokens. The
// rows carry data-go / data-go-thumb (the page flies the thumbnails to Swiggy
// on send), the not-going block data-staying and the tick data-consent, so
// KOI can point at what matters. onConfirm tells the page when the tick moves.
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";
import { CircleSlash, CircleHelp, AlertTriangle, ArrowUpRight, Link2Off, Loader2 } from "lucide-react";
import { hasScore } from "@/lib/score";
import { ProductThumb } from "@/components/store/system/primitives";

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

function Line({ id, image, name, brand, quantity, price, score }) {
  return (
    <li data-go={id} className="grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-koi-forest/10 py-3 last:border-b-0 sm:grid-cols-[56px_minmax(0,1fr)_auto_auto_84px] sm:gap-4">
      <span data-go-thumb className="block"><ProductThumb src={image || null} alt="" size={56} radius={12} /></span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{name}</span>
        {brand && <span className="truncate font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">{brand}</span>}
      </span>
      {hasScore(score) ? (
        <span className="rounded-full border border-koi-tint-border bg-koi-tint px-2 py-0.5 font-koi-num text-[11px] font-bold text-koi-primary">{Math.round(Number(score))}</span>
      ) : <span />}
      <span className="font-koi-num text-sm font-semibold text-koi-ink2">× {quantity}</span>
      {/* Swiggy's unit price × the packs going: the line's own total. */}
      <span className="col-span-4 text-right font-koi-num text-base font-semibold sm:col-span-1">{price !== null && price !== undefined ? `₹${(Number(price) * Number(quantity || 1)).toLocaleString("en-IN")}` : ""}</span>
    </li>
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
 * @param {(on: boolean) => void} [props.onConfirm]
 */
export default function HandoffReview({ plan, byId = {}, onCommit, onBack, committing = false, error = null, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  if (!plan) return null;

  const look = (id) => byId[String(id)] ?? {};
  const accepted = plan.accepted ?? [];
  const rejected = plan.rejected ?? [];
  const replaces = (plan.warnings ?? []).some((w) => w.code === "CART_REPLACED");

  // Nothing to send. Committing an empty cart would replace the shopper's real
  // one with nothing, which is destruction dressed as a hand-off.
  const nothingToSend = accepted.length === 0;
  const canSend = !(committing || nothingToSend || (replaces && !confirmed) || !plan.persisted);

  return (
    <div className="flex flex-col gap-5">

      {/* What Swiggy will take */}
      <section data-card aria-labelledby="h-going" className="rounded-[24px] border border-koi-forest/10 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-going" className="m-0 flex items-center gap-3 text-lg font-bold"><span className="font-koi-num text-xs font-semibold text-koi-primary">03</span>Going to Swiggy</h2>
          <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted"><span className="font-koi-num">{accepted.length}</span> {accepted.length === 1 ? "product" : "products"} · checked near you</span>
        </div>

        {accepted.length ? (
          <ul data-going className="m-0 mt-3 flex list-none flex-col p-0">
            {accepted.map((a) => {
              const p = look(a.koiSkuId);
              return <Line key={a.koiSkuId} id={a.koiSkuId} image={p.image?.hero} name={p.name ?? "Item"} brand={p.brand} quantity={a.quantity} price={a.unitPrice} score={p.score} />;
            })}
          </ul>
        ) : (
          <p className="m-0 mt-3 text-[13.5px] leading-relaxed text-koi-ink2">
            None of this basket can go to Swiggy right now. Each item says why below, and nothing leaves your cart.
          </p>
        )}

        {/* A total is shown only when every line resolved. A subtotal that
            quietly omits an unresolved line is a number KOI cannot stand
            behind — so when it is incomplete we say why instead. */}
        <div className="mt-3 border-t border-koi-forest/10 pt-3">
          {plan.totals?.complete && plan.totals?.subtotal !== null ? (
            <div className="flex items-baseline justify-between">
              <span className="text-[13.5px] font-semibold text-koi-ink2">Swiggy’s prices, this basket</span>
              <span className="font-koi-num text-xl font-semibold">₹{plan.totals.subtotal.toLocaleString("en-IN")}</span>
            </div>
          ) : (
            <p className="m-0 text-[12.5px] leading-relaxed text-koi-ink2">
              No total yet — some items below couldn’t be priced. Swiggy shows the final amount at their checkout.
            </p>
          )}
        </div>

        {/* What it won't, and what KOI would get instead */}
        {rejected.length > 0 && (
          <div data-staying className="mt-4 rounded-2xl border border-koi-amber-border bg-koi-amber-bg p-4">
            <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-amber-ink">Not going · <span className="font-koi-num">{rejected.length}</span></span>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-koi-ink2">These stay in your KOI cart. We won’t swap anything in without you choosing it.</p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
              {rejected.map((r) => {
                const p = look(r.koiSkuId);
                const copy = REASON_COPY[r.reason] ?? REASON_COPY.unknown;
                const Icon = copy.icon;
                const subs = r.substitutes ?? [];
                return (
                  <li key={r.koiSkuId} className="rounded-xl bg-white p-3.5">
                    <div className="flex items-start gap-3">
                      <ProductThumb src={p.image?.hero || null} alt="" size={48} radius={12} />
                      <div className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-koi-warm"><Icon className="size-3.5" />{copy.label}</span>
                        <div className="text-[15px] font-bold">{p.name ?? "Item"}</div>
                        <p className="m-0 mt-0.5 text-[13px] leading-normal text-koi-ink2">{copy.detail}</p>
                      </div>
                    </div>

                    {subs.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        <span className="font-koi-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-koi-primary">Screened alternatives in stock</span>
                        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                          {subs.map((s) => (
                            <li key={s.id ?? s.externalId}>
                              <Link href={`/store/product/${s.id}`} className="flex items-center gap-2.5 rounded-xl border border-koi-forest/10 bg-koi-paper px-3 py-2 no-underline transition-colors hover:bg-koi-tint">
                                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-koi-ink">{s.name}</span>
                                {hasScore(s.score) && <span className="rounded-full bg-koi-tint px-1.5 font-koi-num text-[10px] font-bold text-koi-primary">{Math.round(Number(s.score))}</span>}
                                <ArrowUpRight className="size-3.5 text-koi-muted" />
                              </Link>
                              {/* Why KOI offers this one: the recorded reason and its
                                  figures (food.substitution_edge), never "healthier". */}
                              {(s.why ?? []).length > 0 && <p className="m-0 mt-1 px-3 text-[11.5px] leading-normal text-koi-ink2">{s.why.join(" · ")}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* The destructive bit, said out loud */}
        {replaces && !nothingToSend && (
          <div data-consent className="mt-4 rounded-2xl border border-koi-forest/15 bg-koi-paper p-4">
            <span className="flex items-center gap-2 text-[15px] font-bold"><AlertTriangle className="size-4 text-koi-amber" />This replaces your Swiggy cart</span>
            <p className="m-0 mt-1 text-sm leading-relaxed text-koi-ink2">
              Swiggy keeps one cart per account. Continuing clears whatever is in it now and
              puts this basket there instead. Anything you had saved on Swiggy will be gone.
            </p>
            <label data-consent-tick className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5 text-sm font-semibold">
              <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); onConfirm?.(e.target.checked); }} className="size-5 accent-[#083d2d]" />
              I understand — replace my Swiggy cart
            </label>
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-koi-red/20 bg-koi-red-bg px-3.5 py-3 text-[13.5px] font-medium leading-normal text-koi-red">
          {error}
        </div>
      )}

      <div className="flex flex-wrap-reverse gap-2.5">
        <button type="button" onClick={onBack} disabled={committing} className="h-14 flex-[1_1_160px] rounded-full border border-koi-forest/20 bg-white text-[15px] font-semibold text-koi-forest disabled:opacity-60">
          Back to checkout
        </button>
        <button
          data-send
          type="button"
          onClick={() => onCommit(plan.planId)}
          disabled={!canSend}
          aria-describedby="send-help"
          className={`flex h-14 flex-[2_1_220px] items-center justify-center gap-2.5 rounded-full text-base font-bold transition-colors ${canSend || committing ? "bg-koi-forest text-koi-lime" : "cursor-not-allowed bg-koi-forest/15 text-koi-forest/50"}`}
        >
          {committing ? <><Loader2 className="size-5 animate-spin" /> Sending…</> : <>Send to Swiggy <span aria-hidden="true">→</span></>}
        </button>
      </div>
      <p id="send-help" className="m-0 text-center text-[13px] text-koi-ink2">
        {replaces && !confirmed && !nothingToSend ? "Tick “replace my Swiggy cart” above to send." : "Opens Swiggy to pay. KOI never takes payment."}
      </p>

      {/* `persisted` false means the plan was not stored, so exactly-once
          cannot be guaranteed. Better to refuse than to risk replacing a cart
          twice from a plan nothing is tracking. */}
      {!plan.persisted && (
        <p className="m-0 text-center text-[12.5px] font-semibold text-koi-amber-ink">
          Couldn’t save this hand-off, so we won’t send it. Please try again.
        </p>
      )}
    </div>
  );
}
