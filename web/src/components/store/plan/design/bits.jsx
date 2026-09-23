"use client";

// Small pieces the design repeats: arrows, step headings, the Back / Continue
// footer, chips, the toast and the ring.

import { C, font } from "./tokens";

export function Arrow({ color = "#fff", size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sparkle({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" fill={C.accent} />
      <path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7L19 14Z" fill="#9fc7ae" />
    </svg>
  );
}

export function StepHead({ title, sub, size = 30 }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ font: font(700, size), letterSpacing: "-.02em", margin: "0 0 5px" }}>{title}</h2>
      {sub && <p style={{ font: font(400, 15), color: C.ink2, margin: 0 }}>{sub}</p>}
    </div>
  );
}

export function MonoLabel({ children, color = C.faint, size = 10, spacing = ".1em", style }) {
  return <div style={{ font: font(500, size, "mono"), letterSpacing: spacing, textTransform: "uppercase", color, ...style }}>{children}</div>;
}

export function PrimaryButton({ children, onClick, disabled = false, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? "default" : "pointer", background: disabled ? C.disabled : C.primary, border: "none", borderRadius: 13,
        padding: "14px 28px", font: font(600, 15), color: "#fff", display: "flex", alignItems: "center", gap: 10, ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Footer({ onBack, next }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, gap: 12 }}>
      {onBack ? (
        <button type="button" onClick={onBack} style={{ cursor: "pointer", background: "none", border: "none", font: font(600, 14), color: C.muted, padding: "13px 22px" }}>← Back</button>
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
      style={{
        cursor: "pointer", font: font(600, 12), padding: "6px 11px", borderRadius: 999,
        border: `1px solid ${on ? C.accent : "rgba(20,22,15,.12)"}`, background: on ? C.tint2 : "#fff", color: on ? C.primary : C.muted,
      }}
    >
      {children}
    </button>
  );
}

/** A chip with a remove button; tone "green" (favourites) or "red" (avoids). */
export function RemovableChip({ label, onRemove, tone = "green", size = 13 }) {
  const green = tone === "green";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: green ? C.tint2 : C.redBg, border: `1px solid ${green ? C.tintBorder : C.redBorder}`, borderRadius: 999, padding: "6px 9px 6px 13px" }}>
      <span style={{ font: font(600, size), color: green ? C.primary : C.redText }}>{label}</span>
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} style={{ cursor: "pointer", width: 18, height: 18, borderRadius: "50%", background: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", font: font(600, 12), color: C.muted, padding: 0 }}>×</button>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const tone = toast.tone === "warn"
    ? { background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBorder}` }
    : toast.tone === "error"
      ? { background: C.redBg, color: C.redText, border: `1px solid ${C.redBorder}` }
      : { background: C.primary, color: "#fff", border: "none" };
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)", zIndex: 120, maxWidth: "calc(100vw - 32px)", width: "max-content", borderRadius: 14, padding: "12px 18px", font: font(600, 13), boxShadow: "0 12px 32px rgba(0,0,0,.22)", animation: "koiUp .3s ease both", textAlign: "center", ...tone }}>
      {toast.text}
    </div>
  );
}

/** The design's 62 px ring, filled to a real share (0–100). */
export function Ring({ percent }) {
  const share = Math.max(0, Math.min(100, Number(percent) || 0));
  const to = 163.4 * (1 - share / 100);
  return (
    <div style={{ position: "relative", width: 62, height: 62, flex: "none" }}>
      <svg width="62" height="62" viewBox="0 0 62 62" aria-hidden="true">
        <circle cx="31" cy="31" r="26" fill="none" stroke={C.track} strokeWidth="7" />
        <circle
          cx="31" cy="31" r="26" fill="none" stroke={C.accent} strokeWidth="7" strokeLinecap="round"
          strokeDasharray="163.4" strokeDashoffset={to} transform="rotate(-90 31 31)"
          style={{ "--koi-ring-to": to, animation: "koiRingTo 1.1s ease .35s both" }}
        />
      </svg>
    </div>
  );
}

/** "Not verified for peanuts" — the allergen caution, the same words as the product page. */
export function Unverified({ allergens }) {
  if (!allergens?.length) return null;
  return <span style={{ font: font(600, 10, "mono"), color: C.warnText, background: C.warnBg, borderRadius: 999, padding: "2px 7px" }}>Not verified for {allergens.join(", ")}</span>;
}
