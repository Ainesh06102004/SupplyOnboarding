// ============================================================================
// KOI PRODUCT - View-model normaliser
// Turns a product (live DB or curated fallback) into the view model the product
// story renders.
//
// Rule: every line on the page is either read from the product's data or not
// shown. This file used to fill every gap with copy that read as fact:
//   - a default ingredient list per category, which put almonds and milk
//     solids on products KOI holds no ingredient data for — an allergen
//     statement invented from a category name;
//   - a "category average" computed as half or double the product's own
//     figures, presented as the market;
//   - a usage timeline, a "science" section and an ingredient-quality timeline
//     stamped identically on every product ("without the sugar crash", on
//     honey);
//   - three community reviews signed with invented names, and a quote
//     attributed to a nutritionist nobody consulted;
//   - an undeclared sugar figure coerced to 0 and rated "Minimal".
// KOI is a marketer under the food claims regulations, so each of those was a
// claim KOI made — the review and the nutritionist quote were prohibited ones
// (implied endorsement), and "Diabetes - watch portions" a disease reference.
// A section with nothing true to say now comes back empty, and the page omits
// it rather than filling it.
// ============================================================================

import { THRESHOLDS } from "@/lib/recommendation/config";
import { toPer100 } from "@/lib/nutrition/basis";
import {
  isHighProtein, isHighFibre, isLowSugar, isSugarFree, rowFromProduct,
} from "@/lib/nutrition/claims";

const has = (tags, kw) => (tags || []).some((t) => String(t).toLowerCase().includes(kw));

/** A declared figure, rounded for display, or null. Never 0 for missing. */
const fig = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

/**
 * Letter grade for a KOI score, or null when there is no score.
 *
 * It used to be called as grade(p.score || 0), which handed an unscored
 * product a confident "C / Mixed" — a verdict manufactured from the absence of
 * one. There is no grade for a product nobody has scored.
 */
export function grade(score) {
  if (score === null || score === undefined || score === "" || !Number.isFinite(Number(score))) return null;
  if (score >= 92) return { g: "A+", label: "Exceptional" };
  if (score >= 87) return { g: "A", label: "Excellent" };
  if (score >= 82) return { g: "A-", label: "Very good" };
  if (score >= 76) return { g: "B+", label: "Good" };
  if (score >= 70) return { g: "B", label: "Fair" };
  return { g: "C", label: "Mixed" };
}

// ── What an ingredient is ───────────────────────────────────────────────────
// Descriptions say what the ingredient IS, and flag the allergen it carries.
// They no longer say what it does for a body: "heart-friendly fat", "low
// glycaemic load" and "supports fullness" are health and function claims about
// a product KOI has not tested, and the same sentence appeared on every product
// whose list contained the word.
const TREE_NUT = "A tree nut — relevant if you avoid tree nuts.";
const INGREDIENT_DB = {
  "whole wheat": { role: "Whole grain", detail: "Wheat milled with its bran and germ. Contains gluten." },
  oats: { role: "Whole grain", detail: "Rolled or cut oat grains." },
  millet: { role: "Whole grain", detail: "Small-seeded grains such as ragi, jowar or bajra." },
  ragi: { role: "Whole grain", detail: "Finger millet." },
  jaggery: { role: "Sweetener", detail: "Unrefined cane sugar. It counts as sugar on the nutrition panel." },
  dates: { role: "Sweetener", detail: "Dried fruit used for sweetness. It counts toward total sugar." },
  honey: { role: "Sweetener", detail: "It counts toward total sugar." },
  cocoa: { role: "Flavour", detail: "Ground cocoa solids." },
  cacao: { role: "Flavour", detail: "Cocoa processed at lower temperatures." },
  almond: { role: "Nut", detail: TREE_NUT },
  cashew: { role: "Nut", detail: TREE_NUT },
  walnut: { role: "Nut", detail: TREE_NUT },
  pistachio: { role: "Nut", detail: TREE_NUT },
  peanut: { role: "Legume", detail: "A legume, not a tree nut — relevant if you avoid peanuts." },
  "milk solids": { role: "Dairy", detail: "Concentrated milk — relevant if you avoid milk or lactose." },
  ghee: { role: "Fat", detail: "Clarified butter; a dairy fat." },
  "white butter": { role: "Fat", detail: "Unsalted churned butter; a dairy fat." },
  saffron: { role: "Spice", detail: "Dried crocus stigmas, used for aroma and colour." },
  seeds: { role: "Seeds", detail: "Edible seeds." },
};

