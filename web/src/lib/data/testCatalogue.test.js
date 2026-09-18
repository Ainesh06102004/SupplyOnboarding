// ============================================================================
// KOI - tests for the local test catalogue
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { testCatalogueRows, isTestSku, TEST_SKU_PREFIX } from "@/lib/data/testCatalogue.js";
import { mapProducts } from "@/lib/data/productFetcher.js";
import { plannableFrom } from "@/lib/planner/candidates.js";
import { extractFacts } from "@/lib/recommendation/productFacts.js";

test("the test catalogue is off unless it is asked for", () => {
  assert.deepEqual(testCatalogueRows(false), []);
  assert.equal(isTestSku("9a80563e-22ac-42d2-b9a3-7b7186c974f3"), false, "a live SKU id is not a test one");
});

test("every test product says what it is, and none carries a KOI score", () => {
  const products = mapProducts(testCatalogueRows(true));
  assert.ok(products.length >= 40, `${products.length} products`);
  for (const p of products) {
    assert.ok(p.id.startsWith(TEST_SKU_PREFIX) && isTestSku(p.skuId), p.name);
    assert.match(p.brand, /\(test · Open Food Facts\)$/);
    assert.equal(p.testCatalogue.source, "Open Food Facts");
    assert.equal(p.testCatalogue.licence, "ODbL-1.0");
    assert.equal(p.testCatalogue.priceIsEstimate, true);
    assert.equal(p.score, null, "Open Food Facts data is never scored as if KOI screened it");
    assert.equal(p.label, null, "an unverified list is never a published label");
  }
});

test("a test product shows no photograph: Open Food Facts' are volunteers' own snapshots", () => {
  const products = mapProducts(testCatalogueRows(true));
  for (const p of products) {
    assert.equal(p.image?.hero ?? "", "", p.name);
  }
});

test("the test catalogue can be planned with, and its allergens still count", () => {
  const products = mapProducts(testCatalogueRows(true));
  const { catalogue, unplannable } = plannableFrom(products);
  assert.ok(catalogue.length >= 40, `${catalogue.length} plannable`);
  // Three products carry no figure KOI can plan with, and are recorded as
  // such rather than quietly dropped.
  assert.deepEqual(unplannable.map((u) => u.reason), unplannable.map(() => "cannot_quantify_a_pack"));
  assert.ok(unplannable.length <= 3, `${unplannable.length} unplannable`);

  const muesli = products.find((p) => p.name === "Super Muesli 0% Added Sugar");
  assert.ok(extractFacts(muesli).contains.has("tree_nut"), "the ingredient list names nuts");
  const peanutButter = products.find((p) => p.name === "Natural Peanut Butter Crunch");
  assert.ok(extractFacts(peanutButter).contains.has("peanut"));
  // Partial evidence proves presence, never absence.
  assert.equal(extractFacts(peanutButter).ingredientEvidence, "partial");
});
