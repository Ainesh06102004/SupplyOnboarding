// ============================================================================
// KOI — store primitives
//
// The handful of pieces every in-app surface is built from, so the cart, the
// checkout, the Plan and the shop grid cannot each invent their own button.
// Styling is in app/store/koi.css under `ks-` classes (hover and breakpoints
// need real CSS); these components only choose the class and the semantics.
//
// Money is the one with a rule in it: a missing price renders NOTHING. It
// never renders ₹0, because ₹0 is a claim about the product.
// ============================================================================

import Link from "next/link";
import Image from "next/image";

/**
 * The KOI mark: the store's heavy "KOI" with the founder design's orange dot.
 * @param {{ ink?: "dark"|"light", href?: string|null }} props
 */
export function Wordmark({ ink = "dark", href = "/store" }) {
  const inner = (
    <>
      <span className="ks-wordmark-text">KOI</span>
      <span className="ks-wordmark-dot" aria-hidden="true" />
    </>
  );
  if (!href) return <span className="ks-wordmark" data-ink={ink}>{inner}</span>;
  return <Link href={href} className="ks-wordmark" data-ink={ink} aria-label="KOI home">{inner}</Link>;
}

/**
 * A button, or a link dressed as one when `href` is given.
 * @param {object} props
 * @param {"primary"|"secondary"|"ghost"|"mint"|"warm"|"warm-outline"} [props.variant]
 * @param {"sm"|"md"|"lg"} [props.size]
 * @param {boolean} [props.block] full width
 * @param {boolean} [props.busy] shows a spinner and disables
 * @param {string} [props.href]
 */
export function Button({ variant = "primary", size = "md", block = false, busy = false, href, children, className = "", disabled, ...rest }) {
  const shared = { className: `ks-btn ${className}`, "data-variant": variant, "data-size": size === "md" ? undefined : size, "data-block": block ? "true" : undefined };
  if (href) {
    return (
      <Link href={href} {...shared} aria-disabled={disabled ? "true" : undefined} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...shared} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <span className="ks-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * ₹ in Space Grotesk. `value` null or not a number renders nothing at all.
 * @param {{ value: number|null|undefined, mrp?: boolean, size?: number, className?: string, style?: object }} props
 */
export function Money({ value, mrp = false, size, className = "", style }) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  return (
    <span className={`ks-num ${className}`} style={{ fontSize: size, ...style }}>
      ₹{Math.round(n).toLocaleString("en-IN")}
      {mrp && <span className="ks-mono" style={{ marginLeft: 6 }}>MRP</span>}
    </span>
  );
}

/** An uppercase Plex Mono eyebrow. */
export function MonoLabel({ children, tone, className = "", style, as: Tag = "span" }) {
  const color = tone === "green" ? "var(--koi-primary)" : tone === "mint" ? "var(--koi-mint)" : tone === "warm" ? "var(--koi-warm)" : undefined;
  return <Tag className={`ks-mono ${className}`} style={{ color, ...style }}>{children}</Tag>;
}

/**
 * − n +. At `min` the minus becomes a remove (a bin) when `removable`.
 * @param {object} props
 * @param {number} props.value
 * @param {(n: number) => void} props.onChange
 * @param {string} props.label what is being counted, for screen readers
 * @param {number} [props.min]
 * @param {number} [props.max]
 * @param {boolean} [props.removable] at 1, the minus removes
 * @param {"plain"|"solid"} [props.tone]
 * @param {"md"|"lg"} [props.size]
 */
export function QtyStepper({ value, onChange, label, min = 0, max = 20, removable = true, tone = "plain", size = "md", disabled = false }) {
  const atFloor = value <= Math.max(min, 1);
  const showBin = removable && atFloor && min === 0;
  return (
    <span className="ks-stepper" data-tone={tone === "solid" ? "solid" : undefined} data-size={size === "lg" ? "lg" : undefined} role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(Math.max(min, value - 1)); }}
        disabled={disabled || (!showBin && value <= min)}
        aria-label={showBin ? `Remove ${label}` : `One fewer ${label}`}
      >
        {showBin ? <BinIcon /> : "−"}
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(Math.min(max, value + 1)); }}
        disabled={disabled || value >= max}
        aria-label={`One more ${label}`}
      >
        +
      </button>
    </span>
  );
}

function BinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--koi-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

/** The leaf a product without a photo shows. Never a stock photo. */
export function LeafIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8fae98" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19c8 0 14-6 14-14C11 5 5 11 5 19zM5 19l7-7" />
    </svg>
  );
}

/**
 * A pack shot on a cream plate, or a leaf when KOI has no photo.
 * @param {{ src?: string|null, alt?: string, size?: number, radius?: number }} props
 */
export function ProductThumb({ src, alt = "", size = 52, radius = 13 }) {
  const box = { width: size, height: size, borderRadius: radius };
  if (!src) {
    return <span className="ks-thumb" data-empty="true" style={box}><LeafIcon size={Math.round(size * 0.4)} /></span>;
  }
  return (
    <span className="ks-thumb" style={box}>
      <Image src={src} alt={alt} fill sizes={`${size}px`} style={{ padding: Math.round(size * 0.06) }} />
    </span>
  );
}

/** The KOI score as a small ring. A product without a score shows no ring. */
export function ScoreBadge({ score, size = 40 }) {
  const n = Number(score);
  if (score === null || score === undefined || !Number.isFinite(n)) return null;
  const tone = n >= 80 ? "#1f5c3a" : n >= 50 ? "#b07d2b" : "#c2683a";
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span style={{ position: "relative", width: size, height: size, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }} title={`KOI score ${Math.round(n)} out of 100`}>
      <svg width={size - 4} height={size - 4} viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#eceae3" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, n)) / 100) * c} ${c}`} transform="rotate(-90 18 18)" />
      </svg>
      <span className="ks-num" style={{ position: "absolute", fontSize: Math.round(size * 0.3), color: tone }}>{Math.round(n)}</span>
      <span className="ks-sr">KOI score {Math.round(n)} out of 100</span>
    </span>
  );
}

/** Small inline icons the shell uses. Stroke-only, decorative. */
export const Icon = {
  Search: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  Pin: (p) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}><path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  Bag: (p) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M5 7h14l-1.5 11h-11z" /><path d="M9 7a3 3 0 016 0" /></svg>,
  Check: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M5 12l5 5 9-10" /></svg>,
  Close: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  Calendar: (p) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}><path d="M5 5h14v15H5zM5 10h14M9 3v4M15 3v4" /></svg>,
  Chevron: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" {...p}><path d="M6 9l6 6 6-6" /></svg>,
  Refresh: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" {...p}><path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M18 4v5h-5M6 20v-5h5" /></svg>,
  Alert: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>,
  Home: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M4 11l8-7 8 7v9H4z" /></svg>,
  Shop: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 018 0v2" /></svg>,
  You: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4-6 8-6s7 2 8 6" /></svg>,
};
