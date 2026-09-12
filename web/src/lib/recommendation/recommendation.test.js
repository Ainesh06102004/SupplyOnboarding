// ============================================================================
// KRE — tests for what KOI may say about what is NOT in a food
// Run with `npm test`.
//
// Eligibility removes a product whose data shows an allergen. These cover the
// other half: a product whose data shows nothing, because nothing complete was
// read. "No ingredients you avoid" is only sayable over a verified label.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { extractFacts } from "@/lib/recommendation/productFacts.js";
import { filterEligible } from "@/lib/recommendation/eligibilityFilter.js";
import { scoreProduct } from "@/lib/recommendation/scoringEngine.js";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config.js";
import { REASONS, CAUTIONS } from "@/lib/recommendation/reasons.js";

function product(over = {}) {
  return {
    id: "p1",
    name: "Test Bites",
    brand: "Testwind",
    category: "Snacks",
    price: 100,
    score: 90,
    dietary: [],
    tags: [],
    goalTags: [],
    goodIngredients: [],
    nutrition: [{ label: "Protein", value: 8 }, { label: "Sugar", value: 3 }],
    ...over,
  };
}

const partial = (...names) => names.map((name) => ({ name, desc: null }));
const verified = (ingredientsText, allergens = []) => ({ verified: true, ingredientsText, allergens });

const eligible = (p, profile) => filterEligible([extractFacts(p)], profile).eligible.length === 1;
const score = (p, profile) => scoreProduct(extractFacts(p), profile);

// ── The catalogue ──────────────────────────────────────────────────────────

test("every avoid key carries a kind the database knows", () => {
  const kinds = new Set(["allergen", "ingredient", "attribute"]);
  for (const a of FOODS_AVOID) assert.ok(kinds.has(a.kind), `${a.key} has kind ${a.kind}`);
});

test("the avoid keys match avoided_item after migration 00021", () => {
  // user_avoided_food has a foreign key to avoided_item, so a key here with no
  // row there fails the moment a shopper saves it.
  assert.deepEqual(FOODS_AVOID.map((a) => a.key).sort(), [
    "artificial_colours", "artificial_flavours", "artificial_sweeteners", "caffeine",
    "eggs", "fish", "gluten", "high_sodium", "lactose", "milk", "palm_oil", "peanuts",
    "preservatives", "red_meat", "refined_sugar", "shellfish", "soy", "spicy", "tree_nuts",
  ]);
});

// ── Evidence ───────────────────────────────────────────────────────────────

test("evidence is verified, partial or none — and only a checked label is verified", () => {
  assert.equal(extractFacts(product()).ingredientEvidence, "none");
  assert.equal(extractFacts(product({ goodIngredients: partial("Oats") })).ingredientEvidence, "partial");
  assert.equal(extractFacts(product({ label: verified("oats, salt") })).ingredientEvidence, "verified");
  assert.equal(extractFacts(product({ label: { verified: false, ingredientsText: "oats" } })).ingredientEvidence, "none");
});

test("a partial list cannot say 'No ingredients you avoid'", () => {
  const p = product({ goodIngredients: partial("Oats", "Jaggery") });
  const s = score(p, { foodsAvoid: ["peanuts"] });
  assert.ok(!s.reasons.includes(REASONS.noAvoid()), "asserted absence from a partial list");
  assert.deepEqual(s.cautions, [CAUTIONS.notVerifiedFor(["Peanuts"])]);
});

test("a verified label can", () => {
  const s = score(product({ label: verified("rolled oats, jaggery, salt") }), { foodsAvoid: ["peanuts"] });
  assert.ok(s.reasons.includes(REASONS.noAvoid()));
  assert.deepEqual(s.cautions, []);
});

test("a machine-read label says what the pack lists, not that the food is safe", () => {
  const p = product({ label: { evidence: "machine_read", ingredientsText: "rolled oats, jaggery", allergens: [], mayContain: [] } });
  const s = score(p, { foodsAvoid: ["peanuts", "milk"] });
  assert.ok(s.reasons.includes(REASONS.notListedOnPack(["Peanuts", "Milk"])));
  assert.equal(REASONS.notListedOnPack(["Peanuts", "Milk"]), "No peanuts or milk listed on the pack");
  assert.ok(!s.reasons.includes(REASONS.noAvoid()));
  assert.deepEqual(s.cautions, [], "the whole list was read, so nothing is 'not verified'");
});