function ingredientEntry(name) {
  const key = String(name).toLowerCase().trim();
  const hit = Object.keys(INGREDIENT_DB).find((k) => key.includes(k));
  return hit ? { name, tone: "mid", ...INGREDIENT_DB[hit] } : { name, tone: "mid", role: "Ingredient", detail: null };
}

/** A printed ingredient list split on top-level commas, keeping "(...)" together. */
const splitIngredients = (text) =>
  String(text || "").split(/,(?![^()]*\))/).map((s) => s.replace(/\.$/, "").trim()).filter(Boolean);

const NOT_DECLARED = Object.freeze(["Not declared", 0, "mid"]);

export function buildProductVM(p, all = []) {
  if (!p) return null;
  const tags = p.tags || [];
  const category = p.category || "Snacks";
  const brand = p.brand || "the brand";
  const g = grade(p.score);

  // ── Figures, per 100 on the product's own basis ──
  // Converted once, so every figure on the page is comparable with every other
  // and with the claim rules, which are per 100.
  const row = rowFromProduct(p);
  const per100 = toPer100(row);
  const per = per100.unit ? `per 100 ${per100.unit}` : null;
  const protein = fig(per100.protein_g);
  const sugar = fig(per100.sugars_g);
  const fibre = fig(per100.fibre_g);
  const kcal = fig(per100.energy_kcal);
  const carbs = fig(per100.carbs_g);
  const fat = fig(per100.total_fat_g);

  const high = { protein: isHighProtein(row), fibre: isHighFibre(row), lowSugar: isLowSugar(row), sugarFree: isSugarFree(row) };

  // ── Ingredients: the verified label, else the partial list, else nothing ──
  // `verified` = a person checked it; `machine_read` = two agreeing automatic
  // readings. Both are the full printed list; the page says which it is.
  const labelEvidence = p.label?.evidence ?? (p.label?.verified ? "verified" : null);
  const labelList = labelEvidence ? splitIngredients(p.label.ingredientsText) : null;
  const rawIngredients = labelList || (p.goodIngredients || []).map((x) => x?.name || x).filter(Boolean);
  const ingredients = rawIngredients.slice(0, labelList ? 16 : 8).map(ingredientEntry);
  const ingredientsEvidence = labelList && labelList.length ? labelEvidence : null;
  const ingredientsVerified = ingredientsEvidence === "verified";

  // ── Trust module: "What we confirmed" ──
  // Only what KOI established itself — a claim rule passed on the declared
  // figures, or a label a person checked. Brand statements are not KOI's
  // confirmations and are shown as the brand's, in Transparency.
  const attributes = [
    high.protein && { label: "High protein", ok: true },
    high.fibre && { label: "High fibre", ok: true },
    high.sugarFree ? { label: "Sugar free", ok: true } : high.lowSugar && { label: "Low sugar", ok: true },
    ingredientsVerified && { label: "Ingredient list verified", ok: true },
    ingredientsEvidence === "machine_read" && { label: "Ingredient list read from the pack", ok: true },
  ].filter(Boolean);

  // Only sub-scores the screening report actually carried.
  const sb = p.scoreBreakdown || {};
  const subs = Object.entries(sb)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)))
    .map(([label, value]) => ({ label, value: Math.round(Number(value)) }));

  // ── Why it earned its place ──
  // The claims the brand made and KOI allowed through (see
  // lib/nutrition/claims.js#guardClaims), each attributed to whoever made it.
  const pros = tags.slice(0, 5).map((t) => ({
    type: "pro",
    title: t,
    detail: String(t).toLowerCase() === "high protein" && high.protein
      ? `Meets KOI's high-protein rule on the declared figures: ${THRESHOLDS.proteinHigh} g per 100 g and ${THRESHOLDS.proteinPerServingFloor} g in a serving.`
      : `Declared by ${brand}.`,
  }));
  const consSource = p.watchouts && p.watchouts.length ? p.watchouts : (p.watchOuts || []).map((w) => w.name || w);
  const cons = consSource.length
    ? consSource.slice(0, 2).map((t) => ({ type: "con", title: typeof t === "string" ? t : t.name, detail: `Noted in KOI's screening of ${brand}'s submission.` }))
    : sugar !== null && !high.lowSugar && sugar > THRESHOLDS.sugarHigh
      ? [{ type: "con", title: `${sugar} g sugar ${per}`, detail: "Above FSSAI's low-sugar condition. It counts toward your daily sugar." }]
      : [];

  // ── Nutrition meters ──
  const proteinRating = protein === null ? NOT_DECLARED
    : high.protein ? ["High", 0.9, "good"]
    : protein >= THRESHOLDS.proteinMin ? ["Moderate", 0.5, "mid"] : ["Light", 0.2, "mid"];
  const sugarRating = sugar === null ? NOT_DECLARED
    : high.sugarFree ? ["Sugar free", 0.05, "good"]
    : high.lowSugar ? ["Low", 0.25, "good"]
    : sugar <= THRESHOLDS.sugarHigh ? ["Moderate", 0.55, "mid"] : ["High", 0.85, "warn"];
  const fibreRating = fibre === null ? NOT_DECLARED
    : high.fibre ? ["High", 0.8, "good"]
    : fibre >= 3 ? ["Moderate", 0.45, "mid"] : ["Low", 0.2, "mid"];

  const noFigure = "Not on the nutrition panel KOI holds for this product.";
  const cleanDeclared = has(tags, "no preserv") || has(tags, "no artificial");
  const meter = (key, label, [rating, fill, tone], value, context) =>
    ({ key, label, rating, fill, tone, value, unit: value === null ? "" : ` g ${per}`, context });

  const meters = [
    meter("protein", "Protein", proteinRating, protein, protein === null ? noFigure : high.protein
      ? `Meets KOI's high-protein rule: ${THRESHOLDS.proteinHigh} g per 100 g and at least ${THRESHOLDS.proteinPerServingFloor} g in a declared serving.`
      : `Below KOI's high-protein rule of ${THRESHOLDS.proteinHigh} g per 100 g with ${THRESHOLDS.proteinPerServingFloor} g in a serving.`),
    meter("sugar", "Sugar", sugarRating, sugar, sugar === null ? noFigure : high.sugarFree
      ? "0.5 g or less per 100 — FSSAI's condition for \"sugar free\"."
      : high.lowSugar
        ? "Within FSSAI's low-sugar condition: 5 g per 100 g, or 2.5 g per 100 ml for drinks."
        : "Above FSSAI's low-sugar condition. It counts toward your daily sugar."),
    meter("fibre", "Fibre", fibreRating, fibre, fibre === null ? noFigure : high.fibre
      ? "Meets FSSAI's high-fibre condition: 6 g per 100 g, or 3 g per 100 kcal."
      : "Below FSSAI's high-fibre condition of 6 g per 100 g."),
    {
      key: "additives", label: "Additives",
      rating: cleanDeclared ? "None declared" : "Not checked",
      fill: cleanDeclared ? 0.1 : 0, tone: "mid", value: null, unit: "",
      context: cleanDeclared
        ? `${brand} declares no preservatives or artificial additives. KOI hasn't checked the pack yet.`
        : "KOI hasn't checked this product's additives yet.",
    },
  ];

  // ── Comparison: only against a real reference ──
  // A comparison needs a reference food. None is held, so none is drawn — the
  // old "market" figures were the product's own numbers halved or doubled.
  const avg = p.categoryAverage || {};
  const comparison = [["Protein", "high", protein], ["Sugar", "low", sugar], ["Fibre", "high", fibre]]
    .filter(([label, , value]) => value !== null && Number.isFinite(Number(avg[label])))
    .map(([label, better, product]) => ({ label, better, product, market: Number(avg[label]), unit: "g" }));

  // ── Who it suits ──
  // Occasions only, and only where a claim rule backs them. Suitability for a
  // disease or physiological condition is prohibited outright.
  const personasFor = high.protein
    ? [{ label: "Gym & fitness", icon: "Dumbbell" }, { label: "Post-workout", icon: "Flame" }]
    : [];
  const personasNot = [];
  if (carbs !== null && (carbs > 15 || (sugar !== null && sugar > 8))) personasNot.push({ label: "Strict low-carb / keto", icon: "Ban" });
  if (sugar !== null && !high.lowSugar && sugar > THRESHOLDS.sugarHigh) personasNot.push({ label: `Watching sugar: ${sugar} g ${per}`, icon: "Ban" });
  if (ingredients.length) personasNot.push({ label: "Anyone avoiding an ingredient listed above", icon: "Ban" });

  // ── Transparency: who said what ──
  const declaredBy = (cond, what) => (cond
    ? { status: "pass", note: `${brand} declares it ${what}. KOI hasn't checked the pack yet.` }
    : { status: "limited", note: "Not declared, and not checked yet." });
  const transparency = [
    { label: "Ingredient list", ...(ingredientsVerified
      ? { status: "pass", note: "Checked against the pack by KOI." }
      : ingredientsEvidence === "machine_read"
        ? { status: "pass", note: "Read from the pack automatically; two independent readings agreed." }
        : { status: "limited", note: rawIngredients.length ? "Partial — from the brand's submission, not the full pack." : "KOI doesn't hold this product's ingredient list yet." }) },
    { label: "Nutrient claims", status: "pass", note: "Every nutrient claim on this page is tested against FSSAI's conditions on the declared figures." },
    { label: "Palm oil", ...declaredBy(has(tags, "no palm"), "palm-oil free") },
    { label: "Preservatives", ...declaredBy(has(tags, "no preserv"), "free of preservatives") },
    { label: "Artificial colours", ...declaredBy(has(tags, "no artificial colour") || has(tags, "no artificial color") || has(tags, "no artificial additive"), "free of artificial colours") },
    { label: "Third-party testing", ...(has(tags, "lab tested")
      ? { status: "pass", note: `${brand} states it is lab tested.` }
      : { status: "limited", note: "Not independently verified." }) },
  ];

  return {
    id: p.id,
    brand: p.brand,
    name: p.name,
    category,
    price: p.price,
    weight: p.weight,
    score: p.score,
    image: p.image || {},
    // NOT `|| "Verified"`. That defaulted every product with no screening
    // verdict to "KOI Verified", printed over the product image.
    koiStatus: p.koiStatus || null,
    // The reviewer's note when there is one. The fallback was marketing copy
    // ("ingredients your body actually understands") stamped on every product.
    philosophy: p.insight || null,
    tags,
    dietary: p.dietary || [],
    goalTags: p.goalTags || [],
    grade: g,
    raw: p,
    trust: {
      score: p.score,
      scored: g !== null,
      grade: g?.g ?? null,
      gradeLabel: g?.label ?? null,
      attributes,
      subs,
    },
    reasons: [...pros, ...cons],
    verdict: {
      quote: p.verdict?.summary || null,
      confidence: Number.isFinite(Number(p.score)) && p.score !== null ? p.score : null,
      refs: p.koiStatus ? ["KOI screening report"] : [],
    },
    ingredients,
    ingredientsEvidence,
    ingredientTimeline: [],
    nutrition: { meters, calories: kcal, carbs, fat, basisLabel: per, serving: p.servingSize || null },
    comparison,
    personas: { for: personasFor, not: personasNot.slice(0, 3) },
    usage: [],
    pairings: [],
    science: [],
    transparency,
    community: { notes: [], nutritionist: null },
  };
}
