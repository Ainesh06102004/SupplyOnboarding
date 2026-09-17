// ============================================================================
// Build the local test catalogue from Open Food Facts
//
//   node scripts/buildTestCatalogue.mjs
//
// Writes src/lib/data/fixtures/openFoodFactsTestCatalogue.js: fifteen Indian
// staples and protein foods, shaped like the rows fetchAllProducts reads from
// Supabase, so they pass through the same mapping. The storefront and the
// planner only see them when NEXT_PUBLIC_KOI_TEST_CATALOGUE=open_food_facts
// (lib/data/testCatalogue.js).
//
// WHY A FILE AND NOT THE DATABASE. The Supabase project is the live catalogue:
// koinorth.com/store lists every approved product in it. And KOI keeps Open
// Food Facts out of its own tables on purpose — the data is ODbL, share-alike,
// and sku_nutrition carries a constraint (sku_nutrition_not_from_open_food_facts)
// refusing it. A separate file under its own licence is a test fixture, not a
// derivative of KOI's database.
//
// WHAT IS NOT FROM OPEN FOOD FACTS. The prices: Open Food Facts records none,
// so each is an estimate of a typical Indian MRP for that pack, marked as such
// on every row. The clean product names and the category hints are KOI's, so
// the category tree can place them; the Open Food Facts name is kept alongside.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "src", "lib", "data", "fixtures", "openFoodFactsTestCatalogue.js");
const UA = "KOI-test-catalogue/0.1 (internal testing; koinorth.com)";
const FIELDS = [
  "code", "product_name", "brands", "quantity", "nutriments", "ingredients_text", "ingredients_text_en",
  "allergens_tags", "last_modified_t",
].join(",");

// barcode, KOI's name, brand, category hints, estimated MRP (₹) for the pack.
const PICKS = [
  ["8904043926216", "Unpolished Toor Dal", "Tata Sampann", "Staples", "Pulses", 215],
  ["8906009010601", "Split Moong Dal", "Parry's", "Staples", "Pulses", 180],
  ["8904043926728", "Besan", "Tata Sampann", "Staples", "Flours", 80],
  ["8901725016838", "Superior MP Atta", "Aashirvaad", "Staples", "Flours", 65],
  ["8906002348954", "Kabuli Chana", "Rajdhani", "Staples", "Pulses", 190],
  ["8901560600223", "Soya Chunks", "Nilon's", "Staples", "Soya", 30],
  ["0690225106542", "Brown Rice", "India Gate", "Staples", "Rice", 210],
  ["8901537007123", "Rozana Super Basmati Rice", "Daawat", "Staples", "Rice", 130],
  ["8906008812817", "Poha (Thick)", "Fortune", "Staples", "Rice", 55],
  ["8901088213608", "Oats", "Saffola", "Staples", "Breakfast Cereals", 199],
  ["8908005144618", "Super Muesli 0% Added Sugar", "Yoga Bar", "Staples", "Breakfast Cereals", 399],
  ["8904335601890", "High Protein Muesli+", "Yoga Bar", "Staples", "Breakfast Cereals", 599],
  ["8906127550010", "Natural Peanut Butter Crunch", "Alpino", "Nuts & Seeds", "Nut Butters", 549],
  ["8906055100455", "Roasted Chana", "Rajdhani", "Snacks", "Namkeen", 60],
  ["8904004403800", "Moong Dal Namkeen", "Haldiram's", "Snacks", "Namkeen", 120],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : null);
const round = (v, places = 2) => (v === null ? null : Math.round(v * 10 ** places) / 10 ** places);

function grams(quantity) {
  const m = String(quantity ?? "").toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|grams?)\b/);
  if (!m) return null;
  return m[2] === "kg" ? Number(m[1]) * 1000 : Number(m[1]);
}

/** Top-level ingredients, split on commas outside brackets. */
function ingredientNames(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of String(text ?? "").replace(/_/g, "")) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((s) => s.replace(/\s+/g, " ").replace(/\.$/, "").trim()).filter((s) => s && s.length <= 160).slice(0, 25);
}

