// Step 5 — read nutrition tables and ingredient lists off the pack photos.
// From web/:
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/amazon/labels.mjs --plan
//       counts and a cost estimate; calls no model
//   … labels.mjs                 read now (live API)
//   … labels.mjs --batch         submit the reads to OpenAI's Batch API (half price, back within 24 h)
//   … labels.mjs --collect [<id>] store the readings from finished batches (all pending, or one)
// Add --limit N to any of them.
//
// Same rule as KOI's label engine: two independent readings, only what both
// read counts (KOI_LABEL_MODEL, KOI_LABEL_VERIFIER_MODEL). Savings
// (lib/engine/readPlan.js): only the photos a product still needs; the Batch
// API; and for a nutrition-only photo whose barcode is in Open Food Facts, one
// model reading checked against Open Food Facts instead of a second model.
// Readings stay in amazon_products.label_reading, with their usage and cost.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as cache from "./cache.mjs";
import { pool, withRateLimit } from "./oxylabs.mjs";
import { selectAll, upsert } from "./db.mjs";
import { submitInBatches, pendingBatches, fetchReplies, markCollected } from "./batch.mjs";

const { readLabel, labelRequestBody, parseImageReply } = await import("../../src/lib/engine/providers/openai.js");
const { LabelReading } = await import("../../src/lib/engine/labelSchema.js");
const { compareReadings } = await import("../../src/lib/engine/autopublish.js");
const { proposeAllergens } = await import("../../src/lib/engine/proposals.js");
const { photosToRead, offSecondOpinion, costOf } = await import("../../src/lib/engine/readPlan.js");

const args = process.argv.slice(2);
const MODE = args.includes("--plan") ? "plan" : args.includes("--batch") ? "batch" : args.includes("--collect") ? "collect" : "live";
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const MODEL = process.env.KOI_LABEL_MODEL;
const VERIFIER = process.env.KOI_LABEL_VERIFIER_MODEL;
if (!MODEL || !VERIFIER) throw new Error("KOI_LABEL_MODEL and KOI_LABEL_VERIFIER_MODEL must be set");
const JOB = "koi-amazon-labels";

// ── What still needs reading ─────────────────────────────────────────────────
async function workList() {
  const images = await selectAll("image", "select=id,asin,role,position,sha256,kind,width,height&kind=in.(nutrition,label,ingredients)");
  const readings = await selectAll("label_reading", "select=image_id,asin,agreed,agreed_fields");
  const readIds = new Set(readings.map((r) => r.image_id));
  const read = new Set(images.filter((i) => readIds.has(i.id)).map((i) => i.sha256));
  const has = new Map();
  for (const r of readings.filter((x) => x.agreed)) {
    const h = has.get(r.asin) ?? { nutrition: false, ingredients: false };
    if (r.agreed_fields?.per_100 || r.agreed_fields?.per_serving) h.nutrition = true;
    if (r.agreed_fields?.ingredients_text) h.ingredients = true;
    has.set(r.asin, h);
  }
  const photos = photosToRead(images, { read, has }).slice(0, LIMIT);
  // Every stored image row that is this photo (variants share photos): one reading covers them all.
  const rowsBySha = new Map();
  const chosen = new Set(photos.map((p) => p.sha256));
  for (const img of images) if (chosen.has(img.sha256)) (rowsBySha.get(img.sha256) ?? rowsBySha.set(img.sha256, []).get(img.sha256)).push(img);

  // Open Food Facts nutrition by barcode, for nutrition-only photos (the check, never the source).
  const barcodes = await selectAll("barcode", "select=asin,code");
  const codes = [...new Set(barcodes.map((b) => b.code))];
  const off = new Map();
  for (let i = 0; i < codes.length; i += 200) {
    const part = codes.slice(i, i + 200).map((c) => `"${c}"`).join(",");
    for (const o of await selectAll("off_products", `select=code,nutrients_per_100&code=in.(${part})`, { schema: "engine" })) {
      if (o.nutrients_per_100) off.set(o.code, o.nutrients_per_100);
    }
  }
  const offFor = new Map();
  for (const b of barcodes) if (off.has(b.code)) offFor.set(b.asin, off.get(b.code));
  const plan = photos.map((p) => ({ ...p, offCheck: p.kind === "nutrition" && offFor.has(p.asin) ? offFor.get(p.asin) : null }));
  return { plan, rowsBySha, all: images.length };
}

// ── Two readings → what was agreed ───────────────────────────────────────────
const servingGrams = (s) => {
  const m = /(\d+(?:\.\d+)?)\s*g\b/i.exec(s || "");
  return m ? Number(m[1]) : null;
};
const round = (x) => (x === null ? null : Math.round(x * 100) / 100);

function nutritionFields(n) {
  const fields = {};
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
  return fields;
}

