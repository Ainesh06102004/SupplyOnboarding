"use client";
// ============================================================================
// KOI — asking in the KOI bar
//
//   <KoiAsk id="lunch" label="KOI is asking · Lunch" onCancel={close}>…</KoiAsk>
//
// While mounted, the bar turns into the question (store/koiBarStore.js) and the
// children render inside it, through a portal into the bar's slot: no sheet,
// no second window. The ember beats in the bar until the ask closes. <AskSlot>
// is the bar's side: the frame, KOI's label, Cancel and the slot itself.
// ============================================================================

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useKoiBar } from "@/store/koiBarStore";
import { EmberSlot, useEmber } from "@/components/store/ember/Ember";

export default function KoiAsk({ id, label, onCancel, children }) {
  const open = useKoiBar((b) => b.open);
  const close = useKoiBar((b) => b.close);
  const slot = useKoiBar((b) => b.slot);
  const mine = useKoiBar((b) => b.ask?.id === id);
  const ember = useEmber();
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    open({ id, label, onCancel: () => cancelRef.current?.() });
    return () => close(id);
  }, [id, label, open, close]);

  // The dot beats while KOI waits on the answer; it stops when the ask goes.
  useEffect(() => {
    if (!mine) return undefined;
    // Whatever the dot was pointing at, it comes home to the question first.
    const t = setTimeout(() => { ember.rest(); ember.heartbeat(true); }, 120);
    return () => { clearTimeout(t); ember.heartbeat(false); };
  }, [mine, ember]);

  // Esc cancels, as it would close a sheet.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") cancelRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!mine || !slot) return null;
  return createPortal(children, slot);
}

/**
 * The bar while a page is asking: KOI's label with the ember, Cancel, and the
 * slot the page's content renders into. Scrolls inside itself, never past the
 * top of the screen.
 */
export function AskSlot({ ask, className = "" }) {
  const setSlot = useKoiBar((b) => b.setSlot);
  const ember = useEmber();
  const ref = useRef(null);
  // The bar grows upward as the answer comes in, carrying the dot's home with it: re-pin the dot.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => ember.pin());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ember]);
  return (
    <section
      ref={ref}
      aria-label={ask.label}
      className={`pointer-events-auto flex max-h-[min(72dvh,640px)] w-full max-w-[680px] flex-col rounded-[26px] border-2 border-koi-ember bg-white shadow-[0_24px_44px_-26px_rgba(122,61,28,.5)] ${className}`}
    >
      <div className="flex items-center gap-2 px-5 pt-3.5">
        <EmberSlot />
        <span className="flex-1 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-warm-ink">{ask.label}</span>
        {ask.onCancel && (
          <button type="button" onClick={ask.onCancel} className="h-9 rounded-full px-3 text-[13px] font-semibold text-koi-ink2 hover:bg-koi-paper">Cancel</button>
        )}
      </div>
      <div ref={setSlot} className="flex min-h-0 flex-col overflow-y-auto px-5 pb-4 pt-1.5" />
    </section>
  );
}
