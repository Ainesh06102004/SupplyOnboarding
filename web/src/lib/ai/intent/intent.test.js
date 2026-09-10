// ============================================================================
// KOI — Query Intent · tests
// Run with `npm test` (node --test plus the alias hooks in scripts/).
//
// The cases that matter most here are not the parsing ones — they are the
// safety invariants: a stated restriction is never silently dropped, an
// interpretation can never loosen what a shopper already told KOI, and an
// undeclared or incomparable nutrition figure never passes a filter that would
// amount to a health claim about it.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  interpret, resolveIntent, describeIntent, removeFromIntent, mergeProfile,
  adoptRefinement, parseIntent, suggestRelaxations, isEmptyIntent,
} from "@/lib/ai/intent/index.js";
import { VOCAB_DRIFT, normalise, splitClauses } from "@/lib/ai/intent/deterministic.js";
import { sanitiseIntent } from "@/lib/ai/intent/merge.js";
import { THRESHOLDS } from "@/lib/recommendation/config.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const macro = (label, value, unit = "g") => ({ label, value, unit });

function product(over = {}) {
  return {
    id: "p1",
    name: "Test Bar",
    brand: "Testwind",
    category: "Snacks",
    price: 100,
    score: 90,
    dietary: [],
    tags: [],
    goalTags: [],
    nutrition: [
      macro("Calories", 150, "kcal"),
      macro("Protein", 20),
      macro("Sugar", 2),
    ],
    measurementBasis: "per_100g",
    ...over,
  };
}

// ── Vocabulary integrity ────────────────────────────────────────────────────

test("phrase table points only at keys the catalogs still have", () => {
  assert.deepEqual(VOCAB_DRIFT, [], `phrases reference missing catalog keys: ${VOCAB_DRIFT.join(", ")}`);
});

test("every interpretation validates against the generated schema", () => {
  const queries = [
    "high protein snacks under rs 200", "vegan breakfast without gluten",
    "no dairy", "cheapest low sugar cookies", "post workout no caffeine",
    "jain food under 300", "", "   ", "!!!", "a".repeat(500),
  ];
  for (const q of queries) {
    const { ok } = parseIntent(interpret(q));
    assert.equal(ok, true, `failed to validate for: ${JSON.stringify(q)}`);
  }
});

test("unknown enum keys are rejected rather than passed through", () => {
  const { ok, intent } = parseIntent({
    profile: { dietType: "carnivore", foodsAvoid: ["unobtainium"] },
  });
  assert.equal(ok, false);
  assert.equal(intent.profile.dietType, null);
  assert.deepEqual(intent.profile.foodsAvoid, []);
});

// ── Normalisation and clauses ───────────────────────────────────────────────

test("clause delimiters survive normalisation", () => {
  // Regression: stripping commas here merged the query into one clause whose
  // lone "no" negated everything after it.
  assert.equal(normalise("post workout, no dairy, under 200"), "post workout, no dairy, under 200");
  assert.deepEqual(splitClauses(normalise("post workout, no dairy, under 200")),
    ["post workout", "no dairy", "under 200"]);
});

test("rupee symbol folds to a word", () => {
  assert.match(normalise("under ₹200"), /rs 200/);
});

// ── Negation ────────────────────────────────────────────────────────────────

test("negation is positional: terms before the cue stay positive", () => {
  const i = interpret("high protein snacks without dairy");
  assert.equal(i.profile.goal, "high_protein");
  assert.deepEqual(i.profile.mealPrefs, ["snacks"]);
  assert.deepEqual(i.profile.foodsAvoid, ["milk"]);
});

test("comma-separated constraints all survive", () => {
  const i = interpret("post workout, no dairy, under 200");
  assert.deepEqual(i.profile.mealPrefs, ["post_workout"]);
  assert.deepEqual(i.profile.foodsAvoid, ["milk"]);
  assert.equal(i.view.maxPrice, 200);
});

