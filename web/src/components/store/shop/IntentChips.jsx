"use client";

// ============================================================================
// KOI SHOP — Interpreted query chips
// Shows what KOI understood a typed query to mean, as chips the shopper can
// remove one at a time.
//
// The row exists for two reasons, both about trust rather than decoration:
//
//   - An interpretation the shopper cannot see is an interpretation they cannot
//     correct. If KOI decides "high protein" means 12g and quietly filters on
//     it, a thin grid looks like a thin catalogue.
//   - A restriction KOI could NOT apply has to be visible. "no onion" has no
//     key in FOODS_AVOID, so it is shown in warning styling as unapplied.
//     Silently returning onion-heavy snacks under that query is the one
//     failure this whole feature must not have.
//   - Neither may a restriction KOI applied but could not CHECK. A product whose
//     ingredient list nobody has verified stays in the results, and the note
//     under the chips says how many there are and for what.
//
// Purely presentational. Labels arrive already built by describeIntent(), which
// composes them from catalog labels and the shopper's own numbers.
//
// Shot as the States board's "nothing matched" (Oct 2026): forest chips, and a
// paper sheet that names the binding limit as one-tap "Try without" pills.
// ============================================================================

import React, { useRef } from "react";
import { X, Sparkles, AlertTriangle } from "lucide-react";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

const KIND_STYLE = {
  constraint: { chip: "bg-koi-forest text-koi-lime", x: "text-koi-lime/80 hover:bg-koi-lime/15 hover:text-koi-lime" },
  preference: { chip: "border border-koi-tint-border bg-koi-tint text-koi-forest", x: "text-koi-forest/70 hover:bg-koi-forest/10 hover:text-koi-forest" },
  unapplied: { chip: "border border-koi-warm-border bg-koi-warm-bg text-koi-warm-ink", x: "text-koi-warm-ink/70 hover:bg-koi-warm/15 hover:text-koi-warm-ink" },
};

/**
 * @param {object} props
 * @param {Array} props.chips from describeIntent()
 * @param {(chip: object) => void} props.onRemove
 * @param {() => void} props.onClearAll
 * @param {number|null} props.matchCount products matching, or null when not narrowing
 * @param {Array<{chip: object, matched: number}>} [props.relaxations] offered when nothing matched
 * @param {string|null} [props.unverifiedNote] CAUTIONS.unverifiedInResults text, when any result is unchecked
 */
export default function IntentChips({ chips = [], onRemove, onClearAll, matchCount = null, relaxations = [], unverifiedNote = null }) {
  const root = useRef(null);
  const empty = matchCount === 0;

  // The no-match sheet arrives rather than appears: it is the answer to the search.
  useGSAP(() => {
    if (!empty || !root.current || prefersReducedMotion()) return;
    const gsap = setupMotion();
    const sheet = root.current.querySelectorAll("[data-nomatch], [data-relax]");
    if (sheet.length) gsap.from(sheet, { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.06, ease: E.reveal, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [empty] });

  if (!chips.length) return null;

  return (
    // `scroll-mt-28` keeps the row clear of the sticky nav when it is the
    // scroll target — it is the explanation for what the grid now shows, so
    // landing with it hidden behind the header defeats the point.
    <section
      ref={root}
      id="intent"
      aria-label="How KOI read your search"
      className="mx-auto w-full max-w-[1400px] scroll-mt-28 px-5 pt-8 font-koi-sans sm:px-8 lg:px-12"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-koi-muted">
          <Sparkles size={13} aria-hidden="true" />
          KOI read this as
        </span>

        {chips.map((chip) => {
          const k = KIND_STYLE[chip.kind] || KIND_STYLE.preference;
          return (
            <span key={chip.id} className={`flex h-9 items-center gap-1.5 rounded-full pl-3.5 pr-1.5 text-[13px] font-semibold ${k.chip}`}>
              {chip.kind === "unapplied" && <AlertTriangle size={12} aria-hidden="true" />}
              {chip.label}
              <button
                type="button"
                onClick={() => onRemove?.(chip)}
                aria-label={`Remove ${chip.label}`}
                className={`grid size-6 place-items-center rounded-full transition-colors ${k.x}`}
              >
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </span>
          );
        })}

        <button
          type="button"
          onClick={onClearAll}
          className="h-9 rounded-full px-3 text-[13px] font-semibold text-koi-primary hover:underline"
        >
          Clear
        </button>
      </div>

      {unverifiedNote && !empty && (
        <p className="m-0 mt-3 inline-flex items-start gap-1.5 text-[12.5px] font-semibold text-koi-warm-ink">
          <AlertTriangle size={13} className="mt-[2px] shrink-0" aria-hidden="true" />
          {unverifiedNote}
        </p>
      )}

      {/* A correct interpretation can still match nothing. Saying which limit is
          binding turns a dead end into one tap. */}
      {empty && (
        <div data-nomatch className="mt-4 flex flex-col gap-3 rounded-[22px] bg-koi-paper p-6">
          <p className="m-0 font-koi-display text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-koi-forest">
            Nothing in KOI&apos;s catalogue matches all of that.
          </p>
          {relaxations.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-koi-ink2">Try without</span>
              {relaxations.slice(0, 3).map(({ chip, matched }) => (
                <button
                  key={`relax-${chip.id}`}
                  data-relax
                  type="button"
                  onClick={() => onRemove?.(chip)}
                  className="flex h-10 items-center gap-1.5 rounded-full border border-koi-forest/20 bg-white px-4 text-sm font-semibold text-koi-forest transition-colors hover:border-koi-forest"
                >
                  {chip.label} <span className="font-koi-num opacity-70">({matched})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
