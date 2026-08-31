// ============================================================================
// KOI Recommendation Engine (KRE) — Public API
// Deterministic. No AI, no embeddings, no vector search. AI can later replace
// only the ranking strategy without touching anything else.
// ============================================================================

export { recommend, RecommendationService } from "./recommendationService";
export { RuleBasedRankingStrategy, AIRankingStrategy } from "./rankingEngine";
export { scoreProduct } from "./scoringEngine";
export { extractFacts } from "./productFacts";
export { generateCandidates } from "./candidateGenerator";
export { filterEligible } from "./eligibilityFilter";
export { buildShelves, toDTO } from "./shelves";

// Catalogs + config re-exported so the onboarding UI and engine never drift.
export {
  FOODS_LOVE, FOODS_AVOID, DIET_TYPES, MEALS, BUDGETS, COOKING,
  GOAL_PROFILES, WEIGHTS, PENALTIES, THRESHOLDS, AVAILABILITY,
} from "./config";
