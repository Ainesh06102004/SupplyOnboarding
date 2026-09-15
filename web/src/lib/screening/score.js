// ============================================================================
// KOI SCREENING — The KOI score, computed from the data
//
// Phase 1.2. The KOI score used to be a number someone typed into seven
// screening reports; the other eleven products had none and so could not be
// searched or recommended. This computes it, for every product, from what KOI
// actually holds, following the layers in docs/brand_onboarding_documentation.md:
//
//   ingredients  the full printed list, matched to food.ingredients_master
//                (names, aliases, INS/E codes) and its risk levels
//   nutrition    the declared figures per 100, against thresholds for foods
//                and for drinks
//   claims       the brand's own claims, checked against its figures and the
//                claims regulations (lib/nutrition/claims.js) — a PENALTY for
//                each one KOI would not repeat, never a bonus
//   processing   NULL until Phase 2 adds NOVA groups — not guessed
//
// RULES THAT KEEP IT HONEST
//   - Nothing is scored from nothing. No nutrition panel, or no sugars or fat
//     figure, means no score: the product stays unscored rather than getting a
//     plausible number.
//   - An undeclared saturated fat or sodium figure costs the medium penalty.
//     Absence is not a clean result.
//   - Without a full ingredient list (verified or machine-read), the score is
//     capped at NO_LIST_CAP. A product must not score better for hiding its
//     ingredients than one that shows them.
//   - Claims only subtract. Rubric v1 averaged a claims score in, so a fried
//     namkeen whose claims were all true ("No palm oil", "Vegan") scored 100
//     on claims and was lifted from 44 to 61. Telling the truth about a food
//     is the minimum, not a quality of the food.
//   - A blocked ingredient makes the score 0 and the verdict `rejected`.
//   - Every point is recorded in `scoring`, so a score can be explained line
//     by line, and RUBRIC_VERSION says which rules produced it.
//
// KNOWN LIMIT: sugar is judged by the figure, not its source, so dates and
// honey score like sweets. The processing layer (NOVA, Phase 2) is what tells
// a whole food from a formulated one.
//
// `risk_level` in ingredients_master is an editorial position (see its seed
// file); the ingredient layer is weighted below nutrition for that reason.
//
// Pure.
// ============================================================================

import { toPer100 } from "@/lib/nutrition/basis";
import { THRESHOLDS } from "@/lib/recommendation/config";
import { isHighProtein, isHighFibre, guardClaims } from "@/lib/nutrition/claims";

export const RUBRIC_VERSION = "koi-screen-v2";

export const WEIGHTS = Object.freeze({ ingredients: 0.35, nutrition: 0.45 });
export const CLAIM_PENALTY = Object.freeze({ each: 10, max: 30 });
export const NO_LIST_CAP = 75;
// Verdict bands from the onboarding documentation.
export const BANDS = Object.freeze({ eligible: 80, review: 60 });

// Per 100 g (solids) or per 100 ml (drinks): [low at or below, high above].
// Sodium, saturated fat and fat follow the UK front-of-pack traffic-light
// bands; sugars use KOI's own stricter limit from the onboarding documentation
// (10 g per 100 g for foods), halved for drinks as those bands are.
export const LIMITS = Object.freeze({
  solid: Object.freeze({ sugars_g: [5, 10], saturated_fat_g: [1.5, 5], sodium_mg: [120, 600], total_fat_g: [3, 17.5] }),
  liquid: Object.freeze({ sugars_g: [2.5, 5], saturated_fat_g: [0.75, 2.5], sodium_mg: [120, 300], total_fat_g: [1.5, 8.75] }),
});
// [medium, high] penalty for each.
const PENALTY = Object.freeze({ sugars_g: [15, 30], saturated_fat_g: [10, 20], sodium_mg: [10, 20], total_fat_g: [5, 10] });
const REQUIRED = Object.freeze(["sugars_g", "total_fat_g"]);
const BASE = 70;
const BONUS = Object.freeze({ proteinHigh: 15, proteinSource: 7, fibreHigh: 15, fibreSource: 7 });
const FIBRE_SOURCE_PER_100G = 3; // FSSAI Schedule I "source of fibre"

