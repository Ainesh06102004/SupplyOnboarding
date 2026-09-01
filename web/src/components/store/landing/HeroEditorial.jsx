"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Hero
// Editorial split: stacked oversized headline + product render on a forest
// plate, integrated KOI Score, verification chips and a trust ticker.
//
// The product plate is now fed by the caller rather than by a module-scope
// PRODUCTS.find(). That matters beyond tidiness: the fixture it used to read
// published a score and a claim set KOI never issued, on the first page a
// visitor sees. With no catalogue the plate renders the shelf-being-built
// state below — an empty store is a true thing to say and a fine thing to
// look at, and it is the state production is actually in.
// ============================================================================

import React from "react";
import Link from "next/link";
import { Check, ArrowRight, Leaf } from "lucide-react";
import Image from "next/image";
import { C, HEADING, BODY } from "./tokens";
import { Reveal, ScoreRing, ArrowButton, Marquee, Grain } from "./primitives";

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

// A word for the score band. This describes KOI's own number back to the
// reader — it is not a claim about the food, which is why it is allowed to
// exist at all. It used to be the literal "Exceptional" on every product.
function scoreBand(score) {
  if (score >= 90) return "Exceptional";
  if (score >= 80) return "Strong";
  return "Screened";
}

// ── The plate, with a product ───────────────────────────────────────────────
function ProductPlate({ product }) {
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px] overflow-hidden rounded-[32px]" style={{ background: C.forest }}>
      <Grain opacity={0.08} blend="soft-light" />
      <div className="absolute left-1/2 top-[46%] h-[118%] w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" />
      <div className="absolute left-1/2 top-[46%] h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

      <div className="absolute inset-x-8 top-10 bottom-24 grid place-items-center">
        <Image
          src={product.image}
          alt={`${product.brand ?? ""} - ${product.name}`.trim()}
          width={640}
          height={640}
          preload
          draggable="false"
          className="h-full w-auto max-w-full object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)]"
          style={{ animation: "koi-float 7s ease-in-out infinite" }}
        />
      </div>

      <div className="absolute right-4 top-4">
        <RotatingSeal />
      </div>

      {/* Score badge — only for a product that actually carries a score. */}
      {product.score !== null && (
        <div className="absolute left-5 top-6 flex items-center gap-3 rounded-2xl bg-white/10 p-2.5 pr-4 backdrop-blur-md">
          <ScoreRing score={product.score} size={52} stroke={3} track="#ffffff22" />
          <div className="leading-tight">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">KOI Score</div>
            <div className="text-[13px] font-bold text-white" style={HEADING}>{scoreBand(product.score)}</div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/10 p-4 backdrop-blur-md">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {product.brand && (
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#DDF247]">{product.brand}</div>
            )}
            <div className="mt-0.5 truncate text-[16px] font-bold text-white" style={HEADING}>{product.name}</div>
          </div>
          {product.price !== null && (
            <div className="shrink-0 text-right text-[18px] font-extrabold text-white" style={HEADING}>₹{product.price}</div>
          )}
        </div>
        {product.claims.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product.claims.slice(0, 3).map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── The plate, with no catalogue ────────────────────────────────────────────
// Not a spinner and not a shrug. KOI's proposition is that the shelf is short
// because the screen is strict, so an empty shelf is on-message: it says what
// is true, and points at the thing that changes it.
function EmptyPlate({ loading }) {
  return (
    <div className="relative mx-auto flex aspect-[4/5] w-full max-w-[520px] flex-col justify-between overflow-hidden rounded-[32px] p-8" style={{ background: C.forest }}>
      <Grain opacity={0.08} blend="soft-light" />
      <div className="absolute left-1/2 top-[46%] h-[118%] w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8" />
      <div className="absolute left-1/2 top-[46%] h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />

      <div className="relative flex justify-end">
        <RotatingSeal />
      </div>

      <div className="relative">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#DDF247]">
          {loading ? "Loading the shelf" : "Screening in progress"}
        </div>
        <h2 className="mt-3 font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          {loading ? (
            <>Reading<br />the labels.</>
          ) : (
            <>The shelf<br />is being built.</>
          )}
        </h2>
        <p className="mt-4 max-w-[38ch] text-[14px] leading-relaxed text-white/70" style={BODY}>
          {loading
            ? "One moment — pulling the products that cleared the screen."
            : "Nothing goes on this page until it has cleared the ingredient and nutrition review. Nothing has, yet."}
        </p>

        {!loading && (
          <Link
            href="/onboarding"
            className="group mt-6 inline-flex items-center gap-2 rounded-full bg-[#DDF247] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.12em] transition-transform hover:scale-[1.02]"
            style={{ color: C.forest }}
          >
            Submit a brand for review
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{ product?: object|null, loading?: boolean }} props
 */
export default function HeroEditorial({ product = null, loading = false }) {
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
              nutrition panel and claim - so the only things you&apos;ll find here are the ones that
              genuinely earned their place.
            </p>
          </Reveal>

          <Reveal delay={400}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ArrowButton href="/store/shop" variant="forest" size="lg">Start shopping</ArrowButton>
              <ArrowButton href="#trust" variant="outline" size="lg">How KOI works</ArrowButton>
            </div>
          </Reveal>

          <Reveal delay={450}>
            <Link href="/onboarding" className="group mt-5 inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#083D2D]/55 transition-colors hover:text-[#083D2D]">
              <span className="relative">
                Are you a brand? Partner with KOI
                <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-[#083D2D] transition-transform duration-300 group-hover:scale-x-100" />
              </span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>

          {/* NOTE: these three are marketing figures about KOI's methodology,
              not claims about any product, and no source in this repo backs
              them. Wire them to real counts over screening_reports when the
              catalogue is populated, or retire them. */}
          <Reveal delay={480}>
            <div className="mt-11 flex items-center gap-8">
              <div>
                <div className="text-[28px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>412+</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#101412]/50">Ingredients Flagged</div>
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
          {product ? <ProductPlate product={product} /> : <EmptyPlate loading={loading} />}
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
