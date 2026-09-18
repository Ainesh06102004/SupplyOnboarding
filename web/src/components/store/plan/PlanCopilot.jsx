"use client";

// ============================================================================
// The plan copilot — a floating chat that plans, and then changes the plan
//
// It works from the first message, and what it does depends on what the
// shopper has:
//
//   setup   no profiles yet: the message is read as a household
//           (/api/plan/brief) and drafted for them to keep, as profiles.
//   ready   profiles but no plan: the message is read for days and a budget,
//           and the plan is made.
//   plan    a plan on screen: the message changes it (/api/plan/followup) —
//           "cheaper", "no paneer", "more protein for me".
//
// The conversation is kept in the shopper's own browser (the page stores it),
// never on KOI's servers: only the plans it produces are stored. The cue line
// says what KOI is doing while it works — reading, planning, saving — because a
// spinner alone doesn't say whether anything is happening.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, X, ArrowUp, Trash2, UserRoundPlus } from "lucide-react";

/** What KOI says it is doing, by stage. Cycled, so a long wait still reads as work. */
const CUES = Object.freeze({
  reading: ["Reading what you wrote", "Working out who is who", "Checking it against your household", "Keeping to what you said"],
  planning: ["Planning", "Weighing the budget", "Balancing everyone's targets", "Choosing whole packs", "Checking portions", "Solving"],
  saving: ["Saving", "Recording the version"],
});

const PROMPTS = Object.freeze({
  setup: "Tell KOI who you shop for — \"we're four, two adults and two kids, 120 g protein each for the adults\" — and it drafts a profile for each person for you to keep.",
  ready: "Ask for a plan: \"plan 7 days on ₹4,000\". Or press Plan it above.",
  plan: "Ask for a change and KOI plans again. For example:",
});

/**
 * A cue line: a verb that changes while KOI works, with the seconds once it's
 * slow. Mounted with `key={stage}`, so each stage starts its own count.
 */
function Cue({ stage }) {
  const phrases = CUES[stage] ?? CUES.planning;
  const [i, setI] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const phrase = setInterval(() => setI((n) => (n + 1) % phrases.length), 1600);
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { clearInterval(phrase); clearInterval(clock); };
  }, [phrases.length]);

  return (
    <p className="flex items-center gap-2 text-[12px] text-[#5A6B5A]" aria-live="polite">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{phrases[i]}…{seconds > 2 ? ` ${seconds}s` : ""}</span>
    </p>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {"setup"|"ready"|"plan"} props.mode what the next message will do
 * @param {Array} props.conversation turns: { text, kind, lines, draft, householdChanges, saving, saved, saveError }
 * @param {string} props.text the message being typed
 * @param {(text: string) => void} props.onText
 * @param {() => void} props.onSend
 * @param {"reading"|"planning"|"saving"|null} props.stage what KOI is doing now
 * @param {string[]} props.examples what this plan could be asked, from the plan itself
 * @param {(turnIndex: number) => void} props.onSaveToHousehold
 * @param {(turnIndex: number) => void} props.onKeepDraft
 * @param {() => void} props.onClear
 */
export default function PlanCopilot({
  open, onOpenChange, mode = "ready", conversation = [], text, onText, onSend, stage = null,
  examples = [], onSaveToHousehold, onKeepDraft, onClear,
}) {
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const busy = Boolean(stage);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, conversation.length, stage]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) {
    return (
      // Above the mobile tab bar (StoreNavigation, z-[60]), beside the page on
      // desktop — and over both, so it is never hidden behind a sticky header.
      <button type="button" onClick={() => onOpenChange(true)}
              className="fixed bottom-24 right-4 z-[70] inline-flex items-center gap-2 rounded-full bg-[#0E4032] px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_30px_rgba(8,61,45,0.35)] md:bottom-4">
        <MessageSquare className="h-4 w-4" />
        {mode === "plan" ? "Change this plan" : "Ask KOI"}
        {conversation.length > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 text-[11px]">{conversation.length}</span>
        )}
      </button>
    );
  }

  return (
    <section role="dialog" aria-label="Ask KOI about this plan"
             className="fixed inset-x-3 bottom-24 z-[70] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-[#083D2D]/15 bg-white shadow-[0_18px_50px_rgba(8,61,45,0.28)] md:inset-x-auto md:bottom-3 md:right-4 md:max-h-[76vh] md:w-[400px]">
      <header className="flex items-start justify-between gap-3 border-b border-[#083D2D]/10 px-4 py-3">
        <div>
          <p className="text-[13px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Ask KOI</p>
          <p className="text-[11px] text-[#5A6B5A]">
            {mode === "plan" ? "Changes the plan on screen." : mode === "setup" ? "Sets up who you shop for." : "Plans your week."}
            {" "}Kept in this browser.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {conversation.length > 0 && (
            <button type="button" onClick={onClear} aria-label="Clear this chat" className="text-[#5A6B5A] hover:text-[#0E4032]">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close" className="text-[#5A6B5A] hover:text-[#0E4032]">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="space-y-2 text-[12px] text-[#5A6B5A]">
          <p>{PROMPTS[mode]}</p>
          {mode === "plan" && conversation.length === 0 && (
            <ul className="space-y-1">
              {examples.map((example) => (
                <li key={example}>
                  <button type="button" onClick={() => onText(example)} className="rounded-full border border-[#083D2D]/15 px-2.5 py-1 text-left text-[11.5px] text-[#0E4032]">
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {conversation.map((turn, i) => (
          <div key={`${turn.at ?? i}-${i}`} className="space-y-1.5 text-[12.5px]">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#0E4032] px-3 py-1.5 text-white">{turn.text}</p>
            <div className="w-fit max-w-[92%] space-y-1 rounded-2xl rounded-bl-sm bg-[#083D2D]/[0.05] px-3 py-2 text-[#5A6B5A]">
              {(turn.lines ?? []).map((line, n) => (
                <p key={n} className={n === 0 ? "font-semibold text-[#0E4032]" : undefined}>{line}</p>
              ))}
              {turn.draft?.members?.length > 0 && !turn.kept && (
                <button type="button" onClick={() => onKeepDraft(i)} disabled={turn.keeping}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#0E4032] px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
                  <UserRoundPlus className="h-3.5 w-3.5" />
                  {turn.keeping ? "Saving…" : `Keep ${turn.draft.members.length === 1 ? "this profile" : "these profiles"}`}
                </button>
              )}
              {turn.kept && <p className="text-[#16A06E]">Kept as profiles.</p>}
              {turn.householdChanges?.length > 0 && !turn.saved && (
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
        {busy && <Cue key={stage} stage={stage} />}
        <div ref={endRef} />
      </div>

      <form className="flex items-center gap-2 border-t border-[#083D2D]/10 px-3 py-2.5"
            onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input ref={inputRef} id="plan-followup" value={text} onChange={(e) => onText(e.target.value)} maxLength={600}
               placeholder={mode === "setup" ? "We're four, two adults and two kids…" : mode === "ready" ? "Plan 7 days on ₹4,000" : (examples[0] ?? "Say what to change")}
               className="min-w-0 flex-1 rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Send"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0E4032] text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}
