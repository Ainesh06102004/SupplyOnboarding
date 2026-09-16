// ============================================================================
// KOI — Substitutes
//
// When a product a shopper wants cannot be bought right now, what should KOI
// offer instead?
//
// THE ANSWER IS NEVER A PROVIDER'S SUGGESTION.
//
// The adapter contract can return the provider's own `similarProducts`, and it
// is tempting to surface them: they are guaranteed in stock and they are free.
// But a provider's substitute is a product KOI has NOT screened. Putting one
// in front of a shopper — on a storefront whose entire proposition is that
// someone read the label first — is the storefront vouching for food it knows
// nothing about. That is the same failure as an invented KOI score, arriving
// through a different door, and it would be at its most damaging exactly where
// a shopper is most trusting: at the moment their first choice fell through.
//
// So substitutes come from KOI's OWN catalogue: screened, scored, and ranked
// by the same engine that ranks everything else. The provider is asked only
// one question about them — "can this be bought right now?" — which is the
// only question it is authoritative on.
//
// Cost: candidates are capped, because each one costs a provider search. The
// cap is enforced again at the API boundary (MAX_SKUS).
// ============================================================================

import { extractFacts } from "./productFacts";
import { scoreProduct } from "./scoringEngine";
import { AVAILABILITY } from "./config";
import { hasScore } from "@/lib/score";

/** How many KOI alternatives to ask the provider about. See the cost note. */
export const MAX_CANDIDATES = 4;

/**
 * Rank KOI's own catalogue as replacements for a product that cannot be bought.
 *
 * Ordering, in priority:
 *   1. Same category, then same aisle — a replacement for biscuits is
 *      biscuits before it is chips, and a replacement for peanut butter is
 *      never a beverage. Categories come from KOI's tree (lib/food/taxonomy.js).
 *   2. KRE score against the shopper's goal profile, so the substitute
 *      preserves what they were actually shopping for rather than merely
 *      filling the hole.
 *   3. KOI score, as the tie-break, because that is the promise on the tin.
 *
 * Products already known UNAVAILABLE are dropped before ranking — asking the
 * provider about something we were just told is out of stock spends quota to
 * learn nothing. Products with `unknown` availability are KEPT: unknown is
 * absence of a signal, not absence of stock, and asking is how it resolves.
 *
 * Deterministic: same inputs, same order, no clock and no randomness.
 *
 * Since Phase 2.5 a caller that holds KOI's substitution edges
 * (food.substitution_edge) can pass them: a candidate KOI has a recorded
 * reason for comes first, and carries that reason on `via` so the screen can
 * say why rather than merely offering it.
 *
 * @param {object} target      the product that could not be bought
 * @param {Array}  catalogue   KOI's screened products
 * @param {object} [profile]   the shopper's goal profile, when they have one
 * @param {number} [limit]
 * @param {object} [options]
 * @param {Record<string, Array<{reason: string, basis: object, comparability: number}>>|null} [options.edges]
 *   edges FROM the target, keyed by the candidate's SKU id
 * @returns {Array} candidate products, best first; each with `via` when an edge explains it
 */
export function pickSubstituteCandidates(target, catalogue = [], profile = {}, limit = MAX_CANDIDATES, { edges = null } = {}) {
  if (!target || !catalogue.length) return [];

  const targetId = String(target.id);
  const targetCategory = target.category || null;
  const targetKey = target.categoryKey || null;

  const scored = [];
  for (const p of catalogue) {
    if (!p || String(p.id) === targetId) continue;
    // Do not spend a provider call re-confirming something already known out.
    if (p.availability === AVAILABILITY.UNAVAILABLE) continue;

    let fit = 0;
    try {
      // `raw`, not `total` — scoreProduct returns { id, raw, display, ... }.
      // Reading a field that does not exist would leave every fit at 0 and
      // silently reduce this whole ranking to the category tie-break.
      fit = Number(scoreProduct(extractFacts(p), profile).raw) || 0;
    } catch {
      // A product the KRE cannot read is still a legitimate candidate; it just
      // sorts below everything it can. Never let one bad row empty the list.
      fit = 0;
    }

    const via = (edges?.[String(p.skuId)] ?? []).filter((e) => e?.reason);
    scored.push({
      product: p,
      via,
      // How like-for-like KOI recorded the pair as being, when it did.
      comparability: via.reduce((best, e) => Math.max(best, Number(e.comparability) || 0), 0),
      // 2: the same category; 1: the same aisle; 0: neither.
      sameCategory: targetKey && p.categoryKey === targetKey ? 2
        : targetCategory && p.category === targetCategory ? 1 : 0,
      fit,
      // hasScore, not Number.isFinite(Number(...)): Number(null) is 0, so the
      // intended "unscored sorts last" sentinel of -1 was never reached — an
      // unscored product sorted as though it had scored zero. Same outcome
      // against today's 75-95 range, wrong the moment anything scores 0.
      koiScore: hasScore(p.score) ? Number(p.score) : -1,
    });
  }

  scored.sort(
    (a, b) =>
      b.comparability - a.comparability ||
      b.sameCategory - a.sameCategory ||
      b.fit - a.fit ||
      b.koiScore - a.koiScore ||
      // Final tie-break on id so the order is stable across renders.
      String(a.product.id).localeCompare(String(b.product.id))
  );

  return scored.slice(0, limit).map((s) => (s.via.length ? { ...s.product, via: s.via } : s.product));
}

/**
 * Keep the candidates the provider confirmed are buyable.
 *
 * `unknown` is deliberately excluded here, and this is the one place in the
 * codebase where that is the right call. Everywhere else an unknown product
 * still renders, because it is real and screened and hiding it would empty the
 * store. But a substitute is a POSITIVE suggestion — "this one you can get
 * instead" — and offering something KOI cannot confirm is buyable would fail
 * the shopper twice in a row.
 *
 * @param {Array} candidates
 * @param {Record<string, {availability: string, price: number|null, deliveryEta: string|null}>} signals
 * @param {(p: object) => string|null} [keyOf]  how a product maps to a signal
 *   key. Defaults to the product id, but supply signals are keyed on SKU id —
 *   availability is a property of a pack, not of a product.
 * @returns {Array} products with the confirmed live signal attached
 */
export function keepAvailable(candidates = [], signals = {}, keyOf = (p) => String(p.id)) {
  const out = [];
  for (const p of candidates) {
    const key = keyOf(p);
    const signal = key ? signals[key] : null;
    if (!signal || signal.availability !== AVAILABILITY.AVAILABLE) continue;
    out.push({
      ...p,
      availability: AVAILABILITY.AVAILABLE,
      // The provider's live price when it gave one; otherwise KOI's own MRP,
      // which is a fact about the product rather than a claim about buying it.
      price: signal.price ?? p.price,
      deliveryEta: signal.deliveryEta ?? null,
    });
  }
  return out;
}