/** Open Food Facts answers a busy moment with an HTML page, not JSON: wait and ask again. */
async function productJson(code) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, { headers: { "User-Agent": UA } });
    const text = await res.text();
    if (text.trimStart().startsWith("{")) return JSON.parse(text);
    console.log(`${code}: not JSON (HTTP ${res.status}), waiting before attempt ${attempt + 1}`);
    await sleep(10000 * attempt);
  }
  throw new Error(`Open Food Facts did not answer for ${code}`);
}

const fetchedAt = new Date().toISOString();
const products = [];
for (const [code, name, brand, l1, l2, price] of PICKS) {
  const body = await productJson(code);
  const p = body.product;
  if (!p) throw new Error(`Open Food Facts has no product ${code}`);
  const n = p.nutriments ?? {};
  const packGrams = grams(p.quantity);
  if (!packGrams) throw new Error(`${code}: cannot read a pack size from "${p.quantity}"`);
  const sodiumG = num(n.sodium_100g);
  const url = `https://world.openfoodfacts.org/product/${code}`;
  const ingredients = ingredientNames(p.ingredients_text_en || p.ingredients_text);
  const allergens = (p.allergens_tags ?? []).map((t) => `Allergen declared: ${String(t).replace(/^\w+:/, "").replace(/-/g, " ")}`);

  products.push({
    id: `off-${code}`,
    product_name: name,
    category_l1: l1,
    category_l2: l2,
    brand_id: null,
    brands: { brand_name: `${brand} (test · Open Food Facts)` },
    skus: [{
      id: `off-${code}`,
      variant_name: `${packGrams} g`,
      mrp: price,
      net_weight: `${packGrams} g`,
      sku_nutrition: [{
        measurement_basis: "per_100g",
        serving_size: null,
        energy_kcal: round(num(n["energy-kcal_100g"])),
        protein_g: round(num(n.proteins_100g)),
        carbs_g: round(num(n.carbohydrates_100g)),
        sugars_g: round(num(n.sugars_100g)),
        total_fat_g: round(num(n.fat_100g)),
        saturated_fat_g: round(num(n["saturated-fat_100g"])),
        fibre_g: round(num(n.fiber_100g)),
        sodium_mg: sodiumG === null ? null : round(sodiumG * 1000, 1),
        source: "off",
        source_ref: url,
        // When the Open Food Facts record last changed, not when KOI saw a pack.
        confirmed_at: p.last_modified_t ? new Date(p.last_modified_t * 1000).toISOString() : null,
      }],
      // Partial by name: Open Food Facts' list is unverified, so it can show an
      // allergen is present and never that one is absent.
      screening_reports: [{ is_latest: true, final_score: null, verdict: null, review_notes: null, flags: { ingredients_partial: [...ingredients, ...allergens] }, created_at: fetchedAt }],
      sku_label_facts: [],
    }],
    _test: {
      source: "Open Food Facts",
      licence: "ODbL-1.0",
      url,
      offName: p.product_name ?? null,
      priceIsEstimate: true,
      fetchedAt,
    },
  });
  console.log(`${code} ${brand} ${name}: ${packGrams} g, ${round(num(n["energy-kcal_100g"]))} kcal, ${ingredients.length} ingredients`);
  await sleep(1500);
}

const header = `// ============================================================================
// GENERATED by scripts/buildTestCatalogue.mjs on ${fetchedAt.slice(0, 10)}. Do not edit by hand.
//
// A local TEST catalogue: ${products.length} products from Open Food Facts
// (https://world.openfoodfacts.org), © Open Food Facts contributors, made
// available under the Open Database Licence (ODbL 1.0,
// https://opendatacommons.org/licenses/odbl/1-0/). This file is a separate
// database under that licence and is not part of KOI's catalogue.
//
// Prices are estimates of a typical MRP, not Open Food Facts data and not
// real prices. Shown only when NEXT_PUBLIC_KOI_TEST_CATALOGUE=open_food_facts.
// ============================================================================

`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${header}export const OPEN_FOOD_FACTS_TEST_CATALOGUE = ${JSON.stringify({ fetchedAt, products }, null, 2)};\n`);
console.log(`wrote ${products.length} products to ${path.relative(ROOT, OUT)}`);
