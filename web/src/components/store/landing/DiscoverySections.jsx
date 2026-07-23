"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Discovery
// IngredientExplorer (rotating tags + loved/flagged matrix) ·
// TrendingCategories (modular geometric blocks).
// ============================================================================

import React from "react";
import Link from "next/link";
import { Check, X, ArrowUpRight } from "lucide-react";
import { C, HEADING, BODY, INGREDIENTS_GOOD, INGREDIENTS_WATCH, CATEGORIES } from "./tokens";
import { Reveal, Eyebrow, Marquee, ArrowButton } from "./primitives";

// ── Section: Ingredient explorer ────────────────────────────────────────────
export function IngredientExplorer() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.cream }}>
      <div className="mx-auto max-w-[1400px] px-5 pt-20 sm:px-8 lg:px-12 lg:pt-28">
        <Reveal>
          <Eyebrow index="06">Ingredient explorer</Eyebrow>
          <h2 className="mt-5 max-w-2xl font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5.5vw, 4.8rem)" }}>
            Know exactly<br />what&apos;s inside.
          </h2>
          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-[#083D2D]/65" style={BODY}>
            We keep a living index of the ingredients we celebrate - and the ones we quietly refuse.
            Every product on KOI is measured against both.
          </p>
        </Reveal>
      </div>

      {/* rotating tag rows */}
      <div className="mt-12 space-y-3">
        <Marquee speed={38}>
          {INGREDIENTS_GOOD.concat(INGREDIENTS_GOOD).map((t, i) => (
            <span key={i} className="mx-2 inline-flex items-center gap-2 rounded-full border border-[#083D2D]/12 bg-white px-5 py-2.5 text-[18px] font-bold text-[#083D2D]" style={HEADING}>
              <Check className="h-4 w-4" style={{ color: C.emerald }} strokeWidth={3} />
              {t}
            </span>
          ))}
        </Marquee>
        <Marquee speed={44} reverse>
          {INGREDIENTS_WATCH.concat(INGREDIENTS_WATCH).map((t, i) => (
            <span key={i} className="mx-2 inline-flex items-center gap-2 rounded-full border border-[#F36A1D]/30 px-5 py-2.5 text-[18px] font-bold text-[#F36A1D]/80" style={{ ...HEADING, textDecoration: "line-through", textDecorationThickness: "2px" }}>
              <X className="h-4 w-4" strokeWidth={3} />
              {t}
            </span>
          ))}
        </Marquee>
      </div>

      {/* loved / flagged matrix */}
      <div className="mx-auto max-w-[1400px] px-5 pb-20 pt-14 sm:px-8 lg:px-12 lg:pb-28">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Reveal y={30}>
            <div className="h-full rounded-[28px] p-8 sm:p-10" style={{ background: C.forest }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DDF247]">What we love</span>
              <h3 className="mt-3 text-[28px] font-extrabold text-white" style={HEADING}>The clean list</h3>
              <ul className="mt-6 space-y-3">
                {INGREDIENTS_GOOD.slice(0, 6).map((t) => (
                  <li key={t} className="flex items-center gap-3 border-b border-white/10 pb-3 text-[16px] font-medium text-white/85" style={BODY}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: C.emerald }}>
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={80} y={30}>
            <div className="h-full rounded-[28px] border border-[#083D2D]/12 bg-white p-8 sm:p-10">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F36A1D]">What we flag</span>
              <h3 className="mt-3 text-[28px] font-extrabold text-[#083D2D]" style={HEADING}>The watch list</h3>
              <ul className="mt-6 space-y-3">
                {INGREDIENTS_WATCH.slice(0, 6).map((t) => (
                  <li key={t} className="flex items-center gap-3 border-b border-[#083D2D]/8 pb-3 text-[16px] font-medium text-[#083D2D]/70" style={BODY}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#F36A1D]/30">
                      <X className="h-3.5 w-3.5 text-[#F36A1D]" strokeWidth={3} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ── Section: Trending categories ────────────────────────────────────────────
const TONES = {
  forest: { bg: C.forest, fg: "#FFFFFF", sub: "rgba(255,255,255,0.55)", arrow: C.lime },
  emerald: { bg: C.emerald, fg: "#FFFFFF", sub: "rgba(255,255,255,0.7)", arrow: "#FFFFFF" },
  lime: { bg: C.lime, fg: C.forest, sub: "rgba(8,61,45,0.6)", arrow: C.forest },
  butter: { bg: C.butter, fg: C.forest, sub: "rgba(8,61,45,0.6)", arrow: C.forest },
  cream: { bg: C.cream, fg: C.forest, sub: "rgba(8,61,45,0.55)", arrow: C.forest },
  orange: { bg: C.orange, fg: "#FFFFFF", sub: "rgba(255,255,255,0.75)", arrow: "#FFFFFF" },
};

// index → grid span for an editorial, non-uniform rhythm
const SPANS = ["md:col-span-2", "", "", "", "", "md:col-span-2"];

export function TrendingCategories() {
  return (
    <section className="relative" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <Eyebrow index="07">Shop by intention</Eyebrow>
            <h2 className="mt-5 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5.5vw, 4.6rem)" }}>
              Find your<br />shelf.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <ArrowButton href="/store/shop" variant="outline" size="sm">Browse everything</ArrowButton>
          </Reveal>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat, i) => {
            const t = TONES[cat.tone] || TONES.forest;
            return (
              <Reveal key={cat.name} delay={i * 60} className={SPANS[i] || ""}>
                <Link
                  href="/store/shop"
                  className="group relative flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-[26px] p-7 transition-transform duration-500 hover:-translate-y-1"
                  style={{ background: t.bg }}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[12px] font-bold tabular-nums tracking-[0.1em]" style={{ color: t.sub }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="grid h-10 w-10 place-items-center rounded-full transition-transform duration-500 group-hover:rotate-45"
                      style={{ background: "rgba(255,255,255,0.12)" }}
                    >
                      <ArrowUpRight className="h-5 w-5" style={{ color: t.arrow }} />
                    </span>
                  </div>
                  <div>
                    <h3 className="text-[clamp(1.6rem,3vw,2.4rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.01em]" style={{ ...HEADING, color: t.fg }}>
                      {cat.name}
                    </h3>
                    <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.1em]" style={{ color: t.sub }}>
                      {cat.count} verified products
                    </p>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
