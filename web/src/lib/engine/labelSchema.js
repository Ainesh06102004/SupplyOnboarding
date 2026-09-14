// ============================================================================
// KOI ENGINE — What a label reading may contain
//
// A model reading a pack photo returns exactly this shape and nothing else:
// the provider is asked for it as a strict JSON schema (LABEL_JSON_SCHEMA), and
// what comes back is parsed again with Zod (LabelReading) before anything uses
// it. Two layers, because the first is the provider's promise and the second is
// KOI's check of it.
//
// The shape is a TRANSCRIPTION, not an interpretation. There is no field for a
// score, a verdict, a claim or a health note, so none can be returned. Every
// value is nullable because the honest answer to "what does the label say?" is
// often "that part isn't on this photo". `visible` records which parts were on
// the image, and `unreadable` names what was there but illegible.
//
// Parsing also NORMALISES, because two models transcribing the same label
// disagree on form far more often than on substance: one returns "" where the
// other returns null, one copies "Serving Size: 15g (2 Biscuits Approx.)"
// where the other copies "15g". Left raw, those read as disagreements and
// block a table both models read correctly. Normalising never invents: a
// serving size becomes its amount only when exactly one amount is printed.
//
// Pure: no I/O, safe to import from tests and from the browser.
// ============================================================================

import { z } from "zod";

// Bump when the instructions or the schema change, so a stored reading always
// says which version produced it (engine.extraction_outputs.prompt_version).
export const PROMPT_VERSION = "label-v2";

// Named for their public.sku_nutrition columns, so a reading maps across 1:1.
export const NUTRIENT_FIELDS = Object.freeze([
  "energy_kcal", "protein_g", "carbs_g", "sugars_g", "added_sugar_g", "fibre_g",
  "total_fat_g", "saturated_fat_g", "trans_fat_g", "sodium_mg", "cholesterol_mg",
]);

const BASES = ["per_100g", "per_100ml", "per_serving"];
// Generous limits: a limit exists to stop a runaway reply, not to reject a
// licence number that arrived with its printed "FSSAI Lic. No." prefix.
const text = (max) => z.string().trim().max(max).nullable();

const UNITS = Object.freeze({
  kg: "kg", g: "g", gm: "g", gms: "g", gram: "g", grams: "g",
  ml: "ml", l: "l", ltr: "l", litre: "l", litres: "l", liter: "l", liters: "l",
});
const AMOUNT = /(\d+(?:\.\d+)?)\s*(kg|gms|gm|grams|gram|g|ml|litres|litre|liters|liter|ltr|l)\b/gi;

/**
 * "Serving Size: 15g (2 Biscuits Approx.)" -> "15g"; "Per 35g Serving" -> "35g".
 * Only when exactly one amount is printed; otherwise the text is kept as read,
 * and basis.js will refuse to convert it — which is the honest outcome.
 * @param {string|null} value
 * @returns {string|null}
 */
export function canonicalServing(value) {
  if (value === null || value === undefined) return null;
  const found = new Set();
  for (const m of String(value).matchAll(AMOUNT)) {
    const unit = UNITS[m[2].toLowerCase()];
    if (unit) found.add(`${Number(m[1])}${unit}`);
  }
  return found.size === 1 ? [...found][0] : String(value).trim() || null;
}

const blank = (v) => (typeof v === "string" && v.trim() === "" ? null : v);

function normalise(r) {
  const licence = blank(r.fssai_licence);
  const digits = licence ? licence.match(/\d{14}/) : null;
  return {
    ...r,
    product_name: blank(r.product_name),
    brand: blank(r.brand),
    net_quantity: blank(r.net_quantity),
    ingredients_text: blank(r.ingredients_text),
    allergen_statement: blank(r.allergen_statement),
    may_contain_statement: blank(r.may_contain_statement),
    fssai_licence: digits ? digits[0] : licence,
    nutrition: { ...r.nutrition, serving_size: canonicalServing(blank(r.nutrition.serving_size)) },
  };
}