const RISK_PENALTY = Object.freeze({ safe: 0, caution: 5, risky: 15 });
const CAUTION_CAP = 30;

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const clamp = (v) => Math.max(0, Math.min(100, v));
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {object} row a `sku_nutrition` row
 * @returns {{ score: number|null, reason?: string, form?: string, parts: Array }}
 */
export function nutritionScore(row) {
  if (!row) return { score: null, reason: "No nutrition panel.", parts: [] };
  const p = toPer100(row);
  if (!p.unit) return { score: null, reason: "No basis that converts per 100.", parts: [] };
  const missing = REQUIRED.filter((f) => !isNum(p[f]));
  if (missing.length) return { score: null, reason: `Not declared: ${missing.join(", ")}.`, parts: [] };

  const form = p.unit === "ml" ? "liquid" : "solid";
  const parts = [];
  let score = BASE;
  for (const [field, [low, high]] of Object.entries(LIMITS[form])) {
    const [medium, severe] = PENALTY[field];
    if (!isNum(p[field])) {
      score -= medium;
      parts.push({ field, value: null, band: "undeclared", points: -medium });
      continue;
    }
    const v = Number(p[field]);
    const band = v <= low ? "low" : v <= high ? "medium" : "high";
    const points = band === "low" ? 0 : band === "medium" ? -medium : -severe;
    score += points;
    parts.push({ field, value: r1(v), band, points });
  }

  if (isHighProtein(row)) { score += BONUS.proteinHigh; parts.push({ field: "protein_g", band: "high", points: BONUS.proteinHigh }); }
  else if (isNum(p.protein_g) && Number(p.protein_g) >= THRESHOLDS.proteinMin) { score += BONUS.proteinSource; parts.push({ field: "protein_g", band: "source", points: BONUS.proteinSource }); }

  if (isHighFibre(row)) { score += BONUS.fibreHigh; parts.push({ field: "fibre_g", band: "high", points: BONUS.fibreHigh }); }
  else if (form === "solid" && isNum(p.fibre_g) && Number(p.fibre_g) >= FIBRE_SOURCE_PER_100G) { score += BONUS.fibreSource; parts.push({ field: "fibre_g", band: "source", points: BONUS.fibreSource }); }

  return { score: clamp(Math.round(score)), form, parts };
}

// ── Ingredients ─────────────────────────────────────────────────────────────

/**
 * "Emulsifier INS 170 (i)" -> " emulsifier ins170 "; "E551" -> " ins551 ";
 * "Roasted Peanuts" -> " roasted peanut ". Labels print plurals and the master
 * table holds singulars, so a trailing "s" is dropped from every word on both
 * sides — the same rule applied to both is what makes them meet.
 */
