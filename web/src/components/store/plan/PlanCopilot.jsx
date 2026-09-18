"use client";

// ============================================================================
// The plan copilot — a floating chat that changes the plan on screen
//
// Phase 4.3 in a panel that follows the shopper down the page: "cheaper", "no
// paneer", "more protein for me". Each message is read (lib/planner/followup.js,
// with a model when one is configured), applied to the plan's own stored
// constraints, and solved again as a new plan.
//
// What the shopper types stays in this component for the session. Only the
// plans it produces are stored, and a change to a person reaches their saved
// profile only when the shopper says so.
// ============================================================================

import { useEffect, useRef } from "react";
import { Loader2, MessageSquare, X, ArrowUp } from "lucide-react";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {Array} props.conversation turns: { text, applied, notApplied, changed, basketChange, report, householdChanges, saving, saved, saveError }
 * @param {string} props.text the message being typed
 * @param {(text: string) => void} props.onText
 * @param {() => void} props.onSend
 * @param {boolean} props.busy
 * @param {string[]} props.examples what this plan could be asked, from the plan itself
 * @param {(turnIndex: number) => void} props.onSaveToHousehold
 */
export default function PlanCopilot({ open, onOpenChange, conversation = [], text, onText, onSend, busy, examples = [], onSaveToHousehold }) {
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, conversation.length, busy]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) {
    return (
      // Above the mobile tab bar (StoreNavigation), beside the page on desktop.
      <button type="button" onClick={() => onOpenChange(true)}
              className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#0E4032] px-4 py-3 text-[13px] font-bold text-white shadow-lg md:bottom-4">
        <MessageSquare className="h-4 w-4" />
        Change this plan
        {conversation.length > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 text-[11px]">{conversation.length}</span>
        )}
      </button>
    );
  }

  return (
    <section role="dialog" aria-label="Change this plan"
             className="fixed inset-x-3 bottom-24 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-[#083D2D]/15 bg-white shadow-xl md:inset-x-auto md:bottom-3 md:right-4 md:max-h-[76vh] md:w-[400px]">
      <header className="flex items-start justify-between gap-3 border-b border-[#083D2D]/10 px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Change this plan</p>
          <p className="text-[11px] text-[#5A6B5A]">What you type stays on this page. Only the new plan is saved.</p>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close" className="text-[#5A6B5A] hover:text-[#0E4032]">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {conversation.length === 0 && (
          <div className="space-y-2 text-[12px] text-[#5A6B5A]">
            <p>Ask for a change and KOI plans again. For example:</p>
            <ul className="space-y-1">
              {examples.map((example) => (
                <li key={example}>
                  <button type="button" onClick={() => onText(example)} className="rounded-full border border-[#083D2D]/15 px-2.5 py-1 text-left text-[11.5px] text-[#0E4032]">
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {conversation.map((turn, i) => (
          <div key={i} className="space-y-1.5 text-[12.5px]">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#0E4032] px-3 py-1.5 text-white">{turn.text}</p>
            <div className="w-fit max-w-[92%] space-y-1 rounded-2xl rounded-bl-sm bg-[#083D2D]/[0.05] px-3 py-2 text-[#5A6B5A]">
              {turn.applied?.length > 0 && <p className="font-semibold text-[#0E4032]">Changed: {turn.applied.join(" · ")}</p>}
              {turn.changed && turn.basketChange && (
                <>
                  {turn.basketChange.added.map((s) => <p key={`a-${s.skuId}`}>Adds {s.packs} × {s.name}</p>)}
                  {turn.basketChange.changed.map((c) => <p key={`c-${c.skuId}`}>{c.name}: {c.from} → {c.to} packs</p>)}
                  {turn.basketChange.dropped.map((s) => <p key={`d-${s.skuId}`}>No longer {s.name}</p>)}
                  <p>
                    ₹{turn.basketChange.costBefore} → ₹{turn.report.cost}
                    {turn.report.unmet.length > 0
                      ? ` · short: ${turn.report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}`
                      : " · every target met"}
                  </p>
                </>
              )}
              {turn.notApplied?.map((note) => <p key={note} className="text-[#8A6508]">{note}</p>)}
              {turn.changed && turn.householdChanges?.length > 0 && !turn.saved && (
                <p>
                  This changed the plan, not their saved profile.{" "}
                  <button type="button" onClick={() => onSaveToHousehold(i)} disabled={turn.saving}
                          className="font-semibold text-[#16A06E] hover:underline disabled:opacity-40">
                    {turn.saving ? "Saving…" : `Save it for ${turn.householdChanges.map((c) => c.label).join(", ")}`}
                  </button>
                </p>
              )}
              {turn.saved && <p className="text-[#16A06E]">Saved to their profile.</p>}
              {turn.saveError && <p className="text-[#B4453C]">{turn.saveError}</p>}
            </div>
          </div>
        ))}
        {busy && <p className="text-[12px] text-[#5A6B5A]"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Planning again…</p>}
        <div ref={endRef} />
      </div>

      <form className="flex items-center gap-2 border-t border-[#083D2D]/10 px-3 py-2.5"
            onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input ref={inputRef} id="plan-followup" value={text} onChange={(e) => onText(e.target.value)} maxLength={200}
               placeholder={examples[0] ?? "Say what to change"}
               className="min-w-0 flex-1 rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Send"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0E4032] text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}
