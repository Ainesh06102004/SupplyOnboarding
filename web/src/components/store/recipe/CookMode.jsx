"use client";

// ============================================================================
// Cook mode: one step at a time, big enough to read from the hob.
//
// The method takes the whole screen in the forest ink: the step, the amounts it
// uses, and a timer the cook can start. The screen is asked to stay on (Screen
// Wake Lock) while it is open, and let go when it closes. Back and Next are
// thumb-sized; Escape leaves. The amounts are the cook plan's, so they are the
// same ones the recipe page shows.
//
// Timers are the cook's to start, never started for them. A step the recipe
// times offers one at the recipe's time, a minute either way before it starts;
// any other step can have one too. A started timer keeps going when the cook
// moves on, in a strip under the progress bar, so the dal simmers while the
// tadka is made. Time's up turns it lime, buzzes a phone that can, and is read
// out. Leaving with a timer still set asks first.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { lineText, renderText } from "@/lib/food/recipes";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const NUDGE_S = 60;
const MAX_S = 3 * 60 * 60;
const DEFAULT_S = 5 * 60;

/**
 * The cook's timers, at most one per step. They count to an end time rather
 * than down a counter, so a phone that put the tab to sleep wakes to the right
 * time.
 */
function useTimers() {
  const [timers, setTimers] = useState([]);
  const [now, setNow] = useState(0);
  const rung = useRef(new Set());

  const list = timers.map((t) => {
    const left = t.endsAt ? Math.min(t.total, Math.max(0, Math.ceil((t.endsAt - now) / 1000))) : t.left;
    return { ...t, left, running: Boolean(t.endsAt) && left > 0, done: left === 0 };
  });
  const ticking = list.some((t) => t.running);
  const doneKey = list.filter((t) => t.done).map((t) => t.step).join(",");

  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);

  // Buzz once for each timer that runs out.
  useEffect(() => {
    for (const step of doneKey ? doneKey.split(",") : []) {
      if (rung.current.has(step)) continue;
      rung.current.add(step);
      navigator.vibrate?.([300, 120, 300]);
    }
  }, [doneKey]);

  const start = (step, title, seconds) => {
    const at = Date.now();
    rung.current.delete(String(step));
    setNow(at);
    setTimers((ts) => [...ts.filter((t) => t.step !== step), { step, title, total: seconds, left: seconds, endsAt: at + seconds * 1000 }]);
  };
  const pause = (step) => {
    const at = Date.now();
    setNow(at);
    setTimers((ts) => ts.map((t) => (t.step === step && t.endsAt ? { ...t, left: Math.max(0, Math.ceil((t.endsAt - at) / 1000)), endsAt: null } : t)));
  };
  const resume = (step) => {
    const at = Date.now();
    setNow(at);
    setTimers((ts) => ts.map((t) => (t.step === step && !t.endsAt ? { ...t, endsAt: at + t.left * 1000 } : t)));
  };
  const clear = (step) => setTimers((ts) => ts.filter((t) => t.step !== step));

  return { list, start, pause, resume, clear };
}

const Icon = ({ d }) => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const PAUSE = "M9 6v12M15 6v12";
const PLAY = "M8 5.5v13l10.5-6.5z";
const CLOSE = "M6 6l12 12M18 6 6 18";

