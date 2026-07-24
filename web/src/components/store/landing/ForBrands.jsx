"use client";

// ============================================================================
// KOI LANDING — For Brands
// The second journey. A premium, editorial invitation for brands to apply —
// deliberately not "become a seller". Curated, trust-first, confident.
// ============================================================================

import React from "react";
import {
  Check, ShieldCheck, Users, Star, ScanLine, FlaskConical, Cpu, Sparkles,
  Building2, Package, ArrowUpRight, Clock,
} from "lucide-react";
import { C, HEADING, BODY } from "./tokens";
import { Reveal, ArrowButton, ScoreRing, Grain } from "./primitives";

const BENEFITS = [
  { icon: ShieldCheck, label: "Verified marketplace" },
  { icon: Users, label: "Health-conscious customers" },
  { icon: Star, label: "Transparent reviews" },
  { icon: ScanLine, label: "Ingredient intelligence" },
  { icon: FlaskConical, label: "Nutrition analysis" },
  { icon: Cpu, label: "AI-ready insights", soon: true },
  { icon: Sparkles, label: "Premium brand presence" },
];

const PIPELINE = [
  { icon: Building2, label: "Company", state: "done" },
  { icon: ShieldCheck, label: "Verification", state: "active" },
  { icon: Package, label: "Products", state: "todo" },
  { icon: Star, label: "Review", state: "todo" },
];

function PreviewCard() {
  return (
    <div className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.06] p-6 backdrop-blur-md sm:p-7">
      <Grain opacity={0.06} blend="soft-light" />
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Brand application</div>
          <div className="mt-1 text-[17px] font-bold text-white" style={HEADING}>TrueNut Foods</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DDF247]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#DDF247]">
          <ShieldCheck className="h-3 w-3" /> In review
        </span>
      </div>

      {/* pipeline */}
      <div className="mt-6 space-y-1">
        {PIPELINE.map((p, i) => {
          const Icon = p.icon;
          const done = p.state === "done";
          const active = p.state === "active";
          return (
            <div key={p.label} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="grid h-8 w-8 place-items-center rounded-full transition-all"
                  style={{
                    background: done ? C.emerald : active ? "rgba(221,242,71,0.16)" : "rgba(255,255,255,0.08)",
                    border: active ? `1.5px solid ${C.lime}` : "1.5px solid transparent",
                  }}
                >
                  {done ? <Check className="h-4 w-4 text-white" strokeWidth={3} /> : <Icon className="h-4 w-4" style={{ color: active ? C.lime : "rgba(255,255,255,0.5)" }} />}
                </span>
                {i < PIPELINE.length - 1 && <span className="my-0.5 h-5 w-px" style={{ background: done ? C.emerald : "rgba(255,255,255,0.12)" }} />}
              </div>
              <div className="flex flex-1 items-center justify-between pb-1">
                <span className="text-[13px] font-bold" style={{ color: done ? "rgba(255,255,255,0.85)" : active ? "#fff" : "rgba(255,255,255,0.45)" }}>{p.label}</span>
                {active && <span className="text-[10px] font-bold uppercase tracking-wide text-[#DDF247]">Now</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* footer: trust + eta */}
      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-5">
        <div className="flex items-center gap-3">
          <ScoreRing score={95} size={46} stroke={3} label={null} track="#ffffff22" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">Trust score</div>
            <div className="text-[13px] font-bold text-white" style={HEADING}>Exceptional</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50">
          <Clock className="h-3.5 w-3.5" /> 24–72h review
        </div>
      </div>
    </div>
  );
}

export default function ForBrands() {
  return (
    <section id="for-brands" className="relative scroll-mt-24 overflow-hidden" style={{ background: C.forest }}>
      <div className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full" style={{ background: C.emerald, opacity: 0.22, filter: "blur(120px)" }} />
      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-28">
        {/* copy */}
        <div>
          <Reveal>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold tabular-nums text-[#DDF247]">✦</span>
              <span className="h-px w-8" style={{ background: C.lime, opacity: 0.5 }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/60">KOI for brands</span>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <h2 className="mt-6 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(2.6rem, 6vw, 5.2rem)" }}>
              Your products.<br /><span style={{ color: C.lime }}>Verified.</span>
            </h2>
          </Reveal>

          <Reveal delay={140}>
            <p className="mt-7 max-w-md text-[17px] leading-relaxed text-white/65" style={BODY}>
              We don&apos;t list every product. We curate brands that care about ingredient quality,
              transparency and trust — and put them in front of customers who value exactly that.
            </p>
          </Reveal>

          <Reveal delay={220}>
            <div className="mt-9 grid max-w-lg grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <Icon className="h-3.5 w-3.5" style={{ color: C.lime }} strokeWidth={2.2} />
                    </span>
                    <span className="text-[14px] font-semibold text-white/85">
                      {b.label}
                      {b.soon && <span className="ml-2 rounded-full bg-[#DDF247]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#DDF247]">Soon</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ArrowButton href="/onboarding" variant="lime" size="lg">Apply as a brand</ArrowButton>
              <ArrowButton href="/onboarding" variant="outlineLight" size="lg">Learn more</ArrowButton>
            </div>
          </Reveal>
        </div>

        {/* preview */}
        <Reveal delay={200} y={40} className="flex justify-center lg:justify-end">
          <div style={{ animation: "koi-float 8s ease-in-out infinite" }}>
            <PreviewCard />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
