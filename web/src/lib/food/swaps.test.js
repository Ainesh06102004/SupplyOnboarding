// ============================================================================
// KOI FOOD — tests for swaps with numbers (Phase 5.1)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { swapsFor, swapFact, priceDifference } from "@/lib/food/swaps.js";

const cookies = { id: "p-cookies", skuId: "cookies", name: "Butter Cookies", brand: "Troovy", price: 120, weight: "200 g" };
const chivda = { id: "p-chivda", skuId: "chivda", name: "Chivda Mix", brand: "Mama Nourish", price: 130, weight: "200 g" };
const crispies = { id: "p-crispies", skuId: "crispies", name: "Jowar Crispies", brand: "The Healthy Binge", price: 60, weight: "40 g" };
const dates = { id: "p-dates", skuId: "dates", name: "Dates", brand: "Open Secret", price: 299, weight: "250 g" };

const edges = [
  { to_sku: "chivda", reason: "same_category", comparability: 1, basis: { category: "snacks.biscuits_cookies" } },
  { to_sku: "chivda", reason: "less_sugar", comparability: 1, basis: { from: 25, to: 15, less: 10, per: "100 g" } },
  { to_sku: "chivda", reason: "without_allergen", comparability: 1, basis: { allergens: ["dairy", "gluten"], adds: ["tree_nut"] } },
  { to_sku: "crispies", reason: "more_protein", comparability: 0.6, basis: { from: 8, to: 12, more: 4, per: "100 g" } },
  { to_sku: "dates", reason: "same_category", comparability: 1, basis: { category: "snacks.biscuits_cookies" } },
  { to_sku: "gone", reason: "less_sugar", comparability: 1, basis: { from: 25, to: 5, less: 20, per: "100 g" } },
];

test("a swap is said in its figures: shelf, percentage and price", () => {
  const swaps = swapsFor({ product: cookies, edges, catalogue: [cookies, chivda, crispies, dates] });
  assert.deepEqual(swaps.map((s) => s.name), ["Chivda Mix", "Jowar Crispies"], "same shelf first; a product not in the store is not offered");
  assert.deepEqual(swaps[0], {
    id: "p-chivda",
    skuId: "chivda",
    name: "Chivda Mix",
    brand: "Mama Nourish",
    shelf: "Same shelf",
    facts: ["40% less sugar per 100 g", "Without dairy and gluten, but contains tree nut"],
    price: "₹10 more a pack",
  });
  assert.equal(swaps[1].shelf, "Nearby shelf");
  assert.deepEqual(swaps[1].facts, ["50% more protein per 100 g"]);
  // ₹60 for 40 g is ₹150 per 100 g, against ₹60 per 100 g for the cookies.
  assert.equal(swaps[1].price, "₹90 more per 100 g", "a 40 g pack is compared per 100 g, not per pack");
});

test("the same shelf alone is not a swap, and nothing is called healthier", () => {
  const swaps = swapsFor({ product: cookies, edges, catalogue: [cookies, chivda, crispies, dates] });
  assert.ok(!swaps.some((s) => s.name === "Dates"), "Dates share the shelf but no figure differs enough to say so");
  // KOI's own words: a brand may call itself "The Healthy Binge", KOI calls nothing healthier.
  assert.doesNotMatch(JSON.stringify(swaps.map(({ shelf, facts, price }) => ({ shelf, facts, price }))), /health|better|best|good for/i);
  assert.deepEqual(swapsFor({ product: { name: "no sku" }, edges, catalogue: [chivda] }), []);
});

test("prices compare like for like, or not at all", () => {
  assert.equal(priceDifference(cookies, { ...chivda, price: 120 }), "Same price a pack");
  assert.equal(priceDifference(cookies, { ...chivda, price: 100 }), "₹20 less a pack");
  assert.equal(priceDifference({ price: 100, weight: "200 g" }, { price: 100, weight: "200 ml" }), null, "grams and millilitres are not compared");
  assert.equal(priceDifference({ price: 100, weight: "N/A" }, { price: 90, weight: "200 g" }), null);
  assert.equal(swapFact({ reason: "cheaper_per_g_protein", basis: { from: 10, to: 6, less: 4 } }), "40% less per gram of protein");
});
