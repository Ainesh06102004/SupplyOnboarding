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
  cautions: s.cautions || [],
  category: s.category,
});

function shelf(id, title, subtitle, items, { min = 3, limit = 8 } = {}) {
  const picked = items.slice(0, limit).map(toDTO);
  return picked.length >= min ? { id, title, subtitle, items: picked } : null;
}

// A shelf title is a claim about every product on it. "Lower sugar
// alternatives" says these products are lower in sugar, so a product whose
// sugar KOI has never been told does not belong there — and `null <= T.sugarLow`
// is TRUE, which is exactly how it used to get on. Membership needs a declared
// figure, not merely one that fails to exceed the threshold.
const macro = (s, key) => {
  const v = s?.facts?.macros?.[key];
  return v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null;
};

/** Sort by a macro, with undeclared values last in either direction. */
const byMacro = (key, dir) => (a, b) => {
  const x = macro(a, key);
  const y = macro(b, key);
  if (x === null && y === null) return b.raw - a.raw;
  if (x === null) return 1;
  if (y === null) return -1;
  return (dir === "desc" ? y - x : x - y) || b.raw - a.raw;
};

/**
 * Does a product's category or label text belong to a meal occasion?
 *
 * Exported because search narrows by meal as well as shelves do (see
 * `lib/ai/intent/resolveIntent.js`), and both callers must agree on what
 * "breakfast" means. A second definition of that would drift.
 *
 * @param {string} category product category
 * @param {string} haystack lowercased name + brand + tags + ingredients
 * @param {string} mealKey a MEALS key
 * @returns {boolean}
 */
export const mealMatches = (category, haystack, mealKey) => {
  const m = MEAL_MATCH[mealKey];
  return Boolean(m && (
    m.categories.includes(category) ||
    m.keywords.some((kw) => String(haystack || "").includes(kw))
  ));
};

const matchMeal = (s, mealKey) => mealMatches(s.category, s.facts.haystack, mealKey);

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
      by(byMacro("protein", "desc"))
        .filter((s) => macro(s, "protein") !== null && macro(s, "protein") >= T.proteinHigh)),

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
      by(byMacro("sugar", "asc"))
        .filter((s) => macro(s, "sugar") !== null && macro(s, "sugar") <= T.sugarLow)),

    shelf("complete", "Complete your daily protein",
      profile.targets?.protein ? `Toward your ${profile.targets.protein}g / day` : "Protein-forward picks",
      by(byMacro("protein", "desc"))
        .filter((s) => macro(s, "protein") !== null && macro(s, "protein") >= T.proteinMin)),

    shelf("different", "Try something different", "A little outside your usual", diverseSample(included)),
  ];

  return shelves.filter(Boolean);
}
