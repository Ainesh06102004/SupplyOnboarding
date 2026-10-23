// ============================================================================
// KOI — the cart as a list to take shopping (Cart · "Export ingredient list")
//
// Plain text, so it pastes anywhere: a WhatsApp chat, a note, a printout for
// the sabziwala. The shelf products come in two groups, the way the cart shows
// them (from this week's plan, and what the shopper added); then the week's
// fresh food and kitchen basics, by name only, because their amounts depend on
// the recipe (store/cartStore.js keeps them with the plan). Pure.
// ============================================================================

import { packs } from "./lines";

const day = (now) => new Date(now).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** One shelf line: "Rolled Oats, 1 kg (True Elements) × 2". */
export function shelfLine(line, quantity = packs(line.quantity)) {
  const weight = line.weight && line.weight !== "N/A" ? `, ${line.weight}` : "";
  const brand = line.brand && line.brand !== "Unknown" ? ` (${line.brand})` : "";
  return `${line.name}${weight}${brand} × ${quantity}`;
}

/**
 * @param {{ planLines: Array<object>, ownLines: Array<object>, plan: object|null }} groups the cart's groups (CartView useCartGroups)
 * @param {{ shelf?: boolean, fresh?: boolean, now?: number }} [opts]
 * @returns {{ text: string, sections: Array<{ title: string, items: string[], inline?: boolean }>, count: number }}
 */
export function exportList(groups, { shelf = true, fresh = true, now = Date.now() } = {}) {
  const sections = [];
  if (shelf) {
    // A planned line the shopper topped up lists the plan's packs here and theirs below.
    const own = [...groups.ownLines];
    const planned = groups.planLines.map((l) => {
      const extra = packs(l.quantity) - packs(l.fromPlan);
      if (extra > 0) own.push({ ...l, quantity: extra });
      return shelfLine(l, packs(l.fromPlan));
    });
    if (planned.length) sections.push({ title: "From this week's plan", items: planned });
    if (own.length) sections.push({ title: groups.plan ? "You added" : "In your cart", items: own.map((l) => shelfLine(l)) });
  }
  if (fresh && groups.plan) {
    if (groups.plan.fresh?.length) sections.push({ title: "Fresh, for the week", items: [...groups.plan.fresh] });
    if (groups.plan.kitchen?.length) sections.push({ title: "Check your kitchen for", items: [...groups.plan.kitchen], inline: true });
  }
  const body = sections.map((s) => `${s.title.toUpperCase()}\n${s.inline ? s.items.join(" · ") : s.items.map((i) => `☐ ${i}`).join("\n")}`).join("\n\n");
  return {
    text: `KOI · Shopping list · ${day(now)}\n\n${body}\n`,
    sections,
    count: sections.filter((s) => !s.inline).reduce((n, s) => n + s.items.length, 0),
  };
}
