// ============================================================================
// KOI - Catalogue merge
// Combines the development seed catalogue with live products from Supabase.
//
// Live rows win on id collision: a screened product from the database is
// always more authoritative than a fixture. Concatenating the two without
// deduping renders the same product twice, which is what the shop and the
// product page both did before.
//
// Pure and order-stable: seed order is preserved for entries the live set does
// not replace, then unseen live rows follow. No I/O, no globals.
// ============================================================================

/**
 * @param {Array} seed curated/fixture products (may be empty)
 * @param {Array} live products fetched from the database
 * @returns {Array} one entry per id, live winning on collision
 */
export function mergeCatalogue(seed = [], live = []) {
  const liveById = new Map();
  for (const p of live) {
    if (p && p.id != null) liveById.set(String(p.id), p);
  }

  const out = [];
  const taken = new Set();

  for (const p of seed) {
    if (!p || p.id == null) continue;
    const key = String(p.id);
    if (taken.has(key)) continue;        // seed itself may contain duplicates
    taken.add(key);
    out.push(liveById.get(key) ?? p);
  }

  for (const [key, p] of liveById) {
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(p);
  }

  return out;
}
