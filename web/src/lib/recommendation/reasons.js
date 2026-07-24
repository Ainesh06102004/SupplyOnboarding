// ============================================================================
// KRE — Reason templates
// Deterministic, human-readable explanations. No AI, no free text — every
// reason is a predefined template so recommendations are always explainable.
// ============================================================================

export const REASONS = {
  goal: (label) => `Great for ${String(label).toLowerCase()}`,
  proteinGoal: () => "Matches your protein goal",
  calorieTarget: () => "Fits your calorie target",
  noAvoid: () => "No ingredients you avoid",
  meal: (label) => `Great ${String(label).toLowerCase()} option`,
  likes: (label) => `You like ${label}`,
  lowSugar: () => "Lower sugar",
  highFibre: () => "High in fibre",
  highProtein: () => "High protein",
  trust: () => "High KOI trust score",
  budget: () => "Within your budget",
  popular: () => "Popular with the community",
  clean: () => "Clean, recognisable ingredients",
};
