"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Hero
// Editorial split: stacked oversized headline + product render on a forest
// plate, integrated KOI Score, verification chips and a trust ticker.
// ============================================================================

import React from "react";
import { Check, Leaf } from "lucide-react";
import { C, HEADING, BODY, PRODUCTS } from "./tokens";
import { Reveal, ScoreRing, ArrowButton, Marquee, Grain } from "./primitives";

const HERO_PRODUCT = PRODUCTS.find((p) => p.id === "os-dfm") || PRODUCTS[0];

function RotatingSeal() {
  return (
    <div className="relative h-[104px] w-[104px]" aria-hidden="true">
      <svg viewBox="0 0 120 120" className="h-full w-full" style={{ animation: "koi-spin-slow 22s linear infinite" }}>
        <defs>
          <path id="koi-seal" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
        </defs>
        <text className="fill-[#DDF247]" style={{ fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
          <textPath href="#koi-seal" startOffset="0%">
            KOI VERIFIED · ONLY THE GOOD STUFF ·
          </textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: C.lime }}>
          <Check className="h-5 w-5" style={{ color: C.forest }} strokeWidth={3} />
        </span>
      </span>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white/85">
      <Check className="h-3 w-3" style={{ color: C.lime }} strokeWidth={3} />
      {children}
    </span>
  );
}

export default function HeroEditorial() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.offwhite }}>
      <Grain opacity={0.04} />

      {/* Ambient colour blocks */}
      <div className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full" style={{ background: C.lime, opacity: 0.14, filter: "blur(90px)" }} />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full" style={{ background: C.emerald, opacity: 0.1, filter: "blur(90px)" }} />

      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-12 lg:pb-24 lg:pt-16">
        {/* ── Left: editorial headline ── */}
        <div className="relative z-10">
          <Reveal>
            <div className="mb-7 flex items-center gap-3">
              <span className="text-[11px] font-bold tabular-nums text-[#16A06E]">(01)</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#083D2D]/70">
                The better choices store
              </span>
            </div>
          </Reveal>

          <h1 className="font-extrabold uppercase leading-[0.86] tracking-[-0.02em]" style={{ ...HEADING, fontSize: "clamp(3rem, 8.5vw, 7.2rem)" }}>
            <Reveal as="span" className="block text-[#083D2D]" delay={40}>We read</Reveal>
            <Reveal as="span" className="block text-[#083D2D]" delay={110}>the labels.</Reveal>
            <Reveal as="span" className="block" delay={180} style={{ color: "transparent", WebkitTextStroke: "1.5px #0C6B4C" }}>You don&apos;t</Reveal>
            <Reveal as="span" className="block text-[#16A06E]" delay={250}>have to.</Reveal>
          </h1>

          <Reveal delay={320}>
            <p className="mt-8 max-w-md text-[16px] leading-relaxed text-[#101412]/70" style={BODY}>
              KOI is a curated marketplace of health-first products. We decode every ingredient,
              nutrition panel and claim - so the only things you'll find here are the ones that
              genuinely earned their place.
            </p>
          </Reveal>

          <Reveal delay={400}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ArrowButton href="/store/shop" variant="forest" size="lg">Start shopping</ArrowButton>
              <ArrowButton href="#trust" variant="outline" size="lg">How KOI works</ArrowButton>
            </div>
          </Reveal>

          <Reveal delay={480}>
            <div className="mt-11 flex items-center gap-8">
              <div>
                <div className="text-[28px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>50k+</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#101412]/50">Members trust KOI</div>
              </div>
              <div className="h-10 w-px bg-[#083D2D]/10" />
              <div>
                <div className="text-[28px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>9/10</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#101412]/50">Products rejected</div>
              </div>
              <div className="hidden h-10 w-px bg-[#083D2D]/10 sm:block" />
              <div className="hidden sm:block">
                <div className="text-[28px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>100%</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#101412]/50">Labels decoded</div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* ── Right: product plate ── */}
        <Reveal delay={200} y={40} className="relative z-10">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-[32px]" style={{ background: C.forest }}>
            <Grain opacity={0.08} blend="soft-light" />
            {/* concentric guide rings */}
            <div className="absolute left-1/2 top-[46%] h-[118%] w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" />
            <div className="absolute left-1/2 top-[46%] h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

            {/* Product render on a light plate (no multiply on dark bg) */}
            <div className="absolute inset-x-8 top-10 bottom-24 grid place-items-center">
              <img
                src={HERO_PRODUCT.image}
                alt={`${HERO_PRODUCT.brand} - ${HERO_PRODUCT.name}`}
                width="640"
                height="640"
                loading="eager"
                decoding="async"
                draggable="false"
                className="h-full w-auto max-w-full object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)]"
                style={{ animation: "koi-float 7s ease-in-out infinite" }}
              />
            </div>

            {/* Verified seal */}
            <div className="absolute right-4 top-4">
              <RotatingSeal />
            </div>

            {/* Score badge */}
            <div className="absolute left-5 top-6 flex items-center gap-3 rounded-2xl bg-white/10 p-2.5 pr-4 backdrop-blur-md">
              <ScoreRing score={HERO_PRODUCT.score} size={52} stroke={3} track="#ffffff22" />
              <div className="leading-tight">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">KOI Score</div>
                <div className="text-[13px] font-bold text-white" style={HEADING}>Exceptional</div>
              </div>
            </div>

            {/* Bottom info bar */}
            <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/10 p-4 backdrop-blur-md">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#DDF247]">{HERO_PRODUCT.brand}</div>
                  <div className="mt-0.5 text-[16px] font-bold text-white" style={HEADING}>{HERO_PRODUCT.name}</div>
                </div>
                <div className="text-right text-[18px] font-extrabold text-white" style={HEADING}>₹{HERO_PRODUCT.price}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {HERO_PRODUCT.claims.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ── Trust ticker ── */}
      <div className="relative border-y border-[#083D2D]/10" style={{ background: C.forest }}>
        <Marquee speed={30} className="py-4">
          {["Ingredients decoded", "Labels verified", "AI analysed", "Only the good stuff", "No palm oil", "No hidden sugar", "Lab-tested evidence"].map((t, i) => (
            <span key={i} className="mx-8 flex items-center gap-8 text-[15px] font-bold uppercase tracking-[0.14em] text-[#F9F8F4]">
              {t}
              <Leaf className="h-4 w-4" style={{ color: C.lime }} />
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
