// ============================================================================
// KOI ENGINE — tests for the parts that decide what a person must look at
// Run with `npm test`.
//
// The fixture is the Madras Mixture nutrition graphic KOI holds today
// (public/media/skc-madras-label.jpg): a per-100 g table and a 20 g serving,
// and no ingredient list or allergen statement at all.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { LabelReading, LABEL_JSON_SCHEMA, NUTRIENT_FIELDS } from "@/lib/engine/labelSchema.js";
import { runChecks, flagsInIngredients, flagsInStatement } from "@/lib/engine/checks.js";
import { toReviewItems, toNutritionRow, AUTO_ACCEPT } from "@/lib/engine/proposals.js";
import { validateDecision, buildPublishPayload } from "@/lib/engine/decisions.js";

const values = (over = {}) => ({ ...Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, null])), ...over });

function reading(over = {}) {
  return {
    visible: { ingredients: false, allergen_statement: false, nutrition_table: true },
    product_name: "Madras Mixture", brand: null, net_quantity: null, veg_mark: "not_visible",
    ingredients_text: null, ingredients: [], allergen_statement: null, may_contain_statement: null,
    nutrition: {
      basis: "per_100g", serving_size: "20g", servings_per_pack: 10,
      values: values({
        energy_kcal: 560, protein_g: 10.4, carbs_g: 50, sugars_g: 0, added_sugar_g: 0, fibre_g: 4,
        total_fat_g: 35, saturated_fat_g: 8.6, trans_fat_g: 0, sodium_mg: 453.7, cholesterol_mg: 0,
      }),
    },
    fssai_licence: null, unreadable: [],
    ...over,
  };
}

const withList = (text, statement = null, mayContain = null) => reading({
  visible: { ingredients: true, allergen_statement: Boolean(statement), nutrition_table: true },
  ingredients_text: text,
  ingredients: text.split(",").map((name) => ({ name: name.trim(), percent: null })),
  allergen_statement: statement,
  may_contain_statement: mayContain,
});

const find = (result, id) => result.checks.find((c) => c.id === id);

// ── Schema ─────────────────────────────────────────────────────────────────

test("the fixture is a valid reading, and the provider schema is strict everywhere", () => {
  assert.equal(LabelReading.safeParse(reading()).success, true);
  const walk = (node) => {
    if (node?.type === "object") {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      Object.values(node.properties).forEach(walk);
    }
    if (node?.items) walk(node.items);
  };
  walk(LABEL_JSON_SCHEMA);
});

test("a reading cannot carry a score, a claim or anything else unasked for", () => {
  const parsed = LabelReading.parse({ ...reading(), health_score: 92, claims: ["Healthy"] });
  assert.equal("health_score" in parsed, false);
  assert.equal("claims" in parsed, false);
});

// ── Checks ─────────────────────────────────────────────────────────────────

test("the Madras panel's arithmetic holds: 560 kcal against 557 computed", () => {
  const r = runChecks(reading());
  assert.equal(find(r, "nutrition.energy").ok, true);
  assert.equal(find(r, "nutrition.sugars_in_carbs").ok, true);
  assert.equal(find(r, "nutrition.mass").ok, true);
});

test("a misread digit fails the energy check and says which figures disagree", () => {
  const misread = reading({ nutrition: { ...reading().nutrition, values: values({ energy_kcal: 56, protein_g: 10.4, carbs_g: 50, sugars_g: 0, total_fat_g: 35 }) } });
  const c = find(runChecks(misread), "nutrition.energy");
  assert.equal(c.ok, false);
  assert.match(c.detail, /56 kcal/);
});

test("sugars above carbohydrate is caught", () => {
  const bad = reading({ nutrition: { ...reading().nutrition, values: values({ energy_kcal: 400, protein_g: 5, carbs_g: 20, sugars_g: 30, total_fat_g: 30 }) } });
  assert.equal(find(runChecks(bad), "nutrition.sugars_in_carbs").ok, false);
});

test("a photo with no ingredient list says a back-of-pack photo is needed", () => {
  const c = find(runChecks(reading()), "ingredients.visible");
  assert.equal(c.ok, false);
  assert.match(c.detail, /back-of-pack/);
});

