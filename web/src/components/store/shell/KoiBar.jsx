"use client";
// ============================================================================
// KOI — the KOI bar: one place to talk to KOI, at the foot of every store page
//
// KOI is not a side-window chat any more. Its words appear as a subtitle above
// a single prompt, and its dot (the ember) rests in the prompt between acts.
//
// With Agent Mode on, the agent's own dock is this bar (AgentDock renders the
// same <KoiSubtitle /> and <EmberSlot />), so this component stands down.
// Without it, asking KOI here is the store's intent search: the sentence goes
// to the shop, which reads it the way the header's search always has.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { EmberSlot, useEmber } from "@/components/store/ember/Ember";
import { setupMotion, prefersReducedMotion, E } from "@/lib/motion/koiMotion";

const PLACEHOLDERS = {
  "/store": "Snacks for evening tea, crunchy, not sweet…",
  "/store/shop": "High protein, no palm oil…",
  "/store/cart": "Anything here my kid shouldn’t have?",
  "/store/orders": "Make last week’s basket again…",
  "/store/household": "My mother is staying with us this week…",
};
const placeholderFor = (path) => PLACEHOLDERS[path] ?? (path.startsWith("/store/product") ? "Is this okay for my dad? He’s diabetic…" : "Ask KOI…");

/** KOI's current line, word by word. */
export function KoiSubtitle({ tone = "light" }) {
  const { line, key } = useKoiVoice();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !line) return;
    const words = el.querySelectorAll("[data-w]");
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.fromTo(words, { autoAlpha: 0, y: 10, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.045, ease: E.reveal });
  }, [line, key]);
  return (
    <p
      ref={ref}
      aria-live="polite"
      className={`m-0 min-h-[27px] max-w-[780px] text-balance rounded-2xl px-4 py-1 text-center text-[16px] font-medium leading-[1.45] md:text-[19px] ${tone === "dark" ? "text-koi-bg" : "text-koi-ink"} ${line && tone !== "dark" ? "bg-koi-bg/80 backdrop-blur-md" : ""}`}
    >
      {line.split(" ").filter(Boolean).map((w, i) => (
        <span key={`${key}-${i}`} data-w className="mr-[0.28em] inline-block">{w}</span>
      ))}
    </p>
  );
}

export default function KoiBar() {
  const pathname = usePathname() ?? "/store";
  const router = useRouter();
  const ember = useEmber();
  const [text, setText] = useState("");

  // Checkout is the one page with nothing but the checkout on it: KOI still
  // speaks (the subtitle) and its dot still has a home, but there is nothing to
  // ask it here, and no agent runs mid-checkout.
  if (pathname.startsWith("/store/checkout")) {
    return (
      <section
        data-koi-bar
        aria-label="KOI"
        className="pointer-events-none sticky bottom-0 z-40 mt-auto flex flex-col items-center gap-2.5 bg-linear-to-t from-koi-bg from-60% to-koi-bg/0 px-4 pb-5 pt-8"
      >
        <KoiSubtitle />
        <div className="flex h-11 items-center gap-2.5 rounded-full border border-koi-forest/15 bg-white/90 pl-4 pr-5 shadow-[0_24px_44px_-28px_rgba(15,61,46,.45)] backdrop-blur-xl">
          <EmberSlot />
          <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">KOI is reading along · it never takes payment</span>
        </div>
      </section>
    );
  }

  const ask = (e) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText("");
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
      <KoiSubtitle />
      <form onSubmit={ask} role="search" className="pointer-events-auto relative flex h-14 w-full max-w-[680px] items-center gap-2.5 rounded-full border border-koi-forest/15 bg-white/90 pl-5 pr-2 shadow-[0_24px_44px_-28px_rgba(15,61,46,.45)] backdrop-blur-xl md:h-[60px]">
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
    </section>
  );
}
