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
  // For a list read by machine rather than checked by a person: a statement
  // about the pack, not a guarantee about the food.
  notListedOnPack: (labels) => `No ${joinOr(labels.map((l) => String(l).toLowerCase()))} listed on the pack`,
  meal: (label) => `Great ${String(label).toLowerCase()} option`,
  likes: (label) => `You like ${label}`,
  // "Low", not "Lower": "lower" is a comparative claim and needs a named
  // reference food. Only ever pushed when claims.js#isLowSugar passes.
  lowSugar: () => "Low sugar",
  highFibre: () => "High in fibre",
  highProtein: () => "High protein",
  trust: () => "High KOI trust score",
  budget: () => "Within your budget",
  popular: () => "Popular with the community",
  clean: () => "Clean, recognisable ingredients",
};

// Cautions: what KOI could NOT check, shown beside the reasons rather than
// mixed into them. A reason is a claim about the food; a caution is a limit on
// what KOI knows, and the card has to make that difference visible.
const joinOr = (list) =>
  list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;

export const CAUTIONS = {
  notVerifiedFor: (labels) => `Not verified for ${joinOr(labels.map((l) => String(l).toLowerCase()))}`,
  notVerifiedAsDiet: (label) => `Not verified as ${label}`,
  // The line under search chips when some results could not be checked.
  unverifiedInResults: (count, total, allergens = [], diet = null) => {
    const what = [
      allergens.length ? `for ${joinOr(allergens.map((l) => String(l).toLowerCase()))}` : null,
      diet ? `as ${diet}` : null,
    ].filter(Boolean).join(" or ");
    const one = count === 1;
    return `${count} of ${total} ${total === 1 ? "result" : "results"} ${one ? "hasn't" : "haven't"} had ${one ? "its" : "their"} ingredient list verified ${what}. Check the pack before you buy.`;
  },
};
