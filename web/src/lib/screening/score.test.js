// ============================================================================
// KOI SCREENING — tests for the computed KOI score
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  nutritionScore, ingredientScore, claimScore, screen, buildMasterIndex, matchIngredient, normaliseName,
  NO_LIST_CAP,
} from "@/lib/screening/score.js";

const per100 = (values, over = {}) => ({ measurement_basis: "per_100g", serving_size: "30g", ...values, ...over });

const MADRAS = per100({ energy_kcal: 560, protein_g: 10.4, carbs_g: 50, sugars_g: 0, fibre_g: 4, total_fat_g: 35, saturated_fat_g: 8.6, sodium_mg: 453.7 }, { serving_size: "20g" });
const ALMONDS = per100({ energy_kcal: 579, protein_g: 21, carbs_g: 22, sugars_g: 4, fibre_g: 12.5, total_fat_g: 50, saturated_fat_g: 3.8, sodium_mg: 1 });
const HONEY = per100({ energy_kcal: 304, protein_g: 0.3, carbs_g: 82, sugars_g: 82, fibre_g: 0, total_fat_g: 0, saturated_fat_g: 0, sodium_mg: 4 });

const MASTER = buildMasterIndex([
  { canonical_name: "Calcium Carbonate", aliases: ["INS 170", "E170"], ingredient_category: "anticaking", risk_level: "safe", is_blocked: false },
  { canonical_name: "Monosodium Glutamate", aliases: ["INS 621", "E621", "MSG"], ingredient_category: "flavour_enhancer", risk_level: "caution", is_blocked: false },
  { canonical_name: "Refined Wheat Flour", aliases: ["maida", "refined wheat flour"], ingredient_category: "refined_carb", risk_level: "caution", is_blocked: false },
  { canonical_name: "Whole Wheat", aliases: ["wheat flour", "atta"], ingredient_category: "whole_food", risk_level: "safe", is_blocked: false },
  { canonical_name: "Butylated Hydroxyanisole", aliases: ["INS 320", "BHA"], ingredient_category: "antioxidant", risk_level: "risky", is_blocked: false },
  { canonical_name: "Potassium Bromate", aliases: ["INS 924"], ingredient_category: "flour_treatment", risk_level: "blocked", is_blocked: true },
  { canonical_name: "Peanut", aliases: ["peanut", "groundnut"], ingredient_category: "allergen", risk_level: "caution", is_blocked: false },
]);

// ── Nutrition ──────────────────────────────────────────────────────────────

test("Madras Mixture: high fat and saturated fat, medium sodium, some protein and fibre", () => {
  // 70 - 10 (fat high) - 20 (sat high) - 10 (sodium medium) + 7 (protein source) + 7 (fibre source)
  assert.equal(nutritionScore(MADRAS).score, 44);
});

test("almonds: fat costs points, high protein and fibre earn them back", () => {
  // 70 - 10 (fat high) - 10 (sat medium) + 15 + 15
  assert.equal(nutritionScore(ALMONDS).score, 80);
});

test("honey: the sugar is the score", () => {
  assert.equal(nutritionScore(HONEY).score, 40);
});

test("no sugars or fat figure means no score, not a good one", () => {
  const { score, reason } = nutritionScore(per100({ energy_kcal: 300, protein_g: 5 }));
  assert.equal(score, null);
  assert.match(reason, /sugars_g/);
  assert.equal(nutritionScore(null).score, null);
});

test("an undeclared sodium or saturated fat figure costs the medium penalty", () => {
  const declared = nutritionScore(per100({ sugars_g: 2, total_fat_g: 2, saturated_fat_g: 0.5, sodium_mg: 50 })).score;
  const silent = nutritionScore(per100({ sugars_g: 2, total_fat_g: 2 })).score;
  assert.equal(declared - silent, 20);
});

test("drinks are held to drink thresholds", () => {
  const drink = { measurement_basis: "per_100ml", serving_size: "200ml", sugars_g: 4, total_fat_g: 1, saturated_fat_g: 0.5, sodium_mg: 40 };
  assert.equal(nutritionScore(drink).form, "liquid");
  assert.equal(nutritionScore(drink).parts.find((p) => p.field === "sugars_g").band, "medium", "4 g per 100 ml is not low for a drink");
});

// ── Ingredients ────────────────────────────────────────────────────────────

test("INS and E codes normalise to one form", () => {
  assert.equal(normaliseName("Emulsifier INS 170 (i)").includes(" ins170 "), true);
  assert.equal(normaliseName("E551"), " ins551 ");
  assert.equal(matchIngredient("Flavour enhancer (E621)", MASTER).canonical, "Monosodium Glutamate");
});

