// ============================================================================
// KRE — Product feature extraction
// Normalises a raw product (live DB or curated fallback) into a deterministic
// `facts` object the engine can reason over. Pure, no side effects.
// ============================================================================

import { CONTAINS_KEYWORDS, CLEAR_TAGS, THRESHOLDS } from "./config";

const toNum = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, "")) || 0);
const anyKeyword = (haystack, list) => list.some((k) => haystack.includes(k));

/**
 * @returns {{
 *   id, name, brand, category, price, trust, recommended,
 *   macros: { protein, sugar, fat, fibre, kcal, carbs, sodium },
 *   dietary: string[], tags: string[], goalTags: string[],
 *   contains: Set<string>, haystack: string, inStock: boolean, status: string
 * }}
 */
export function extractFacts(product) {
  const tags = (product.tags || []).map((t) => String(t).toLowerCase());
  const dietary = product.dietary || [];
  const ingredients = (product.goodIngredients || []).map((x) => (x?.name || x || "")).join(" ");
  const haystack = [product.name, product.brand, product.category, ingredients, ...(product.tags || []), ...(product.goalTags || [])]
    .join(" ")
    .toLowerCase();

  // macros from the nutrition array
  const nm = {};
  (product.nutrition || []).forEach((n) => { nm[String(n.label).toLowerCase()] = toNum(n.value); });
  const macros = {
    protein: nm.protein ?? 0,
    sugar: nm.sugar ?? 0,
    fat: nm.fat ?? 0,
    fibre: nm.fibre ?? nm.fiber ?? 0,
    kcal: nm.calories ?? nm.energy ?? 0,
    carbs: nm.carbs ?? 0,
    sodium: nm.sodium ?? null, // often unknown → stays null (no penalty)
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

  // refined sugar: present when there is measurable sugar and it isn't declared clean
  const cleanSugar = hasTag(CLEAR_TAGS.refined_sugar) || anyKeyword(haystack, ["jaggery", "dates", "honey", "natural"]);
  if (macros.sugar > 0 && !cleanSugar) contains.add("refined_sugar");
  else contains.delete("refined_sugar");

  // high sodium only when we actually know the value
  if (macros.sodium != null && macros.sodium >= THRESHOLDS.sodiumHighMg) contains.add("high_sodium");
  else contains.delete("high_sodium");

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
    inStock: product.inStock !== false, // default available unless explicitly false
    status: product.status || "approved",
    product, // keep the original for the DTO / cart
  };
}
