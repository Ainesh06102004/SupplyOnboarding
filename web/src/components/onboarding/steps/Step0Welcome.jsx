"use client";

// ============================================================================
// KOI for brands — the welcome (cinematic storefront, Oct 2026)
//
// The BrandWelcome board: a title shot in the display cut, the three reasons in
// tiles, and a "before you begin" sheet the applicant can tick through — it only
// helps them gather papers, nothing is uploaded or saved here. "Start
// onboarding" advances the store and routes to step 1 exactly as before.
// ============================================================================

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, FileText, TrendingUp, Clock, Check, ArrowRight } from "lucide-react";
import { useOnboardingStore } from "@/store/onboardingStore";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

const BENEFITS = [
  { icon: ShieldCheck, title: "Trusted Health Verification", body: "AI + expert review ensures only quality products get approved.", lead: true },
  { icon: FileText, title: "Smart Label Extraction", body: "Upload packaging once. KOI auto-fills product data." },
  { icon: TrendingUp, title: "Reach High-Intent Buyers", body: "Sell to health-conscious consumers seeking better alternatives." },
];

const REQUIRED = ["GST certificate", "FSSAI license", "Product packaging images", "Ingredient & Nutrition labels"];
const OPTIONAL = [
  { label: "Lab certifications", note: "Increases trust score" },
  { label: "Brand assets / story", note: "Helps your listing read well" },
];

function Doc({ on, onToggle, label, note }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-koi-tint-border bg-koi-tint" : "border-koi-forest/10 bg-white hover:border-koi-forest/25"}`}
    >
      <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-lime" : "border-koi-forest/25 text-transparent"}`}>
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      {note ? (
        <span className="flex flex-col"><span className="text-[14.5px] font-semibold">{label}</span><span className="text-[12.5px] text-koi-muted">{note}</span></span>
      ) : (
        <span className="text-[14.5px] font-semibold">{label}</span>
      )}
    </button>
  );
}

