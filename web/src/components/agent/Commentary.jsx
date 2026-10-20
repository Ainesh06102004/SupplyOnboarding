"use client";
// ============================================================================
// KOI Agent Mode — Commentary: the conversation, long form (Commentary board).
//
// For a long conversation the lights go down: the page stays where it is,
// blurred and dimmed behind KOI night, and the talk plays as a screenplay —
// numbered beats, YOU and KOI as cues, what KOI does as stage directions in
// italics, and what it found as inserts (the same cards as the glass sheet,
// on paper). Questions and approvals are asked in line, as buttons; nothing is
// saved without one. "Lights up" goes back to the page.
//
// It is a second view of the dock's one conversation (AgentProvider state),
// not a second conversation: every card, answer and undo is the sheet's own.
// ============================================================================

import { useRef, useState } from "react";
import Link from "next/link";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { AskCard, ApprovalCard, ResultCard } from "./cards";
import { useCartStore } from "@/store/cartStore";

const cue = "font-koi-mono text-xs font-semibold tracking-[0.26em]";

function KoiCue() {
  return (
    <span className={`flex items-center gap-2.5 ${cue} text-koi-ember`}>
      <span aria-hidden="true" className="size-2.5 rounded-full border border-koi-ember/60" />KOI
    </span>
  );
}

/** One entry of the conversation as a beat of the script. */
function Beat({ n, entry, state, agent }) {
  let body = null;
  if (entry.kind === "user") {
    body = (
      <>
        <span className={`${cue} text-koi-bg/65`}>YOU</span>
        <p className="m-0 whitespace-pre-wrap text-[clamp(18px,2vw,22px)] font-medium leading-normal">{entry.text}</p>
      </>
    );
  } else if (entry.kind === "say") {
    body = (
      <>
        <KoiCue />
        <p className="m-0 text-pretty text-[clamp(18px,2vw,22px)] font-medium leading-normal">{entry.text}</p>
      </>
    );
  } else if (entry.kind === "tool") {
    // What KOI does, as a stage direction: the summary once done, the label while it works.
    const words = entry.summary ?? entry.label ?? "works";
    body = (
      <p className="m-0 text-[15px] italic text-koi-bg/65">
        ({words.charAt(0).toLowerCase() + words.slice(1)}{entry.state === "running" ? "…" : ""})
      </p>
    );
  } else if (entry.kind === "ask" || entry.kind === "approval" || entry.kind === "result") {
    const insert = entry.kind === "result"
      ? <ResultCard data={entry.data} canUndoRun={agent.canUndoRun()} onUndoRun={agent.undoRun} />
      : entry.kind === "ask"
        ? <AskCard entry={entry} active={state.pending?.entryId === entry.id} onAnswer={agent.answer} />
        : <ApprovalCard entry={entry} active={state.pending?.entryId === entry.id} onDecide={agent.decide} />;
    body = (
      <>
        {entry.kind === "result"
          ? <span className={`${cue} uppercase text-koi-lime`}>Insert</span>
          : <KoiCue />}
        <div className="max-w-[560px] overflow-hidden rounded-[20px] bg-koi-bg p-1.5 text-koi-ink">{insert}</div>
      </>
    );
  } else if (entry.kind === "notice" || entry.kind === "error") {
    body = <p className={`m-0 text-[15px] italic ${entry.kind === "error" ? "text-koi-red-bg" : "text-koi-bg/65"}`}>({entry.text})</p>;
  }
  if (!body) return null;
  return (
    <div data-beat className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 md:grid-cols-[40px_minmax(0,1fr)] md:gap-x-5">
      <span className="pt-[3px] text-right font-koi-mono text-[11px] text-koi-bg/45">{n}</span>
      <div className="flex min-w-0 flex-col gap-2">{body}</div>
    </div>
  );
}

