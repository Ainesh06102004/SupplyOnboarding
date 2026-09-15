// ============================================================================
// KOI — tests for staging and cross-checking Open Food Facts products
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { fromProduct, fromCsv, nutrientsPer100, tagList, isIndian } from "@/lib/off/record.js";
import { findOffMatch, compareWithOff, brandSlug, shouldReread, REREAD_COOLDOWN_DAYS } from "@/lib/off/match.js";

test("a disagreement re-reads the label once a month at most, and never over a person's check", () => {
  const now = Date.parse("2026-09-15T00:00:00Z");
  const daysAgo = (d) => new Date(now - d * 86_400_000).toISOString();
  assert.equal(shouldReread({ now }), true, "never asked before");
  assert.equal(shouldReread({ lastRequestedAt: daysAgo(3), now }), false);
  assert.equal(shouldReread({ lastRequestedAt: daysAgo(REREAD_COOLDOWN_DAYS), now }), true);
  assert.equal(shouldReread({ nutritionVerified: true, now }), false);
});

const doc = (over = {}) => ({
  code: "8908015836114",
  product_name: "The Healthy Binge Moringa Jowar Crispies",
  brands: "The Healthy Binge",
  brands_tags: ["the-healthy-binge"],
  countries_tags: ["en:india"],
  last_modified_t: 1727940470,
  nova_group: 4,
  nutriments: { "energy-kcal_100g": 480, "proteins_100g": 9, "salt_100g": 1.5 },
  ...over,
});

// ── Staging ────────────────────────────────────────────────────────────────

test("an Indian product becomes a staging row under KOI's field names", () => {
  const row = fromProduct(doc(), "delta:x.json.gz");
  assert.equal(row.code, "8908015836114");
  assert.equal(row.nova_group, 4);
  assert.deepEqual(row.nutrients_per_100, { energy_kcal: 480, protein_g: 9, sodium_mg: 600 });
  assert.equal(row.off_last_modified, "2024-10-03T07:27:50.000Z");
  assert.equal(row.imported_from, "delta:x.json.gz");
});

test("nothing is staged that is not sold in India, has no barcode, or no modification time", () => {
  assert.equal(fromProduct(doc({ countries_tags: ["en:france"] }), "x"), null);
  assert.equal(fromProduct(doc({ code: "abc" }), "x"), null);
  assert.equal(fromProduct(doc({ last_modified_t: undefined }), "x"), null);
});

test("figures no food can hold are dropped, and sodium prefers its own field", () => {
  const n = nutrientsPer100((k) => ({ "proteins_100g": 450, "sugars_100g": "12.5", "sodium_100g": 0.4, "salt_100g": 9 })[k]);
  assert.deepEqual(n, { sugars_g: 12.5, sodium_mg: 400 });
});

test("tags arrive as arrays or comma-separated strings", () => {
  assert.deepEqual(tagList("en:milk, en:soybeans,en:milk"), ["en:milk", "en:soybeans"]);
  assert.equal(isIndian("en:united-states,en:india"), true);
});

test("a CSV export line reads the same as the product document", () => {
  const header = ["code", "product_name", "brands", "brands_tags", "countries_tags", "last_modified_t", "allergens", "energy-kcal_100g", "proteins_100g", "salt_100g"];
  const columns = new Map(header.map((name, i) => [name, i]));
  const cells = ["8908015836114", "Moringa Jowar Crispies", "The Healthy Binge", "xx:the-healthy-binge", "en:india", "1727940470", "en:gluten", "480", "9", "1.5"];
  const row = fromCsv(columns, cells, "csv_export");
  assert.deepEqual(row.brand_tags, ["the-healthy-binge"], "the export's xx: prefix is dropped, so brands match");
  assert.deepEqual(row.allergens_tags, ["en:gluten"]);
  assert.deepEqual(row.nutrients_per_100, { energy_kcal: 480, protein_g: 9, sodium_mg: 600 });
  assert.equal(fromCsv(columns, cells.map((c, i) => (i === 4 ? "en:germany" : c)), "csv_export"), null);
});

// ── Matching ───────────────────────────────────────────────────────────────

const OFF = [
  { code: "8908015836114", product_name: "The Healthy Binge Moringa Jowar Crispies", brand_tags: ["the-healthy-binge"] },
  { code: "8908018651172", product_name: "Troovy Potato Chips Lemon", brand_tags: ["troovy"] },
  { code: "8908018651189", product_name: "Troovy Potato Chips Tangy Tomato", brand_tags: ["troovy"] },
  { code: "8908013328000", product_name: "Choco Almond Cookies", brand_tags: ["open-secret"] },
];

test("a barcode is an exact match", () => {
  const m = findOffMatch({ barcode: "08908013328000", product: "Anything", brand: "Other" }, OFF);
  assert.equal(m.method, "barcode");
  assert.equal(m.row.code, "8908013328000");
});

test("by name: same brand, and every other word of theirs is in KOI's name", () => {
  const m = findOffMatch({ product: "Moringa Jowar Crispies - Indian Masala", brand: "The Healthy Binge", variant: "Default" }, OFF);
  assert.equal(m.status, "matched");
  assert.equal(m.row.code, "8908015836114");
  assert.equal(brandSlug("The Healthy Binge"), "the-healthy-binge");
});

test("another brand's product of the same name is never a match", () => {
  assert.equal(findOffMatch({ product: "Moringa Jowar Crispies", brand: "Troovy" }, OFF).status, "no_match");
});

test("a flavour is a match only for the SKU of that flavour", () => {
  assert.equal(findOffMatch({ product: "The Healthy Potato Chips", brand: "Troovy", variant: "Masala" }, OFF).status, "no_match");
  assert.equal(findOffMatch({ product: "The Healthy Potato Chips", brand: "Troovy", variant: "Default" }, OFF).status, "no_match");
  assert.equal(findOffMatch({ product: "The Healthy Potato Chips", brand: "Troovy", variant: "Lemon" }, OFF).row.code, "8908018651172");
});

test("two products that fit equally are ambiguous, and nothing is compared", () => {
  const twice = [...OFF, { code: "8908015836999", product_name: "Moringa Jowar Crispies", brand_tags: ["the-healthy-binge"] }];
  const m = findOffMatch({ product: "Moringa Jowar Crispies - Indian Masala", brand: "The Healthy Binge" }, twice);
  assert.equal(m.status, "ambiguous");
  assert.equal(m.row, undefined);
});

// ── Comparing ──────────────────────────────────────────────────────────────

test("figures within label rounding agree; a different number does not", () => {
  const koi = { measurement_basis: "per_100g", serving_size: "30g", energy_kcal: 485, protein_g: 9.4, sugars_g: 4, sodium_mg: 620 };
  const c = compareWithOff(koi, { energy_kcal: 480, protein_g: 9, sugars_g: 12, sodium_mg: 600 });
  assert.equal(c.comparable, true);
  assert.deepEqual(c.disagreements, ["sugars_g"]);
});

test("a per-serving row is converted before it is compared", () => {
  const koi = { measurement_basis: "per_serving", serving_size: "50g", energy_kcal: 240, protein_g: 4.5 };
  const c = compareWithOff(koi, { energy_kcal: 480, protein_g: 9 });
  assert.deepEqual(c.disagreements, []);
  assert.equal(c.fields.find((f) => f.field === "energy_kcal").koi, 480);
});

test("nothing to compare is said plainly", () => {
  assert.equal(compareWithOff({ measurement_basis: "per_100g", energy_kcal: 480 }, {}).comparable, false);
  assert.equal(compareWithOff(null, { energy_kcal: 480 }).comparable, false);
});
