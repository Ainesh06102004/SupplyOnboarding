// ============================================================================
// KOI — What's in a serving
//
// Phase 5.2, the nutrition panel as agreed on 16 September 2026 (plan §11.1).
// Pure. The founder's note was that a red "high sugar" bar kills the sale; it
// is also imprecise, saying "this food is bad" where the truth is narrower.
// So this panel keeps every figure and drops the verdict:
//
//   1. The portion leads. A realistic serving — the pack's own, or the
//      category's reference amount when the pack's is implausible or absent
//      (food.portion_norm, 21 CFR 101.12) — then per 100 beside it.
//   2. No traffic lights, no High/Low words. The one accent is for what KOI
//      checked: a nutrient claim that passes FSSAI's conditions on the
//      declared figures.
//   3. A line that frames the food by what it is for ("Sweets are a treat").
//   4. The shopper's goal decides what comes first, in a plain line ("Your
//      goal, Fat loss, watches sugar. A 30 g serving has about 13 g."). With no
//      goal, the figures run in the label's own order.
//   5. Plain section words; see ProductStory.jsx.
//
// The floor: every declared figure appears, undeclared ones are named as not
// declared, allergens are never softened (they are not in this panel at all),
// and no claim is made that the figures do not support.
// ============================================================================

import { toPer100, parseAmount } from "./basis";
import { isHighProtein, isHighFibre, isLowSugar, isSugarFree } from "./claims";
import { GOAL_PROFILES } from "@/lib/recommendation/config";

/** The label's order, and how each figure is said. */
export const PANEL_FIELDS = Object.freeze([
  { key: "energy_kcal", label: "Energy", word: "energy", unit: "kcal", core: true },
  { key: "protein_g", label: "Protein", word: "protein", unit: "g", core: true },
  { key: "carbs_g", label: "Carbohydrate", word: "carbohydrate", unit: "g", core: true },
  { key: "sugars_g", label: "of which sugars", word: "sugar", unit: "g", core: true },
  { key: "added_sugar_g", label: "Added sugar", word: "added sugar", unit: "g" },
  { key: "total_fat_g", label: "Fat", word: "fat", unit: "g", core: true },
  { key: "saturated_fat_g", label: "of which saturated", word: "saturated fat", unit: "g" },
  { key: "trans_fat_g", label: "Trans fat", word: "trans fat", unit: "g" },
  { key: "fibre_g", label: "Fibre", word: "fibre", unit: "g", core: true },
  { key: "sodium_mg", label: "Sodium", word: "sodium", unit: "mg" },
]);

/** GOAL_PROFILES metric → panel field. */
const METRIC_FIELD = Object.freeze({ protein: "protein_g", fibre: "fibre_g", kcal: "energy_kcal", sugar: "sugars_g", fat: "total_fat_g" });
/** Avoid keys that are about a figure on the panel. */
const AVOID_FIELD = Object.freeze({ refined_sugar: "sugars_g", high_sodium: "sodium_mg" });

const fig = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);

/**
 * The serving the panel leads with, or null when KOI cannot measure one.
 *
 * The pack's declared serving, unless it is more than the category's plausible
 * maximum (the "100 g of almonds" case) or in another unit; then the
 * category's reference amount, which also covers a pack that declares none.
 *
 * @param {object} row a nutrition row (sku_nutrition shape)
 * @param {{amount, unit, max, measure}|null} portion the category's reference portion
 * @returns {{ amount: number, unit: string, source: "pack"|"reference", measure: string|null }|null}
 */
export function realisticServing(row, portion) {
  const per100 = toPer100(row);
  if (!per100.unit) return null;
  const declared = parseAmount(row?.serving_size);
  const plausible = !portion || portion.unit !== per100.unit || !Number.isFinite(Number(portion.max)) || declared?.value <= portion.max;
  if (declared && declared.unit === per100.unit && declared.value > 0 && plausible) {
    return { amount: declared.value, unit: declared.unit, source: "pack", measure: null };
  }
  if (portion && portion.unit === per100.unit && Number(portion.amount) > 0) {
    return { amount: Number(portion.amount), unit: portion.unit, source: "reference", measure: portion.measure ?? null };
  }
  return null;
}

/** "a 30 g serving", "1 tbsp (21 g)", "a 45 g portion". */
export function servingPhrase(serving) {
  if (!serving) return null;
  if (serving.source === "pack") return `a ${serving.amount} ${serving.unit} serving`;
  if (serving.measure) return `${serving.measure} (${serving.amount} ${serving.unit})`;
  return `a ${serving.amount} ${serving.unit} portion`;
}

