"use client";
// ============================================================================
// KOI SHOP - the shelf's head: "On the shelf"
//
// The title, the lenses (each one is a sentence KOI reads with the same intent
// engine the KOI bar and ⌘K use), and the focus bar that says what KOI is
// showing. Entrance and chip presses are GSAP; nothing here filters by itself.
// ============================================================================

import { useRef } from "react";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

export default function ShelfHead({ lenses, activeLens, onLens, onOpenSearch, focusLabel, focused, onClear, stats }) {
  const ref = useRef(null);

  useGSAP(() => {
    const gsap = setupMotion();
    if (prefersReducedMotion()) return;
    const q = (s) => ref.current.querySelectorAll(s);
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(q("[data-eyebrow]"), { autoAlpha: 0, x: -12, duration: 0.6 }, 0.05);
    tl.from(q("[data-line]"), { yPercent: 115, duration: 1 }, 0.08);
    tl.from(q("[data-chip]"), { autoAlpha: 0, y: 12, duration: 0.5, stagger: 0.035 }, 0.2);
    tl.from(q("[data-focusbar]"), { autoAlpha: 0, duration: 0.6 }, 0.35);
  }, { scope: ref });

  return (
    <div ref={ref} className="relative z-10 mx-auto w-full max-w-[1440px] px-[clamp(16px,4vw,52px)] pt-8 md:pt-10">
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="flex flex-col gap-2.5">
          <div data-eyebrow className="flex items-center gap-3">
            <span className="font-koi-mono text-xs font-semibold text-koi-primary">(02)</span>
            <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Shop</span>
            {stats?.count > 0 && (
              <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.16em] text-koi-muted/80">
                · <span className="font-koi-num">{stats.count}</span> screened · <span className="font-koi-num">{stats.brands}</span> brands
              </span>
            )}
          </div>
          <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.4vw,80px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">On the shelf</span></span>
          </h1>
        </div>
        <div role="group" aria-label="Lenses" className="flex max-w-[860px] gap-2 [scrollbar-width:none] max-md:-mx-4 max-md:w-[calc(100%+32px)] max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 md:flex-wrap md:justify-end [&>button]:shrink-0">
          <button
            data-chip
            type="button"
            aria-pressed={!activeLens && !focused}
            onClick={() => onLens(null)}
            className={`h-11 rounded-full border px-[18px] text-sm font-semibold transition-colors ${!activeLens && !focused ? "border-koi-forest bg-koi-forest text-koi-lime" : "border-koi-forest/15 bg-white/70 text-koi-forest hover:bg-white"}`}
          >
            Everything
          </button>
          {lenses.map((l) => {
            const on = activeLens === l;
            return (
              <button
                key={l}
                data-chip
                type="button"
                aria-pressed={on}
                onClick={() => onLens(on ? null : l)}
                className={`h-11 rounded-full border px-[18px] text-sm font-semibold transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-lime" : "border-koi-forest/15 bg-white/70 text-koi-forest hover:bg-white"}`}
              >
                {l}
              </button>
            );
          })}
          <button
            data-chip
            type="button"
            onClick={onOpenSearch}
            className="flex h-11 items-center gap-2 rounded-full border border-dashed border-koi-forest/25 px-4 text-sm font-semibold text-koi-forest transition-colors hover:bg-white"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            Search
            <kbd className="hidden rounded-md border border-koi-forest/15 px-1.5 font-koi-mono text-[10.5px] text-koi-muted md:inline">⌘K</kbd>
          </button>
        </div>
      </section>

      <div data-focusbar className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 pt-5">
        <p aria-live="polite" className="m-0 flex items-center gap-2.5 font-koi-mono text-[11px] font-medium uppercase tracking-[0.16em] text-koi-ink2">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-koi-ember" />
          {focusLabel}
        </p>
        {focused && (
          <button type="button" onClick={onClear} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-forest transition-colors hover:bg-white">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            Clear focus
          </button>
        )}
      </div>
    </div>
  );
}