test("the longest name wins: refined wheat flour is not whole wheat", () => {
  assert.equal(matchIngredient("Refined Wheat Flour (Maida)", MASTER).canonical, "Refined Wheat Flour");
  assert.equal(matchIngredient("Wheat flour", MASTER).canonical, "Whole Wheat");
});

test("caution and risky ingredients cost points; allergens and unknowns do not", () => {
  const r = ingredientScore([{ name: "Wheat flour" }, { name: "MSG" }, { name: "BHA" }, { name: "Peanuts" }, { name: "Curry leaves" }], MASTER);
  assert.equal(r.score, 80); // 100 - 5 - 15
  assert.deepEqual(r.unmatched, ["Curry leaves"]);
});

test("a blocked ingredient scores zero and rejects the product", () => {
  const report = screen({ nutrition: ALMONDS, label: { evidence: "machine_read", parsed: [{ name: "Flour treated with INS 924" }] }, claims: [], index: MASTER });
  assert.equal(report.ingredient_score, 0);
  assert.equal(report.final_score, 0);
  assert.equal(report.verdict, "rejected");
});

// ── Claims and the report ──────────────────────────────────────────────────

test("claims the figures or the rules do not support cost points", () => {
  const c = claimScore(["High protein", "Immunity Booster", "No palm oil"], HONEY);
  assert.deepEqual(c.dropped, ["High protein", "Immunity Booster"]);
  assert.equal(c.penalty, 20);
  assert.equal(claimScore([], HONEY).penalty, 0);
});

test("honest claims do not lift a poor score; dishonest ones lower it", () => {
  // Rubric v1 averaged claims in and lifted Madras Mixture from 44 to 61.
  const honest = screen({ nutrition: MADRAS, label: null, claims: ["No Palm Oil", "Vegan"], index: MASTER });
  assert.equal(honest.final_score, 44);
  assert.equal(honest.verdict, "rejected");
  const dishonest = screen({ nutrition: MADRAS, label: null, claims: ["Immunity Booster", "Vegan"], index: MASTER });
  assert.equal(dishonest.final_score, 34);
});

test("without a full ingredient list the score is capped", () => {
  const report = screen({ nutrition: ALMONDS, label: null, claims: ["No preservatives"], index: MASTER });
  assert.equal(report.ingredient_score, null);
  assert.equal(report.final_score, NO_LIST_CAP);
  assert.equal(report.scoring.capped_without_ingredient_list, true);
  assert.equal(report.verdict, "review");
});

test("a partial list does not count as a full one", () => {
  const report = screen({ nutrition: ALMONDS, label: { evidence: "partial", parsed: [{ name: "Almonds" }] }, claims: [], index: MASTER });
  assert.equal(report.ingredient_score, null);
});

test("a full list and clean figures can reach eligible, and every part is recorded", () => {
  const report = screen({ nutrition: ALMONDS, label: { evidence: "machine_read", parsed: [{ name: "Almond kernels" }] }, claims: [], index: MASTER });
  // ingredients 100 x .35 + nutrition 80 x .45 + processing (NOVA 1) 100 x .20 = 91
  assert.equal(report.final_score, 91);
  assert.equal(report.verdict, "eligible");
  assert.equal(report.processing_score, 100);
  assert.equal(report.scoring.processing.nova_group, 1);
  assert.equal(report.scoring.rubric_version, "koi-screen-v3");
});

test("an ultra-processed list costs the processing part, and says why", () => {
  const plain = screen({ nutrition: ALMONDS, label: { evidence: "machine_read", parsed: [{ name: "Almond kernels" }] }, claims: [], index: MASTER });
  const flavoured = screen({
    nutrition: ALMONDS,
    label: { evidence: "machine_read", text: "Almond kernels, Salt, Natural and Nature Identical Flavouring Substances", parsed: [{ name: "Almond kernels" }, { name: "Salt" }, { name: "Natural and Nature Identical Flavouring Substances" }] },
    claims: [],
    index: MASTER,
  });
  assert.equal(flavoured.processing_score, 30);
  assert.equal(flavoured.scoring.processing.nova_group, 4);
  assert.deepEqual(flavoured.scoring.processing.markers, ["nature identical flavouring substance"]);
  assert.ok(flavoured.final_score < plain.final_score);
});

test("without a complete list there is no processing score, not a guessed one", () => {
  const report = screen({ nutrition: ALMONDS, label: null, claims: [], index: MASTER });
  assert.equal(report.processing_score, null);
  assert.match(report.scoring.processing, /complete ingredient list/);
});

test("no nutrition panel means no score and a review verdict", () => {
  const report = screen({ nutrition: null, label: null, claims: [], index: MASTER });
  assert.equal(report.final_score, null);
  assert.equal(report.verdict, "review");
});
