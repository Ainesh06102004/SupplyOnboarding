"use client";
// ============================================================================
// KOI — the landing's opening shot: "The read"
//
// One continuous shot. The camera starts in macro on a specimen ingredients
// label; KOI's dot (the ember) is the pen, hopping word to word, striking what
// KOI would flag and highlighting what is fine. Then the camera pulls back, the
// titles rise, and the dot flies home to the KOI bar, where KOI says its first
// line. Afterwards, pointing at (or focusing) a struck word sends KOI back to
// say why, in its status capsule.
//
// Plays once per session; "Skip intro" or a click ends it, "Replay titles"
// plays it again. Reduced motion gets the finished frame and no flight.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { setupMotion, prefersReducedMotion, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";

const SEEN = "koi:titles-seen";
const FIRST_LINE = "Tell me who you’re shopping for. I’ll do the reading.";

// The specimen: a typical cream biscuit, read the way KOI reads every label.
const LABEL = [
  { t: "Refined wheat flour (maida)", flag: "Refined flour · low in fibre" },
  { t: ", " },
  { t: "sugar", flag: "Added sugar" },
  { t: ", " },
  { t: "palm oil", flag: "Palm oil · high in saturated fat" },
  { t: ", " },
  { t: "invert sugar syrup", flag: "Another added sugar" },
  { t: ", " },
  { t: "milk solids", ok: "Milk solids · fine" },
  { t: ", " },
  { t: "maltodextrin", flag: "Maltodextrin · acts like sugar" },
  { t: ", raising agents (INS 500(ii), INS 503(ii)), " },
  { t: "emulsifier (INS 322)", ok: "INS 322 is lecithin · fine" },
  { t: ", iodised salt, " },
  { t: "artificial flavour (vanilla)", flag: "Artificial flavour" },
  { t: "." },
];
const FLAGGED = LABEL.filter((s) => s.flag).length;
const FINE = LABEL.filter((s) => s.ok).length;

const TICKER = ["Ingredients decoded", "Labels verified", "AI analysed", "Only the good stuff", "No hidden sugar"];

