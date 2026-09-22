// Step 5 — read nutrition tables and ingredient lists off the pack photos.
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/amazon/labels.mjs
// Same rule as KOI's label engine: two models read each photo independently
// (KOI_LABEL_MODEL, KOI_LABEL_VERIFIER_MODEL); only what both read counts.
// Readings stay in amazon_products.label_reading; nothing is published.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as cache from "./cache.mjs";
import { pool, withRateLimit } from "./oxylabs.mjs";
import { selectAll, upsert } from "./db.mjs";

const { readLabel } = await import("../../src/lib/engine/providers/openai.js");
const { LabelReading } = await import("../../src/lib/engine/labelSchema.js");
const { compareReadings } = await import("../../src/lib/engine/autopublish.js");
const { proposeAllergens } = await import("../../src/lib/engine/proposals.js");

const MODEL = process.env.KOI_LABEL_MODEL;
const VERIFIER = process.env.KOI_LABEL_VERIFIER_MODEL;
if (!MODEL || !VERIFIER) throw new Error("KOI_LABEL_MODEL and KOI_LABEL_VERIFIER_MODEL must be set");

const images = await selectAll("image", "select=id,asin,role,position,sha256,kind&kind=in.(nutrition,label,ingredients)");
const done = new Set((await selectAll("label_reading", `select=image_id&model=eq.${MODEL}`)).map((r) => r.image_id));
const byHash = new Map();
for (const r of images) if (!done.has(r.id)) (byHash.get(r.sha256) || byHash.set(r.sha256, []).get(r.sha256)).push(r);
console.log(`labels: ${byHash.size} unique label photos to read (${images.length} label images, ${done.size} already read)`);

const servingGrams = (s) => {
  const m = /(\d+(?:\.\d+)?)\s*g\b/i.exec(s || "");
  return m ? Number(m[1]) : null;
};
const round = (x) => (x === null ? null : Math.round(x * 100) / 100);

function agreedFrom(a, b) {
  const cmp = compareReadings(a, b);
  const fields = {};
  const n = cmp.nutrition;
  if (n.ok && n.values) {
    const g = servingGrams(n.serving_size);
    if (n.basis === "per_100g") {
      fields.per_100 = n.values;
      if (g) fields.per_serving = Object.fromEntries(Object.entries(n.values).map(([k, v]) => [k, v === null ? null : round((v * g) / 100)]));
    } else if (n.basis === "per_serving") {
      fields.per_serving = n.values;
      if (g) fields.per_100 = Object.fromEntries(Object.entries(n.values).map(([k, v]) => [k, v === null ? null : round((v * 100) / g)]));
    }
    fields.basis_read = n.basis;
    fields.serving_size = n.serving_size;
    fields.serving_g = g;
    fields.servings_per_pack = n.servings_per_pack;
  }
  if (cmp.ingredients.ok) fields.ingredients_text = a.ingredients_text;
  if (cmp.allergens.ok && (a.visible.allergen_statement || cmp.ingredients.ok)) {
    const p = proposeAllergens(a);
    fields.allergens = { contains: p.contains, may_contain: p.may_contain };
  }
  if (a.fssai_licence && a.fssai_licence === b.fssai_licence) fields.fssai_licence = a.fssai_licence;
  if (a.veg_mark !== "not_visible" && a.veg_mark === b.veg_mark) fields.veg_mark = a.veg_mark;
  const disagreements = [...n.differences, ...n.dropped, ...cmp.ingredients.differences, ...cmp.allergens.differences];
  return { fields, disagreements, agreed: Object.keys(fields).some((k) => ["per_100", "per_serving", "ingredients_text"].includes(k)) };
}

let count = 0, agreed = 0;
await pool([...byHash.values()], 8, async (rs) => {
  const r = rs[0];
  const bytes = readFileSync(join(cache.CACHE, "images", r.asin, `${r.role}-${r.position}.jpg`));
  const jpg = await sharp(bytes).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const img = { imageBase64: jpg.toString("base64"), mimeType: "image/jpeg" };
  const [x, y] = await Promise.all([
    withRateLimit(() => readLabel({ ...img, model: MODEL })),
    withRateLimit(() => readLabel({ ...img, model: VERIFIER })),
  ]);
  const a = LabelReading.safeParse(x.json);
  const b = LabelReading.safeParse(y.json);
  let result = { fields: null, disagreements: ["a reading did not match the label schema"], agreed: false };
  if (a.success && b.success) result = agreedFrom(a.data, b.data);
  if (result.agreed) agreed++;
  // Postgres jsonb refuses \u0000, which a model occasionally emits.
  const clean = (v) => (v == null ? v : JSON.parse(JSON.stringify(v).replace(/\\u0000/g, "")));
  await upsert("label_reading", rs.map((img) => ({
    asin: img.asin, image_id: img.id, model: x.model, verifier_model: y.model,
    reading: clean(a.success ? a.data : x.json), second: clean(b.success ? b.data : y.json),
    agreed: result.agreed, agreed_fields: clean(result.fields), disagreements: clean(result.disagreements),
  })), "image_id,model");
  if (++count % 25 === 0) console.log(`  read ${count}/${byHash.size} (${agreed} agreed)`);
});
console.log(`labels: ${count} photos read, ${agreed} with agreed figures or lists`);
