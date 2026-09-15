// ============================================================================
// KOI DEMAND — tests for which search words are counted
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { interpret } from "@/lib/ai/intent";
import { demandTerms, sanitiseTerm, MAX_TERMS } from "@/lib/demand/terms.js";

const PRODUCTS = [
  { name: "California Almonds", brand: "Open Secret", category: "Dry Fruits", tags: ["High Protein"] },
  { name: "Madras Mixture", brand: "Sweet Karam Coffee", category: "Namkeen", tags: [] },
];

test("a product word the catalogue does not carry is counted as not stocked", () => {
  assert.deepEqual(demandTerms(interpret("kombucha"), PRODUCTS), [{ term: "kombucha", kind: "not_stocked" }]);
});

test("the word is counted, never the sentence around it", () => {
  assert.deepEqual(demandTerms(interpret("show me kombucha under ₹200"), PRODUCTS), [{ term: "kombucha", kind: "not_stocked" }]);
});

test("a word the catalogue answers is not demand", () => {
  assert.deepEqual(demandTerms(interpret("madras mixture"), PRODUCTS), []);
});

test("with no catalogue loaded, nothing counts as unstocked", () => {
  assert.deepEqual(demandTerms(interpret("kombucha"), []), []);
});

test("a restriction KOI cannot enforce is counted as vocabulary to add", () => {
  assert.deepEqual(demandTerms(interpret("mushroom free"), PRODUCTS), [{ term: "mushroom", kind: "cannot_filter" }]);
});

test("medical conditions and health states are never counted", () => {
  assert.deepEqual(demandTerms(interpret("diabetes friendly"), PRODUCTS), []);
  assert.deepEqual(demandTerms(interpret("pregnancy"), PRODUCTS), []);
  assert.equal(sanitiseTerm("kidney friendly"), null);
});

test("numbers, emails and long phrases are rejected whole", () => {
  assert.equal(sanitiseTerm("call 9876543210"), null);
  assert.equal(sanitiseTerm("me@example.com"), null);
  assert.equal(sanitiseTerm("one two three four"), null);
  assert.equal(sanitiseTerm("ab"), null);
  assert.equal(sanitiseTerm(42), null);
});

test("terms are folded to one form, in any script", () => {
  assert.equal(sanitiseTerm("  Keto   Bread "), "keto bread");
  assert.equal(sanitiseTerm("गुड़"), "गुड़");
});

test("one search reports at most a few terms", () => {
  const intent = { text: "", unresolved: ["onion", "garlic", "corn", "yeast", "sesame", "onion"] };
  assert.equal(demandTerms(intent, PRODUCTS).length, MAX_TERMS);
});
