// ============================================================================
// KOI DEMAND — Send a search's unmet demand, and nothing else
//
// Fire and forget: a failed count must never touch the search a shopper is
// looking at. Sent without cookies, so the request carries no session, and
// each term goes at most once per page load, so re-running a search does not
// count twice.
// ============================================================================

const sent = new Set();

/** @param {Array<{ term: string, kind: string }>} terms from demandTerms() */
export function reportDemand(terms) {
  if (typeof window === "undefined" || !Array.isArray(terms)) return;
  const fresh = terms.filter(({ term, kind }) => {
    const key = `${kind}:${term}`;
    if (sent.has(key)) return false;
    sent.add(key);
    return true;
  });
  if (!fresh.length) return;
  try {
    fetch("/api/demand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms: fresh }),
      credentials: "omit",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Counting is best-effort.
  }
}