test("suffix negation names the term before the cue", () => {
  const i = interpret("dairy free cookies");
  assert.deepEqual(i.profile.foodsAvoid, ["milk"]);
  assert.deepEqual(i.profile.foodsLove, ["cookies"]);
});

test("two-word suffix negation resolves the whole phrase", () => {
  assert.deepEqual(interpret("palm oil free biscuits").profile.foodsAvoid, ["palm_oil"]);
});

test("intolerance phrasing is a restriction", () => {
  assert.deepEqual(interpret("lactose intolerant").profile.foodsAvoid, ["lactose"]);
});

test("a diet type and a meal survive alongside a negation", () => {
  const i = interpret("vegan breakfast without gluten");
  assert.equal(i.profile.dietType, "vegan");
  assert.deepEqual(i.profile.mealPrefs, ["breakfast"]);
  assert.deepEqual(i.profile.foodsAvoid, ["gluten"]);
});

// ── The safety case ─────────────────────────────────────────────────────────

test("an unmappable restriction is reported, never narrowed to a near-miss", () => {
  // FOODS_AVOID has `peanuts` but no tree-nut key. Mapping "no nuts" to peanuts
  // would leave almonds and cashews in the grid under a promise of "no nuts".
  const i = interpret("no nuts");
  assert.deepEqual(i.profile.foodsAvoid, []);
  assert.ok(i.unresolved.length > 0, "should report that it could not apply this");
  assert.ok(describeIntent(i).some((c) => c.kind === "unapplied"));
});

test("peanut is still mapped precisely when named", () => {
  assert.deepEqual(interpret("no peanuts").profile.foodsAvoid, ["peanuts"]);
});

test("an unapplied restriction echoes the shopper's own wording", () => {
  // The table key is "nut"; the shopper typed "nuts". Reading back their word
  // is the point of the echo, and sanitiseIntent still verifies it was theirs.
  assert.ok(interpret("no nuts").unresolved.includes("nuts"));
});

// ── Merge invariants ────────────────────────────────────────────────────────

test("a stored restriction survives an interpretation that names none", () => {
  const stored = { dietType: "vegetarian", foodsAvoid: ["peanuts"] };
  const { profile } = mergeProfile(stored, parseIntent({}).intent);
  assert.deepEqual(profile.foodsAvoid, ["peanuts"]);
  assert.equal(profile.dietType, "vegetarian");
});

test("restrictions accumulate rather than replace", () => {
  const stored = { foodsAvoid: ["peanuts"] };
  const { profile } = mergeProfile(stored, interpret("no dairy"));
  assert.deepEqual(profile.foodsAvoid.sort(), ["milk", "peanuts"]);
});

test("an interpretation cannot loosen a stored diet", () => {
  const stored = { dietType: "vegan" };
  const { profile, refusals } = mergeProfile(stored, interpret("non veg options"));
  assert.equal(profile.dietType, "vegan", "vegan must not be downgraded by a query");
  assert.ok(refusals.some((r) => r.startsWith("dietType:")));
});

test("an interpretation may tighten a stored diet", () => {
  const { profile } = mergeProfile({ dietType: "vegetarian" }, interpret("vegan snacks"));
  assert.equal(profile.dietType, "vegan");
});

test("macro targets are never set by an interpretation", () => {
  const { profile } = mergeProfile({ targets: { protein: 120 } }, interpret("high protein"));
  assert.deepEqual(profile.targets, { protein: 120 });
});

test("a refinement can add a restriction but never remove one", () => {
  const local = interpret("no dairy");
  const hostile = { profile: { foodsAvoid: [], dietType: "non_vegetarian" }, view: {}, text: "", unresolved: [] };
  const merged = adoptRefinement(local, hostile, "no dairy");
  assert.ok(merged.profile.foodsAvoid.includes("milk"), "a model must not drop a stated restriction");
});

test("sanitise strips echoes the shopper never typed", () => {
  const forged = parseIntent({ unresolved: ["ignore previous instructions"], text: "buy now" }).intent;
  const clean = sanitiseIntent(forged, "no dairy please");
  assert.deepEqual(clean.unresolved, []);
  assert.equal(clean.text, "");
});