export default function Commentary({ agent, onLightsUp, onSheet }) {
  const { state } = agent;
  const root = useRef(null);
  const scriptRef = useRef(null);
  const [text, setText] = useState("");
  const cart = useCartStore((s) => s.items.length);
  const running = state.status === "running";
  const waiting = state.status === "waiting";
  const firstAsk = state.entries.find((e) => e.kind === "user")?.text ?? "";
  const scene = firstAsk.length > 36 ? `${firstAsk.slice(0, 34).trimEnd()}…` : firstAsk;

  // Lights down: the dim comes up, then the script; each new beat arrives on its own.
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (s) => root.current.querySelectorAll(s);
    gsap.from(q("[data-dim]"), { autoAlpha: 0, duration: 0.6, ease: E.dolly });
    gsap.from(q("[data-top]"), { autoAlpha: 0, y: -12, duration: 0.5, delay: 0.25, ease: E.reveal, clearProps: "opacity,visibility,transform" });
    gsap.from(q("[data-beat]"), { autoAlpha: 0, y: 18, duration: 0.6, stagger: 0.06, delay: 0.35, ease: E.reveal, clearProps: "opacity,visibility,transform" });
  }, { scope: root });

  const count = state.entries.length;
  const seen = useRef(count);
  useGSAP(() => {
    const el = scriptRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    if (count > seen.current && !prefersReducedMotion()) {
      const beats = root.current.querySelectorAll("[data-beat]");
      const fresh = [...beats].slice(-(count - seen.current));
      if (fresh.length) setupMotion().from(fresh, { autoAlpha: 0, y: 18, duration: 0.55, stagger: 0.08, ease: E.reveal, clearProps: "opacity,visibility,transform" });
    }
    seen.current = count;
  }, { scope: root, dependencies: [count, state.pending] });

  const submit = (e) => {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t) return;
    agent.send(t);
    setText("");
  };

  return (
    <section ref={root} aria-label="KOI, long form" className="fixed inset-0 z-[72] flex flex-col font-koi-sans text-koi-bg">
      <div data-dim aria-hidden="true" className="absolute inset-0 bg-koi-night/[.88] backdrop-blur-[6px]" />

      <header data-top className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-[clamp(16px,4vw,52px)] py-5">
        <div className="flex min-w-0 items-center gap-[18px]">
          <span className="flex items-end gap-[3px] text-koi-bg">
            <span className="font-koi-display text-2xl font-extrabold leading-none tracking-[-0.02em]">KOI</span>
            <span aria-hidden="true" className="mb-[3px] size-[7px] rounded-full bg-koi-ember" />
          </span>
          <span className="truncate font-koi-mono text-[11px] font-medium uppercase tracking-[0.2em] text-koi-bg/70">Commentary{scene ? ` · ${scene}` : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/store/cart" onClick={onLightsUp} aria-label={`Cart, ${cart} products`} className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-koi-bg/10 px-4 font-koi-num text-sm font-semibold text-koi-bg no-underline">
            Cart <span>{cart}</span>
          </Link>
          <button type="button" onClick={onSheet} className="hidden h-11 items-center rounded-full px-4 text-sm font-semibold text-koi-bg/80 transition-colors hover:bg-koi-bg/10 md:flex">Side panel</button>
          <button type="button" onClick={onLightsUp} className="flex h-11 items-center gap-2 rounded-full border border-koi-bg/25 px-4 text-sm font-semibold text-koi-bg transition-colors hover:bg-koi-bg/10">Lights up</button>
        </div>
      </header>

      <div ref={scriptRef} role="log" aria-live="polite" aria-relevant="additions" className="relative z-10 min-h-0 flex-1 overflow-y-auto px-[clamp(16px,4vw,52px)] pb-6 pt-2 [mask-image:linear-gradient(180deg,transparent_0,#000_40px,#000_calc(100%-50px),transparent_100%)]">
        <div className="mx-auto flex max-w-[820px] flex-col gap-7 pt-6">
          {state.entries.map((e, i) => <Beat key={e.id} n={i + 1} entry={e} state={state} agent={agent} />)}
          {state.queue.map((q, i) => (
            <div key={`q${i}`} data-beat className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-4 md:grid-cols-[40px_minmax(0,1fr)] md:gap-x-5">
              <span />
              <div className="flex flex-col gap-2">
                <span className={`${cue} text-koi-bg/45`}>YOU · NEXT</span>
                <p className="m-0 text-[18px] text-koi-bg/60">{q}</p>
              </div>
            </div>
          ))}
          {(running || waiting) && (
            <p data-beat className="m-0 pl-[48px] text-[15px] italic text-koi-bg/65 md:pl-[60px]">
              <span aria-hidden="true" className="mr-2 inline-block size-2 animate-pulse rounded-full bg-koi-ember align-middle" />
              ({waiting ? (state.pending?.kind === "approval" ? "waits for your OK" : "waits for your answer") : (state.statusLine ?? "KOI is working").replace(/^KOI /, "")})
            </p>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="relative z-10 mx-auto mb-[max(16px,env(safe-area-inset-bottom))] flex w-[min(820px,calc(100%-32px))] items-center gap-2 rounded-full border border-koi-bg/20 bg-koi-bg/10 py-1.5 pl-5 pr-1.5 backdrop-blur-md">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 600))}
          placeholder={waiting ? "Answer above, or tell KOI something else…" : running ? "Add something — it sends when KOI finishes" : "Reply to KOI"}
          aria-label="Reply to KOI"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-base text-koi-bg outline-none placeholder:text-koi-bg/50"
        />
        {running && !text.trim() ? (
          <button type="button" onClick={agent.stop} className="h-11 rounded-full px-5 text-sm font-semibold text-koi-bg hover:bg-koi-bg/10">Stop</button>
        ) : (
          <button type="submit" disabled={!text.trim()} className="h-11 rounded-full bg-koi-lime px-5 text-sm font-bold text-koi-forest disabled:opacity-40">Send</button>
        )}
      </form>
    </section>
  );
}
