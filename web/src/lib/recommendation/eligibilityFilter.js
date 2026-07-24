// ============================================================================
// KRE — Step 2: Eligibility Filter
// Hard constraints only. Removes products that violate the user's diet type or
// a HARD avoided ingredient (allergens, red meat, caffeine). This stage ONLY
// eliminates — it never scores. Soft avoids (palm oil, refined sugar, …) are
// handled as penalties in the Scoring Engine.
// ============================================================================

import { DIET_EXCLUSIONS, FOODS_AVOID } from "./config";

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));

/**
 * @param {Array} candidates facts[]
 * @param {object} profile user profile { dietType, foodsAvoid: string[] }
 * @returns {{ eligible: Array, removed: Array<{id, reason}> }}
 */
export function filterEligible(candidates, profile = {}) {
  const dietExcluded = DIET_EXCLUSIONS[profile.dietType] || [];
  const hardAvoidFlags = (profile.foodsAvoid || [])
    .map((k) => AVOID_BY_KEY[k])
    .filter((a) => a && a.mode === "hard")
    .map((a) => a.flag);

  const eligible = [];
  const removed = [];

  for (const f of candidates) {
    // diet-type violation
    const dietHit = dietExcluded.find((flag) => f.contains.has(flag));
    if (dietHit) {
      removed.push({ id: f.id, reason: `diet:${profile.dietType}:${dietHit}` });
      continue;
    }
    // hard avoided ingredient
    const avoidHit = hardAvoidFlags.find((flag) => f.contains.has(flag));
    if (avoidHit) {
      removed.push({ id: f.id, reason: `avoid:${avoidHit}` });
      continue;
    }
    eligible.push(f);
  }

  return { eligible, removed };
}