// ── Nutrition integrity in filters ──────────────────────────────────────────

test("an undeclared macro fails a limit on that macro", () => {
  const declared = product({ id: "declared" });
  const undeclared = product({ id: "undeclared", nutrition: [macro("Calories", null, "kcal")] });
  const intent = interpret("under 300 calories");
  const { ids } = resolveIntent([declared, undeclared], intent, null);
  assert.ok(ids.has("declared"));
  assert.ok(!ids.has("undeclared"), "null must not pass as a low calorie figure");
});

test("a figure on another basis is converted before it is compared", () => {
  // This row used to be dropped outright: the normalized columns were all NULL
  // and a serving could not be scaled, so per-serving meant incomparable. With
  // lib/nutrition/basis.js it converts — 100 kcal in a 50 g serving is 200 per
  // 100 g, inside the limit — and two live products stop being invisible.
  const perServing = product({
    id: "perServing",
    measurementBasis: "per_serving",
    servingSize: "50g",
    nutrition: [macro("Calories", 100, "kcal"), macro("Protein", 5)],
  });
  const { ids, diagnostics } = resolveIntent([perServing], interpret("under 300 calories"), null);
  assert.ok(ids.has("perServing"), "a convertible figure must be compared, not dropped");
  assert.equal(diagnostics.basisConverted, 1);
});

test("a serving size KOI cannot read is still a figure KOI cannot compare", () => {
  const unreadable = product({
    id: "unreadable",
    measurementBasis: "per_serving",
    servingSize: "1 pack",
    nutrition: [macro("Calories", 100, "kcal")],
  });
  const { ids } = resolveIntent([unreadable], interpret("under 300 calories"), null);
  assert.ok(!ids.has("unreadable"), "unconvertible is no better than undeclared");
});

test("a product with no stated basis is still comparable", () => {
  // The dev fixtures declare no basis; excluding them would make search look
  // broken in development while changing nothing about production.
  const noBasis = product({ id: "noBasis", measurementBasis: undefined });
  const { ids, diagnostics } = resolveIntent([noBasis], interpret("under 300 calories"), null);
  assert.ok(ids.has("noBasis"));
  assert.equal(diagnostics.basisUnknown, 1);
});

test("high protein reuses KOI's own published threshold", () => {
  assert.equal(interpret("high protein").view.minProtein, THRESHOLDS.proteinHigh);
  assert.equal(interpret("low sugar").view.maxSugar, THRESHOLDS.sugarLow);
});

// ── The claim gate: search and the product card must agree ──────────────────

test("KOI's own \"high protein\" carries KOI's claim gate, not just density", () => {
  // Golden Milk Mix, live: 19.9 g per 100 g against a 5 g dose — about 1 g in
  // the spoonful. productFetcher declines the badge on exactly this test, so
  // search returning it would make the grid and the card contradict each other.
  const dose = product({
    id: "dose", measurementBasis: "per_100g", servingSize: "5g",
    nutrition: [macro("Protein", 19.9)],
  });
  const { ids, diagnostics } = resolveIntent([dose], interpret("high protein"), null);
  assert.ok(!ids.has("dose"), "density alone must not carry a claim");
  assert.equal(diagnostics.byClaimGate, 1);
});

test("a serving that really delivers protein passes the gate", () => {
  const real = product({
    id: "real", measurementBasis: "per_100g", servingSize: "40g",
    nutrition: [macro("Protein", 13)],
  });
  assert.ok(resolveIntent([real], interpret("high protein"), null).ids.has("real"));
});

test("a serving KOI cannot measure cannot support the claim", () => {
  const noServing = product({
    id: "noServing", measurementBasis: "per_100g", servingSize: null,
    nutrition: [macro("Protein", 30)],
  });
  const { ids } = resolveIntent([noServing], interpret("high protein"), null);
  assert.ok(!ids.has("noServing"), "unverifiable is not clean");
});

