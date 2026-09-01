// ============================================================================
// KOI — Score arithmetic
//
// Exists because of one JavaScript trap that this codebase walked into five
// separate times:
//
//     Number(null)                  // 0
//     Number.isFinite(Number(null)) // true
//     Number("")                    // 0
//
// So `items.filter(i => Number.isFinite(Number(i.score)))` does NOT filter out
// unscored products — it admits every one of them as a zero. A basket holding
// one product scored 90 and one not yet scored reported an average of 45, and
// a 45 on a KOI storefront is a verdict, not a gap.
//
// An unscored product is not a zero-scoring product. Absence of a score is
// absence of a screening result, exactly as `unknown` availability is absence
// of a stock signal — see lib/availability.js for the same principle.
// ============================================================================

/**
 * Does this product carry a real KOI score?
 *
 * Rejects null, undefined, "" and NaN. Accepts a numeric string, because the
 * fixtures and some Supabase numeric columns hand back strings.
 *
 * @param {unknown} score
 * @returns {boolean}
 */
export function hasScore(score) {
  if (score === null || score === undefined || score === "") return false;
  return Number.isFinite(Number(score));
}

/** Products carrying a real score. Never assume the caller pre-filtered. */
export const scoredOnly = (items = []) => items.filter((i) => i && hasScore(i.score));

/**
 * Mean KOI score, or null when nothing is scored.
 *
 * Returns null rather than 0 for an empty set, so callers must decide what to
 * render for "no scored products" instead of inheriting a zero that looks like
 * a terrible score.
 *
 * @param {Array<{score?: unknown}>} items
 * @returns {number|null}
 */
export function averageScore(items = []) {
  const scored = scoredOnly(items);
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, i) => sum + Number(i.score), 0) / scored.length);
}
