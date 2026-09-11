// ============================================================================
// Nutrient claims — tests against FSSAI Schedule I
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  isHighFibre, isLowSugar, isSugarFree, isHighProtein, guardClaims, isClaimSafeText,
} from "@/lib/nutrition/claims.js";

const solid = (over) => ({ measurement_basis: "per_100g", ...over });
const liquid = (over) => ({ measurement_basis: "per_100ml", ...over });

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