/** This step's timer: offered (and set by the cook), or the one they started. Keyed per step. */
function StepTimer({ step, index, timers }) {
  const own = timers.list.find((t) => t.step === index);
  const preset = step.timer ?? (step.minutes ? step.minutes * 60 : DEFAULT_S);
  const [want, setWant] = useState(preset);
  const [open, setOpen] = useState(Boolean(step.timer));

  if (!own && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-2xl border border-koi-bg/30 px-4 py-3 text-[15px] font-semibold">
        Set a timer for this step
      </button>
    );
  }

  if (own) {
    const label = own.done ? "Time's up" : own.running ? "Running" : "Paused";
    return (
      <div className={`flex items-center justify-between gap-3 rounded-[22px] px-[18px] py-4 ${own.done ? "bg-koi-lime text-koi-forest" : "bg-koi-bg/10"}`}>
        <span className="flex flex-col">
          <span className={`font-koi-mono text-[10.5px] uppercase tracking-[0.14em] ${own.done ? "text-koi-forest/80" : "text-koi-bg/70"}`}>{label}</span>
          <span role="timer" aria-live="off" className="font-koi-num text-[44px] font-semibold leading-none">{clock(own.left)}</span>
        </span>
        <span className="flex items-center gap-2">
          {!own.done && (
            <button type="button" onClick={() => timers.clear(index)} className="h-[52px] rounded-2xl px-3 text-[15px] font-semibold text-koi-bg/80">Cancel</button>
          )}
          <button
            type="button"
            onClick={() => (own.done ? timers.clear(index) : own.running ? timers.pause(index) : timers.resume(index))}
            className={`h-[52px] rounded-2xl px-5 text-[15px] font-bold ${own.done ? "bg-koi-forest text-koi-lime" : "bg-koi-lime text-koi-forest"}`}
          >
            {own.done ? "Clear" : own.running ? "Pause" : "Resume"}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-koi-bg/10 px-[18px] py-4">
      <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">{step.timer ? "The recipe says" : "Your timer"}</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center justify-between gap-2 sm:justify-start">
          <button type="button" aria-label="A minute less" disabled={want <= NUDGE_S} onClick={() => setWant((w) => Math.max(NUDGE_S, w - NUDGE_S))} className="grid size-11 place-items-center rounded-[14px] bg-koi-bg/10 text-xl font-semibold disabled:opacity-40">−</button>
          <span role="timer" aria-live="polite" className="min-w-[4.6ch] text-center font-koi-num text-[44px] font-semibold leading-none">{clock(want)}</span>
          <button type="button" aria-label="A minute more" disabled={want >= MAX_S} onClick={() => setWant((w) => Math.min(MAX_S, w + NUDGE_S))} className="grid size-11 place-items-center rounded-[14px] bg-koi-bg/10 text-xl font-semibold disabled:opacity-40">+</button>
        </span>
        <button type="button" onClick={() => timers.start(index, step.title, want)} className="h-[52px] w-full rounded-2xl bg-koi-lime px-5 sm:w-auto text-[15px] font-bold text-koi-forest">Start timer</button>
      </div>
      <span className="text-[13px] leading-snug text-koi-bg/70">Starts when you tap. It keeps going if you move to the next step.</span>
    </div>
  );
}

/**
 * @param {{ plan: object, unit: "kitchen"|"grams", onClose: Function }} props
 */
