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
// ============================================================================

import React from "react";
import { X, Sparkles, AlertTriangle } from "lucide-react";
import { C, BODY } from "@/components/store/landing/tokens";

const KIND_STYLE = {
  constraint: { background: "#FFFFFF", border: `1px solid ${C.forest}22`, color: C.forest },
  preference: { background: C.mint, border: `1px solid ${C.emerald}33`, color: C.green },
  unapplied: { background: "#FDF3E7", border: "1px solid #E8A87C", color: "#9B3A25" },
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
  if (!chips.length) return null;

  const empty = matchCount === 0;

  return (
    // `scroll-mt-28` keeps the row clear of the sticky nav when it is the
    // scroll target — it is the explanation for what the grid now shows, so
    // landing with it hidden behind the header defeats the point.
    <section
      id="intent"
      aria-label="How KOI read your search"
      className="mx-auto w-full max-w-[1400px] scroll-mt-28 px-5 pt-8 sm:px-8 lg:px-12"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ ...BODY, color: `${C.ink}66` }}
        >
          <Sparkles size={13} aria-hidden="true" />
          KOI read this as
        </span>

        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-[12.5px] font-semibold"
            style={{ ...BODY, ...(KIND_STYLE[chip.kind] || KIND_STYLE.preference) }}
          >
            {chip.kind === "unapplied" && <AlertTriangle size={12} aria-hidden="true" />}
            {chip.label}
            <button
              type="button"
              onClick={() => onRemove?.(chip)}
              aria-label={`Remove ${chip.label}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-opacity hover:opacity-60"
              style={{ background: "currentColor" }}
            >
              <X size={10} strokeWidth={3} style={{ color: C.offwhite }} aria-hidden="true" />
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={onClearAll}
          className="ml-1 text-[12px] font-semibold underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-60"
          style={{ ...BODY, color: `${C.ink}88` }}
        >
          Clear
        </button>
      </div>

      {unverifiedNote && !empty && (
        <p
          className="mt-3 inline-flex items-start gap-1.5 text-[12.5px] font-semibold"
          style={{ ...BODY, color: "#9B3A25" }}
        >
          <AlertTriangle size={13} className="mt-[2px] shrink-0" aria-hidden="true" />
          {unverifiedNote}
        </p>
      )}

      {/* A correct interpretation can still match nothing. Saying which limit is
          binding turns a dead end into one tap. */}
      {empty && (
        <div className="mt-4 rounded-2xl p-4" style={{ background: C.cream }}>
          <p className="text-[13.5px] font-semibold" style={{ ...BODY, color: C.forest }}>
            Nothing in KOI&apos;s catalogue matches all of that.
          </p>
          {relaxations.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px]" style={{ ...BODY, color: `${C.ink}88` }}>Try without</span>
              {relaxations.slice(0, 3).map(({ chip, matched }) => (
                <button
                  key={`relax-${chip.id}`}
                  type="button"
                  onClick={() => onRemove?.(chip)}
                  className="rounded-full px-3 py-1 text-[12.5px] font-semibold transition-transform hover:-translate-y-px"
                  style={{ ...BODY, background: C.forest, color: C.offwhite }}
                >
                  {chip.label} <span style={{ opacity: 0.7 }}>({matched})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
