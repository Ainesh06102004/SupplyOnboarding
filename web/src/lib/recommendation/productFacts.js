// ============================================================================
// KRE — Product feature extraction
// Normalises a raw product (live DB or curated fallback) into a deterministic
// `facts` object the engine can reason over. Pure, no side effects.
// ============================================================================

import { CONTAINS_KEYWORDS, CLEAR_TAGS, THRESHOLDS, AVAILABILITY } from "./config";

const VALID_AVAILABILITY = new Set(Object.values(AVAILABILITY));

const toNum = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, "")) || 0);

// A declared macro, or null when there is no figure. Deliberately NOT toNum:
// `parseFloat("") || 0` is exactly how an undeclared macro became a confident
// zero, and because a genuine declared 0 is itself falsy, no `||` can appear
// anywhere in here.
const toMacro = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^\d.]/g, "");
  if (cleaned === "") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

const anyKeyword = (haystack, list) => list.some((k) => haystack.includes(k));

// Anything absent, malformed or unrecognised is `unknown`. The legacy boolean
// `inStock` is honoured only when it is explicitly present.
function readAvailability(product) {
  const raw = product.availability;
  const state = typeof raw === "string" ? raw : raw?.state;
  if (VALID_AVAILABILITY.has(state)) return state;
  if (product.inStock === true) return AVAILABILITY.AVAILABLE;
  if (product.inStock === false) return AVAILABILITY.UNAVAILABLE;
  return AVAILABILITY.UNKNOWN;
}

/**
 * @returns {{
 *   id, name, brand, category, price, trust, recommended,
 *   macros: { protein, sugar, fat, fibre, kcal, carbs, sodium },
 *   dietary: string[], tags: string[], goalTags: string[],
 *   contains: Set<string>, haystack: string, status: string,
 *   availability: 'available'|'unavailable'|'unknown'
 * }}
 */
export function extractFacts(product) {
  const tags = (product.tags || []).map((t) => String(t).toLowerCase());
  const dietary = product.dietary || [];
  const ingredients = (product.goodIngredients || []).map((x) => (x?.name || x || "")).join(" ");
  const haystack = [product.name, product.brand, product.category, ingredients, ...(product.tags || []), ...(product.goalTags || [])]
    .join(" ")
    .toLowerCase();

  // ── Macros: declared, or unknown ─ never assumed ────────────────────────
  // `null` means KOI has no figure for this macro. It is NOT zero, and the
  // difference is not pedantic. Every one of these read `?? 0`, so a product
  // with no sugar figure was scored as a sugar-free product — the best possible
  // sugar result. It won the `sugar: "low"` metric in five of the nine goal
  // profiles, collected the whole 40% sugar half of macroFit, kept a clean
  // `refined_sugar` flag, and was told to the shopper in as many words:
  // "Lower sugar". Missing data outranked declared data, and the storefront
  // published a health claim about a number nobody had ever given it.
  //
  // The same default cut the other way on protein: `null` became 0, which is
  // below proteinMin, so an undeclared protein figure was actively PENALISED
  // on protein-focused goals. Absence was rewarded on one macro and punished
  // on another, and neither was a claim the data supported.
  //
  // `sodium` was already null-safe. It is now the pattern rather than the
  // exception, and every consumer must handle null explicitly — including the
  // ones that look safe, because `null < 6` is `true`.
  const nm = {};
  (product.nutrition || []).forEach((n) => {
    const v = toMacro(n?.value);
    // An entry that carries no readable number is the same as no entry at all.
    if (v !== null) nm[String(n?.label).toLowerCase()] = v;
  });
  const macros = {
    protein: nm.protein ?? null,
    sugar: nm.sugar ?? null,
    fat: nm.fat ?? null,
    fibre: nm.fibre ?? nm.fiber ?? null,
    kcal: nm.calories ?? nm.energy ?? null,
    carbs: nm.carbs ?? null,
    sodium: nm.sodium ?? null,
  };

  const hasTag = (list) => (list || []).some((t) => tags.some((tag) => tag.includes(t)));

  // ── infer ingredient/attribute flags ──
  const contains = new Set();
  for (const [flag, kws] of Object.entries(CONTAINS_KEYWORDS)) {
    if (anyKeyword(haystack, kws)) contains.add(flag);
  }

  // dietary declarations authoritatively CLEAR flags
  const dl = dietary.map((d) => d.toLowerCase());
  if (dl.includes("vegan")) ["dairy", "egg", "meat", "fish", "shellfish", "honey"].forEach((f) => contains.delete(f));
  if (dl.includes("vegetarian")) ["meat", "fish", "shellfish"].forEach((f) => contains.delete(f));
  if (dl.includes("gluten free")) contains.delete("gluten");

  // free-from tags clear attribute flags
  for (const [flag, clears] of Object.entries(CLEAR_TAGS)) {
    if (hasTag(clears)) contains.delete(flag);
  }

  // Refined sugar: decided only where the sugar figure is known. An unknown
  // figure is not a clean one — `null > 0` is false, so the old `else` branch
  // cleared the flag and handed a shopper who avoids refined sugar a clean bill
  // of health on a product whose sugar KOI had never been told.
  const cleanSugar = hasTag(CLEAR_TAGS.refined_sugar) || anyKeyword(haystack, ["jaggery", "dates", "honey", "natural"]);
  if (macros.sugar !== null) {
    if (macros.sugar > 0 && !cleanSugar) contains.add("refined_sugar");
    else contains.delete("refined_sugar");
  }

  // High sodium only where the value is known — the rule the rest now follow.
  if (macros.sodium !== null) {
    if (macros.sodium >= THRESHOLDS.sodiumHighMg) contains.add("high_sodium");
    else contains.delete("high_sodium");
  }

  // peanut/tree_nut split (tree_nut isn't an avoid flag but keep peanut precise)
  if (haystack.includes("peanut") || haystack.includes("groundnut")) contains.add("peanut");

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category || "Snacks",
    price: toNum(product.price),
    trust: toNum(product.score),
    recommended: !!product.recommended,
    betterThan: toNum(product.betterThanPercentage),
    macros,
    dietary,
    tags,
    goalTags: product.goalTags || [],
    contains,
    haystack,
    // Tri-state, never inferred. An unchecked product is `unknown`, not in
    // stock — defaulting the other way turns absence of evidence into a claim.
    availability: readAvailability(product),
    status: product.status || "approved",
    product, // keep the original for the DTO / cart
  };
}