test("a check that cannot run is left out of confidence, not counted as a pass", () => {
  const sparse = reading({ nutrition: { ...reading().nutrition, values: values({ protein_g: 10 }) } });
  const r = runChecks(sparse);
  assert.equal(find(r, "nutrition.energy").ok, null);
  assert.ok(r.confidence < 1);
});

test("an allergen in the ingredients but missing from the statement fails the check", () => {
  const r = runChecks(withList("Wheat flour, milk solids, sugar", "Contains: wheat"));
  const c = find(r, "allergens.consistent");
  assert.equal(c.ok, false);
  assert.match(c.detail, /dairy/);
});

test("statement words name groups: 'tree nuts' and 'crustaceans' are understood", () => {
  assert.deepEqual(flagsInStatement("Contains tree nuts and crustaceans").sort(), ["shellfish", "tree_nut"]);
  assert.deepEqual(flagsInIngredients("Roasted cashew (12%), rice flour"), ["tree_nut"]);
});

// ── Routing ────────────────────────────────────────────────────────────────

test("allergens always go to a person, and nutrition does too while auto-accept is off", () => {
  const r = withList("Gram flour, peanuts, curry leaves", "Contains peanuts");
  const items = toReviewItems(r, runChecks(r), { netWeight: "200g" });
  const by = Object.fromEntries(items.map((i) => [i.field_group, i]));
  assert.equal(by.allergens.route, "human");
  assert.deepEqual(by.allergens.proposed.contains, ["peanut"]);
  assert.equal(AUTO_ACCEPT.nutrition, false);
  assert.equal(by.nutrition.route, "human");
});

test("no ingredient list means no ingredient or allergen item to approve", () => {
  const groups = toReviewItems(reading(), runChecks(reading())).map((i) => i.field_group);
  assert.deepEqual(groups, ["identity", "nutrition"]);
});

test("the nutrition proposal carries per-serving columns computed by the shared converter", () => {
  const row = toNutritionRow(reading().nutrition, "200g");
  assert.equal(row.protein_per_100g, 10.4);
  assert.equal(row.protein_per_serving, 2.08);
  assert.equal(row.kcal_per_serving, 112);
  assert.equal(row.servings_per_pack, 10);
});

// ── Decisions ──────────────────────────────────────────────────────────────

test("a correction must fit the group's shape, and an unknown allergen flag is refused", () => {
  assert.equal(validateDecision("allergens", "correct", { contains: ["dairy"], may_contain: [] }).ok, true);
  assert.equal(validateDecision("allergens", "correct", { contains: ["gluten_ish"], may_contain: [] }).ok, false);
  assert.equal(validateDecision("nutrition", "delete").ok, false);
});

const item = (field_group, status, proposed, decision = null) => ({ field_group, status, proposed, decision });

test("nothing publishes until the photo is confirmed as this product", () => {
  const r = buildPublishPayload([item("identity", "pending", {}), item("nutrition", "accepted", toNutritionRow(reading().nutrition))]);
  assert.equal(r.nutrition, null);
  assert.match(r.blockers[0], /Confirm the photo/);
});

test("ingredients publish only together with decided allergens", () => {
  const list = { raw_ingredient_text: "Gram flour, peanuts", parsed_ingredients: [{ name: "Gram flour", percent: null }] };
  const half = buildPublishPayload([item("identity", "accepted", {}), item("ingredients", "accepted", list), item("allergens", "pending", {})]);
  assert.equal(half.ingredients, null);

  const whole = buildPublishPayload([
    item("identity", "accepted", {}), item("ingredients", "accepted", list),
    item("allergens", "corrected", {}, { contains: ["peanut"], may_contain: ["tree_nut"] }),
  ]);
  assert.deepEqual(whole.ingredients.allergens, ["peanut"]);
  assert.deepEqual(whole.ingredients.may_contain, ["tree_nut"]);
});

test("corrected nutrition gets freshly computed per-100 columns", () => {
  const corrected = { measurement_basis: "per_serving", serving_size: "50g", servings_per_pack: null, ...values({ protein_g: 10 }) };
  const r = buildPublishPayload([item("identity", "accepted", {}), item("nutrition", "corrected", {}, corrected)]);
  assert.equal(r.nutrition.protein_per_100g, 20);
  assert.equal(r.nutrition.protein_per_serving, 10);
});