function agreedFrom(a, b) {
  const cmp = compareReadings(a, b);
  const n = cmp.nutrition;
  const fields = n.ok && n.values ? nutritionFields(n) : {};
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

/** One model's reading of a nutrition-only photo, checked against Open Food Facts. Nutrition only; nothing copied. */
function agreedWithOff(a, offNutrients) {
  const check = offSecondOpinion(a.nutrition, offNutrients);
  if (!check.agrees) return { fields: {}, disagreements: [`Open Food Facts: ${check.why}`], agreed: false };
  return { fields: nutritionFields(a.nutrition), disagreements: [], agreed: true };
}

// Postgres jsonb refuses \u0000, which a model occasionally emits.
const clean = (v) => (v == null ? v : JSON.parse(JSON.stringify(v).replace(/\\u0000/g, "")));

async function store(rows, x, y, result, { secondSource, batchId = null }) {
  const batch = Boolean(batchId);
  const cost = (costOf(x.usage, x.model, { batch }) ?? 0) + (y ? costOf(y.usage, y.model, { batch }) ?? 0 : 0);
  await upsert("label_reading", rows.map((img) => ({
    asin: img.asin, image_id: img.id, model: x.model, verifier_model: y?.model ?? "open_food_facts",
    reading: clean(x.parsed ?? x.json), second: clean(y ? (y.parsed ?? y.json) : null),
    agreed: result.agreed, agreed_fields: clean(result.fields), disagreements: clean(result.disagreements),
    usage: { first: x.usage ?? null, second: y?.usage ?? null }, cost_usd: Math.round(cost * 1e6) / 1e6,
    second_source: secondSource, batch_id: batchId,
  })), "image_id,model");
  return cost;
}

function judge(x, y, offCheck) {
  const a = LabelReading.safeParse(x.json);
  x.parsed = a.success ? a.data : null;
  if (!y) return a.success ? agreedWithOff(a.data, offCheck) : { fields: null, disagreements: ["the reading did not match the label schema"], agreed: false };
  const b = LabelReading.safeParse(y.json);
  y.parsed = b.success ? b.data : null;
  return a.success && b.success ? agreedFrom(a.data, b.data) : { fields: null, disagreements: ["a reading did not match the label schema"], agreed: false };
}

async function photoPayload(p) {
  const bytes = readFileSync(join(cache.CACHE, "images", p.image.asin, `${p.image.role}-${p.image.position}.jpg`));
  const jpg = await sharp(bytes).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { imageBase64: jpg.toString("base64"), mimeType: "image/jpeg" };
}

// ── Modes ────────────────────────────────────────────────────────────────────
const { plan, rowsBySha, all } = MODE === "collect" ? { plan: [], rowsBySha: new Map(), all: 0 } : await workList();

if (MODE === "plan") {
  const offChecked = plan.filter((p) => p.offCheck).length;
  const calls = plan.length * 2 - offChecked;
  console.log(JSON.stringify({ labelImages: all, photosToRead: plan.length, products: new Set(plan.map((p) => p.asin)).size, offChecked, modelCalls: calls }, null, 2));
  process.exit(0);
}

if (MODE === "live") {
  let count = 0, agreed = 0, spent = 0;
  console.log(`labels: ${plan.length} photos to read (${plan.filter((p) => p.offCheck).length} checked against Open Food Facts)`);
  await pool(plan, 8, async (p) => {
    const img = await photoPayload(p);
    const [x, y] = await Promise.all([
      withRateLimit(() => readLabel({ ...img, model: MODEL })),
      p.offCheck ? null : withRateLimit(() => readLabel({ ...img, model: VERIFIER })),
    ]);
    const result = judge(x, y, p.offCheck);
    if (result.agreed) agreed++;
    spent += await store(rowsBySha.get(p.sha256) ?? [p.image], x, y, result, { secondSource: y ? "model" : "off" });
    if (++count % 25 === 0) console.log(`  read ${count}/${plan.length} (${agreed} agreed, $${spent.toFixed(3)})`);
  });
  console.log(`labels: ${count} photos read, ${agreed} agreed, $${spent.toFixed(3)} at list prices`);
}

if (MODE === "batch") {
  // Both readings of a photo travel in the same batch; custom_id says which photo and which reader.
  const ids = await submitInBatches(JOB, plan, async (p) => {
    const img = await photoPayload(p);
    const requests = [{ custom_id: `${p.sha256}|first`, body: labelRequestBody({ ...img, model: MODEL }) }];
    if (!p.offCheck) requests.push({ custom_id: `${p.sha256}|second`, body: labelRequestBody({ ...img, model: VERIFIER }) });
    return { requests, entry: { sha256: p.sha256, offCheck: p.offCheck, rows: rowsBySha.get(p.sha256) ?? [p.image] } };
  });
  console.log(`labels: ${plan.length} photos in ${ids.length} batch(es). Collect with --collect (all) or --collect <id>`);
}

if (MODE === "collect") {
  const id = args[args.indexOf("--collect") + 1];
  for (const batch of pendingBatches(JOB, id && !id.startsWith("--") ? id : null)) {
    const replies = await fetchReplies(batch);
    if (!replies) continue;
    const reply = (key) => {
      try { return replies.has(key) ? parseImageReply(replies.get(key)) : null; } catch { return null; /* a refusal or non-JSON stays unread */ }
    };
    let agreed = 0, spent = 0, stored = 0;
    for (const p of batch.entries) {
      const x = reply(`${p.sha256}|first`);
      const y = p.offCheck ? null : reply(`${p.sha256}|second`);
      if (!x || (!p.offCheck && !y)) continue;
      const result = judge(x, y, p.offCheck);
      if (result.agreed) agreed++;
      spent += await store(p.rows, x, y, result, { secondSource: y ? "model" : "off", batchId: batch.id });
      stored++;
    }
    markCollected(batch, { stored, agreed, cost_usd: Math.round(spent * 1e6) / 1e6 });
    console.log(`  batch ${batch.id}: ${stored} photos stored, ${agreed} agreed, $${spent.toFixed(3)} at batch prices`);
  }
}
