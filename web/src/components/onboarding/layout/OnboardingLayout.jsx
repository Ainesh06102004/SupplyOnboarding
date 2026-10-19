"use client";

// ============================================================================
// KOI ONBOARDING — the brand application frame (cinematic storefront, Oct 2026)
//
// The BrandSetup / BrandPortfolio / BrandCompliance boards: a forest rail with
// the wordmark, the condensed promise, the numbered timeline and what happens
// next; on the right a thin topbar — the step, its progress line and KOI's save
// pill (the ember dot says whether the draft is saved) — then the step's title
// in the display cut and its form. Presentation only: steps keep their logic.
// ============================================================================

import { useRef } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useOnboardingStore } from "@/store/onboardingStore";

const NODES = [
  { n: 1, label: "Company details", hint: "Brand & business", href: "/onboarding/step-1" },
  { n: 2, label: "Product portfolio", hint: "Your range", href: "/onboarding/step-2" },
  { n: 3, label: "Compliance", hint: "Certifications", href: "/onboarding/step-3" },
  { n: 4, label: "Review & submit", hint: "Final check" },
];

const WHAT_NEXT = ["AI verification of your brand & product claims", "Expert review by the KOI health team"];

const SAVE = {
  saving: { label: "Saving…", dot: "bg-koi-amber animate-pulse" },
  saved: { label: "Draft saved", dot: "bg-koi-green" },
  error: { label: "Save failed — try again", dot: "bg-koi-red" },
  idle: { label: "Not saved yet · Save Draft below", dot: "bg-koi-ember" },
};

// The pill reports the real draft: a row exists only once Save Draft (or the
// submit) has written one, so it reads the store, not the step's prop — which
// only ever adds an error.
function SavePill({ status }) {
  const isSaving = useOnboardingStore((s) => s.isSaving);
  const draftId = useOnboardingStore((s) => s.draftId);
  const key = status === "error" ? "error" : isSaving ? "saving" : draftId ? "saved" : "idle";
  const s = SAVE[key];
  return (
    <span role="status" className="flex h-10 items-center gap-2.5 rounded-full border border-koi-forest/10 bg-white px-4 text-[13px] font-semibold text-koi-forest">
      <span aria-hidden="true" className={`size-[10px] shrink-0 rounded-full ${s.dot}`} />
      <span>{s.label}</span>
    </span>
  );
}

