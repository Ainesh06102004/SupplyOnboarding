// ============================================================================
// KOI — tests for linking a KOI SKU to a marketplace listing automatically
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { pickListingMatch, scoreListing, matchQueryFor } from "@/lib/marketplace/match.js";

const CHIPS = { brand: "Troovy", product: "The Healthy Potato Chips", variant: "Masala", netWeight: "200g", mrp: 99 };

const listing = (externalId, rawName, over = {}) => ({
  marketplace: "swiggy", externalId, variantRef: `sku-${externalId}`, rawName, rawBrand: "Troovy",
  rawPackSize: "200 g", price: 89, mrp: 99, availability: "available", deliveryEta: null, observedAt: "2026-09-15T00:00:00Z",
  ...over,
});

const SEARCH = [
  listing("A", "Troovy Healthy Potato Chips Masala 200 g"),
  listing("B", "Troovy Healthy Potato Chips Lemon 200 g"),
  listing("C", "Troovy Healthy Potato Chips Masala 400 g", { rawPackSize: "400 g", mrp: 189 }),
  listing("D", "Troovy Healthy Potato Chips Masala Pack of 3", { rawPackSize: "3 x 200 g", mrp: 297 }),
  listing("E", "Lay's Potato Chips Masala 200 g", { rawBrand: "Lay's" }),
];

test("brand, name, the SKU's flavour, the exact pack and a close MRP make a trusted link", () => {
  const m = pickListingMatch(CHIPS, SEARCH);
  assert.equal(m.status, "matched");
  assert.equal(m.item.externalId, "A");
  assert.equal(m.confidence, 0.95);
});

test("another flavour, another pack, a multi-pack and another brand are each refused", () => {
  assert.equal(scoreListing(CHIPS, SEARCH[1]).confidence, 0, "lemon is not masala");
  assert.equal(scoreListing(CHIPS, SEARCH[2]).confidence, 0, "400 g is not 200 g");
  assert.equal(scoreListing(CHIPS, SEARCH[3]).confidence, 0, "a pack of three");
  assert.equal(scoreListing(CHIPS, SEARCH[4]).confidence, 0, "another brand");
});

test("a SKU with no flavour to choose by is not linked to a flavoured listing", () => {
  assert.equal(pickListingMatch({ ...CHIPS, variant: "Default" }, SEARCH).status, "no_match");
});

test("no pack size or an MRP far off is recorded as weak, below trust", () => {
  const noSize = pickListingMatch(CHIPS, [listing("A", "Troovy Healthy Potato Chips Masala", { rawPackSize: null })]);
  assert.equal(noSize.status, "weak");
  assert.equal(noSize.confidence, 0.6);
  assert.equal(pickListingMatch(CHIPS, [listing("A", "Troovy Healthy Potato Chips Masala 200 g", { mrp: 150 })]).status, "weak");
});

test("two different listings that fit equally link nothing", () => {
  const m = pickListingMatch(CHIPS, [SEARCH[0], listing("A2", "Troovy Healthy Potato Chips Masala 200 g")]);
  assert.equal(m.status, "ambiguous");
  assert.equal(m.item, undefined);
});

test("a one-word name needs that word and nothing foreign", () => {
  const dates = { brand: "Open Secret", product: "Dates", variant: "Default", netWeight: "250g", mrp: null };
  const plain = { ...listing("F", "Open Secret Dates 250 g"), rawBrand: "Open Secret", rawPackSize: "250 g" };
  const medjool = { ...listing("G", "Open Secret Medjool Dates 250 g"), rawBrand: "Open Secret", rawPackSize: "250 g" };
  assert.equal(pickListingMatch(dates, [plain, medjool]).item.externalId, "F");
  assert.equal(pickListingMatch(dates, [plain]).confidence, 0.85, "no MRP to raise it further");
});

test("a listing with no brand field is matched by the brand leading its name", () => {
  assert.equal(pickListingMatch(CHIPS, [listing("A", "Troovy Healthy Potato Chips Masala 200 g", { rawBrand: null })]).status, "matched");
});

test("the search is KOI's brand and product name", () => {
  assert.equal(matchQueryFor(CHIPS), "Troovy The Healthy Potato Chips");
  assert.equal(matchQueryFor({}), null);
});
