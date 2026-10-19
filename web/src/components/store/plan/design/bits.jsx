"use client";

// Small pieces the design repeats: arrows, step headings, the Back / Continue
// footer, chips, the toast and the ring. Cinematic storefront (Oct 2026): drawn
// in the koi-* Tailwind tokens, moved by GSAP (no CSS keyframes), so every Plan
// step speaks the same language as the rest of the store.

import { useRef } from "react";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

export function Arrow({ color = "currentColor", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sparkle({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-koi-ember" aria-hidden="true">
      <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />
    </svg>
  );
}

/** A chapter's title: a mono eyebrow over the condensed display cut, rising in. */
export function StepHead({ title, sub, eyebrow = null, size = 30 }) {
  const ref = useRef(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(ref.current.querySelectorAll("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal });
    gsap.from(ref.current.querySelectorAll("[data-rise]"), { autoAlpha: 0, y: 12, duration: 0.7, stagger: 0.08, ease: E.reveal, delay: 0.1 });
  }, { scope: ref });
  const big = size >= 30;
  return (
    <div ref={ref} className="mb-6 flex flex-col gap-2">
      {eyebrow && <span data-rise className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">{eyebrow}</span>}
      <h2 className={`koi-condensed m-0 font-koi-display font-extrabold leading-[0.95] tracking-[-0.03em] text-koi-forest ${big ? "text-[clamp(36px,4.4vw,60px)]" : "text-[clamp(26px,3vw,36px)]"}`}>
        <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{title}</span></span>
      </h2>
      {sub && <p data-rise className="m-0 max-w-[720px] text-[15.5px] leading-relaxed text-koi-ink2">{sub}</p>}
    </div>
  );
}

export function MonoLabel({ children, color, size = 10, spacing = ".1em", style }) {
  return (
    <div className="font-koi-mono font-medium uppercase text-koi-muted" style={{ fontSize: size, letterSpacing: spacing, ...(color ? { color } : null), ...style }}>
      {children}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled = false, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className="flex h-14 items-center gap-2.5 rounded-2xl bg-koi-forest px-7 text-base font-bold text-koi-lime transition-transform hover:-translate-y-0.5 disabled:cursor-default disabled:bg-koi-forest/20 disabled:text-koi-forest/50 disabled:hover:translate-y-0"
    >
      {children}
    </button>
  );
}

export function Footer({ onBack, next }) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="h-14 rounded-2xl px-5 text-sm font-semibold text-koi-ink2 transition-colors hover:bg-white">← Back</button>
      ) : <span />}
      {next && (
        <PrimaryButton onClick={next.onClick} disabled={next.disabled}>
          {next.label} <Arrow />
        </PrimaryButton>
      )}
    </div>
  );
}

/** A pill that toggles. */
export function Chip({ on, children, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-lime" : "border-koi-forest/15 bg-white text-koi-ink2 hover:border-koi-forest/30 hover:text-koi-forest"}`}
    >
      {children}
    </button>
  );
}

/** A chip with a remove button; tone "green" (favourites) or "red" (avoids). */
export function RemovableChip({ label, onRemove, tone = "green" }) {
  const green = tone === "green";
  return (
    <span className={`flex h-9 items-center gap-1.5 rounded-full pl-3.5 pr-1.5 text-[13px] font-semibold ${green ? "bg-koi-forest text-koi-lime" : "border border-koi-red/20 bg-koi-red-bg text-koi-red"}`}>
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className={`grid size-6 place-items-center rounded-full ${green ? "text-koi-lime/80 hover:bg-koi-lime/15 hover:text-koi-lime" : "text-koi-red/70 hover:bg-white"}`}>
        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
      </button>
    </span>
  );
}

export function Toast({ toast }) {
  const ref = useRef(null);
  useGSAP(() => {
    if (!toast || !ref.current || prefersReducedMotion()) return;
    setupMotion().fromTo(ref.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: E.reveal });
  }, { dependencies: [toast?.text ?? null] });
  if (!toast) return null;
  const tone = toast.tone === "warn"
    ? "border border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink"
    : toast.tone === "error"
      ? "border border-koi-red/20 bg-koi-red-bg text-koi-red"
      : "bg-koi-forest text-koi-lime";
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 z-[120] w-max max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-2xl px-[18px] py-3 text-center font-koi-sans text-[13px] font-semibold shadow-[0_12px_32px_rgba(0,0,0,.22)] ${tone}`}
      style={{ bottom: "calc(var(--koi-bottom-chrome, 0px) + 150px)" }}
    >
      {toast.text}
    </div>
  );
}

/** The design's 62 px ring, filled to a real share (0–100), drawn by GSAP. */
export function Ring({ percent }) {
  const ref = useRef(null);
  const share = Math.max(0, Math.min(100, Number(percent) || 0));
  useGSAP(() => {
    const arc = ref.current.querySelector("[data-arc]");
    const gsap = setupMotion();
    if (prefersReducedMotion()) { gsap.set(arc, { drawSVG: `0% ${share}%` }); return; }
    gsap.fromTo(arc, { drawSVG: "0% 0%" }, { drawSVG: `0% ${share}%`, duration: 1.1, ease: E.reveal, delay: 0.35 });
  }, { scope: ref, dependencies: [share] });
  return (
    <div ref={ref} className="relative size-[62px] shrink-0">
      <svg width="62" height="62" viewBox="0 0 62 62" className="-rotate-90" aria-hidden="true">
        <circle cx="31" cy="31" r="26" fill="none" stroke="#ebe8df" strokeWidth="7" />
        <circle data-arc cx="31" cy="31" r="26" fill="none" stroke="#16a06e" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(share / 100) * 163.4} 163.4`} />
      </svg>
    </div>
  );
}

/** "Not verified for peanuts" — the allergen caution, the same words as the product page. */
export function Unverified({ allergens }) {
  if (!allergens?.length) return null;
  return <span className="rounded-full border border-koi-amber-border bg-koi-amber-bg px-2 py-0.5 font-koi-mono text-[10px] font-semibold text-koi-amber-ink">Not verified for {allergens.join(", ")}</span>;
}