export const LabelReading = z.object({
  visible: z.object({
    ingredients: z.boolean(),
    allergen_statement: z.boolean(),
    nutrition_table: z.boolean(),
  }),
  product_name: text(300),
  brand: text(200),
  net_quantity: text(80),
  veg_mark: z.enum(["veg", "non_veg", "not_visible"]),
  ingredients_text: text(6000),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    percent: z.number().min(0).max(100).nullable(),
  })).max(120),
  allergen_statement: text(1000),
  may_contain_statement: text(1000),
  nutrition: z.object({
    basis: z.enum(BASES).nullable(),
    serving_size: text(120),
    servings_per_pack: z.number().positive().nullable(),
    values: z.object(Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, z.number().nonnegative().nullable()]))),
  }),
  fssai_licence: text(120),
  unreadable: z.array(z.string().max(200)).max(40),
}).transform(normalise);

// ── The provider-side schema ───────────────────────────────────────────────
// Hand-written rather than generated: strict structured output accepts only a
// subset of JSON Schema (no maxLength, every property required, no extra
// properties), and a generated schema that trips it fails every request.
const nullable = (type) => ({ type: [type, "null"] });
const obj = (properties) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});

export const LABEL_JSON_SCHEMA = obj({
  visible: obj({
    ingredients: { type: "boolean" },
    allergen_statement: { type: "boolean" },
    nutrition_table: { type: "boolean" },
  }),
  product_name: nullable("string"),
  brand: nullable("string"),
  net_quantity: nullable("string"),
  veg_mark: { type: "string", enum: ["veg", "non_veg", "not_visible"] },
  ingredients_text: nullable("string"),
  ingredients: { type: "array", items: obj({ name: { type: "string" }, percent: nullable("number") }) },
  allergen_statement: nullable("string"),
  may_contain_statement: nullable("string"),
  nutrition: obj({
    basis: { type: ["string", "null"], enum: [...BASES, null] },
    serving_size: nullable("string"),
    servings_per_pack: nullable("number"),
    values: obj(Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, nullable("number")]))),
  }),
  fssai_licence: nullable("string"),
  unreadable: { type: "array", items: { type: "string" } },
});

// ── The instructions ───────────────────────────────────────────────────────
// Every rule here closes a way a reading could become a claim nobody printed.
export const LABEL_INSTRUCTIONS = [
  "You transcribe photos of Indian packaged-food labels for a grocery catalogue.",
  "Report only what is printed in the image. Copy text exactly as printed: do not correct, translate, summarise or complete it.",
  "If a part of the label is not in the photo, set it to null (or an empty list) and set the matching `visible` flag to false. If it is in the photo but you cannot read it, set it to null and name the field in `unreadable`. Use null, never an empty string.",
  "Never infer anything from the product type, the brand, the pictures, or what similar products usually contain. A missing ingredient list stays missing.",
  "product_name: the product's name as printed, not the manufacturer or marketer's company name.",
  "ingredients_text: the whole ingredient list verbatim. ingredients: the same list in printed order, split at top-level commas, with bracketed sub-ingredients kept inside their parent's name; percent only where a percentage is printed for that top-level ingredient.",
  "allergen_statement: the allergen declaration (for example \"Contains: milk, soy\") verbatim. may_contain_statement: any \"may contain\" or shared-facility statement verbatim.",
  "nutrition: if a per 100 g or per 100 ml column is printed, report that column and its basis; otherwise report the per-serving column with basis per_serving. serving_size: the serving amount as printed. Do not compute or convert any number. energy_kcal only when kcal is printed. sodium_mg only when printed in mg; if it is printed in another unit, leave it null and add it to `unreadable`.",
  "veg_mark: \"veg\" for the green square with a green dot, \"non_veg\" for the brown or red mark, otherwise \"not_visible\".",
  "Do not add health commentary, scores, or claims of your own.",
].join("\n");