export default function Step0Welcome() {
  const router = useRouter();
  const nextStep = useOnboardingStore((state) => state.nextStep);
  const [ready, setReady] = useState(() => new Set());
  const root = useRef(null);

  const toggle = (label) => setReady((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const requiredReady = REQUIRED.filter((d) => ready.has(d)).length;
  const allRequired = requiredReady === REQUIRED.length;

  const handleStart = () => {
    nextStep();
    router.push("/onboarding/step-1");
  };

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (s) => root.current.querySelectorAll(s);
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(q("[data-line]"), { yPercent: 115, duration: 1.05, stagger: 0.1 }, 0.1);
    tl.from(q("[data-rise]"), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.08, clearProps: "opacity,visibility,transform" }, 0.3);
    tl.from(q("[data-benefit]"), { autoAlpha: 0, y: 40, duration: 0.9, stagger: 0.09, ease: E.dolly, clearProps: "opacity,visibility,transform" }, 0.45);
    tl.from(q("[data-ready]"), { autoAlpha: 0, y: 40, duration: 0.9, ease: E.dolly, clearProps: "opacity,visibility,transform" }, 0.7);
  }, { scope: root });

  return (
    <main ref={root} className="relative flex min-h-screen flex-col overflow-x-clip bg-koi-bg font-koi-sans text-koi-ink antialiased">
      <header className="relative z-20 flex items-center justify-between px-[clamp(16px,4vw,52px)] py-6">
        <span className="flex items-center gap-3">
          <span className="flex items-end gap-[3px] text-koi-forest"><span className="font-koi-display text-[26px] font-extrabold leading-none tracking-[-0.02em]">KOI</span><span aria-hidden="true" className="mb-[3px] size-[7px] rounded-full bg-koi-ember" /></span>
          <span className="rounded-full border border-koi-forest/20 px-2.5 py-1 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-koi-forest">For Brands</span>
        </span>
        <Link href="/login?redirect=/dashboard" className="flex h-11 items-center rounded-full border border-koi-forest/15 px-5 text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-white">Sign in</Link>
      </header>

      <section className="relative z-10 grid grid-cols-1 items-end gap-6 px-[clamp(16px,4vw,52px)] pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-5">
          <div data-rise className="flex flex-wrap gap-2">
            <span className="flex h-9 items-center gap-2 rounded-full bg-koi-forest px-3.5 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-koi-lime"><Clock className="size-3.5" />10–15 mins</span>
            <span className="flex h-9 items-center gap-2 rounded-full border border-koi-forest/15 bg-white px-3.5 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-koi-forest"><span aria-hidden="true" className="size-1.5 rounded-full bg-koi-green" />Save as a draft</span>
          </div>
          <h1 className="koi-condensed m-0 font-koi-display text-[clamp(56px,7vw,112px)] font-extrabold leading-[0.86] tracking-[-0.04em] text-koi-forest">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Join KOI</span></span>
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Supplier Network</span></span>
          </h1>
          <p data-rise className="m-0 max-w-[560px] text-lg leading-relaxed text-koi-ink2">Get your products listed on India&apos;s most trusted health-first quick commerce platform.</p>
        </div>
        <p data-rise className="m-0 max-w-[460px] pb-3 font-koi-display text-[28px] font-bold italic leading-snug text-koi-ink2">“We curate for trust, not volume.”</p>
      </section>

      <section aria-label="Why KOI" className="relative z-10 grid grid-cols-1 gap-4 px-[clamp(16px,4vw,52px)] pt-10 md:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, title, body, lead }) => (
          <article key={title} data-benefit className={`flex flex-col gap-3 rounded-[26px] p-6 ${lead ? "bg-koi-forest text-koi-bg" : "border border-koi-forest/10 bg-white"}`}>
            <span aria-hidden="true" className={`grid size-12 place-items-center rounded-2xl text-koi-forest ${lead ? "bg-koi-lime" : "bg-koi-tint"}`}><Icon className="size-5" /></span>
            <span className={`font-koi-display text-[22px] font-extrabold leading-tight ${lead ? "" : "text-koi-forest"}`}>{title}</span>
            <span className={`text-[14px] leading-relaxed ${lead ? "text-koi-bg/75" : "text-koi-ink2"}`}>{body}</span>
          </article>
        ))}
      </section>

      <section data-ready aria-label="Before you begin" className="relative z-10 mx-[clamp(16px,4vw,52px)] mt-6 grid grid-cols-1 gap-6 rounded-[30px] border border-koi-forest/10 bg-white p-5 md:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          <span className="flex items-baseline justify-between gap-2"><span className="text-[17px] font-bold">Required Documents</span><span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-koi-muted">{requiredReady} of {REQUIRED.length} ready</span></span>
          {REQUIRED.map((label) => <Doc key={label} label={label} on={ready.has(label)} onToggle={() => toggle(label)} />)}
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-[17px] font-bold">Optional</span>
          {OPTIONAL.map(({ label, note }) => <Doc key={label} label={label} note={note} on={ready.has(label)} onToggle={() => toggle(label)} />)}
        </div>
        <div className="flex flex-col justify-between gap-5 rounded-[24px] bg-koi-paper p-5">
          <span className="flex flex-col gap-1.5"><span className="text-[17px] font-bold">Before you begin</span><span className="text-[13.5px] leading-relaxed text-koi-ink2">Keep these details ready for a smooth onboarding process.</span></span>
          <span className="flex flex-col gap-2">
            <button type="button" onClick={handleStart} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-koi-forest text-base font-bold text-koi-lime transition-transform hover:-translate-y-0.5">Start onboarding <ArrowRight className="size-5" /></button>
            <span className="text-center text-[12.5px] text-koi-muted">You can save progress and continue anytime.</span>
          </span>
          <span className="flex items-center gap-2 font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted">
            <span aria-hidden="true" className="size-[10px] rounded-full bg-koi-ember" />
            {allRequired ? "You have everything — let's go" : "KOI · tick what you have to hand"}
          </span>
        </div>
      </section>
      <div className="h-10" />
    </main>
  );
}
