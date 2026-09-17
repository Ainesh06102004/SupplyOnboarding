// ============================================================================
// KRE — Product feature extraction
// Normalises a raw product (live DB or curated fallback) into a deterministic
// `facts` object the engine can reason over. Pure, no side effects.
// ============================================================================

import { CLEAR_TAGS, THRESHOLDS, AVAILABILITY } from "./config";
import { allergensIn, ingredientFlagsIn, ALLERGEN_KEYS, FLAG_KEYS } from "@/lib/food/allergens";
import { categorise } from "@/lib/food/taxonomy";
import { isLabelCurrent } from "./verification";

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
 *   contains: Set<string>, ingredientEvidence: 'verified'|'machine_read'|'partial'|'none',
 *   haystack: string, status: string,
 *   availability: 'available'|'unavailable'|'unknown'
 * }}
 */
export function extractFacts(product) {
  const tags = (product.tags || []).map((t) => String(t).toLowerCase());
  const dietary = product.dietary || [];
  const ingredients = (product.goodIngredients || []).map((x) => (x?.name || x || "")).join(" ");

  // ── How much KOI knows about what is in it ─────────────────────────────
  // `verified`:     a person checked the full printed ingredient list.
  // `machine_read`: the full list, read twice independently with the readings
  //                 agreeing and every check passing (lib/engine/autopublish.js).
  //                 It can support "not listed on the pack", worded as such.
  // `partial`:      a screening report named some ingredients. Partial by name
  //                 — it can prove presence, never absence.
  // `none`:         nothing beyond the name and tags.
  //
  // A label with no reading in LABEL_MAX_AGE_DAYS drops to `partial`: the
  // recipe may have changed since, so it still proves what it lists and no
  // longer proves what it leaves out.
  const labelEvidence = product.label?.evidence ?? (product.label?.verified ? "verified" : null);
  const label = labelEvidence ? product.label : null;
  const ingredientEvidence = label && isLabelCurrent(label.confirmedAt)
    ? labelEvidence
    : (label || ingredients.trim() ? "partial" : "none");
  const labelText = label ? String(label.ingredientsText || "").toLowerCase() : "";

  const haystack = [product.name, product.brand, product.category, ingredients, labelText, ...(product.tags || []), ...(product.goalTags || [])]
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
  // Allergens come from the allergen graph (lib/food/allergens.js): whole
  // words, longest ingredient name first, so "peanut butter" is not milk and
  // "eggless" is not egg. What an ingredient may contain counts as present,
  // as a may-contain statement does below.
  const graph = allergensIn(haystack);
  const contains = new Set([...graph.contains, ...graph.mayContain]);
  // Every other flag comes from the same graph (food.ingredient_flag and
  // food.attribute_term): additives raise the preservative, colour, sweetener
  // and flavour filters (Phase 2.2); meat, honey, caffeine, palm oil and root
  // vegetables are ingredients; "spicy" is an ingredient or a product word
  // (Phase 2.4). The substring lists this replaced found tea in "steamed".
  //
  // Read without the brand. A brand is a name, not an ingredient: "Sweet Karam
  // Coffee" put caffeine on its Madras Mixture and Mango Mysore Pak, which kept
  // them from anyone avoiding caffeine and, with the planner's age rules, from
  // every child. Allergens above still read the brand: over-reading an
  // allergen only ever hides a product from someone avoiding it.
  const productText = [product.name, product.category, ingredients, labelText, ...(product.tags || []), ...(product.goalTags || [])]
    .join(" ")
    .toLowerCase();
  for (const flag of ingredientFlagsIn(productText)) contains.add(flag);

  // dietary declarations authoritatively CLEAR flags
  const dl = dietary.map((d) => d.toLowerCase());
  if (dl.includes("vegan")) ["dairy", "egg", "meat", "fish", "shellfish", "honey"].forEach((f) => contains.delete(f));
  if (dl.includes("vegetarian")) ["meat", "fish", "shellfish"].forEach((f) => contains.delete(f));
  if (dl.includes("gluten free")) contains.delete("gluten");

  // free-from tags clear attribute flags
  for (const [flag, clears] of Object.entries(CLEAR_TAGS)) {
    if (hasTag(clears)) contains.delete(flag);
  }

  // A verified label outranks every declaration above. A brand's "Vegan" or
  // "Gluten free" is a claim; a checked ingredient list saying "milk solids" or
  // "wheat flour" is the evidence that claim has to answer to. So whatever the
  // label shows is put back after the clears — including the allergens its
  // statement declares, which the extraction step stores as KOI flag keys
  // ("dairy", "tree_nut", …) so they need no second parse here.
  if (label) {
    const fromLabel = allergensIn(labelText);
    for (const flag of [...fromLabel.contains, ...fromLabel.mayContain]) contains.add(flag);
    // And a preservative on the label outranks the brand's "No Preservatives".
    for (const flag of ingredientFlagsIn(labelText)) contains.add(flag);
    // "May contain" counts as present. It is the brand saying it cannot rule
    // the allergen out, and a shopper avoiding it has asked KOI to rule it out.
    const declaredFlags = [
      ...(Array.isArray(label.allergens) ? label.allergens : []),
      ...(Array.isArray(label.mayContain) ? label.mayContain : []),
    ];
    for (const declared of declaredFlags) {
      if (typeof declared === "string" && (ALLERGEN_KEYS.includes(declared) || FLAG_KEYS.includes(declared))) contains.add(declared);
    }
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

  // A name that runs peanut into another word ("PeanutCrunch") still counts.
  // Over-reading an allergen only ever hides a product from someone avoiding it.
  if (haystack.includes("peanut") || haystack.includes("groundnut")) contains.add("peanut");

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    // The aisle from KOI's category tree, or null. Never a default: an unplaced
    // product called "Snacks" would join snack shelves it was never placed on.
    category: product.category || null,
    // The category-tree key, which decides meal occasions (lib/food/taxonomy.js).
    // Live products carry it; anything else is placed the same way here.
    categoryKey: product.categoryKey ?? categorise({ name: product.name, categoryL1: product.category })?.key ?? null,
    price: toNum(product.price),
    trust: toNum(product.score),
    recommended: !!product.recommended,
    betterThan: toNum(product.betterThanPercentage),
    macros,
    dietary,
    tags,
    goalTags: product.goalTags || [],
    contains,
    ingredientEvidence,
    haystack,
    // Tri-state, never inferred. An unchecked product is `unknown`, not in
    // stock — defaulting the other way turns absence of evidence into a claim.
    availability: readAvailability(product),
    status: product.status || "approved",
    product, // keep the original for the DTO / cart
  };
}