function Spark() {
  return <svg className="size-2.5 shrink-0" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0 6.2 3.8 10 5 6.2 6.2 5 10 3.8 6.2 0 5 3.8 3.8z" fill="#ddf247" /></svg>;
}
function Arrow({ className = "size-[18px]" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
}

function Word({ seg }) {
  const why = seg.flag ?? seg.ok;
  if (!why) return seg.t;
  return (
    <span
      tabIndex={0}
      data-why={why}
      data-flag={seg.flag ? "" : undefined}
      data-ok={seg.ok ? "" : undefined}
      title={why.replace(" · ", ", ")}
      className="relative whitespace-nowrap rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-koi-ember"
    >
      {seg.t}
      {seg.flag ? (
        <span data-strike aria-hidden="true" className="absolute inset-x-[-2px] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-koi-ember" />
      ) : (
        <span data-hl aria-hidden="true" className="absolute inset-x-[-3px] bottom-[6px] -z-10 h-[10px] rounded-[3px] bg-koi-lime" />
      )}
    </span>
  );
}

export default function TheRead() {
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);
  const rootRef = useRef(null);
  const introRef = useRef(null);
  const [run, setRun] = useState(0); // bumps to replay the titles
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const gsap = setupMotion();
    const reduce = prefersReducedMotion();
    const q = (s) => root.querySelector(s);
    const qa = (s) => [...root.querySelectorAll(s)];
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    let dead = false;
    let explaining = null;
    let cancelReady = () => {};

    const ctx = gsap.context(() => {}, root);

    // The ticker runs for as long as the page is open.
    const track = q("[data-ticker-track]");
    if (track && !reduce) ctx.add(() => gsap.to(track, { xPercent: -50, duration: 38, ease: "none", repeat: -1 }));

    const finish = () => {
      introRef.current = null;
      const store = root.closest(".koi-store");
      if (store) { delete store.dataset.titles; gsap.set(store, { "--koi-chrome": 1 }); }
      if (dead) return;
      setIntroDone(true);
      ember.rest();
      say(FIRST_LINE);
    };

    const skip = () => {
      const tl = introRef.current;
      if (!tl) return;
      introRef.current = null;
      tl.progress(1, true);
      finish();
    };

    const intro = () => {
      if (dead) return;
      const card = q("[data-label-card]");
      const words = qa("[data-why]");
      const store = root.closest(".koi-store");
      const C = card.getBoundingClientRect();
      // Macro on the label, centred in the viewport; on a phone the card is already near full width.
      const scale = Math.min(2.05, (window.innerWidth * 0.94) / C.width);
      const dx = window.innerWidth / 2 - (C.left + C.width / 2);
      const dy = window.innerHeight * 0.46 - (C.top + C.height / 2);
      const tl = gsap.timeline({ defaults: { ease: E.reveal }, onComplete: finish });
      introRef.current = tl;
      ctx.add(() => {
        if (store) {
          store.dataset.titles = "on";
          tl.set(store, { "--koi-chrome": 0 }, 0);
        }
        tl.set([q("[data-eyebrow]"), q("[data-hint]"), q("[data-ticker]")], { autoAlpha: 0 }, 0);
        tl.set(qa("[data-rise]"), { autoAlpha: 0, y: 18 }, 0);
        tl.set(qa("[data-line]"), { yPercent: 118 }, 0);
        tl.set(qa("[data-strike], [data-hl]"), { scaleX: 0, transformOrigin: "0% 50%" }, 0);
        tl.fromTo(card, { x: dx, y: dy, scale: Math.max(1, scale), rotation: 2, autoAlpha: 0 }, { autoAlpha: 1, duration: 0.55, ease: "power2.out" }, 0);
        tl.add(() => ember.at(words[0], { ax: 0, ay: 0.5, x: -10 }), 0.3);
        // The ember is the pen: it hops to each word and draws the strike (or the highlight) as it passes.
        let t = 0.7;
        for (const w of words) {
          const bar = w.querySelector("[data-strike], [data-hl]");
          tl.add(() => ember.hop(w, { ax: 0, ay: 0.5, x: -2 }), t);
          if (bar) tl.to(bar, { scaleX: 1, duration: 0.2, ease: "power1.inOut" }, t + 0.16);
          tl.add(() => ember.slide(w, { ax: 1, ay: 0.5, x: 3 }, 0.2), t + 0.16);
          if (w.hasAttribute("data-flag")) tl.to(w, { color: "rgba(28,30,23,.62)", duration: 0.3 }, t + 0.24);
          t += 0.22;
        }
        const back = t + 0.15;
        tl.to(card, { x: 0, y: 0, scale: 1, rotation: 0, duration: 1.1, ease: E.dolly }, back);
        if (store) tl.to(store, { "--koi-chrome": 1, duration: 0.8, ease: "power1.out" }, back + 0.2);
        tl.to(q("[data-eyebrow]"), { autoAlpha: 1, duration: 0.6 }, back + 0.25);
        tl.to(qa("[data-line]"), { yPercent: 0, duration: 1.05, stagger: 0.08 }, back + 0.25);
        tl.to(qa("[data-rise]"), { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1 }, back + 0.55);
        tl.to(q("[data-ticker]"), { autoAlpha: 1, duration: 0.6 }, back + 0.7);
        tl.add(() => ember.home(), back + 0.6);
        tl.to(q("[data-hint]"), { autoAlpha: 1, duration: 0.6 }, back + 1.6);
      });
    };

    const begin = () => {
      const seen = (() => { try { return sessionStorage.getItem(SEEN) === "1"; } catch { return false; } })();
      // The titles play once a session, from the top of the page, and never under reduced motion.
      if (reduce || (seen && run === 0) || window.scrollY > 40) { finish(); return; }
      try { sessionStorage.setItem(SEEN, "1"); } catch { /* private mode: plays again next time */ }
      const fonts = document.fonts?.ready ?? Promise.resolve();
      Promise.race([fonts, new Promise((r) => setTimeout(r, 1200))]).then(intro);
    };
    cancelReady = ember.whenReady(begin);

    // A click anywhere (but the skip button) ends the titles.
    const onDown = (e) => { if (introRef.current && !e.target.closest?.("[data-skip]")) skip(); };
    window.addEventListener("pointerdown", onDown);
    const onSkip = () => skip();
    root.addEventListener("koi:skip", onSkip);

    // After the titles: pointing at a struck word sends KOI there to say why.
    const explain = (w) => {
      if (introRef.current) return;
      explaining = w;
      ember.go(w, { ax: 0.5, ay: 0, y: -14 }, () => { if (explaining === w) ember.status(w.dataset.why); });
    };
    const unexplain = () => {
      if (introRef.current) return;
      explaining = null;
      ember.status(null);
      later(() => { if (!explaining && !dead) ember.home(); }, 1300);
    };
    const offs = qa("[data-why]").flatMap((w) => {
      const on = () => explain(w);
      w.addEventListener("pointerenter", on);
      w.addEventListener("pointerleave", unexplain);
      w.addEventListener("focus", on);
      w.addEventListener("blur", unexplain);
      return [() => { w.removeEventListener("pointerenter", on); w.removeEventListener("pointerleave", unexplain); w.removeEventListener("focus", on); w.removeEventListener("blur", unexplain); }];
    });

    return () => {
      dead = true;
      cancelReady();
      timers.forEach(clearTimeout);
      offs.forEach((f) => f());
      window.removeEventListener("pointerdown", onDown);
      root.removeEventListener("koi:skip", onSkip);
      introRef.current?.kill();
      introRef.current = null;
      ctx.revert();
      ember.rest();
    };
  }, [ember, say, run]);

  const onSkipClick = useCallback(() => {
    if (introRef.current) rootRef.current?.dispatchEvent(new Event("koi:skip"));
    else { setIntroDone(false); setRun((n) => n + 1); }
  }, []);

  return (
    <div ref={rootRef} className="relative flex min-h-[calc(100svh-var(--koi-header-h))] flex-col bg-koi-bg font-koi-sans text-koi-ink antialiased">
      <section className="relative z-10 mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 items-center gap-x-16 gap-y-12 px-[clamp(16px,4vw,52px)] pb-10 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-4">
        <div className="min-w-0">
          <div data-eyebrow className="mb-7 flex items-center gap-3">
            <span className="font-koi-mono text-xs font-semibold text-koi-green">(01)</span>
            <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-forest/70">The better choices store</span>
          </div>
          <h1 className="koi-condensed m-0 flex flex-col font-koi-display text-[clamp(52px,7.4vw,116px)] font-extrabold uppercase leading-[0.86] tracking-[-0.025em]">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block text-koi-forest">We read</span></span>
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block text-koi-forest">the labels.</span></span>
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block text-transparent [-webkit-text-stroke:1.5px_#0c6b4c]">You don’t</span></span>
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block text-koi-green">have to.</span></span>
          </h1>
          <p data-rise className="mt-8 max-w-md text-pretty text-[17px] leading-relaxed text-koi-ink/70">
            KOI is a curated marketplace of health-first products. We decode every ingredient, nutrition panel and claim, so the only things you’ll find here are the ones that genuinely earned their place.
          </p>
          <div data-rise className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/store/shop" className="inline-flex h-14 items-center gap-2.5 rounded-full bg-koi-forest px-7 text-[15px] font-bold text-koi-bg transition-transform hover:-translate-y-0.5">
              Start shopping <Arrow />
            </Link>
            <a href="#trust" className="inline-flex h-14 items-center rounded-full border border-koi-forest/25 px-6 text-[15px] font-semibold text-koi-forest transition-colors hover:bg-white">How KOI works</a>
          </div>
          <Link data-rise href="/onboarding" className="mt-6 inline-flex items-center gap-2 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-forest/60 transition-colors hover:text-koi-forest">
            Are you a brand? Partner with KOI <Arrow className="size-3.5" />
          </Link>
        </div>

        <div className="relative flex min-w-0 flex-col items-center gap-5">
          <div className="w-full max-w-[470px] rotate-[-2deg]">
            <figure data-label-card className="relative m-0 rounded-[24px] border border-koi-forest/10 bg-white p-6 shadow-[0_50px_90px_-50px_rgba(15,61,46,.55)] md:p-7">
              <div className="flex items-baseline justify-between gap-3 border-b-[3px] border-koi-ink pb-3">
                <span className="font-koi-display text-[30px] font-extrabold leading-none tracking-[-0.01em] text-koi-ink">Ingredients</span>
                <span className="font-koi-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-koi-muted">Specimen label</span>
              </div>
              <p className="relative z-0 mt-5 font-koi-mono text-[15px] leading-[2.05] text-koi-ink md:text-[16px]">
                {LABEL.map((seg, i) => <Word key={i} seg={seg} />)}
              </p>
              <figcaption className="mt-6 flex items-center justify-between gap-3 border-t border-koi-forest/10 pt-4">
                <span className="flex items-center gap-2 font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">
                  <span aria-hidden="true" className="size-[7px] rounded-full bg-koi-ember" />Read by KOI
                </span>
                <span className="flex gap-2">
                  <span className="rounded-full border border-koi-warm-border bg-koi-warm-bg px-2.5 py-1 font-koi-mono text-[11px] font-semibold text-koi-warm-ink">{FLAGGED} flagged</span>
                  <span className="rounded-full border border-koi-tint-border bg-koi-tint px-2.5 py-1 font-koi-mono text-[11px] font-semibold text-koi-primary">{FINE} fine</span>
                </span>
              </figcaption>
            </figure>
          </div>
          <p data-hint className="m-0 font-koi-mono text-[11px] font-medium uppercase tracking-[0.16em] text-koi-muted">
            <span className="pointer-coarse:hidden">Point at a struck word · KOI says why</span>
            <span className="hidden pointer-coarse:inline">Tap a struck word · KOI says why</span>
          </p>
        </div>
      </section>

      <div data-ticker aria-hidden="true" className="relative z-10 flex h-[50px] items-center overflow-hidden bg-koi-forest">
        <div data-ticker-track className="flex w-max">
          {[0, 1].map((k) => (
            <div key={k} className="flex items-center gap-10 whitespace-nowrap pr-10 text-[13px] font-bold uppercase tracking-[0.14em] text-koi-bg">
              {TICKER.map((t) => <span key={t} className="flex items-center gap-10">{t}<Spark /></span>)}
            </div>
          ))}
        </div>
      </div>

      <button
        data-skip
        type="button"
        onClick={onSkipClick}
        className="absolute bottom-[66px] right-[clamp(16px,4vw,52px)] z-30 flex h-11 items-center gap-2 rounded-full border border-koi-forest/20 bg-white/80 px-4 font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-forest backdrop-blur transition-colors hover:bg-white"
      >
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 5 7 7-7 7" /><path d="M17 5v14" /></svg>
        {introDone ? "Replay titles" : "Skip intro"}
      </button>
    </div>
  );
}
