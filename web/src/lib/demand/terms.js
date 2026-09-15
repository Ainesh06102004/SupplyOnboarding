// ============================================================================
// KOI DEMAND — Which words from a search are worth counting
//
// Phase 1.3. When a search comes back short, the interpreter already knows
// why, in one of two ways:
//
//   not_stocked    the leftover product word matched nothing KOI sells
//                  ("kombucha"), so that is something to onboard
//   cannot_filter  a restriction KOI recognised but has no key for
//                  ("mushroom free"), so that is vocabulary to add
//
// Those words are counted in engine.demand_queue. The sentence never is.
//
// PRIVACY. A search can say more about a person than about food ("snacks for
// my pregnancy"), so a term is kept only if it is letters and spaces, 3–40
// characters, at most three words, and names no medical or health state. A
// digit or an @ rejects the whole term, which is what keeps phone numbers,
// emails and figures out. The route runs sanitiseTerm again on whatever
// arrives, and the table's CHECK repeats the digit rule.
//
// Client-safe and pure.
// ============================================================================

import { MEDICAL_TERMS } from "@/lib/ai/intent/deterministic";

export const DEMAND_KINDS = Object.freeze(["not_stocked", "cannot_filter"]);
export const MAX_TERMS = 4;
// A term is shown to anyone, staff included, only from this many occurrences.
export const PUBLISH_AT = 5;

const MIN_CHARS = 3;
const MAX_CHARS = 40;
const MAX_WORDS = 3;

// Word prefixes that describe a body rather than a food. MEDICAL_TERMS covers
// the conditions the interpreter declines; these cover the rest a search can
// carry. Deliberately broad: a lost count costs nothing.
const HEALTH_STATE = Object.freeze([
  "pregnan", "lactat", "breastfeed", "postpartum", "cancer", "chemo", "kidney", "renal",
  "liver", "cardiac", "heart", "celiac", "coeliac", "ibs", "gerd", "acidity", "ulcer",
  "allerg", "intoleran", "medic", "disease", "patient", "doctor", "sick", "fever",
  "surgery", "anaemi", "anemi", "obes", "depress", "anxiety",
]);

/**
 * A term fit to count, or null.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function sanitiseTerm(raw) {
  if (typeof raw !== "string") return null;
  const term = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (term.length < MIN_CHARS || term.length > MAX_CHARS) return null;
  if (!/^[\p{L}\p{M} ]+$/u.test(term)) return null;
  const words = term.split(" ");
  if (words.length > MAX_WORDS) return null;
  if (MEDICAL_TERMS.some((t) => term.includes(t))) return null;
  if (words.some((w) => HEALTH_STATE.some((p) => w.startsWith(p)))) return null;
  return term;
}

const haystack = (p) =>
  [p.name, p.brand, p.category, ...(p.tags || []), ...(p.goalTags || [])]
    .filter(Boolean).join(" ").toLowerCase();

/**
 * The demand a search expressed that the catalogue could not meet.
 *
 * @param {object|null} intent an interpreted intent (lib/ai/intent)
 * @param {Array} products the catalogue the shopper searched
 * @returns {Array<{ term: string, kind: "not_stocked"|"cannot_filter" }>}
 */
export function demandTerms(intent, products = []) {
  if (!intent) return [];
  const out = [];
  const add = (raw, kind) => {
    const term = sanitiseTerm(raw);
    if (term && !out.some((x) => x.term === term && x.kind === kind)) out.push({ term, kind });
  };

  // With no catalogue loaded, every word would look unstocked.
  const text = String(intent.text || "").trim().toLowerCase();
  if (text && products.length && !products.some((p) => haystack(p).includes(text))) {
    add(text, "not_stocked");
  }
  for (const word of intent.unresolved || []) add(word, "cannot_filter");

  return out.slice(0, MAX_TERMS);
}
