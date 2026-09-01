"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Reusable primitives
// GPU-accelerated (transform/opacity only), reduced-motion aware, a11y-first.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { C, HEADING, scoreColor } from "./tokens";

// Respect the user's reduced-motion preference.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

// ── Reveal ──────────────────────────────────────────────────────────────────
// Fades + lifts content into view once. No layout shift (transform/opacity).
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  y = 24,
  className = "",
  once = true,
  style,
  ...rest
}) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.unobserve(e.target);
          } else if (!once) {
            setShown(false);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, once]);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        transitionProperty: "transform, opacity",
        transitionDuration: "900ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: `${delay}ms`,
        transform: shown ? "translate3d(0,0,0)" : `translate3d(0,${y}px,0)`,
        opacity: shown ? 1 : 0,
        willChange: "transform, opacity",
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// ── Marquee ───────────────────────────────────────────────────────────────
// Seamless infinite scroller. Pauses on hover and for reduced motion.
export function Marquee({ children, speed = 34, reverse = false, className = "", pauseOnHover = true }) {
  const reduced = usePrefersReducedMotion();
  const items = <div className="flex shrink-0 items-center">{children}</div>;
  return (
    <div className={`group/marquee flex overflow-hidden ${className}`} aria-hidden="true">
      <div
        className="flex shrink-0"
        style={{
          animation: reduced ? "none" : `koi-marquee ${speed}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
          animationPlayState: "running",
          willChange: "transform",
        }}
        data-pause={pauseOnHover ? "1" : "0"}
      >
        {items}
        {items}
      </div>
    </div>
  );
}

// ── ScoreRing ─────────────────────────────────────────────────────────────
// The KOI Score, rendered as an animated stroke ring.
//
// `score` used to default to 90. A default parameter is a fine way to fill in a
// size or a colour; it is not a fine way to fill in a verification verdict. Any
// product whose screening report had no final_score - which is every product
// KOI has listed but not yet scored - rendered a confident 90 ring.
//
// An unscored product now renders NOTHING here. The caller decides what to show
// in the gap, which is the only party that knows whether a dash, an "unscored"
// chip or plain absence reads correctly in that layout.
export function ScoreRing({ score, size = 56, stroke = 3, label = "KOI", track = "#00000018" }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(false);
  const value = Number(score);
  const scored = Number.isFinite(value);
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const color = scored ? scoreColor(value) : "transparent";

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => setOn(true), 0);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setTimeout(() => setOn(true), 0);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  // After the hooks, never before them.
  if (!scored) return null;

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={on ? circ - (value / 100) * circ : circ}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="flex flex-col items-center leading-none">
        <span className="font-bold" style={{ ...HEADING, color, fontSize: size * 0.3 }}>
          {value}
        </span>
        {label && (
          <span
            className="uppercase tracking-[0.15em] font-semibold"
            style={{ color, fontSize: size * 0.12, opacity: 0.7 }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Meter ─────────────────────────────────────────────────────────────────
// Horizontal nutrition bar that fills when scrolled into view.
//
// A null value used to arrive here and render as an empty bar, which reads as
// "0 g" - a macro claim manufactured out of a missing column. An absent value
// renders nothing at all, so a product with no declared protein simply has no
// protein meter rather than a meter reading zero.
export function Meter({ label, value, max = 100, suffix = "", color = C.emerald, track = "#0000000f" }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(false);
  const n = Number(value);
  const known = Number.isFinite(n);
  const pct = known ? Math.max(0, Math.min(100, (n / max) * 100)) : 0;

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => setOn(true), 0);
      return () => clearTimeout(t);
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setTimeout(() => setOn(true), 0);
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  // After the hooks, never before them.
  if (!known) return null;

  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-[0.14em] font-bold opacity-60">{label}</span>
        <span className="text-[13px] font-bold" style={{ ...HEADING, color }}>
          {n}
          {suffix}
        </span>
      </div>
      <div className="h-[6px] w-full rounded-full overflow-hidden" style={{ background: track }}>
        <div
          className="h-full rounded-full"
          style={{
            width: on ? `${pct}%` : "0%",
            background: color,
            transition: "width 1.1s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>
    </div>
  );
}

// ── Eyebrow ───────────────────────────────────────────────────────────────
// Small indexed section label, e.g. "( 02 ) Why KOI exists".
export function Eyebrow({ index, children, color = C.emerald, className = "" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {index != null && (
        <span
          className="text-[11px] font-bold tabular-nums tracking-[0.1em]"
          style={{ color }}
        >
          ({index})
        </span>
      )}
      <span className="text-[11px] uppercase tracking-[0.24em] font-bold opacity-70">
        {children}
      </span>
    </div>
  );
}

// ── ArrowButton ─────────────────────────────────────────────────────────────
// Expressive editorial CTA. Renders <Link> when href given, else <button>.
const BTN_VARIANTS = {
  forest: { bg: C.forest, fg: "#FFFFFF", border: "transparent" },
  lime: { bg: C.lime, fg: C.forest, border: "transparent" },
  orange: { bg: C.orange, fg: "#FFFFFF", border: "transparent" },
  outline: { bg: "transparent", fg: C.forest, border: C.forest },
  outlineLight: { bg: "transparent", fg: "#FFFFFF", border: "#ffffff55" },
};

export function ArrowButton({
  href,
  onClick,
  children,
  variant = "forest",
  size = "md",
  className = "",
  type = "button",
  ...rest
}) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.forest;
  const pad = size === "lg" ? "h-14 pl-7 pr-6 text-[15px]" : size === "sm" ? "h-10 pl-4 pr-3 text-[13px]" : "h-12 pl-6 pr-5 text-[14px]";
  const inner = (
    <span
      className={`group/btn relative inline-flex items-center gap-3 rounded-full font-semibold transition-all duration-300 hover:-translate-y-0.5 ${pad} ${className}`}
      style={{ background: v.bg, color: v.fg, border: `1.5px solid ${v.border}` }}
    >
      <span className="whitespace-nowrap">{children}</span>
      <span
        className="grid place-items-center h-7 w-7 rounded-full transition-transform duration-300 group-hover/btn:rotate-45"
        style={{ background: variant === "outline" || variant === "outlineLight" ? "transparent" : "#ffffff26" }}
      >
        <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-[1px]" strokeWidth={2.4} />
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-full" {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-full" {...rest}>
      {inner}
    </button>
  );
}

// ── Grain ─────────────────────────────────────────────────────────────────
// Subtle film-grain texture overlay for premium depth.
export function Grain({ opacity = 0.05, blend = "overlay" }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        opacity,
        mixBlendMode: blend,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

// ── ProductImage ─────────────────────────────────────────────────────────────
// White-bg product render composited onto a colour panel via multiply blend.
//
// `preload`, not `priority`: next/image deprecated `priority` in v16 in favour
// of a name that says what it does — inserting a <link rel=preload> in <head>.
// Reserve it for an actual LCP element; see the image docs bundled in
// node_modules/next/dist/docs.
export function ProductImage({ src, alt, blend = true, className = "", style, preload = false }) {
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={alt}
      preload={preload}
      fill
      draggable="false"
      className={`select-none ${className}`}
      style={{ mixBlendMode: blend ? "multiply" : "normal", ...style }}
    />
  );
}