const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** What a kind of food is for, in words that describe rather than judge. */
const FRAMES = Object.freeze({
  sweet: { opener: "Sweets are a treat", field: "sugars_g" },
  snack: { opener: "A snack between meals", field: "energy_kcal" },
  drink: { opener: "A drink", field: "sugars_g" },
  meal_base: { opener: "An everyday staple", field: "protein_g" },
  spread: { opener: "A spread, used a spoonful at a time", field: "energy_kcal" },
  cooking: { opener: "Used a little at a time in cooking", field: "energy_kcal" },
});

/**
 * @param {object} input
 * @param {object} input.row nutrition row
 * @param {object|null} [input.portion] category reference portion
 * @param {string|null} [input.role] the category's meal role (taxonomy)
 * @param {string|null} [input.goal] the shopper's goal key (GOAL_PROFILES)
 * @param {string[]} [input.avoidKeys] the shopper's avoid keys
 * @returns {{ serving, servingPhrase, basisLabel, rows, notDeclared, frame, focus }}
 */
export function servingPanel({ row, portion = null, role = null, goal = null, avoidKeys = [] }) {
  const per100 = toPer100(row);
  const basisLabel = per100.unit ? `per 100 ${per100.unit}` : null;
  const serving = realisticServing(row, portion);
  const phrase = servingPhrase(serving);
  const scale = serving ? serving.amount / 100 : null;

  // One accent: only what KOI checked against a rule.
  const checked = {
    protein_g: isHighProtein(row) ? "High protein on KOI's rule" : null,
    fibre_g: isHighFibre(row) ? "High fibre, meets FSSAI's condition" : null,
    sugars_g: isSugarFree(row) ? "Sugar free, meets FSSAI's condition" : isLowSugar(row) ? "Low sugar, meets FSSAI's condition" : null,
  };

  // What the shopper's goal or avoid list asks about, in their order.
  const profile = GOAL_PROFILES[goal];
  const wanted = [
    ...Object.entries(profile?.metrics ?? {})
      .filter(([, direction]) => direction === "low" || direction === "high")
      .map(([metric, direction]) => ({ key: METRIC_FIELD[metric], direction, because: "goal" })),
    ...(avoidKeys ?? []).filter((k) => AVOID_FIELD[k]).map((k) => ({ key: AVOID_FIELD[k], direction: "low", because: "avoid", avoidKey: k })),
  ].filter((w, i, all) => w.key && all.findIndex((x) => x.key === w.key) === i);

  const declared = PANEL_FIELDS.filter((f) => fig(per100[f.key]) !== null);
  const rows = declared.map((f) => ({
    key: f.key,
    label: f.label,
    unit: f.unit,
    per100: fig(per100[f.key]),
    perServing: scale === null ? null : fig(per100[f.key] * scale),
    checked: checked[f.key] ?? null,
    focus: wanted.some((w) => w.key === f.key),
  }));
  const rank = (r) => { const i = wanted.findIndex((w) => w.key === r.key); return i === -1 ? wanted.length : i; };
  rows.sort((a, b) => rank(a) - rank(b));

  const amountOf = (key) => {
    const r = rows.find((x) => x.key === key);
    if (!r) return null;
    return r.perServing !== null && phrase ? `about ${r.perServing} ${r.unit} in ${phrase}` : `${r.per100} ${r.unit} ${basisLabel}`;
  };

  const frameDef = FRAMES[role];
  const frameField = frameDef ? PANEL_FIELDS.find((f) => f.key === frameDef.field) : null;
  const frameRow = frameField ? rows.find((r) => r.key === frameField.key) : null;
  const frame = frameDef && frameRow
    ? `${frameDef.opener} — this one is ${frameRow.per100} ${frameRow.unit} ${frameField.word === "energy" ? "" : `${frameField.word} `}${basisLabel}${frameRow.perServing !== null && phrase ? `, ${frameRow.perServing} ${frameRow.unit} in ${phrase}` : ""}.`.replace(/\s+/g, " ")
    : null;

  const first = wanted.find((w) => rows.some((r) => r.key === w.key));
  let focus = null;
  if (first) {
    const field = PANEL_FIELDS.find((f) => f.key === first.key);
    const how = amountOf(first.key);
    focus = first.because === "avoid"
      ? `You avoid ${first.avoidKey.replace(/_/g, " ")}. This has ${how}.`
      : `Your goal, ${profile.label}, ${first.direction === "low" ? "watches" : "looks for"} ${field.word}. This has ${how}.`;
    focus = capitalise(focus);
  }

  return {
    serving,
    servingPhrase: phrase,
    basisLabel,
    rows,
    notDeclared: PANEL_FIELDS.filter((f) => f.core && fig(per100[f.key]) === null).map((f) => f.word),
    frame,
    focus,
  };
}
