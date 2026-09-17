// ============================================================================
// KOI - The local test catalogue
//
// Fifteen Indian staples and protein foods from Open Food Facts
// (fixtures/openFoodFactsTestCatalogue.js, built by
// scripts/buildTestCatalogue.mjs), so the storefront and the planner can be
// tried against more than the eighteen products KOI lists today.
//
// OFF UNLESS ASKED FOR: NEXT_PUBLIC_KOI_TEST_CATALOGUE=open_food_facts. It is
// never written to Supabase. That project is the live catalogue, and Open Food
// Facts data stays out of KOI's own tables by design (ODbL share-alike; the
// sku_nutrition_not_from_open_food_facts constraint).
//
// What marks a test product: its brand reads "(test · Open Food Facts)", its
// ids start with TEST_SKU_PREFIX, and `testCatalogue` on the product says
// where it came from and that its price is an estimate. Anything that writes a
// SKU id to the database has to check isTestSku first — plan_item references
// skus(id), and these are not in that table.
// ============================================================================

import { OPEN_FOOD_FACTS_TEST_CATALOGUE } from "./fixtures/openFoodFactsTestCatalogue";

export const TEST_CATALOGUE = "open_food_facts";
export const TEST_SKU_PREFIX = "off-";

/** @param {string|null|undefined} id @returns {boolean} */
export const isTestSku = (id) => String(id ?? "").startsWith(TEST_SKU_PREFIX);

/** Read as a literal so Next inlines it into the browser bundle. */
export function testCatalogueEnabled() {
  return process.env.NEXT_PUBLIC_KOI_TEST_CATALOGUE === TEST_CATALOGUE;
}

/**
 * The test catalogue as Supabase-shaped product rows, or none when it is off.
 * @param {boolean} [enabled]
 * @returns {Array<object>}
 */
export function testCatalogueRows(enabled = testCatalogueEnabled()) {
  return enabled ? OPEN_FOOD_FACTS_TEST_CATALOGUE.products : [];
}
