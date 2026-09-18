"use client";

// ============================================================================
// Help KOI understand you (migration 00055)
//
// KOI stores its own words for a change and never the shopper's. That is the
// right default, and it has one cost: when the reader misunderstands "take out
// the chikki and replace with almonds", nobody finds out unless the shopper
// copies the conversation out of their own browser and sends it. Every phrasing
// fixed so far was found exactly that way.
//
// So this is the offer, in plain words: keep the wording of the things KOI
// could not do, so they can be fixed. Off unless switched on, never the ones it
// understood, deleted after ninety days, and visible and deletable here — a
// list of someone's words they cannot see is the thing this was meant to avoid.
// ============================================================================

import { useState } from "react";
import { Trash2 } from "lucide-react";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5A6B5A]";

const when = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * @param {object} props
 * @param {boolean} props.on household.log_failed_phrases
 * @param {Array} props.misses rows of followup_miss, newest first
 * @param {(on: boolean) => Promise<void>} props.onToggle
 * @param {(id: string|null) => Promise<void>} props.onForget id, or null for all of them
 * @param {boolean} props.busy
 */
export default function PhraseLog({ on, misses = [], onToggle, onForget, busy = false }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-3xl bg-white/70 p-5 ring-1 ring-inset ring-[#083D2D]/8">
      <span className={LABEL}>Help KOI understand you</span>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[#5A6B5A]">
        When KOI can&apos;t do something you asked for in the chat, it can keep what you typed so the misunderstanding
        can be fixed. Only the ones it couldn&apos;t do, never the ones it could. Deleted after 90 days, and yours to
        read or delete here at any time.
      </p>

      <label className="mt-3 flex items-center gap-2.5 text-[12.5px] text-[#0E4032]">
        <input type="checkbox" checked={Boolean(on)} disabled={busy} onChange={(e) => onToggle(e.target.checked)}
               className="h-3.5 w-3.5 accent-[#0E4032]" />
        Keep what I typed when KOI can&apos;t do it
      </label>

      {misses.length > 0 && (
        <div className="mt-3 border-t border-[#083D2D]/8 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                    className="text-[12px] font-semibold text-[#0E4032] hover:underline">
              {misses.length} {misses.length === 1 ? "message" : "messages"} kept
            </button>
            <button type="button" onClick={() => onForget(null)} disabled={busy}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#B4453C] hover:underline disabled:opacity-40">
              <Trash2 className="h-3 w-3" /> Delete them all
            </button>
          </div>
          {open && (
            <ul className="mt-2 space-y-2">
              {misses.map((miss) => (
                <li key={miss.id} className="rounded-xl bg-[#083D2D]/[0.04] px-3 py-2 text-[12px]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[#0E4032]">&ldquo;{miss.said}&rdquo;</p>
                    <button type="button" onClick={() => onForget(miss.id)} disabled={busy}
                            aria-label="Delete this message"
                            className="shrink-0 text-[#5A6B5A] hover:text-[#B4453C] disabled:opacity-40">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#8A6508]">{(miss.not_applied ?? []).join(" · ")}</p>
                  <p className="mt-0.5 text-[10.5px] text-[#8A9A8A]">{when(miss.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
