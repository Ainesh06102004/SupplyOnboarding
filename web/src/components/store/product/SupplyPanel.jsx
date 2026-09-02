"use client";

// ============================================================================
// KOI — Live supply for one product
//
// Three states, and the third is the interesting one:
//
//   available    it can be bought now, at this price, in this zone
//   unknown      nobody has been asked, or nobody answered. NOT out of stock.
//   unavailable  a provider said no — and here is what KOI would get instead
//
// The substitutes are KOI's own screened products, ranked by the KRE against
// the shopper's goal. They are never the provider's suggestions: see
// lib/recommendation/substitutes.js for why that distinction is load-bearing
// rather than fussy.
//
// The `unknown` state renders a genuine explanation rather than a spinner that
// never resolves. With no supply source connected, unknown is where every
// product lives, and it has to read as an honest position rather than a
// broken one.
// ============================================================================

import React from "react";
import Link from "next/link";
import { Truck, CircleSlash, CircleHelp, Check, ArrowUpRight } from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { AVAILABILITY } from "@/lib/recommendation/config";
import { hasScore } from "@/lib/score";

function Row({ icon: Icon, tone, children }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] font-semibold" style={{ color: tone }}>
      <Icon className="mt-[1px] h-4 w-4 shrink-0" />
      <span className="leading-snug">{children}</span>
    </div>
  );
}

/**
 * @param {{ supply: object, pincode: string|null }} props
 */
export default function SupplyPanel({ supply, pincode }) {
  if (!supply) return null;

  // Before a shopper has told us where they are, there is no question to ask.
  // Prompting for a pincode is more useful than an indefinite "unknown".
  if (!pincode) {
    return (
      <div className="rounded-2xl border border-[#083D2D]/10 bg-white/60 p-4">
        <Row icon={CircleHelp} tone="#083D2D99">
          Set your delivery location to see whether this is available near you.
        </Row>
      </div>
    );
  }

  if (supply.status === "checking") {
    return (
      <div className="rounded-2xl border border-[#083D2D]/10 bg-white/60 p-4">
        <Row icon={CircleHelp} tone="#083D2D99">Checking availability near you…</Row>
      </div>
    );
  }

  if (supply.availability === AVAILABILITY.AVAILABLE) {
    return (
      <div className="rounded-2xl border p-4" style={{ borderColor: `${C.emerald}33`, background: `${C.mint}80` }}>
        <div className="flex items-center justify-between gap-4">
          <Row icon={Check} tone={C.green}>Available near you now</Row>
          {supply.deliveryEta && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-[#083D2D]/60">
              <Truck className="h-3.5 w-3.5" /> {supply.deliveryEta}
            </span>
          )}
        </div>
        {supply.price !== null && (
          <p className="mt-2 pl-[26px] text-[12px] text-[#083D2D]/55" style={BODY}>
            ₹{supply.price} on Swiggy right now. KOI&apos;s listed price may differ.
          </p>
        )}
      </div>
    );
  }

  if (supply.availability === AVAILABILITY.UNAVAILABLE) {
    return (
      <div className="rounded-2xl border p-4" style={{ borderColor: `${C.orange}33`, background: "#FFF6F0" }}>
        <Row icon={CircleSlash} tone={C.orange}>Not available near you right now</Row>

        {supply.substitutes.length > 0 ? (
          <div className="mt-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/50">
              Screened alternatives in stock
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#083D2D]/60" style={BODY}>
              KOI products that cleared the same review and can be delivered to you now.
            </p>

            <ul className="mt-3 space-y-2">
              {supply.substitutes.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/store/product/${s.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-[#083D2D]/8 bg-white p-3 transition-colors hover:border-[#083D2D]/20"
                  >
                    <div className="min-w-0 flex-1">
                      {s.brand && (
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">{s.brand}</div>
                      )}
                      <div className="truncate text-[13.5px] font-bold text-[#083D2D]" style={HEADING}>{s.name}</div>
                    </div>

                    {/* Only where a score exists. An unscored alternative is
                        still a legitimate suggestion — it is screened — but it
                        does not get a number it never earned.
                        hasScore, NOT Number.isFinite(Number(s.score)): the
                        latter is true for null, because Number(null) is 0, and
                        it rendered a confident "0" badge on every unscored
                        product. See lib/score.js. */}
                    {hasScore(s.score) && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                        style={{ background: C.mint, color: C.forest }}
                      >
                        {Math.round(Number(s.score))}
                      </span>
                    )}
                    {s.price !== null && s.price !== undefined && (
                      <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-[#083D2D]" style={HEADING}>
                        ₹{s.price}
                      </span>
                    )}
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-[#083D2D]/25 transition-colors group-hover:text-[#083D2D]/60" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 pl-[26px] text-[12px] leading-relaxed text-[#083D2D]/60" style={BODY}>
            KOI has nothing else screened and in stock near you right now. We would rather say that
            than point you at something we haven&apos;t read the label on.
          </p>
        )}
      </div>
    );
  }

  // unknown — a real position, stated plainly.
  return (
    <div className="rounded-2xl border border-[#083D2D]/10 bg-white/60 p-4">
      <Row icon={CircleHelp} tone="#083D2D99">Availability unknown near you</Row>
      <p className="mt-2 pl-[26px] text-[12px] leading-relaxed text-[#083D2D]/55" style={BODY}>
        KOI isn&apos;t connected to a delivery partner for this area yet, so we can&apos;t confirm
        stock. We won&apos;t guess.
      </p>
    </div>
  );
}