export default function CookMode({ plan, unit, onClose }) {
  const { recipe } = plan;
  const [i, setI] = useState(0);
  const [awake, setAwake] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef(null);
  const closeRef = useRef(null);
  const timers = useTimers();
  const step = recipe.steps[i];
  const last = i === recipe.steps.length - 1;
  const opts = { scale: plan.scale, unit, gramsOf: plan.gramsOf };
  const others = timers.list.filter((t) => t.step !== i);
  const set = timers.list.filter((t) => !t.done).length;

  // Keep the screen on while cooking; let it go when done.
  useEffect(() => {
    let lock = null;
    let gone = false;
    const ask = async () => {
      try {
        lock = await navigator.wakeLock?.request?.("screen");
        if (lock && !gone) { setAwake(true); lock.addEventListener?.("release", () => setAwake(false)); }
      } catch { setAwake(false); }
    };
    ask();
    const again = () => { if (document.visibilityState === "visible") ask(); };
    document.addEventListener("visibilitychange", again);
    closeRef.current?.focus();
    return () => { gone = true; document.removeEventListener("visibilitychange", again); lock?.release?.().catch(() => {}); };
  }, []);

  useGSAP(() => {
    if (prefersReducedMotion() || !root.current) return;
    setupMotion().fromTo(root.current.querySelectorAll("[data-step]"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: E.reveal, stagger: 0.05 });
  }, { scope: root, dependencies: [i] });

  // A timer still set stops if cook mode closes, so ask first.
  const leave = useCallback(() => (set ? setLeaving(true) : onClose()), [set, onClose]);

  const onKey = useCallback((e) => {
    if (e.key === "Escape") leave();
    if (e.key === "ArrowRight" && !last) setI((x) => x + 1);
    if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
  }, [leave, last]);

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label={`Cook mode: ${recipe.name}`} onKeyDown={onKey} className="fixed inset-0 z-[125] flex flex-col bg-koi-forest font-koi-sans text-koi-bg">
      <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-2 px-4 pb-2.5 pt-3.5">
        <button ref={closeRef} type="button" onClick={leave} aria-label="Leave cook mode" className="grid size-11 place-items-center rounded-[14px] bg-koi-bg/10">
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d={CLOSE} /></svg>
        </button>
        <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-bg/75">Step {i + 1} of {recipe.steps.length}</span>
        <span className="flex h-8 items-center gap-1.5 rounded-full bg-koi-bg/10 px-2.5 font-koi-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-koi-bg/75">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${awake ? "bg-koi-mint" : "bg-koi-bg/40"}`} />{awake ? "Screen on" : "Screen may sleep"}
        </span>
      </div>
      <div aria-hidden="true" className="mx-auto grid w-full max-w-[720px] gap-1 px-4" style={{ gridTemplateColumns: `repeat(${recipe.steps.length}, minmax(0, 1fr))` }}>
        {recipe.steps.map((s, k) => <span key={s.n} className={`h-1 rounded-full ${k <= i ? "bg-koi-lime" : "bg-koi-bg/20"}`} />)}
      </div>

      {others.length > 0 && (
        <ul aria-label="Timers on other steps" className="m-0 mx-auto flex w-full max-w-[720px] list-none flex-wrap gap-1.5 px-4 pt-3">
          {others.map((t) => (
            <li key={t.step} className={`flex items-center gap-1 rounded-full py-1 pl-3 pr-1 ${t.done ? "bg-koi-lime text-koi-forest" : "bg-koi-bg/10"}`}>
              <button type="button" onClick={() => setI(t.step)} aria-label={`Go to step ${t.step + 1}, ${t.title}`} className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
                <span className="max-w-[9rem] truncate">{t.title}</span>
                <span className="font-koi-num text-[15px]">{t.done ? "Time's up" : clock(t.left)}</span>
              </button>
              <button
                type="button"
                onClick={() => (t.done ? timers.clear(t.step) : t.running ? timers.pause(t.step) : timers.resume(t.step))}
                aria-label={t.done ? `Clear the ${t.title} timer` : t.running ? `Pause the ${t.title} timer` : `Resume the ${t.title} timer`}
                className={`grid size-9 place-items-center rounded-full ${t.done ? "bg-koi-forest/10" : "bg-koi-bg/10"}`}
              >
                <Icon d={t.done ? CLOSE : t.running ? PAUSE : PLAY} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="assertive">{timers.list.filter((t) => t.done).map((t) => `${t.title}: time's up.`).join(" ")}</p>

      <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col gap-4 overflow-y-auto px-5 pb-3 pt-6">
        <span data-step className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-lime">{recipe.name} · {plan.servings} {plan.mode === "batch" ? "boxes" : plan.servings === 1 ? "serving" : "servings"}</span>
        <h2 data-step className="koi-condensed m-0 font-koi-display text-[clamp(36px,6vw,56px)] font-extrabold leading-[0.95] tracking-[-0.03em]">{step.title}</h2>
        <p data-step className="m-0 text-[clamp(20px,2.6vw,26px)] leading-normal">{renderText(step.text, recipe, opts)}</p>
        {step.uses.length > 0 && (
          <div data-step className="flex flex-col gap-2">
            <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">For this step</span>
            <div className="flex flex-wrap gap-1.5">
              {step.uses.map((u) => {
                const t = lineText(recipe.lines[u], opts);
                return <span key={u} className="rounded-[10px] bg-koi-lime/15 px-2.5 py-1.5 text-[15px] font-semibold text-koi-lime">{t.amount}{t.name ? ` ${t.name}` : ""}</span>;
              })}
            </div>
          </div>
        )}
        <div data-step className="flex flex-col"><StepTimer key={`${recipe.key}-${i}`} step={step} index={i} timers={timers} /></div>
      </div>

      {leaving && set > 0 && (
        <div role="alertdialog" aria-label="Leave cook mode?" className="mx-auto flex w-full max-w-[720px] flex-wrap items-center justify-between gap-3 border-t border-koi-bg/10 px-4 pt-3">
          <p className="m-0 text-[15px] font-semibold">{set === 1 ? "A timer is" : `${set} timers are`} still set. {set === 1 ? "It stops" : "They stop"} if you leave.</p>
          <span className="flex gap-2">
            <button type="button" onClick={() => setLeaving(false)} className="h-11 rounded-2xl border border-koi-bg/30 px-4 text-[15px] font-semibold">Stay</button>
            <button type="button" onClick={onClose} className="h-11 rounded-2xl bg-koi-bg px-4 text-[15px] font-bold text-koi-forest">Leave</button>
          </span>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[720px] gap-2.5 border-t border-koi-bg/10 px-4 pb-6 pt-3">
        <button type="button" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="h-14 shrink-0 rounded-2xl border border-koi-bg/30 px-5 text-[15px] font-semibold disabled:opacity-40">Back</button>
        <button type="button" onClick={() => (last ? leave() : setI((x) => x + 1))} className="h-14 flex-1 rounded-2xl bg-koi-lime text-base font-bold text-koi-forest">
          {last ? (plan.mode === "batch" ? `Done: ${plan.servings} boxes ready` : "Done") : "Next step"}
        </button>
      </div>
    </div>
  );
}
