"use client";

// ============================================================================
// KOI STAFF — the editing suite's chrome (cinematic storefront, Oct 2026)
//
// The StaffReview / StaffDemand / StaffAgent boards share one look: KOI night,
// the wordmark with its ember, a pill nav, who is signed in, and a title in
// the condensed display cut. StaffStage runs the entrance (and fills any
// [data-bar] to its data-w percentage) so the server pages stay server pages.
// ============================================================================

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

const NAV = [
  { href: "/staff/review", label: "Label review" },
  { href: "/staff/demand", label: "Demand" },
  { href: "/staff/agent", label: "Agent runs" },
];

export function StaffHeader({ who }) {
  const pathname = usePathname();
  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-4 border-b border-koi-bg/10 px-5 py-4 md:px-8">
      <span className="flex items-center gap-4">
        <span className="flex items-end gap-[3px]"><span className="font-koi-display text-[24px] font-extrabold leading-none tracking-[-0.02em]">KOI</span><span aria-hidden="true" className="mb-[3px] size-[6px] rounded-full bg-koi-ember" /></span>
        <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-koi-bg/60">Staff</span>
      </span>
      <nav aria-label="Staff tools" className="flex flex-wrap gap-1">
        {NAV.map((n) => {
          const on = pathname?.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={on
                ? "rounded-full bg-koi-bg/10 px-4 py-2.5 text-sm font-bold text-koi-lime no-underline"
                : "rounded-full px-4 py-2.5 text-sm font-semibold text-koi-bg/70 no-underline hover:bg-white/5 hover:text-koi-bg"}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <span className="flex items-center gap-2 text-[13px] text-koi-bg/60">
        <span aria-hidden="true" className={`size-[10px] rounded-full ${who ? "bg-koi-ember" : "bg-koi-bg/30"}`} />
        {who ? `Signed in as ${who}` : "Not signed in as a reviewer"}
      </span>
    </header>
  );
}

/** Runs the boards' entrance over its children; bars fill to data-w. */
export function StaffStage({ children, className = "" }) {
  const root = useRef(null);
  useGSAP(() => {
    const gsap = setupMotion();
    const q = (s) => root.current.querySelectorAll(s);
    const reduced = prefersReducedMotion();
    q("[data-bar]").forEach((bar, i) => {
      gsap.to(bar, { width: `${bar.dataset.w}%`, duration: reduced ? 0 : 1, delay: reduced ? 0 : 0.4 + i * 0.03, ease: E.dolly });
    });
    if (reduced) return;
    const lines = q("[data-line]");
    if (lines.length) gsap.from(lines, { yPercent: 115, duration: 1, ease: E.reveal });
    const rise = q("[data-rise]");
    if (rise.length) gsap.from(rise, { autoAlpha: 0, y: 14, duration: 0.6, stagger: 0.07, delay: 0.15, ease: E.reveal, clearProps: "opacity,visibility,transform" });
    const panels = q("[data-section]");
    if (panels.length) gsap.from(panels, { autoAlpha: 0, y: 30, duration: 0.8, stagger: 0.08, delay: 0.3, ease: E.dolly, clearProps: "opacity,visibility,transform" });
  }, { scope: root });
  return <div ref={root} className={className}>{children}</div>;
}

export function StaffTitle({ title, children, aside }) {
  return (
    <section className="relative z-10 flex flex-wrap items-end justify-between gap-6 px-5 pb-2 pt-8 md:px-8">
      <div className="flex max-w-[820px] flex-col gap-2">
        <span data-rise className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-koi-mint">KOI staff</span>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,4.6vw,68px)] font-extrabold leading-none tracking-[-0.03em]">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{title}</span></span>
        </h1>
        {children && <div data-rise className="m-0 text-[15px] leading-relaxed text-koi-bg/70">{children}</div>}
      </div>
      {aside && <div data-rise>{aside}</div>}
    </section>
  );
}

/** What a signed-out visitor or a non-reviewer sees instead of the tool. */
export function StaffGate({ title, grantHint = false }) {
  return (
    <StaffStage>
      <StaffHeader who={null} />
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-24">
        <h1 className="koi-condensed m-0 font-koi-display text-[44px] font-extrabold leading-none tracking-[-0.03em]">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{title}</span></span>
        </h1>
        <p data-rise className="m-0 text-[15px] leading-relaxed text-koi-bg/70">
          Sign in with a reviewer account.
          {grantHint && (
            <> If you should have access, ask whoever holds the service key to run
              <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 font-koi-mono text-[13px] text-koi-lime">scripts/grantReviewer.mjs</code>
              for your email.</>
          )}
        </p>
        <Link data-rise href="/login" className="flex h-12 items-center self-start rounded-full bg-koi-lime px-6 text-sm font-bold text-koi-forest no-underline">Sign in</Link>
      </main>
    </StaffStage>
  );
}
