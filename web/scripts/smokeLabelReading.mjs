// ============================================================================
// KOI - Read one label photo with both configured models, no database
//
// Proves the model half of the engine end to end — the real instructions, the
// real strict schema, both readings, the checks, the agreement and the
// publish decision — against an image on disk, without writing anything. Use
// it to choose KOI_LABEL_MODEL / KOI_LABEL_VERIFIER_MODEL, or to see why a
// label would be blocked, before running the engine for real.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/smokeLabelReading.mjs \
//        public/media/skc-madras-label.jpg "Madras Mixture" "Sweet Karam Coffee" 200g
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { LABEL_INSTRUCTIONS, LABEL_JSON_SCHEMA, LabelReading } from "@/lib/engine/labelSchema.js";
import { runChecks } from "@/lib/engine/checks.js";
import { planAutoPublish, pickPrimary } from "@/lib/engine/autopublish.js";

const [file, product = "", brand = "", netWeight = null] = process.argv.slice(2);
const key = process.env.OPENAI_API_KEY;
const models = [process.env.KOI_LABEL_MODEL, process.env.KOI_LABEL_VERIFIER_MODEL || process.env.KOI_LABEL_MODEL];

if (!file || !fs.existsSync(file)) { console.error("Give an image path that exists."); process.exit(1); }
if (!key || !models[0]) { console.error("OPENAI_API_KEY and KOI_LABEL_MODEL must be set."); process.exit(1); }

const mime = path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
const image = fs.readFileSync(file).toString("base64");

async function read(model) {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      messages: [
        { role: "system", content: LABEL_INSTRUCTIONS },
        { role: "user", content: [
          { type: "text", text: "Transcribe this label." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${image}`, detail: "high" } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "label_reading", strict: true, schema: LABEL_JSON_SCHEMA } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${model}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  const parsed = LabelReading.safeParse(JSON.parse(body.choices[0].message.content));
  if (!parsed.success) throw new Error(`${model}: schema mismatch ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  return { model: body.model, reading: parsed.data, ms: Date.now() - started, tokens: body.usage?.total_tokens };
}

const [r1, r2] = await Promise.all(models.map(read));
// Same choice the pipeline makes: publish from the reading that took the per-100 column.
const [primaryReading] = pickPrimary(r1.reading, r2.reading);
const [first, second] = primaryReading === r1.reading ? [r1, r2] : [r2, r1];
const result = runChecks(first.reading);
const plan = planAutoPublish({ reading: first.reading, second: second.reading, result, sku: { product, brand, netWeight } });

const summary = (r) => ({
  model: r.model, ms: r.ms, tokens: r.tokens,
  visible: r.reading.visible, name: r.reading.product_name, basis: r.reading.nutrition.basis,
  serving: r.reading.nutrition.serving_size, values: r.reading.nutrition.values,
  ingredients: r.reading.ingredients_text, allergen_statement: r.reading.allergen_statement, unreadable: r.reading.unreadable,
});

console.log(JSON.stringify({
  first: summary(first),
  second: summary(second),
  checks: result.checks.map((c) => `${c.ok === true ? "pass" : c.ok === false ? "FAIL" : "skip"}  ${c.id}: ${c.detail}`),
  confidence: result.confidence,
  agreement: plan.agreement,
  would_publish: { nutrition: Boolean(plan.nutrition), ingredients: Boolean(plan.ingredients) },
  blocked: plan.blocked,
}, null, 2));
