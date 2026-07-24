// ============================================================================
// KRE — Personalised shelves
// Turns the ranked recommendation list into named, explainable shelves for the
// storefront. Pure & deterministic — each shelf is a filter+sort over the same
// scored list, so the same profile always yields the same shelves.
// ============================================================================

import { GOAL_PROFILES, THRESHOLDS as T, BUDGET_RANGES, MEAL_MATCH } from "./config";

/** Recommendation DTO — the only shape the frontend consumes. */
export const toDTO = (s) => ({
  id: s.id,
  product: s.facts.product,
  score: s.display,
  raw: s.raw,
  reasons: s.reasons,
  category: s.category,
});

function shelf(id, title, subtitle, items, { min = 3, limit = 8 } = {}) {
  const picked = items.slice(0, limit).map(toDTO);
  return picked.length >= min ? { id, title, subtitle, items: picked } : null;
}

const matchMeal = (s, mealKey) => {
  const m = MEAL_MATCH[mealKey];
  return m && (m.categories.includes(s.category) || m.keywords.some((kw) => s.facts.haystack.includes(kw)));
};

// Interleave categories so "try something different" feels varied.
function diverseSample(list) {
  const byCat = {};
  list.forEach((s) => (byCat[s.category] = byCat[s.category] || []).push(s));
  Object.values(byCat).forEach((a) => a.sort((x, y) => y.raw - x.raw));
  const out = [];
  for (let i = 0, added = true; added; i++) {
    added = false;
    for (const cat of Object.keys(byCat)) {
      if (byCat[cat][i]) { out.push(byCat[cat][i]); added = true; }
    }
  }
  return out;
}

export function buildShelves(ranked, included, profile = {}) {
  const goal = profile.goal || "maintenance";
  const goalLabel = ((GOAL_PROFILES[goal] || {}).label || "your goal").toLowerCase();
  const by = (fn) => [...included].sort(fn);

  const shelves = [
    shelf("picked", "Picked for you", `Because you're aiming for ${goalLabel}`, ranked),

    shelf("protein", "Today's protein picks", "High-protein products, ranked for you",
      by((a, b) => b.facts.macros.protein - a.facts.macros.protein || b.raw - a.raw)
        .filter((s) => s.facts.macros.protein >= T.proteinHigh)),

    shelf("breakfast", "Great breakfast choices", "Ways to start the day right",
      by((a, b) => b.raw - a.raw).filter((s) => matchMeal(s, "breakfast"))),

    shelf("snacks", "Smart snack swaps", "Better than the vending machine",
      by((a, b) => b.raw - a.raw).filter((s) => s.category === "Snacks")),

    (profile.budget && profile.budget !== "any")
      ? shelf("budget", "Under your budget", "Great value for your range",
          by((a, b) => a.facts.price - b.facts.price).filter((s) => {
            const [lo, hi] = BUDGET_RANGES[profile.budget] || BUDGET_RANGES.any;
            return s.facts.price >= lo && s.facts.price <= hi;
          }))
      : null,

    shelf("lowsugar", "Lower sugar alternatives", "Sweetness without the spike",
      by((a, b) => a.facts.macros.sugar - b.facts.macros.sugar || b.raw - a.raw)
        .filter((s) => s.facts.macros.sugar <= T.sugarLow)),

    shelf("complete", "Complete your daily protein",
      profile.targets?.protein ? `Toward your ${profile.targets.protein}g / day` : "Protein-forward picks",
      by((a, b) => b.facts.macros.protein - a.facts.macros.protein).filter((s) => s.facts.macros.protein >= T.proteinMin)),

    shelf("different", "Try something different", "A little outside your usual", diverseSample(included)),
  ];

  return shelves.filter(Boolean);
}
