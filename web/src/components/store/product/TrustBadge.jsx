"use client";

// ============================================================================
// KOI PRODUCT - Trust module ("Why you can trust this")
// A premium, animated verification card. Not a dashboard.
// ============================================================================

import React from "react";
import { Check, Sparkles } from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { Reveal, ScoreRing } from "@/components/store/landing/primitives";

export default function TrustBadge({ trust }) {
  if (!trust) return null;
  return (
    <section className="relative" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[28px] p-7 sm:p-10" style={{ background: C.forest }}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full" style={{ background: C.emerald, opacity: 0.3, filter: "blur(80px)" }} />

            <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:gap-12">
              {/* score
                  An unscored product says so. It used to render "KOI Verified"
                  above a grade of "C / Mixed" derived from grade(score || 0) —
                  a verdict manufactured out of a missing score, on the module
                  whose whole job is to say the number can be trusted. */}
              <div className="flex items-center gap-5">
                {trust.scored && (
                  <div className="rounded-full bg-white/8 p-2">
                    <ScoreRing score={trust.score} size={92} stroke={5} label={null} track="#ffffff22" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" style={{ color: C.lime }} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DDF247]">
                      {trust.scored ? "KOI Verified" : "In review"}
                    </span>
                  </div>
                  {trust.scored ? (
                    <>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-[44px] font-extrabold leading-none text-white" style={HEADING}>{trust.grade}</span>
                        <span className="text-[14px] font-semibold text-white/60">{trust.gradeLabel}</span>
                      </div>
                      <p className="mt-2 max-w-[220px] text-[12.5px] leading-snug text-white/50" style={BODY}>
                        Scored across ingredients, nutrition, additives and processing.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mt-2 text-[24px] font-extrabold leading-tight text-white" style={HEADING}>
                        Not yet scored
                      </div>
                      <p className="mt-2 max-w-[260px] text-[12.5px] leading-snug text-white/50" style={BODY}>
                        This product is listed but its label review isn&apos;t finished, so KOI has no
                        score to show you yet.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* attributes + subscores */}
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div className={trust.attributes.length ? "" : "hidden"}>
                  <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">What we confirmed</div>
                  <ul className="space-y-2.5">
                    {trust.attributes.map((a, i) => (
                      <Reveal as="li" key={a.label} delay={i * 70} className="flex items-center gap-2.5 text-[14px] font-semibold text-white/90">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: C.emerald }}>
                          <Check className="h-3 w-3 text-white" strokeWidth={3} />
                        </span>
                        {a.label}
                      </Reveal>
                    ))}
                  </ul>
                </div>

                <div className={trust.subs.length ? "" : "hidden"}>
                  <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">The breakdown</div>
                  <div className="space-y-3.5">
                    {trust.subs.map((s) => (
                      <div key={s.label}>
                        <div className="mb-1.5 flex items-baseline justify-between">
                          <span className="text-[12px] font-semibold text-white/70">{s.label}</span>
                          <span className="text-[12px] font-bold text-[#DDF247]" style={HEADING}>{s.value}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <Bar value={s.value} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-8 flex items-center gap-2 border-t border-white/10 pt-5 text-[12px] font-medium text-white/50" style={BODY}>
              Backed by KOI&apos;s independent nutrition review - not the brand&apos;s marketing.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Bar({ value }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
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
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-full rounded-full" style={{ width: on ? `${value}%` : "0%", background: C.lime, transition: "width 1.1s cubic-bezier(0.16,1,0.3,1)" }} />
  );
}
