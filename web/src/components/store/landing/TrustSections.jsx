"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Trust & Science
// WhyKoi (manifesto + count-up stats) · TrustFramework (decode pipeline +
// verification seals) · ScienceBacked (animated evidence graph).
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, Sparkles, FlaskConical, ScanLine } from "lucide-react";
import { C, HEADING, BODY, WHY_STATS, TRUST_STEPS } from "./tokens";
import { Reveal, Eyebrow, ArrowButton, ScoreRing } from "./primitives";

// Count-up number, animates once in view.
function Counter({ to, suffix = "", duration = 1500 }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t = setTimeout(() => setVal(to), 0);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          const start = performance.now();
          const step = (now) => {
            const p = Math.min(1, (now - start) / duration);
            setVal(Math.floor(p * to));
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
          io.disconnect();
        }
      },{ threshold: 0.5 }
    );
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {val}
      {suffix}
    </span>
  );
}

// ── Section: Why KOI exists ─────────────────────────────────────────────────
export function WhyKoi() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.forest }}>
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full" style={{ background: C.emerald, opacity: 0.16, filter: "blur(100px)" }} />
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-32">
        <Reveal>
          <Eyebrow index="03" color={C.lime}>
            <span className="text-white/70">Why KOI exists</span>
          </Eyebrow>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <Reveal delay={60}>
            <h2 className="font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(2.6rem, 6.5vw, 6rem)" }}>
              We reject<br />
              <span style={{ color: "transparent", WebkitTextStroke: "1.5px #DDF247" }}>most</span> of what<br />
              we&apos;re sent.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <div className="flex h-full flex-col justify-end">
              <p className="text-[17px] leading-relaxed text-white/70" style={BODY}>
                The shelves are crowded with products that look healthy. KOI exists to be the filter —
                a standard high enough that being listed here actually means something. We read the
                panels, flag the additives, and turn down anything that can&apos;t back up its claims.
              </p>
              <ArrowButton href="#trust" variant="lime" className="mt-8 self-start">See the standard</ArrowButton>
            </div>
          </Reveal>
        </div>

        {/* Stat band */}
        <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-white/10 pt-12 lg:grid-cols-4">
          {WHY_STATS.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div>
                <div className="text-[clamp(2.6rem,5vw,4.2rem)] font-extrabold leading-none text-[#DDF247]" style={HEADING}>
                  <Counter to={s.value} suffix={s.suffix} />
                </div>
                <p className="mt-3 max-w-[200px] text-[13px] leading-snug text-white/60" style={BODY}>{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Trust framework ────────────────────────────────────────────────
const SEALS = [
  { icon: ScanLine, label: "Ingredient decode" },
  { icon: Sparkles, label: "AI analysed" },
  { icon: FlaskConical, label: "Lab evidence" },
  { icon: ShieldCheck, label: "KOI verified" },
];

export function TrustFramework() {
  return (
    <section id="trust" className="relative scroll-mt-24" style={{ background: C.mint }}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          {/* Left: intro + seals */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Reveal>
              <Eyebrow index="05">The KOI standard</Eyebrow>
              <h2 className="mt-5 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5vw, 4.4rem)" }}>
                How a product<br />earns its<br />place.
              </h2>
              <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-[#083D2D]/70" style={BODY}>
                Six checks, every SKU, no exceptions. Trust isn&apos;t a badge we hand out - it&apos;s a
                pipeline every product has to pass.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {SEALS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2.5 rounded-2xl border border-[#083D2D]/10 bg-white/70 px-3.5 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: C.forest }}>
                      <Icon className="h-4 w-4" style={{ color: C.lime }} strokeWidth={2.4} />
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-[#083D2D]">{label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right: pipeline */}
          <div className="flex flex-col">
            {TRUST_STEPS.map((step, i) => (
              <Reveal key={step.k} delay={i * 60}>
                <div className="group flex gap-5 border-b border-[#083D2D]/10 py-6 transition-colors last:border-b-0">
                  <span className="text-[15px] font-bold tabular-nums text-[#16A06E]" style={HEADING}>{step.k}</span>
                  <div className="flex-1">
                    <h3 className="text-[20px] font-bold text-[#083D2D] transition-transform duration-300 group-hover:translate-x-1" style={HEADING}>
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[#083D2D]/60" style={BODY}>{step.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section: Science backed ─────────────────────────────────────────────────
function EvidenceGraph() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t = setTimeout(() => setOn(true), 0);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => setOn(true), 0);
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // rising average-score curve
  const pts = [12, 20, 18, 30, 34, 46, 52, 64, 70, 78, 84, 92];
  const W = 640, H = 260, pad = 8;
  const stepX = (W - pad * 2) / (pts.length - 1);
  const toXY = (v, i) => [pad + i * stepX, H - pad - (v / 100) * (H - pad * 2)];
  const line = pts.map((v, i) => toXY(v, i).join(",")).join(" ");
  const area = `M${toXY(pts[0], 0).join(",")} L${line.replace(/ /g, " L")} L${W - pad},${H - pad} L${pad},${H - pad} Z`;

  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Rising average KOI score over time">
        <defs>
          <linearGradient id="koi-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.lime} stopOpacity="0.35" />
            <stop offset="100%" stopColor={C.lime} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((g) => (
          <line key={g} x1={pad} x2={W - pad} y1={pad + (g * (H - pad * 2)) / 3} y2={pad + (g * (H - pad * 2)) / 3} stroke="#ffffff14" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#koi-area)" style={{ opacity: on ? 1 : 0, transition: "opacity 1.4s ease 0.3s" }} />
        <polyline
          points={line}
          fill="none"
          stroke={C.lime}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeDasharray: 1400, strokeDashoffset: on ? 0 : 1400, transition: "stroke-dashoffset 2s cubic-bezier(0.16,1,0.3,1)" }}
        />
        {pts.map((v, i) => {
          const [x, y] = toXY(v, i);
          return <circle key={i} cx={x} cy={y} r="3" fill={C.forest} stroke={C.lime} strokeWidth="2" style={{ opacity: on ? 1 : 0, transition: `opacity 0.4s ease ${0.6 + i * 0.08}s` }} />;
        })}
      </svg>
    </div>
  );
}

export function ScienceBacked() {
  return (
    <section className="relative overflow-hidden" style={{ background: C.ink }}>
      <div className="relative mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Reveal>
              <Eyebrow index="08" color={C.lime}>
                <span className="text-white/60">Science, not slogans</span>
              </Eyebrow>
              <h2 className="mt-5 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5.5vw, 4.8rem)" }}>
                Backed by<br />evidence,<br /><span style={{ color: C.lime }}>not ads.</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-7 max-w-md text-[16px] leading-relaxed text-white/60" style={BODY}>
                Placement is earned through data - parsed panels, verified certificates and a scoring
                model refined against thousands of SKUs. As the standard rises, so does the average
                quality of everything you see.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-9 flex items-center gap-6">
                <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <ScoreRing score={94} size={68} stroke={4} label="EVID" track="#ffffff1f" />
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/50">Avg evidence score</div>
                    <div className="text-[15px] font-bold text-white" style={HEADING}>Across live catalogue</div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={120} y={30}>
            <div className="flex h-full flex-col justify-center rounded-[28px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <div className="mb-6 flex items-baseline justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">Average KOI score</span>
                <span className="text-[13px] font-bold text-[#DDF247]" style={HEADING}>↑ 2025 → 2026</span>
              </div>
              <EvidenceGraph />
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {[
                  { k: "12,400+", v: "SKUs screened" },
                  { k: "38", v: "Data points / product" },
                  { k: "24h", v: "Avg review time" },
                ].map((s) => (
                  <div key={s.v}>
                    <div className="text-[20px] font-extrabold text-white" style={HEADING}>{s.k}</div>
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
