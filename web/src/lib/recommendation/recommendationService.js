// ============================================================================
// KRE — RecommendationService (orchestrator)
// Wires the deterministic pipeline together:
//   Candidate Generator → Eligibility Filter → Scoring Engine → Ranking → DTO
// The ranking strategy is injectable; swapping in AIRankingStrategy later
// requires zero changes here or anywhere upstream.
// ============================================================================

import { generateCandidates } from "./candidateGenerator";
import { filterEligible } from "./eligibilityFilter";
import { scoreProduct } from "./scoringEngine";
import { RuleBasedRankingStrategy, inclusionCutoff } from "./rankingEngine";
import { buildShelves, toDTO } from "./shelves";

/**
 * Run the full pipeline.
 * @param {Array}  products inventory (live or fallback)
 * @param {object} profile  user health + food profile
 * @param {object} [opts]   { strategy }
 * @returns {{ shelves, ranked, meta }}
 */
export function recommend(products = [], profile = {}, opts = {}) {
  const strategy = opts.strategy || new RuleBasedRankingStrategy({ maxStreak: 2 });

  const candidates = generateCandidates(products);
  const { eligible, removed } = filterEligible(candidates, profile);
  const scored = eligible.map((f) => scoreProduct(f, profile));
  const included = inclusionCutoff(scored);
  const ranked = strategy.rank(included);

  return {
    shelves: buildShelves(ranked, included, profile),
    ranked: ranked.map(toDTO),
    meta: {
      total: products.length,
      candidates: candidates.length,
      eligible: eligible.length,
      removed,
      included: included.length,
      strategy: strategy.constructor?.name || "unknown",
    },
  };
}

/** Class form for DI / testing; default strategy = rule-based. */
export class RecommendationService {
  constructor({ strategy } = {}) {
    this.strategy = strategy || new RuleBasedRankingStrategy({ maxStreak: 2 });
  }
  setStrategy(strategy) { this.strategy = strategy; }
  recommend(products, profile) { return recommend(products, profile, { strategy: this.strategy }); }
}
