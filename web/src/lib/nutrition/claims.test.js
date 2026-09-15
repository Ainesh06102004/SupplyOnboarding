// ============================================================================
// Nutrient claims — tests against FSSAI Schedule I
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  isHighFibre, isLowSugar, isSugarFree, isHighProtein, guardClaims, isClaimSafeText,
  CLAIM_RULES, CLAIM_RULE_VERSION, SCHEDULE_I, claimHolds,
} from "@/lib/nutrition/claims.js";
import { THRESHOLDS } from "@/lib/recommendation/config.js";

const solid = (over) => ({ measurement_basis: "per_100g", ...over });
const liquid = (over) => ({ measurement_basis: "per_100ml", ...over });

test("the claim rules are data, and every copy of their figures agrees", () => {
  assert.match(CLAIM_RULE_VERSION, /^claims-v\d+$/);
  const protein = CLAIM_RULES.high_protein.flat();
  assert.equal(protein.find((c) => c.basis === "per_100").threshold, THRESHOLDS.proteinHigh);
  assert.equal(protein.find((c) => c.basis !== "per_100").threshold, THRESHOLDS.proteinPerServingFloor);
  assert.equal(SCHEDULE_I.highFibre.per100g, THRESHOLDS.fibreHigh);
  assert.equal(SCHEDULE_I.lowSugar.solid, THRESHOLDS.sugarLow);
  assert.deepEqual(
    JSON.parse(JSON.stringify(SCHEDULE_I)),
    { highFibre: { per100g: 6, per100kcal: 3 }, lowSugar: { solid: 5, liquid: 2.5 }, sugarFree: 0.5 },
  );
  assert.equal(claimHolds("no_such_claim", solid({ protein_g: 90 })), false);
});

test("high fibre is 6 g per 100 g, not KOI's old 5", () => {
  assert.equal(isHighFibre(solid({ fibre_g: 6 })), true);
  assert.equal(isHighFibre(solid({ fibre_g: 5.9 })), false);
  assert.equal(isHighFibre(solid({ fibre_g: 5 })), false);
});

test("high fibre's per-100-kcal route works for solids and liquids alike", () => {
  // 2 g in 60 kcal is 3.3 g per 100 kcal.
  assert.equal(isHighFibre(solid({ fibre_g: 2, energy_kcal: 60 })), true);
  assert.equal(isHighFibre(liquid({ fibre_g: 1, energy_kcal: 30 })), true);
  assert.equal(isHighFibre(liquid({ fibre_g: 1, energy_kcal: 40 })), false);
});

test("low sugar is 5 g per 100 g for a solid and 2.5 g per 100 ml for a drink", () => {
  assert.equal(isLowSugar(solid({ sugars_g: 5 })), true);
  assert.equal(isLowSugar(solid({ sugars_g: 5.1 })), false);
  assert.equal(isLowSugar(liquid({ sugars_g: 2.5 })), true);
  assert.equal(isLowSugar(liquid({ sugars_g: 4 })), false, "a drink at 4 g is not low in sugar");
});

test("a per-serving figure is converted before it is judged", () => {
  // 2 g in a 50 g serving is 4 g per 100 g.
  assert.equal(isLowSugar({ measurement_basis: "per_serving", serving_size: "50g", sugars_g: 2 }), true);
  assert.equal(isLowSugar({ measurement_basis: "per_serving", serving_size: "1 pack", sugars_g: 2 }), false);
});

test("no basis or no figure is no claim", () => {
  assert.equal(isLowSugar({ sugars_g: 1 }), false);
  assert.equal(isLowSugar(solid({})), false);
  assert.equal(isHighFibre({ fibre_g: 9 }), false);
  assert.equal(isSugarFree(solid({ sugars_g: null })), false);
});

test("sugar free is 0.5 g", () => {
  assert.equal(isSugarFree(solid({ sugars_g: 0.5 })), true);
  assert.equal(isSugarFree(liquid({ sugars_g: 0.6 })), false);
});

test("high protein needs density AND a real serving — the saffron case", () => {
  assert.equal(isHighProtein(solid({ protein_g: 11.4, serving_size: "0.1g" })), false);
  assert.equal(isHighProtein(solid({ protein_g: 20, serving_size: "30g" })), true);
  assert.equal(isHighProtein(solid({ protein_g: 20, serving_size: "20g" })), false, "4 g a serving");
  assert.equal(isHighProtein(solid({ protein_g: 20 })), false, "no serving, no claim");
});

test("the protein floor is judged on a realistic serving, never a larger one than declared", () => {
  const nuts = { amount: 30, unit: "g", max: 60, measure: null };
  // 12.5 g per 100 g and a declared 100 g serving: 12.5 g "per serving" on a
  // third of the pack. At the 30 g reference for nuts it is 3.75 g.
  assert.equal(isHighProtein(solid({ protein_g: 12.5, serving_size: "100g", portion_reference: nuts })), false);
  assert.equal(isHighProtein(solid({ protein_g: 17, serving_size: "100g", portion_reference: nuts })), true, "5.1 g in 30 g");
  // A declared serving within the plausible maximum is used as declared.
  assert.equal(isHighProtein(solid({ protein_g: 20, serving_size: "40g", portion_reference: nuts })), true);
  // A declared serving smaller than the reference is never scaled up.
  assert.equal(isHighProtein(solid({ protein_g: 20, serving_size: "20g", portion_reference: nuts })), false);
  // No reference portion, or a unit that differs: the declared serving.
  assert.equal(isHighProtein(solid({ protein_g: 12.5, serving_size: "100g" })), true);
  assert.equal(isHighProtein(solid({ protein_g: 12.5, serving_size: "100g", portion_reference: { amount: 240, unit: "ml", max: 480 } })), true);
});

test("prohibited wording is dropped from brand claims", () => {
  const kept = guardClaims(
    ["Immunity Booster", "Diabetes Friendly", "Healthy snack", "Doctor recommended", "No Palm Oil", "Vegan"],
    solid({}),
  );
  assert.deepEqual(kept, ["No Palm Oil", "Vegan"]);
});

test("a brand's nutrient claim survives only if its own figures pass", () => {
  const row = solid({ protein_g: 9, fibre_g: 5, sugars_g: 3, serving_size: "30g" });
  assert.deepEqual(guardClaims(["High protein", "High Fibre", "Low sugar", "No maida"], row), ["Low sugar", "No maida"]);
});

test("reviewer notes answer to the same rule", () => {
  assert.equal(isClaimSafeText("Potent anti-inflammatory mix. Exceptional ingredient purity."), false);
  assert.equal(isClaimSafeText("Traditional recipe, no palm oil, clean ingredients."), true);
  assert.equal(isClaimSafeText(null), true);
});
