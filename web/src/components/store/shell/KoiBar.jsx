"use client";
// ============================================================================
// KOI — the KOI bar: one place to talk to KOI, at the foot of every store page
//
// KOI is not a side-window chat any more. Its words appear as the bar's top
// row, inside the bar (never floating over the page), and its dot (the ember)
// rests in the prompt between acts. When a page needs an answer it asks in
// the bar (<KoiAsk>, store/koiBarStore.js): the bar becomes the question.
//
// With Agent Mode on, the agent's own dock is this bar (AgentDock renders the
// same <KoiSubtitle /> and <AskSlot />), so this component stands down.
// Without it, asking KOI here is the store's intent search: the sentence goes
// to the shop, which reads it the way the header's search always has.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { useKoiBar } from "@/store/koiBarStore";
import { EmberSlot, useEmber } from "@/components/store/ember/Ember";
import { setupMotion, prefersReducedMotion, E } from "@/lib/motion/koiMotion";
import { readMealSentence, dateFor } from "@/lib/food/mealWords";
import { readScheduleSentence } from "@/lib/calendar/words";
import { AskSlot } from "./KoiAsk";

const PLACEHOLDERS = {
  "/store": "Snacks for evening tea, crunchy, not sweet…",
  "/store/shop": "High protein, no palm oil…",
  "/store/cart": "Anything here my kid shouldn’t have?",
  "/store/orders": "Make last week’s basket again…",
  "/store/household": "My mother is staying with us this week…",
};
const placeholderFor = (path) => PLACEHOLDERS[path] ?? (path.startsWith("/store/product") ? "Is this okay for my dad? He’s diabetic…" : "Ask KOI…");

/** How long a line stays up: long enough to read it, then the bar folds back to the prompt. */
const holdMs = (line) => Math.min(12000, 4000 + line.split(" ").length * 280);

/**
 * KOI's current line, word by word, as the top row inside the bar. It folds
 * away once it has been read (the bar shrinks back to the prompt), and a new
 * line opens it again. Inside the bar it can never sit over the page.
 */
export function KoiSubtitle({ className = "" }) {
  const { line, key } = useKoiVoice();
  const [doneKey, setDoneKey] = useState(null);
  const ref = useRef(null);
  const showing = Boolean(line) && doneKey !== key;
  useEffect(() => {
    const el = ref.current;
    if (!el || !line) return;
    const words = el.querySelectorAll("[data-w]");
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.fromTo(words, { autoAlpha: 0, y: 8, filter: "blur(6px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.04, ease: E.reveal });
  }, [line, key]);
  useEffect(() => {
    if (!line) return undefined;
    const timer = setTimeout(() => setDoneKey(key), holdMs(line));
    return () => clearTimeout(timer);
  }, [line, key]);
  return (
    <div data-koi-line className={`grid transition-[grid-template-rows,opacity] duration-500 ${showing ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} ${className}`}>
      <p ref={ref} aria-live="polite" className="m-0 min-h-0 overflow-hidden text-left text-[15px] font-medium leading-[1.45] text-koi-ink md:text-[16px]">
        <span className="block pb-0.5 pt-3">
          {line.split(" ").filter(Boolean).map((w, i) => (
            <span key={`${key}-${i}`} data-w className="mr-[0.28em] inline-block">{w}</span>
          ))}
        </span>
      </p>
    </div>
  );
}

export default function KoiBar() {
  const pathname = usePathname() ?? "/store";
  const router = useRouter();
  const ember = useEmber();
  const [text, setText] = useState("");
  const asking = useKoiBar((b) => b.ask);

  // Checkout is the one page with nothing but the checkout on it: KOI still
  // speaks (its line) and its dot still has a home, but there is nothing to
  // ask it here, and no agent runs mid-checkout.
  if (pathname.startsWith("/store/checkout")) {
    return (
      <section
        data-koi-bar
        aria-label="KOI"
        className="pointer-events-none sticky bottom-0 z-40 mt-auto flex flex-col items-center gap-2.5 bg-linear-to-t from-koi-bg from-60% to-koi-bg/0 px-4 pb-5 pt-8"
      >
        <div className="flex max-w-[680px] flex-col rounded-[24px] border border-koi-forest/15 bg-white/90 px-4 shadow-[0_24px_44px_-28px_rgba(15,61,46,.45)] backdrop-blur-xl">
          <KoiSubtitle />
          <div className="flex h-11 items-center gap-2.5">
            <EmberSlot />
            <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">KOI is reading along · it never takes payment</span>
          </div>
        </div>
      </section>
    );
  }

  const ask = (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText("");
    // "Had biryani at the office", "kal raat pizza khaya": a meal goes to Track, which reads it and offers a Take 2.
    if (readMealSentence(q).isMeal) {
      ember.status("Reading");
      router.push(`/store/track?meal=${encodeURIComponent(q)}`);
      return;
    }
    // "Lunch out every Tuesday", "gym Mon Wed Fri": the Calendar, which reads it into an event to confirm.
    if (readScheduleSentence(q, { today: dateFor("today", { offsetMinutes: -new Date().getTimezoneOffset() }) }).isSchedule) {
      ember.status("Reading");
      router.push(`/store/calendar?add=${encodeURIComponent(q)}`);
      return;
    }
    // On the shelf, KOI pulls focus in place; anywhere else the ask goes to it.
    if (pathname === "/store/shop") { window.dispatchEvent(new CustomEvent("koi:ask", { detail: q })); return; }
    ember.status("Reading");
    router.push(`/store/shop?q=${encodeURIComponent(q)}`);
  };

  return (
    <section
      data-koi-bar
      aria-label="Ask KOI"
      className="pointer-events-none sticky z-40 mt-auto flex flex-col items-center gap-2.5 bg-linear-to-t from-koi-bg from-60% to-koi-bg/0 px-4 pb-5 pt-8"
      style={{ bottom: "var(--koi-bottom-chrome)" }}
    >
      {asking ? <AskSlot ask={asking} /> : (
        <div className="pointer-events-auto flex w-full max-w-[680px] flex-col rounded-[30px] border border-koi-forest/15 bg-white/90 shadow-[0_24px_44px_-28px_rgba(15,61,46,.45)] backdrop-blur-xl">
          <KoiSubtitle className="px-5" />
          <form onSubmit={ask} role="search" className="relative flex h-14 items-center gap-2.5 pl-5 pr-2 md:h-[60px]">
            <EmberSlot />
            <label htmlFor="koi-ask" className="sr-only">Ask KOI</label>
            <input
              id="koi-ask"
              type="text"
              autoComplete="off"
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, 300)); ember.bump(); }}
              placeholder={placeholderFor(pathname)}
              className="h-full min-w-0 flex-1 border-0 bg-transparent font-koi-sans text-base font-medium text-koi-ink outline-none placeholder:text-koi-muted"
            />
            <button type="submit" className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-koi-forest px-[18px] font-koi-sans text-sm font-bold text-koi-lime disabled:opacity-60" disabled={!text.trim()}>
              Ask KOI
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
