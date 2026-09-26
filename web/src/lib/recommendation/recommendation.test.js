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
import { unverifiedFor, provesAllergenAbsence } from "@/lib/recommendation/verification.js";

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
const TODAY = new Date().toISOString();
const A_YEAR_AGO = new Date(Date.now() - 400 * 86_400_000).toISOString();
const verified = (ingredientsText, allergens = []) => ({ verified: true, ingredientsText, allergens, confirmedAt: TODAY });

const eligible = (p, profile) => filterEligible([extractFacts(p)], profile).eligible.length === 1;
const score = (p, profile) => scoreProduct(extractFacts(p), profile);

// ── The catalogue ──────────────────────────────────────────────────────────

test("every avoid key carries a kind the database knows", () => {
  const kinds = new Set(["allergen", "ingredient", "attribute"]);
  for (const a of FOODS_AVOID) assert.ok(kinds.has(a.kind), `${a.key} has kind ${a.kind}`);
});

test("the avoid keys match avoided_item after migration 00067", () => {
  // user_avoided_food has a foreign key to avoided_item, so a key here with no
  // row there fails the moment a shopper saves it. 00067 added onion_garlic.
  assert.deepEqual(FOODS_AVOID.map((a) => a.key).sort(), [
    "artificial_colours", "artificial_flavours", "artificial_sweeteners", "caffeine",
    "eggs", "fish", "gluten", "high_sodium", "lactose", "milk", "onion_garlic", "palm_oil", "peanuts",
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
  const p = product({ label: { evidence: "machine_read", ingredientsText: "rolled oats, jaggery", allergens: [], mayContain: [], confirmedAt: TODAY, readAgreement: 2 } });
  const s = score(p, { foodsAvoid: ["peanuts", "milk"] });
  assert.ok(s.reasons.includes(REASONS.notListedOnPack(["Peanuts", "Milk"])));
  assert.equal(REASONS.notListedOnPack(["Peanuts", "Milk"]), "No peanuts or milk listed on the pack");
  assert.ok(!s.reasons.includes(REASONS.noAvoid()));
  assert.deepEqual(s.cautions, [], "the whole list was read, so nothing is 'not verified'");
});

test("a machine read needs two agreeing readings to say an allergen is absent (00063)", () => {
  const read = (readAgreement) => product({ label: { evidence: "machine_read", ingredientsText: "rolled oats, jaggery", allergens: [], mayContain: [], confirmedAt: TODAY, readAgreement } });
  for (const agreement of [null, 1]) {
    const s = score(read(agreement), { foodsAvoid: ["peanuts"] });
    assert.ok(!s.reasons.includes(REASONS.notListedOnPack(["Peanuts"])), `agreement ${agreement} cannot say peanuts are absent`);
    assert.deepEqual(s.cautions, [CAUTIONS.notVerifiedFor(["Peanuts"])]);
  }
  assert.deepEqual(score(read(3), { foodsAvoid: ["peanuts"] }).cautions, []);

  // Still the complete list: it settles the diet, and what it lists still counts.
  const one = extractFacts(read(1));
  assert.equal(one.readAgreement, 1);
  assert.equal(unverifiedFor(one, { dietType: "vegan" }).diet, null);
  assert.equal(eligible(product({ label: { evidence: "machine_read", ingredientsText: "oats, peanuts", allergens: [], mayContain: [], confirmedAt: TODAY, readAgreement: 1 } }), { foodsAvoid: ["peanuts"] }), false);

  assert.equal(provesAllergenAbsence("verified", null), true, "a person's check needs no count");
  assert.equal(provesAllergenAbsence("partial", 5), false, "a partial list never proves absence");
});

test("a label unconfirmed for a year proves what it lists, not what it leaves out", () => {
  const listed = product({ label: { evidence: "machine_read", ingredientsText: "rolled oats, peanuts", allergens: [], mayContain: [], confirmedAt: A_YEAR_AGO } });
  assert.equal(extractFacts(listed).ingredientEvidence, "partial");
  assert.equal(eligible(listed, { foodsAvoid: ["peanuts"] }), false, "what an old label lists still counts");

  const silent = product({ label: { evidence: "machine_read", ingredientsText: "rolled oats", allergens: [], mayContain: [], confirmedAt: A_YEAR_AGO } });
  const s = score(silent, { foodsAvoid: ["peanuts"] });
  assert.ok(!s.reasons.includes(REASONS.notListedOnPack(["Peanuts"])), "an old label cannot say what is not listed");
  assert.deepEqual(s.cautions, [CAUTIONS.notVerifiedFor(["Peanuts"])]);
});

test("a label with no confirmation date is not treated as current", () => {
  const p = product({ label: { evidence: "machine_read", ingredientsText: "oats", allergens: [], mayContain: [] } });
  assert.equal(extractFacts(p).ingredientEvidence, "partial");
});

test("a brand name is not an ingredient: 'Sweet Karam Coffee' does not make a namkeen caffeinated", () => {
  const mixture = product({ name: "Madras Mixture", brand: "Sweet Karam Coffee", goodIngredients: partial("Peanuts", "Gram flour") });
  const facts = extractFacts(mixture);
  assert.equal(facts.contains.has("caffeine"), false);
  assert.equal(facts.contains.has("peanut"), true, "what the product lists still counts");
  assert.equal(extractFacts(product({ name: "Filter Coffee Powder", brand: "Sweet Karam Coffee" })).contains.has("caffeine"), true, "the product's own name still does");
  assert.equal(extractFacts(product({ name: "Mixture", brand: "Peanut Co" })).contains.has("peanut"), true, "allergens still read the brand: over-reading only hides a product");
});

test("a preservative on the label raises the filter, whatever the brand's tag says", () => {
  const read = (ingredientsText) => product({
    tags: ["No Preservatives"],
    label: { evidence: "machine_read", ingredientsText, allergens: [], mayContain: [], confirmedAt: TODAY },
  });
  const preserved = read("Mango pulp, sugar, preservative (INS 211)");
  const plain = read("Mango pulp, sugar");
  assert.equal(extractFacts(preserved).contains.has("preservatives"), true);
  assert.equal(extractFacts(plain).contains.has("preservatives"), false);
  assert.equal(extractFacts(product({ tags: ["No Preservatives"] })).contains.has("preservatives"), false);

  // Nothing used to set this flag, so a pack printing INS 211 was told to a
  // shopper avoiding preservatives as "No preservatives listed on the pack".
  const profile = { foodsAvoid: ["preservatives"] };
  assert.ok(!score(preserved, profile).reasons.includes(REASONS.notListedOnPack(["Preservatives"])));
  assert.ok(score(plain, profile).reasons.includes(REASONS.notListedOnPack(["Preservatives"])));
  assert.ok(score(preserved, profile).raw < score(plain, profile).raw);
});

test("synthetic colours, sweeteners and artificial flavours raise their filters; natural ones do not", () => {
  const listed = (text) => extractFacts(product({ goodIngredients: partial(text) })).contains;
  assert.equal(listed("Tartrazine").has("artificial_colour"), true);
  assert.equal(listed("Beetroot Red").has("artificial_colour"), false);
  assert.equal(listed("Sucralose").has("artificial_sweetener"), true);
  assert.equal(listed("Steviol Glycosides").has("artificial_sweetener"), false);
  assert.equal(listed("Artificial Flavouring Substances").has("artificial_flavour"), true);
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

// ── Meat ───────────────────────────────────────────────────────────────────

test("Red Meat means red meat: chicken stays for that shopper, and no meat stays for a vegetarian", () => {
  const chicken = product({ goodIngredients: partial("Chicken", "Rice") });
  assert.equal(eligible(chicken, { foodsAvoid: ["red_meat"] }), true);
  assert.equal(eligible(product({ goodIngredients: partial("Mutton") }), { foodsAvoid: ["red_meat"] }), false);
  assert.equal(eligible(chicken, { dietType: "vegetarian" }), false);
  assert.equal(eligible(product({ goodIngredients: partial("Gelatin") }), { dietType: "vegetarian" }), false, "gelatin is made from animals");
});

test("meal occasions come from the category, not substrings of the name", () => {
  const facts = (p) => extractFacts(product(p));
  assert.equal(facts({ name: "Energy Laddubar" }).categoryKey, "snacks.bars");
  assert.equal(scoreProduct(facts({ name: "Energy Laddubar" }), { mealPrefs: ["post_workout"] }).breakdown.mealMatch > 0, true);
  assert.equal(scoreProduct(facts({ name: "Barley Rusk" }), { mealPrefs: ["post_workout"] }).breakdown.mealMatch, 0, "'bar' inside barley is not a bar");
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
