// ============================================================================
// KOI — Landing view model
//
// The editorial landing page was composed around a hand-written fixture shape
// (a string image, a tagline, a claims array, a flat nutrition object). The
// database returns something else entirely. This is the one place that
// translates, so the components stay presentational and the mapping stays
// reviewable.
//
// The rule is the same as productFetcher.js: every field is read or it is
// null. Nothing here invents a tagline, a claim or a macro. A fixture has a
// copywritten `tagline`; a screened product has `review_notes` or it has
// nothing, and "nothing" renders as absence rather than as filler.
// ============================================================================

/**
 * Turn the database's measurement basis into something readable.
 *
 * The column stores an enum (`PER_100G`, `PER_SERVING`). Rendering it raw put
 * "PER_100G" under the nutrition meters. Unrecognised values are lower-cased
 * and de-underscored rather than dropped — an unfamiliar basis is still
 * information, and silently omitting it would leave the macros unqualified.
 */
function formatBasis(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase();
  if (key === "PER_100G") return "per 100 g";
  if (key === "PER_100ML") return "per 100 ml";
  if (key === "PER_SERVING") return "per serving";
  return String(raw).replace(/_/g, " ").toLowerCase();
}

/** Number, or null. Never coerces a missing value to 0 — see Meter. */
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Pull a macro out of productFetcher's nutrition array, which is already
 * filtered to declared values only. A label that is not present is genuinely
 * not declared, so the answer is null and the meter disappears.
 */
function macro(nutrition, label) {
  if (!Array.isArray(nutrition)) return null;
  const row = nutrition.find((n) => n && String(n.label).toLowerCase() === label);
  return row ? num(row.value) : null;
}

/**
 * Normalise either shape — dev fixture or live database row — into what the
 * landing components render.
 *
 * @param {object} p
 * @returns {object|null}
 */
export function toLandingProduct(p) {
  if (!p || p.id == null) return null;

  // Fixtures carry a string; productFetcher carries { hero, label, lifestyle }.
  const image = typeof p.image === "string" ? p.image : p.image?.hero || null;

  // Fixtures carry a flat object; the database carries the filtered array.
  const flat = p.nutrition && !Array.isArray(p.nutrition) ? p.nutrition : null;
  const nutrition = flat
    ? {
        protein: num(flat.protein),
        sugar: num(flat.sugar),
        fibre: num(flat.fibre),
        kcal: num(flat.kcal),
      }
    : {
        protein: macro(p.nutrition, "protein"),
        // Added sugar is the honest one to show when it is declared: total
        // sugars in a date-sweetened product is not the number a shopper is
        // asking about. Fall back to total sugars only when added is absent.
        sugar: macro(p.nutrition, "added sugar") ?? macro(p.nutrition, "sugar"),
        fibre: macro(p.nutrition, "fibre"),
        kcal: macro(p.nutrition, "calories"),
      };

  // Fixtures call them claims; the database calls them tags/goalTags, and both
  // ultimately come from a screening report's flags.
  const claims = Array.isArray(p.claims) ? p.claims : Array.isArray(p.tags) ? p.tags : [];

  return {
    id: String(p.id),
    brand: p.brand || null,
    name: p.name || null,
    category: p.category || null,
    price: num(p.price),
    weight: p.weight && p.weight !== "N/A" ? p.weight : null,
    // null for an unscored product. ScoreRing renders nothing for null.
    score: num(p.score),
    image,
    // A fixture is copywritten. A screened product has the reviewer's note or
    // it has silence — there is no third option that is not invention.
    tagline: p.tagline || p.insight || null,
    claims,
    nutrition,
    // What the macros above are measured against. A protein figure with no
    // basis is ambiguous between per-100 g and per-serving, and the two can
    // differ by a factor of three — so where the basis is unknown the UI says
    // nothing rather than implying the flattering one.
    basis: formatBasis(p.measurementBasis) || p.servingSize || null,
    // Carried through so the cart and the marketplace can both address it.
    externalId: p.externalId ?? null,
    availability: p.availability ?? null,
  };
}

/** Map a catalogue, dropping anything unrenderable. */
export const toLandingCatalogue = (products = []) =>
  products.map(toLandingProduct).filter((p) => p && p.name && p.image);

/**
 * The editorial pick.
 *
 * Highest score wins, because "editorial pick" on a storefront whose whole
 * proposition is the score cannot mean anything else. Ties break on the richer
 * entry — one with a reviewer's note carries the section's body copy, and a
 * spread built around a product with nothing to say about it is a worse page.
 *
 * `exclude` lets the page hand the hero and the editorial spread two different
 * products without either section reaching for an index. With a one-product
 * catalogue the second call returns null and that section renders its empty
 * state, which is the correct outcome rather than the same product twice.
 *
 * @returns {object|null} null when there is no catalogue, which is a state the
 *   caller is required to design for rather than paper over.
 */
export function pickFeatured(products = [], exclude = null) {
  const skip = new Set((Array.isArray(exclude) ? exclude : [exclude]).filter(Boolean).map(String));
  let best = null;
  for (const p of products) {
    if (!p || skip.has(p.id)) continue;
    if (!best) { best = p; continue; }
    const a = p.score ?? -1;
    const b = best.score ?? -1;
    if (a > b || (a === b && !best.tagline && p.tagline)) best = p;
  }
  return best;
}

/**
 * The "best rated" rail: scored products, descending, excluding whatever the
 * featured spread already used.
 *
 * Unscored products are excluded here specifically — the section's claim is
 * that these earned a rating, so listing something unrated under that heading
 * would be the heading lying. They still appear in the shop.
 */
export function pickBestRated(products = [], exclude = null, limit = 8) {
  const skip = new Set((Array.isArray(exclude) ? exclude : [exclude]).filter(Boolean).map(String));
  return products
    .filter((p) => p && !skip.has(p.id) && p.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
