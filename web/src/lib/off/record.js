// ============================================================================
// KOI — One Open Food Facts product, as KOI stages it
//
// Phase 1.5. Open Food Facts publishes the same product in two shapes: the
// daily CSV export (tab-separated, one column per field) and the JSON product
// documents in its delta files and API. Both become one row for
// engine.off_products, under KOI's own field names, or nothing.
//
// Nothing becomes a row unless it is sold in India, has a usable barcode and a
// modification time. Figures outside what a food can hold (protein above 100 g
// per 100 g, say) are dropped rather than stored: the database is volunteer
// entered, and a typo should not reach a comparison.
//
// These rows are staging only. They never reach the storefront or KOI's own
// tables — see supabase/migrations/00030_open_food_facts_staging.sql.
//
// Pure: imported by the daily sync and by scripts/importOpenFoodFacts.mjs.
// ============================================================================

export const OFF_ATTRIBUTION = "Open Food Facts (openfoodfacts.org), Open Database Licence";

// KOI field -> Open Food Facts per-100 key, with the most a food can hold.
const NUTRIENTS = Object.freeze({
  energy_kcal: ["energy-kcal_100g", 950],
  protein_g: ["proteins_100g", 100],
  carbs_g: ["carbohydrates_100g", 100],
  sugars_g: ["sugars_100g", 100],
  fibre_g: ["fiber_100g", 100],
  total_fat_g: ["fat_100g", 100],
  saturated_fat_g: ["saturated-fat_100g", 100],
});
const MAX_SODIUM_MG = 40_000;
const MAX_TAGS = 60;

const round = (v) => Math.round(v * 100) / 100;

function amount(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function text(value, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** An array of tags, or a comma-separated string of them. */
export function tagList(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(list.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TAGS);
}

export const isIndian = (countriesTags) => tagList(countriesTags).includes("en:india");

// The CSV export writes brand tags as "xx:pintola"; product documents write
// "pintola". One form, so a brand matches whichever file its row came from.
export const brandTags = (value) => [...new Set(tagList(value).map((t) => t.replace(/^[a-z]{2}:/, "")))];

function httpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)openfoodfacts\.org$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Per-100 figures under KOI's names. Sodium from its own field, else from salt.
 * @param {(key: string) => unknown} get
 */
export function nutrientsPer100(get) {
  const out = {};
  for (const [field, [key, max]] of Object.entries(NUTRIENTS)) {
    const v = amount(get(key), max);
    if (v !== null) out[field] = round(v);
  }
  const sodium = amount(get("sodium_100g"), MAX_SODIUM_MG / 1000);
  const salt = amount(get("salt_100g"), (MAX_SODIUM_MG / 1000) * 2.5);
  if (sodium !== null) out.sodium_mg = round(sodium * 1000);
  else if (salt !== null) out.sodium_mg = round(salt * 400);
  return out;
}

/**
 * @param {object} doc an Open Food Facts product document
 * @param {string} importedFrom "csv_export" or "delta:<file>"
 * @returns {object|null} an engine.off_products row
 */
export function fromProduct(doc, importedFrom) {
  if (!doc || typeof doc !== "object" || !isIndian(doc.countries_tags)) return null;
  const code = String(doc.code ?? "").trim();
  if (!/^[0-9]{4,20}$/.test(code)) return null;
  const modified = Number(doc.last_modified_t);
  if (!Number.isFinite(modified) || modified <= 0) return null;

  const nutriments = doc.nutriments && typeof doc.nutriments === "object" ? doc.nutriments : {};
  const nova = Number(doc.nova_group);
  const completeness = Number(doc.completeness);

  return {
    code,
    product_name: text(doc.product_name, 300) ?? text(doc.product_name_en, 300),
    brands: text(doc.brands, 300),
    brand_tags: brandTags(doc.brands_tags),
    quantity: text(doc.quantity, 80),
    categories_tags: tagList(doc.categories_tags),
    ingredients_text: text(doc.ingredients_text, 6000) ?? text(doc.ingredients_text_en, 6000),
    allergens_tags: tagList(doc.allergens_tags),
    traces_tags: tagList(doc.traces_tags),
    nova_group: [1, 2, 3, 4].includes(nova) ? nova : null,
    nutrients_per_100: nutrientsPer100((key) => nutriments[key]),
    image_front_url: httpsUrl(doc.image_front_url ?? doc.image_url),
    image_ingredients_url: httpsUrl(doc.image_ingredients_url),
    image_nutrition_url: httpsUrl(doc.image_nutrition_url),
    completeness: Number.isFinite(completeness) && completeness >= 0 && completeness <= 1 ? completeness : null,
    off_last_modified: new Date(modified * 1000).toISOString(),
    imported_from: importedFrom,
  };
}

const CSV_NUTRIENT_KEYS = Object.freeze([...Object.values(NUTRIENTS).map(([key]) => key), "sodium_100g", "salt_100g"]);

/**
 * One line of the CSV export.
 * @param {Map<string, number>} columns header name -> index
 * @param {string[]} cells the line split on tabs
 * @param {string} importedFrom
 */
export function fromCsv(columns, cells, importedFrom) {
  const get = (name) => {
    const i = columns.get(name);
    return i === undefined ? undefined : cells[i];
  };
  if (!isIndian(get("countries_tags"))) return null;
  return fromProduct({
    code: get("code"),
    product_name: get("product_name"),
    brands: get("brands"),
    brands_tags: get("brands_tags"),
    quantity: get("quantity"),
    categories_tags: get("categories_tags"),
    countries_tags: get("countries_tags"),
    ingredients_text: get("ingredients_text"),
    allergens_tags: get("allergens"),
    traces_tags: get("traces_tags"),
    nova_group: get("nova_group"),
    completeness: get("completeness"),
    last_modified_t: get("last_modified_t"),
    image_url: get("image_url"),
    image_ingredients_url: get("image_ingredients_url"),
    image_nutrition_url: get("image_nutrition_url"),
    nutriments: Object.fromEntries(CSV_NUTRIENT_KEYS.map((key) => [key, get(key)])),
  }, importedFrom);
}