test("an unverified product ranks below an identical verified one", () => {
  const profile = { foodsAvoid: ["peanuts"] };
  const unchecked = score(product(), profile);
  const checked = score(product({ label: verified("oats") }), profile);
  assert.ok(checked.raw > unchecked.raw);
});

test("milk and lactose share a flag, so they share one caution", () => {
  const s = score(product(), { foodsAvoid: ["milk", "lactose"] });
  assert.deepEqual(s.cautions, [CAUTIONS.notVerifiedFor(["Milk"])]);
});

test("a brand's diet declaration cannot clear what its verified label shows", () => {
  const p = product({ dietary: ["Vegan"], label: verified("wheat flour, milk solids, sugar") });
  assert.equal(eligible(p, { foodsAvoid: ["milk"] }), false);
});

test("allergens declared on a verified label are read as flags", () => {
  const p = product({ label: verified("oats, sugar", ["tree_nut"]) });
  assert.equal(eligible(p, { foodsAvoid: ["tree_nuts"] }), false);
  assert.equal(eligible(p, { foodsAvoid: ["peanuts"] }), true);
});

test("a 'may contain' on a verified label rules the product out for that allergen", () => {
  const p = product({ label: { verified: true, ingredientsText: "oats, jaggery", allergens: [], mayContain: ["tree_nut"] } });
  assert.equal(eligible(p, { foodsAvoid: ["tree_nuts"] }), false);
  assert.equal(eligible(p, { foodsAvoid: ["peanuts"] }), true);
});

// ── Tree nuts ──────────────────────────────────────────────────────────────

test("tree nuts on a partial list remove the product", () => {
  assert.equal(eligible(product({ goodIngredients: partial("Almonds", "Dates") }), { foodsAvoid: ["tree_nuts"] }), false);
});

test("Indian label names count: kaju is a cashew, and a dry-fruit mix carries nuts", () => {
  assert.equal(eligible(product({ goodIngredients: partial("Kaju") }), { foodsAvoid: ["tree_nuts"] }), false);
  assert.equal(eligible(product({ name: "Daily Dry Fruit Mix" }), { foodsAvoid: ["tree_nuts"] }), false);
});

test("peanuts are not tree nuts", () => {
  assert.equal(eligible(product({ goodIngredients: partial("Peanuts") }), { foodsAvoid: ["tree_nuts"] }), true);
  assert.equal(eligible(product({ goodIngredients: partial("Peanuts") }), { foodsAvoid: ["peanuts"] }), false);
});

// ── Diets ──────────────────────────────────────────────────────────────────

test("Jain is not vegetarian: it excludes root vegetables and honey", () => {
  assert.notDeepEqual(DIET_EXCLUSIONS.jain, DIET_EXCLUSIONS.vegetarian);
  assert.equal(eligible(product({ name: "Masala Potato Chips" }), { dietType: "jain" }), false);
  assert.equal(eligible(product({ goodIngredients: partial("Onion", "Garlic") }), { dietType: "jain" }), false);
  assert.equal(eligible(product({ name: "Uttrakhand Honey" }), { dietType: "jain" }), false);
  assert.equal(eligible(product({ name: "Masala Potato Chips" }), { dietType: "vegetarian" }), true);
});

test("a product that passes Jain on thin evidence says so; a brand's own declaration carries it", () => {
  const unchecked = score(product({ goodIngredients: partial("Oats") }), { dietType: "jain" });
  assert.deepEqual(unchecked.cautions, [CAUTIONS.notVerifiedAsDiet("Jain")]);
  const declared = score(product({ dietary: ["Jain"] }), { dietType: "jain" });
  assert.deepEqual(declared.cautions, []);
});

test("vegetarian needs no label: the veg mark is mandatory on every pack", () => {
  assert.deepEqual(score(product(), { dietType: "vegetarian" }).cautions, []);
});

// ── Wording ────────────────────────────────────────────────────────────────

test("caution wording lists what was not checked", () => {
  assert.equal(CAUTIONS.notVerifiedFor(["Peanuts", "Tree Nuts", "Milk"]), "Not verified for peanuts, tree nuts or milk");
  assert.equal(
    CAUTIONS.unverifiedInResults(3, 5, ["Peanuts"], "Jain"),
    "3 of 5 results haven't had their ingredient list verified for peanuts or as Jain. Check the pack before you buy.",
  );
  assert.equal(
    CAUTIONS.unverifiedInResults(1, 1, ["Milk"]),
    "1 of 1 result hasn't had its ingredient list verified for milk. Check the pack before you buy.",
  );
});
