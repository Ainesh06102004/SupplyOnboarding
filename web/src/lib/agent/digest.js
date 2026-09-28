// ============================================================================
// Agent Mode: the state the model is shown each turn. Pure.
//
// Rebuilt from the database on every turn, never stored, and placed last in
// the model's input so everything before it caches. It says what KOI has —
// people by label, what is missing, whether a plan is on screen and what is in
// its basket, which page the shopper is on — and nothing about anyone: no age,
// no diet, no allergy, no target. The tools hold those; the model routes.
// ============================================================================

import { gapsFor, gapWords } from "./readiness";
import { upcomingFasts, dayLabel } from "@/lib/calendar/festivals";

/**
 * @param {{ saved: Array<{label}>, draft: object|null, planId: string|null, basket: string[], page: object, productName?: string|null, cartCount?: number }} state
 * @returns {string}
 */
export function digestFor({ saved = [], draft = null, planId = null, basket = [], page = {}, productName = null, cartCount = 0, today = new Date() }) {
  const gaps = gapsFor(draft, { savedCount: saved.length });
  const fasts = upcomingFasts(today);
  const lines = [
    "KOI's state now (for routing only):",
    `- Saved people: ${saved.map((p) => p.label).join(", ") || "none"}.`,
    `- Drafted, not saved: ${(draft?.members ?? []).map((m) => m.label).join(", ") || "none"}. Missing: ${gapWords(gaps)}.`,
    `- Plan on screen: ${planId ? `yes; basket: ${basket.slice(0, 30).join(", ") || "empty"}` : "none"}.`,
    `- Shopper is on: ${page.route ?? "other"}${page.step ? ` (${page.step} step)` : ""}${productName ? `, viewing "${productName}"` : ""}. Cart holds ${cartCount} lines.`,
    ...(fasts.length ? [`- Fasting festivals coming up: ${fasts.map((f) => `${f.name} ${dayLabel(f.start)}${f.days > 1 ? `–${dayLabel(f.end)} (${f.days} days)` : ""}`).join("; ")}. Only plan a fast if the shopper asks.`] : []),
  ];
  return lines.join("\n");
}
