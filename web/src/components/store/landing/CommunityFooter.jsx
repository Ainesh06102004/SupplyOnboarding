"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Community · Newsletter · Footer
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";
import { Star, ArrowRight, Check, Camera, Hash, Share2 } from "lucide-react";
import { C, HEADING, BODY, VOICES } from "./tokens";
import { Reveal, Eyebrow, Marquee } from "./primitives";

// ── Section: Community voices ───────────────────────────────────────────────
export function CommunityVoices() {
  return (
    <section id="community" className="relative scroll-mt-24" style={{ background: C.cream }}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <Eyebrow index="09">In their words</Eyebrow>
            <h2 className="mt-5 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5.5vw, 4.6rem)" }}>
              Trusted by<br />the sceptical.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-5 w-5" style={{ color: C.orange }} fill={C.orange} />
                ))}
              </div>
              <div>
                <div className="text-[22px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>4.9 / 5</div>
                <div className="text-[12px] font-semibold text-[#083D2D]/55">from 12,000+ members</div>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {VOICES.map((v, i) => (
            <Reveal key={v.who} delay={i * 80} y={30}>
              <figure
                className={`flex h-full flex-col justify-between rounded-[26px] p-8 ${i === 0 ? "md:row-span-2" : ""}`}
                style={{ background: i === 0 ? C.forest : "#FFFFFF", border: i === 0 ? "none" : `1px solid ${C.forest}14` }}
              >
                <blockquote
                  className="text-[clamp(1.25rem,2vw,1.6rem)] font-bold leading-[1.15]"
                  style={{ ...HEADING, color: i === 0 ? "#FFFFFF" : C.forest }}
                >
                  <span style={{ color: C.orange }}>“</span>
                  {v.quote}
                </blockquote>
                <figcaption className="mt-8 flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-extrabold"
                    style={{ background: i === 0 ? C.lime : C.mint, color: C.forest, ...HEADING }}
                  >
                    {v.who.replace(/[^A-Z]/g, "").slice(0, 2)}
                  </span>
                  <div>
                    <div className="text-[14px] font-bold" style={{ color: i === 0 ? "#FFFFFF" : C.forest, ...HEADING }}>{v.who}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: i === 0 ? "rgba(255,255,255,0.55)" : "rgba(8,61,45,0.5)" }}>
                      {v.role}
                    </div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Section: Newsletter ─────────────────────────────────────────────────────
export function NewsletterEditorial() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setDone(true);
    setEmail("");
    setTimeout(() => setDone(false), 3500);
  };
  return (
    <section className="relative overflow-hidden" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="relative overflow-hidden rounded-[32px] px-6 py-14 sm:px-12 lg:px-16 lg:py-20" style={{ background: C.orange }}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full" style={{ background: "#ffffff", opacity: 0.12, filter: "blur(60px)" }} />
          <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal>
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/80">The KOI dispatch</span>
              <h2 className="mt-4 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(2.2rem, 5vw, 4.2rem)" }}>
                Get the good<br />stuff first.
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/85" style={BODY}>
                New arrivals that cleared the standard, ingredient breakdowns and the occasional
                brutal review - once a week, no noise.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <form onSubmit={submit} className="w-full">
                <label htmlFor="koi-newsletter" className="sr-only">Email address</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="koi-newsletter"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="h-14 flex-1 rounded-full bg-white px-6 text-[15px] font-semibold text-[#083D2D] outline-none placeholder:text-[#083D2D]/40"
                    style={BODY}
                  />
                  <button
                    type="submit"
                    className="group inline-flex h-14 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-bold transition-transform hover:-translate-y-0.5"
                    style={{ background: C.forest, color: "#fff" }}
                  >
                    {done ? (
                      <>
                        You&apos;re in <Check className="h-4 w-4" style={{ color: C.lime }} strokeWidth={3} />
                      </>
                    ) : (
                      <>
                        Subscribe <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-3 pl-2 text-[12px] font-medium text-white/70" style={BODY}>
                  No spam. Unsubscribe anytime.
                </p>
              </form>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────
const FOOT_COLS = [
  { title: "Shop", links: [["Store", "/store/shop"], ["Cart", "/store/cart"], ["Orders", "/store/orders"], ["Profile", "/store/profile"]] },
  { title: "Company", links: [["The standard", "#trust"], ["Science", "#featured"], ["Reviews", "#community"], ["For brands", "/onboarding"]] },
  { title: "Support", links: [["Help centre", "/store/shop"], ["Contact", "/store/shop"], ["Delivery", "/store/shop"], ["Returns", "/store/shop"]] },
];

export function FooterEditorial() {
  return (
    <footer className="relative overflow-hidden" style={{ background: C.forest }}>
      <div className="mx-auto max-w-[1400px] px-5 pt-20 sm:px-8 lg:px-12 lg:pt-28">
        {/* top */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="text-[28px] font-extrabold text-white" style={HEADING}>KOI</div>
            <p className="mt-4 max-w-[220px] text-[14px] leading-relaxed text-white/55" style={BODY}>
              The health-first marketplace where every product earns its place.
            </p>
            <div className="mt-6 flex gap-2.5">
              {[Camera, Hash, Share2].map((Icon, i) => (
                <a key={i} href="#" aria-label="KOI social" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/80 transition-colors hover:bg-white/10">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {FOOT_COLS.map((col) => (
            <div key={col.title}>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DDF247]">{col.title}</div>
              <ul className="mt-5 space-y-3">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("#") ? (
                      <a href={href} className="text-[14px] font-medium text-white/70 transition-colors hover:text-white">{label}</a>
                    ) : (
                      <Link href={href} className="text-[14px] font-medium text-white/70 transition-colors hover:text-white">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* bottom meta */}
        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] font-medium text-white/45" style={BODY}>© 2026 KOI Health First Platform. Every product earns its place.</p>
          <div className="flex gap-6">
            <a href="#" className="text-[12px] font-medium text-white/45 transition-colors hover:text-white/80">Privacy</a>
            <a href="#" className="text-[12px] font-medium text-white/45 transition-colors hover:text-white/80">Terms</a>
            <a href="#" className="text-[12px] font-medium text-white/45 transition-colors hover:text-white/80">Cookies</a>
          </div>
        </div>
      </div>

      {/* oversized wordmark */}
      <div aria-hidden="true" className="select-none overflow-hidden px-2 pt-4">
        <div className="text-center font-extrabold leading-[0.8] tracking-[-0.03em] text-white/[0.06]" style={{ ...HEADING, fontSize: "clamp(5rem, 22vw, 20rem)" }}>
          KOI
        </div>
      </div>
    </footer>
  );
}
