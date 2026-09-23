// The founder's Nutrition Planner design, as values. Every colour, family and
// radius here is the design's own (KOI - Nutrition Planner.html).

export const F = Object.freeze({
  sans: "var(--koi-sans), 'Plus Jakarta Sans', system-ui, sans-serif",
  num: "var(--koi-num), 'Space Grotesk', sans-serif",
  mono: "var(--koi-mono), 'IBM Plex Mono', ui-monospace, monospace",
});

/** The CSS `font` shorthand: font(600, 13) → "600 13px Plus Jakarta Sans". */
export const font = (weight, size, family = "sans", lineHeight = null) =>
  `${weight} ${size}px${lineHeight ? `/${lineHeight}` : ""} ${F[family]}`;

export const C = Object.freeze({
  bg: "#f6f5f1",
  surface: "#fff",
  surface2: "#faf9f6",
  quiet: "#f4f3ee",
  panel: "#f0f4f0",
  note: "#f4f2eb",
  today: "#f0f7f2",
  ink: "#1c1e17",
  ink2: "#6b6f63",
  muted: "#8c8c84",
  faint: "#a7a89c",
  fainter: "#b0b3a8",
  stepOff: "#9a9a8e",
  disabled: "#c0bdb4",
  primary: "#1f5c3a",
  accent: "#2f8050",
  deep: "#0f3d2e",
  mint: "#9fe7c4",
  mintMuted: "#7fc3a3",
  mintChip: "#dff0e6",
  tint: "#e8f1ea",
  tint2: "#eef3ee",
  tintBorder: "#cfe3d6",
  tintGreen: "#e9f5ef",
  icon: "#5a6e5e",
  warm: "#c2683a",
  warmBg: "#faece2",
  logoDot: "#e8743b",
  red: "#c0392b",
  redText: "#b84535",
  redBg: "#fdf0ee",
  redBorder: "#f3cec9",
  warnText: "#856404",
  warnBg: "#fff3cd",
  warnBorder: "#ffc107",
  blue: "#1a5276",
  blueBg: "#e8f0fb",
  blueBorder: "#b6c9e8",
  line: "rgba(20,22,15,.07)",
  line2: "rgba(20,22,15,.08)",
  dashed: "rgba(20,22,15,.18)",
  divider: "#f0eee7",
  track: "#eceae3",
  inputBorder: "#d9d7cd",
  inputBorder2: "#e2e0d8",
});

/** Member avatars: the design's first two, then its cycle for added members. */
export const MEMBER_COLORS = Object.freeze(["#1f5c3a", "#c2683a", "#3a6ea5", "#9a5ba6", "#b07d2b", "#2f8050"]);

export const cardStyle = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 22, padding: 22 };
export const tileStyle = { background: C.surface2, border: "1px solid rgba(20,22,15,.05)", borderRadius: 14, padding: 14 };

/** "Me" → "ME", "Priya Shah" → "PS". */
export function initialsOf(label) {
  const words = String(label ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const inr = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString("en-IN") : "—");
