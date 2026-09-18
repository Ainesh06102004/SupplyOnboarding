"use client";

// ============================================================================
// What someone feels like this week — one list, three states
//
// This used to be two grids of the same twenty categories, one headed "Feels
// like" and one "Not this week", repeated for every person eating. Three people
// meant a hundred and twenty chips, most of them saying nothing, and a shopper
// had to work out which grid they were looking at before they could read it.
//
// It is one list now, and a category is in one of three states:
//
//   nothing   KOI decides, which is what almost every category should be
//   want      a nudge towards it, never a reason to miss a target
//   skip      left out for this person, and still bought for anyone else
//
// Clicking cycles. The state is in the chip itself — filled for a want, struck
// through for a skip — so nothing has to be read twice, and the row of chips
// says what it means at a glance instead of by its heading.
// ============================================================================

import { Check, Minus } from "lucide-react";

/** What one more click means, so a chip is never a mystery box. */
const NEXT = { none: "want", want: "skip", skip: "none" };
const SAYS = {
  none: "KOI decides",
  want: "more of this",
  skip: "none this week",
};

/**
 * @param {object} props
 * @param {Array<{key: string, label: string}>} props.categories the kinds of food KOI stocks
 * @param {string[]} props.prefer what they feel like
 * @param {string[]} props.skip what to leave out for them
 * @param {(key: string, state: "none"|"want"|"skip") => void} props.onChange
 */
export default function ThisWeekChips({ categories = [], prefer = [], skip = [], onChange }) {
  const stateOf = (key) => (prefer.includes(key) ? "want" : skip.includes(key) ? "skip" : "none");
  const wanted = prefer.length;
  const skipped = skip.length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#5A6B5A]">This week</span>
        <span className="text-[11px] text-[#8A9A8A]">
          {wanted || skipped
            ? [wanted && `${wanted} more of`, skipped && `${skipped} skipped`].filter(Boolean).join(" · ")
            : "Tap once for more of it, twice to skip it"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const state = stateOf(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChange(c.key, NEXT[state])}
              aria-label={`${c.label}: ${SAYS[state]}`}
              title={SAYS[state]}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] transition-colors",
                state === "want" && "bg-[#0E4032] font-semibold text-white",
                state === "skip" && "bg-[#083D2D]/[0.06] text-[#8A9A8A] line-through",
                state === "none" && "bg-white text-[#3E4E3E] ring-1 ring-inset ring-[#083D2D]/10 hover:ring-[#083D2D]/25",
              ].filter(Boolean).join(" ")}
            >
              {state === "want" && <Check className="h-3 w-3" aria-hidden="true" />}
              {state === "skip" && <Minus className="h-3 w-3" aria-hidden="true" />}
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
