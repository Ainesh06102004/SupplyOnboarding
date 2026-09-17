// ============================================================================
// KOI — tests for "What's in a serving" (Phase 5.2)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { servingPanel, realisticServing, servingPhrase } from "@/lib/nutrition/panel.js";

const mysorePak = {
  measurement_basis: "per_100g", serving_size: "16 g",
  energy_kcal: 547, protein_g: 5.2, carbs_g: 60, sugars_g: 44.4, total_fat_g: 32, fibre_g: null, sodium_mg: 20,
};
const sweetsPortion = { amount: 30, unit: "g", max: 60, measure: null };

test("the panel leads with a realistic serving, and keeps per 100 beside it", () => {
  const panel = servingPanel({ row: mysorePak, portion: sweetsPortion, role: "sweet" });
  assert.deepEqual(panel.serving, { amount: 16, unit: "g", source: "pack", measure: null });
  const sugar = panel.rows.find((r) => r.key === "sugars_g");
  assert.equal(sugar.per100, 44.4);
  assert.equal(sugar.perServing, 7.1, "16 g of 44.4 g per 100 g");
  assert.equal(panel.frame, "Sweets are a treat — this one is 44.4 g sugar per 100 g, 7.1 g in a 16 g serving.");
});

test("no verdict words, no colours: only figures, and only KOI-checked claims carry an accent", () => {
  const panel = servingPanel({ row: mysorePak, portion: sweetsPortion, role: "sweet" });
  const text = JSON.stringify(panel);
  assert.doesNotMatch(text, /\b(High|Low|Moderate|Light|warn|bad|unhealthy|healthy)\b/, "no rating words");
  assert.ok(panel.rows.every((r) => r.checked === null), "no claim passes, so nothing is marked");
  assert.deepEqual(panel.notDeclared, ["fibre"], "a figure the label does not give is said to be missing, not zero");

  const lentils = servingPanel({ row: { measurement_basis: "per_100g", protein_g: 24, fibre_g: 10, sugars_g: 1, energy_kcal: 330 } });
  assert.equal(lentils.rows.find((r) => r.key === "fibre_g").checked, "High fibre, meets FSSAI's condition");
});

test("an implausible pack serving gives way to the category's reference portion", () => {
  const almonds = { measurement_basis: "per_100g", serving_size: "100 g", protein_g: 21, energy_kcal: 579 };
  assert.deepEqual(realisticServing(almonds, { amount: 30, unit: "g", max: 60, measure: null }), { amount: 30, unit: "g", source: "reference", measure: null });
  const honey = { measurement_basis: "per_100g", energy_kcal: 304, sugars_g: 82 };
  const serving = realisticServing(honey, { amount: 21, unit: "g", max: 42, measure: "1 tbsp" });
  assert.equal(servingPhrase(serving), "1 tbsp (21 g)");
  assert.equal(realisticServing({ measurement_basis: "per_100ml", energy_kcal: 40 }, { amount: 30, unit: "g", max: 60 }), null, "grams and millilitres are not mixed");
});

test("the shopper's goal decides what comes first, in a plain line", () => {
  const watching = servingPanel({ row: mysorePak, portion: sweetsPortion, role: "sweet", goal: "fatloss" });
  assert.equal(watching.rows[0].key, "protein_g", "fat loss lists protein first in its own order");
  assert.ok(watching.rows.find((r) => r.key === "sugars_g").focus);
  assert.equal(watching.focus, "Your goal, Fat loss, looks for protein. This has about 0.8 g in a 16 g serving.");

  const lowSugar = servingPanel({ row: mysorePak, portion: sweetsPortion, goal: "low_sugar" });
  assert.equal(lowSugar.rows[0].key, "sugars_g");
  assert.equal(lowSugar.focus, "Your goal, Low sugar, watches sugar. This has about 7.1 g in a 16 g serving.");

  const avoiding = servingPanel({ row: mysorePak, portion: sweetsPortion, avoidKeys: ["high_sodium"] });
  assert.equal(avoiding.rows[0].key, "sodium_mg");
  assert.equal(avoiding.focus, "You avoid high sodium. This has about 3.2 mg in a 16 g serving.");

  const flat = servingPanel({ row: mysorePak, portion: sweetsPortion });
  assert.deepEqual(flat.rows.map((r) => r.key), ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "total_fat_g", "sodium_mg"], "no goal: the label's order");
  assert.equal(flat.focus, null);
});
