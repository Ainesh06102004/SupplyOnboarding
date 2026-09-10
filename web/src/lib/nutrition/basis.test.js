// ============================================================================
// KOI — Measurement basis · tests
// Run with `npm test` (node --test plus the alias hooks in scripts/).
//
// The fixtures below are real rows from the live catalogue, not invented ones,
// because the bug this module exists to fix was a real badge on a real product:
// saffron declared 11.4 g protein per 100 g and a 0.1 g serving, and the
// storefront called it High Protein. The regression cases at the bottom are the
// ones that matter — the parsing cases only matter because they feed those.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAmount, toPer100, toPerServing, servingsPerPack,
} from "@/lib/nutrition/basis.js";
import { THRESHOLDS } from "@/lib/recommendation/config.js";

// ── Fixtures: live rows, 10 Sep 2026 ────────────────────────────────────────

const SAFFRON = {
  measurement_basis: "per_100g",
  serving_size: "0.1g",
  protein_g: 11.4,
  energy_kcal: 310,
};

const ALMONDS = {
  measurement_basis: "per_100g",
  serving_size: "30g",
  protein_g: 21.1,
};

const CHIVDA = {
  measurement_basis: "per_serving",
  serving_size: "30g",
  energy_kcal: 139,
  protein_g: 2.5,
  sugars_g: 1.3,
};

/** Close-enough for floating point, with a message that names the figure. */
const near = (actual, expected, what) =>
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${what}: expected ~${expected}, got ${actual}`,
  );

// ── parseAmount ─────────────────────────────────────────────────────────────

test("parseAmount reads the serving formats the catalogue actually uses", () => {
  assert.deepEqual(parseAmount("40g"), { value: 40, unit: "g" });
  assert.deepEqual(parseAmount("0.1g"), { value: 0.1, unit: "g" });
  assert.deepEqual(parseAmount("30 g"), { value: 30, unit: "g" });
  assert.deepEqual(parseAmount("1kg"), { value: 1000, unit: "g" });
  assert.deepEqual(parseAmount("200ml"), { value: 200, unit: "ml" });
  assert.deepEqual(parseAmount("1L"), { value: 1000, unit: "ml" });
});

test("parseAmount returns null rather than guessing", () => {
  for (const input of [null, undefined, "", "1 pack", "as desired", "a few strands", "40", "g", "-5g", "0g"]) {
    assert.equal(parseAmount(input), null, `should not parse: ${JSON.stringify(input)}`);
  }
});

// ── Conversion ──────────────────────────────────────────────────────────────

test("a per-100g row is already per 100", () => {
  const per100 = toPer100(ALMONDS);
  assert.equal(per100.protein_g, 21.1);
  assert.equal(per100.unit, "g");
});

test("a per-serving row scales up to per 100", () => {
  // Chivda: 2.5 g protein in a 30 g serving -> 8.33 g per 100 g
  const per100 = toPer100(CHIVDA);
  near(per100.protein_g, 8.333, "chivda protein per 100g");
  near(per100.energy_kcal, 463.33, "chivda kcal per 100g");
  assert.equal(per100.unit, "g");
});

test("a per-serving row is already per serving", () => {
  const perServing = toPerServing(CHIVDA);
  assert.equal(perServing.protein_g, 2.5);
  assert.equal(perServing.energy_kcal, 139);
});

test("a per-100g row scales down to the declared serving", () => {
  near(toPerServing(ALMONDS).protein_g, 6.33, "almond protein per 30g serving");
  near(toPerServing(SAFFRON).protein_g, 0.0114, "saffron protein per 0.1g serving");
});

// ── Refusals: no figure, no claim ───────────────────────────────────────────

test("an unknown basis yields nulls, never zeroes", () => {
  for (const basis of [null, undefined, "", "per_pack", "PER_TABLESPOON"]) {
    const row = { measurement_basis: basis, serving_size: "40g", protein_g: 20 };
    assert.equal(toPer100(row).protein_g, null, `per100 for basis ${basis}`);
    assert.equal(toPerServing(row).protein_g, null, `perServing for basis ${basis}`);
  }
});

test("an unparseable serving size blocks the per-serving figure but not the per-100 one", () => {
  const row = { measurement_basis: "per_100g", serving_size: "1 pack", protein_g: 20 };
  assert.equal(toPer100(row).protein_g, 20, "per-100 is stated outright and survives");
  assert.equal(toPerServing(row).protein_g, null, "per-serving is unknowable");
});

test("grams are never converted to millilitres", () => {
  // A density this database does not hold. Refuse rather than assume 1 g/ml.
  const row = { measurement_basis: "per_100g", serving_size: "200ml", protein_g: 20 };
  assert.equal(toPerServing(row).protein_g, null);
});

test("an undeclared macro stays null through conversion", () => {
  const per100 = toPer100(CHIVDA);
  assert.equal(per100.fibre_g, null, "fibre was never declared, so it is not 0");
  assert.equal(per100.sodium_mg, null);
  near(per100.sugars_g, 4.333, "declared sugars still convert");
});

// ── servingsPerPack ─────────────────────────────────────────────────────────

test("servingsPerPack divides the pack by the serving", () => {
  assert.equal(servingsPerPack("200g", "40g"), 5);
  assert.equal(servingsPerPack("1kg", "50g"), 20);
  assert.equal(servingsPerPack("240g", "40g"), 6);
});

test("servingsPerPack refuses mismatched or unreadable amounts", () => {
  assert.equal(servingsPerPack("1 pack", "40g"), null);
  assert.equal(servingsPerPack("500ml", "40g"), null, "no density assumption");
  assert.equal(servingsPerPack(null, "40g"), null);
});

// ── The regression this module was written for ──────────────────────────────

/** The storefront's High Protein rule, as productFetcher.js now applies it. */
const qualifiesAsHighProtein = (row) => {
  const per100 = toPer100(row);
  const perServing = toPerServing(row);
  return (
    per100.protein_g !== null && per100.protein_g >= THRESHOLDS.proteinHigh &&
    perServing.protein_g !== null && perServing.protein_g >= THRESHOLDS.proteinPerServingFloor
  );
};

test("saffron is not High Protein", () => {
  // 11.4 g per 100 g is true and irrelevant: a serving is 0.1 g.
  assert.equal(qualifiesAsHighProtein(SAFFRON), false);
});

test("a 5 g dose of a protein-dense mix is not High Protein", () => {
  // Golden Milk Mix: dense at 19.9 g/100 g, but a teaspoon delivers 1 g.
  const goldenMilk = { measurement_basis: "per_100g", serving_size: "5g", protein_g: 19.9 };
  assert.equal(qualifiesAsHighProtein(goldenMilk), false);
});

test("almonds are still High Protein", () => {
  // The gate must not swallow the products the claim was meant for.
  assert.equal(qualifiesAsHighProtein(ALMONDS), true);
});

test("a product with no declared basis never earns the claim", () => {
  assert.equal(qualifiesAsHighProtein({ serving_size: "40g", protein_g: 30 }), false);
});