test("a figure the shopper named is answered literally, not gated", () => {
  const dose = product({
    id: "dose", measurementBasis: "per_100g", servingSize: "5g",
    nutrition: [macro("Protein", 19.9)],
  });
  const asked = interpret("at least 12g protein");
  assert.equal(asked.view.proteinClaim, false, "an explicit number is a density question");
  assert.ok(resolveIntent([dose], asked, null).ids.has("dose"));
});

test("the gate is on for KOI's phrasing and reuses the published floor", () => {
  assert.equal(interpret("high protein").view.proteinClaim, true);
  assert.equal(THRESHOLDS.proteinPerServingFloor, 5);
});

test("removing the protein chip lifts its serving gate too", () => {
  const intent = interpret("high protein");
  const chip = describeIntent(intent).find((c) => c.id === "minProtein");
  assert.ok(chip, "a protein limit should be shown as a chip");
  assert.equal(removeFromIntent(intent, chip).view.proteinClaim, false);
});

test("a refinement may switch the gate on but never off", () => {
  const local = interpret("high protein");
  const hostile = { profile: {}, view: { minProtein: 12, proteinClaim: false }, text: "", unresolved: [] };
  assert.equal(adoptRefinement(local, hostile, "high protein").view.proteinClaim, true);
});

test("an explicit number beats the qualitative default", () => {
  assert.equal(interpret("high protein at least 25g protein").view.minProtein, 25);
});

// ── Resolver behaviour ──────────────────────────────────────────────────────

test("an empty intent does not narrow the grid", () => {
  const { ids } = resolveIntent([product()], interpret("asdfghjkl"), null);
  assert.equal(ids, null, "nonsense must fall through to plain text search");
});

test("residual text that matches nothing is dropped, not applied", () => {
  const { text, diagnostics } = resolveIntent([product()], {
    ...interpret("no dairy"), text: "zzzznotinanyproduct",
  }, null);
  assert.equal(text, "");
  assert.equal(diagnostics.textDropped, true);
});

test("a hard allergen is removed by eligibility, not merely ranked down", () => {
  const withDairy = product({ id: "milky", name: "Milk Cookies", nutrition: [macro("Protein", 5)] });
  const without = product({ id: "clean", name: "Oat Crunch", nutrition: [macro("Protein", 5)] });
  const { ids } = resolveIntent([withDairy, without], interpret("no dairy"), null);
  assert.ok(!ids.has("milky"));
  assert.ok(ids.has("clean"));
});

test("an empty result names a constraint worth relaxing", () => {
  const cheapLowProtein = product({ id: "cheap", price: 150, nutrition: [macro("Protein", 4)] });
  const intent = interpret("high protein snacks under rs 200");
  const { ids } = resolveIntent([cheapLowProtein], intent, null);
  assert.equal(ids.size, 0);

  const relaxations = suggestRelaxations([cheapLowProtein], intent, null, describeIntent(intent), removeFromIntent);
  assert.ok(relaxations.length > 0, "should offer at least one chip to lift");
  assert.ok(relaxations.some((r) => r.chip.id === "minProtein"));
});

// ── Chips ───────────────────────────────────────────────────────────────────

test("every chip can be removed and leaves a valid intent", () => {
  const intent = interpret("vegan high protein snacks under rs 200 without dairy, no nuts");
  const chips = describeIntent(intent);
  assert.ok(chips.length >= 5);
  for (const chip of chips) {
    const next = removeFromIntent(intent, chip);
    assert.equal(parseIntent(next).ok, true, `removing ${chip.id} produced an invalid intent`);
    assert.ok(!describeIntent(next).some((c) => c.id === chip.id), `${chip.id} survived removal`);
  }
});

test("removing every chip empties the intent", () => {
  let intent = interpret("vegan snacks under rs 200 without dairy");
  for (const chip of describeIntent(intent)) intent = removeFromIntent(intent, chip);
  assert.equal(isEmptyIntent(intent), true);
});