export function normaliseName(name) {
  const s = String(name ?? "").toLowerCase()
    .replace(/\b(?:ins|e)\s*-?\s*(\d{3,4})[a-z]?\s*(?:\(\s*[ivx]+\s*\))?/g, " ins$1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  return ` ${s} `;
}

/**
 * Every name and alias in ingredients_master, longest first, so "refined
 * wheat flour" is tried before "wheat flour".
 * @param {Array<{canonical_name, aliases, ingredient_category, risk_level, is_blocked}>} rows
 */
export function buildMasterIndex(rows = []) {
  const entries = [];
  for (const row of rows) {
    const names = [row.canonical_name, ...(Array.isArray(row.aliases) ? row.aliases : [])];
    for (const name of new Set(names.map((n) => normaliseName(n).trim()).filter(Boolean))) {
      entries.push({ alias: name, canonical: row.canonical_name, category: row.ingredient_category, risk: row.is_blocked ? "blocked" : row.risk_level });
    }
  }
  return entries.sort((a, b) => b.alias.length - a.alias.length);
}

/** The master entry an ingredient names, or null. Whole words only. */
export function matchIngredient(name, index) {
  const n = normaliseName(name);
  return index.find((e) => n.includes(` ${e.alias} `)) || null;
}

/**
 * @param {Array<{name: string}>} parsed the full printed list
 * @param {Array} index buildMasterIndex()
 */
export function ingredientScore(parsed, index) {
  const matched = [];
  const unmatched = [];
  const blocked = [];
  let caution = 0;
  let risky = 0;
  for (const item of parsed) {
    const name = item?.name ?? item;
    const m = matchIngredient(name, index);
    if (!m) { unmatched.push(name); continue; }
    matched.push({ ingredient: name, canonical: m.canonical, risk: m.risk, category: m.category });
    // An allergen is a fact to warn about, not a mark against the food.
    if (m.category === "allergen") continue;
    if (m.risk === "blocked") blocked.push(m.canonical);
    else if (m.risk === "risky") risky += 1;
    else if (m.risk === "caution") caution += 1;
  }
  const score = blocked.length
    ? 0
    : clamp(100 - Math.min(CAUTION_CAP, caution * RISK_PENALTY.caution) - risky * RISK_PENALTY.risky);
  return { score, matched, unmatched, blocked, caution, risky };
}

// ── Claims ──────────────────────────────────────────────────────────────────

/**
 * Brand claims KOI would not repeat — prohibited wording, or figures that do
 * not support them — and the points they cost. Honest claims cost nothing and
 * earn nothing.
 */
export function claimScore(claims, row) {
  const list = Array.isArray(claims) ? claims.filter((c) => typeof c === "string") : [];
  if (!list.length) return { penalty: 0, dropped: [] };
  const kept = guardClaims(list, row);
  const dropped = list.filter((c) => !kept.includes(c));
  return { penalty: Math.min(CLAIM_PENALTY.max, CLAIM_PENALTY.each * dropped.length), dropped };
}

// ── The report ──────────────────────────────────────────────────────────────

const FULL_LIST = ["verified", "machine_read"];

/**
 * @param {{ nutrition: object|null, label: { evidence, parsed }|null, claims: string[], index: Array }} input
 * @returns {{ ingredient_score, nutrition_score, processing_score, final_score, verdict, scoring }}
 */
export function screen({ nutrition, label, claims, index }) {
  const n = nutritionScore(nutrition);
  const hasList = Boolean(label && FULL_LIST.includes(label.evidence) && Array.isArray(label.parsed) && label.parsed.length);
  const ing = hasList ? ingredientScore(label.parsed, index) : { score: null, reason: "No full ingredient list has been read yet." };
  const c = claimScore(claims, nutrition);

  let final = null;
  let capped = false;
  if (n.score !== null) {
    const parts = [[ing.score, WEIGHTS.ingredients], [n.score, WEIGHTS.nutrition]].filter(([s]) => s !== null);
    const weight = parts.reduce((sum, [, w]) => sum + w, 0);
    let base = parts.reduce((sum, [s, w]) => sum + s * w, 0) / weight;
    if (!hasList && base > NO_LIST_CAP) { base = NO_LIST_CAP; capped = true; }
    final = ing.blocked?.length ? 0 : Math.round(clamp(base - c.penalty));
  }

  const verdict = ing.blocked?.length ? "rejected"
    : final === null ? "review"
    : final >= BANDS.eligible ? "eligible"
    : final >= BANDS.review ? "review" : "rejected";

  return {
    ingredient_score: ing.score,
    nutrition_score: n.score,
    processing_score: null,
    final_score: final,
    verdict,
    scoring: {
      rubric_version: RUBRIC_VERSION,
      weights: WEIGHTS,
      capped_without_ingredient_list: capped,
      evidence: { nutrition: nutrition?.evidence ?? nutrition?.source ?? null, ingredients: label?.evidence ?? null },
      nutrition: n,
      ingredients: ing,
      claims: c,
      processing: "Not scored until NOVA groups exist (Phase 2).",
    },
  };
}
