"use client";
// ============================================================================
// KOI — mounting the ember (EmberEngine.js) in React
//
//   <EmberProvider>   wraps the store, inside .koi-store; renders the layer.
//   useEmber()        what pages call: ember.go(el, ember.perch(el), () => ember.done())
//   <EmberSlot />     the dot's home (the KOI bar); it rests there between acts.
//
// Every method is safe before the engine exists (server render, first paint):
// calls are dropped, except done(after), which still runs `after` so a flow
// that waits on the check never stalls.
// ============================================================================

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { setupMotion, prefersReducedMotion, E } from "@/lib/motion/koiMotion";
import { EmberEngine } from "./EmberEngine";

const EmberContext = createContext(null);

const METHODS = ["at", "go", "status", "mark", "heartbeat", "bump", "home", "letGo", "setHome", "clearHome", "ripple", "pin"];

// The engine lives in a closure: created once per provider, attached by the
// layer's effect, read only when a page calls a method (never during render).
function createEmber() {
  let engine = null;
  const api = {};
  for (const m of METHODS) api[m] = (...args) => engine?.[m](...args);
  api.done = (after) => (engine ? engine.done(after) : after?.());
  api.perch = (el, pad) => (engine && el ? engine.perch(el, pad) : {});
  return { api, attach: (e) => { engine = e; } };
}

export function EmberProvider({ children }) {
  const [ember] = useState(createEmber);
  return (
    <EmberContext.Provider value={ember.api}>
      {children}
      <EmberLayer attach={ember.attach} />
    </EmberContext.Provider>
  );
}

/** The ember's controls. Outside a provider every call is a no-op. */
export function useEmber() {
  return useContext(EmberContext) ?? FALLBACK;
}
const FALLBACK = createEmber().api;

/** The ember's home. Render one, inside the KOI bar. */
export function EmberSlot({ className = "" }) {
  const ember = useEmber();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    ember.setHome(el);
    return () => ember.clearHome(el);
  }, [ember]);
  return <span ref={ref} data-ember-slot aria-hidden="true" className={`inline-block size-[10px] shrink-0 rounded-full ${className}`} />;
}

function EmberLayer({ attach }) {
  const inkRef = useRef(null);
  const emberRef = useRef(null);

  useEffect(() => {
    const gsap = setupMotion();
    const ember = emberRef.current, ink = inkRef.current;
    const root = ember?.closest(".koi-store") ?? ember?.parentElement;
    if (!root || !ink) return undefined;
    const q = (s, el = ember) => el.querySelector(s);
    const engine = new EmberEngine({
      root,
      gsap,
      E,
      reduce: prefersReducedMotion(),
      nodes: {
        ember,
        body: q("[data-ember-body]"),
        pip: q("[data-ember-pip]"),
        label: q("[data-ember-label]"),
        check: q("[data-ember-check]"),
        tick: q("[data-ember-check] path"),
        ripple: q("[data-ember-ripple]"),
        trails: [...ink.querySelectorAll("[data-ember-trail]")],
        mark: q("[data-ember-mark]", ink),
      },
    });
    attach(engine);
    // A slot that mounted before the engine (children's effects run first) is adopted here.
    const slot = root.querySelector("[data-ember-slot]");
    if (slot) engine.setHome(slot);

    // Anchors move: the page scrolls, the window resizes, the KOI bar is sticky.
    const pin = () => engine.pin();
    const ro = new ResizeObserver(pin);
    ro.observe(root);
    window.addEventListener("scroll", pin, { passive: true });
    window.addEventListener("resize", pin);
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onMotion = () => { engine.reduce = prefersReducedMotion(); engine.heartbeat(false); };
    mq?.addEventListener?.("change", onMotion);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", pin);
      window.removeEventListener("resize", pin);
      mq?.removeEventListener?.("change", onMotion);
      engine.destroy();
      attach(null);
    };
  }, [attach]);

  return (
    <>
      <svg ref={inkRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[119] h-full w-full overflow-visible">
        <path data-ember-trail data-n="16" fill="none" stroke="#e8743b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
        <path data-ember-trail data-n="10" fill="none" stroke="#e8743b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
        <path data-ember-trail data-n="5" fill="none" stroke="#e8743b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        <path data-ember-mark fill="none" stroke="#e8743b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
      </svg>
      <div ref={emberRef} data-ember aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 z-[120]">
        <span data-ember-ripple className="absolute -left-[9px] -top-[9px] size-[18px] rounded-full border border-koi-ember opacity-0" />
        <div data-ember-body className="absolute left-[-5px] top-[-5px] flex h-[10px] w-[10px] items-center overflow-hidden rounded-full bg-koi-ember shadow-[0_0_0_4px_rgba(232,116,59,.16)]">
          <span data-ember-pip className="absolute left-[9px] top-1/2 size-[8px] -translate-y-1/2 rounded-full bg-koi-ink opacity-0" />
          <span data-ember-label className="shrink-0 whitespace-nowrap pl-[24px] pr-[12px] font-koi-mono text-[10.5px] font-semibold uppercase leading-none tracking-[0.14em] text-koi-ink opacity-0" />
          <svg data-ember-check viewBox="0 0 24 24" className="absolute left-0 top-0 size-[24px] opacity-0">
            <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </>
  );
}
