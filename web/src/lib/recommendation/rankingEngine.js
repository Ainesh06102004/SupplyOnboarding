// ============================================================================
// KRE — Step 4: Ranking Engine (Strategy pattern)
// The ONLY swappable part of the pipeline. Everything upstream (candidates →
// eligibility → scoring) is fixed and strategy-agnostic. To add AI later, drop
// in an AIRankingStrategy that re-orders the SAME scored list — nothing else in
// the system changes.
//
//   RankingStrategy (interface)
//     ├─ RuleBasedRankingStrategy  (score desc + category diversity)  ← default
//     └─ AIRankingStrategy         (placeholder; identical contract)
// ============================================================================

import { THRESHOLDS } from "./config";

/**
 * @typedef {Object} RankingStrategy
 * @property {(scored: Array, ctx?: object) => Array} rank
 */

// Greedy diversity: keep the highest scores but avoid clustering one category.
// Deterministic — stable given identical input order.
function diversify(sorted, { maxPerCategory = Infinity, maxStreak = 2 } = {}) {
  const out = [];
  const remaining = [...sorted];
  const counts = {};
  let lastCat = null;
  let streak = 0;

  while (remaining.length) {
    let idx = remaining.findIndex((r) => {
      const c = r.category;
      if ((counts[c] || 0) >= maxPerCategory) return false;
      if (c === lastCat && streak >= maxStreak) return false;
      return true;
    });
    if (idx === -1) idx = 0; // constraints exhausted → take best remaining

    const [pick] = remaining.splice(idx, 1);
    counts[pick.category] = (counts[pick.category] || 0) + 1;
    streak = pick.category === lastCat ? streak + 1 : 1;
    lastCat = pick.category;
    out.push(pick);
  }
  return out;
}

export class RuleBasedRankingStrategy {
  constructor(options = {}) {
    this.options = options;
  }
  /** @type {RankingStrategy["rank"]} */
  rank(scored, ctx = {}) {
    const sorted = [...scored].sort((a, b) => {
      if (b.raw !== a.raw) return b.raw - a.raw;
      if (b.facts.trust !== a.facts.trust) return b.facts.trust - a.facts.trust; // tie: trust
      return a.facts.price - b.facts.price; // then cheaper first
    });
    return ctx.diversify === false ? sorted : diversify(sorted, this.options);
  }
}

// Placeholder for the future. Same interface; the rest of the system is unaware
// of which strategy is in use. An implementation would call a model to re-rank
// the already-scored list (never re-generating candidates or eligibility).
export class AIRankingStrategy {
  constructor(fallback = new RuleBasedRankingStrategy()) {
    this.fallback = fallback;
  }
  /** @type {RankingStrategy["rank"]} */
  rank(scored, ctx = {}) {
    // No model wired yet → deterministic fallback, contract preserved.
    return this.fallback.rank(scored, ctx);
  }
}

export const inclusionCutoff = (scored) => scored.filter((s) => s.raw >= THRESHOLDS.minInclusionScore);

export { diversify };