function Rail({ step }) {
  return (
    <aside data-rail aria-label="Onboarding" className="relative z-20 hidden w-[380px] shrink-0 flex-col gap-8 overflow-hidden bg-koi-forest px-9 py-9 text-koi-bg lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
      <Link href="/onboarding" className="flex items-center gap-3 no-underline">
        <span className="flex items-end gap-[3px] text-koi-bg"><span className="font-koi-display text-[26px] font-extrabold leading-none tracking-[-0.02em]">KOI</span><span aria-hidden="true" className="mb-[3px] size-[7px] rounded-full bg-koi-ember" /></span>
        <span className="rounded-full border border-koi-bg/25 px-2.5 py-1 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-koi-bg/80">For Brands</span>
      </Link>
      <div className="flex flex-col gap-2">
        <span className="koi-condensed font-koi-display text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em]">Become a<br /><span className="text-koi-lime">verified brand.</span></span>
        <span className="text-[13px] text-koi-bg/65">Around 10–15 minutes · save a draft any time</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {NODES.map((node, i) => {
          const done = step > node.n;
          const active = step === node.n;
          const dot = done
            ? "bg-koi-lime text-koi-forest"
            : active
              ? "bg-koi-bg text-koi-forest ring-4 ring-koi-lime/30"
              : "border border-koi-bg/25 text-koi-bg/60";
          const text = (
            <span className="flex flex-col">
              <span className={`text-[14px] font-bold ${done || active ? "text-koi-bg" : "text-koi-bg/60"}`}>{node.label}</span>
              <span className={`text-[12.5px] ${active ? "text-koi-lime" : "text-koi-bg/55"}`}>{active ? "In progress" : done ? "Done" : node.hint}</span>
            </span>
          );
          return (
            <li key={node.n} data-rail-step className="flex gap-4">
              <span className="flex flex-col items-center">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full font-koi-num text-sm font-bold ${dot}`}>
                  {done ? <Check className="size-4" strokeWidth={3} /> : node.n}
                </span>
                {i < NODES.length - 1 && <span aria-hidden="true" className={`my-1 min-h-[26px] w-px flex-1 ${done ? "bg-koi-lime/60" : "bg-koi-bg/15"}`} />}
              </span>
              {/* Only steps already reached are links — the form validates on Continue. */}
              {node.href && done ? (
                <Link href={node.href} className="pb-5 no-underline transition-opacity hover:opacity-80">{text}</Link>
              ) : (
                <span aria-current={active ? "step" : undefined} className="pb-5">{text}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-3 rounded-2xl bg-koi-bg/5 p-4">
        <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-koi-mint">What happens next</span>
        {WHAT_NEXT.map((t) => (
          <span key={t} className="flex items-start gap-2.5 text-[13px] text-koi-bg/80"><span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-koi-lime" />{t}</span>
        ))}
      </div>
      <p className="m-0 mt-auto font-koi-display text-[22px] font-bold italic leading-snug text-koi-bg/85">“We curate for trust, not volume.”</p>
    </aside>
  );
}

/**
 * @param {number} step  1-based current step (drives the timeline)
 * @param {string} title / subtitle  header copy for the right column
 * @param {string} saveStatus  "error" shows a failed save; the rest comes from the store
 * @param {ReactNode} children  the step's <main> + <StepActionBar>
 */
export default function OnboardingLayout({ step = 1, title, subtitle, saveStatus = "idle", children }) {
  const root = useRef(null);
  const pct = Math.round((step / NODES.length) * 100);

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (s) => root.current.querySelectorAll(s);
    gsap.from(q("[data-rail-step]"), { autoAlpha: 0, x: -14, duration: 0.6, stagger: 0.07, ease: E.reveal, clearProps: "opacity,visibility,transform" });
  }, { scope: root });

  // The title and progress move with every step.
  useGSAP(() => {
    const gsap = setupMotion();
    const q = (s) => root.current.querySelectorAll(s);
    gsap.to(q("[data-progress]"), { width: `${pct}%`, duration: prefersReducedMotion() ? 0 : 0.9, ease: E.dolly });
    if (prefersReducedMotion()) return;
    gsap.from(q("[data-line]"), { yPercent: 115, duration: 0.95, ease: E.reveal });
    gsap.from(q("[data-rise]"), { autoAlpha: 0, y: 12, duration: 0.6, delay: 0.15, ease: E.reveal, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [title, pct] });

  return (
    <div ref={root} className="min-h-screen bg-koi-bg font-koi-sans text-koi-ink antialiased lg:flex">
      <Rail step={step} />

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-koi-forest/5 bg-koi-bg/85 px-5 py-3 backdrop-blur-md md:px-10 lg:static lg:border-0 lg:bg-transparent lg:pt-7 lg:backdrop-blur-none">
          <Link href="/onboarding" className="flex items-end gap-[3px] text-koi-forest no-underline lg:hidden"><span className="font-koi-display text-[22px] font-extrabold leading-none tracking-[-0.02em]">KOI</span><span aria-hidden="true" className="mb-[3px] size-[6px] rounded-full bg-koi-ember" /></Link>
          <span className="font-koi-mono text-xs font-semibold uppercase tracking-[0.18em] text-koi-muted">Step {step} of {NODES.length}</span>
          <span className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-koi-track sm:block"><span data-progress className="block h-full w-0 rounded-full bg-koi-green" /></span>
          <span className="ml-auto"><SavePill status={saveStatus} /></span>
        </header>

        <div className="px-5 pb-2 pt-6 md:px-10">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-1.5">
            <span className="hidden font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-green lg:block">{NODES[step - 1]?.label || "Application"}</span>
            <h1 className="koi-condensed m-0 font-koi-display text-[clamp(40px,5vw,56px)] font-extrabold leading-none tracking-[-0.03em] text-koi-forest">
              <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{title}</span></span>
            </h1>
            {subtitle && <p data-rise className="m-0 max-w-xl text-base leading-relaxed text-koi-ink2">{subtitle}</p>}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
