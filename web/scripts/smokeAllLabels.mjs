// ============================================================================
// KOI - Preview what the engine would publish for every label photo on disk
//
// The batch form of smokeLabelReading.mjs: reads each public/media label with
// both configured models, runs the checks and the agreement, and prints one
// line per product — what would publish, and why anything would not. Writes
// nothing anywhere. Full readings go to the file given as the last argument.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/smokeAllLabels.mjs out.json
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { LABEL_INSTRUCTIONS, LABEL_JSON_SCHEMA, LabelReading } from "@/lib/engine/labelSchema.js";
import { runChecks } from "@/lib/engine/checks.js";
import { planAutoPublish, pickPrimary } from "@/lib/engine/autopublish.js";

const out = process.argv[2];
const key = process.env.OPENAI_API_KEY;
const models = [process.env.KOI_LABEL_MODEL, process.env.KOI_LABEL_VERIFIER_MODEL || process.env.KOI_LABEL_MODEL];
if (!out) { console.error("Give an output JSON path."); process.exit(1); }
if (!key || !models[0]) { console.error("OPENAI_API_KEY and KOI_LABEL_MODEL must be set."); process.exit(1); }

const BRAND = { troovy: "Troovy", skc: "Sweet Karam Coffee", os: "Open Secret", kisaansay: "KisaanSay", thb: "The Healthy Binge", mn: "Mama Nourish" };
const LABELS = [
  ["troovy-butter-label.jpg", "The Healthy Butter Cookies"], ["troovy-chocolate-label.jpg", "The Healthy Chocolate Cookies"],
  ["troovy-chips-label.jpg", "The Healthy Potato Chips"], ["skc-madras-label.jpg", "Madras Mixture"],
  ["skc-mango-label.jpg", "Mango Mysore Pak"], ["skc-ragi-label.jpg", "Ragi Hot Chocolate Milk Mix"],
  ["skc-golden-label.jpg", "Golden Milk Mix"], ["os-dfm-label.jpg", "Daily Dry Fruit Mix"],
  ["os-cb-label.jpg", "Chocolate Biscuits"], ["os-ca-label.jpg", "California Almonds"], ["os-dates-label.jpg", "Dates"],
  ["kisaansay-honey-label.jpg", "Uttrakhand Honey"], ["kisaansay-saffron-label.jpg", "Premium Pampore Saffron"],
  ["kisaansay-rice-label.jpg", "Gorakhpur Kalanamak Rice"], ["thb-crispies-label.jpg", "Moringa Jowar Crispies - Indian Masala"],
  ["thb-combo-label.jpg", "Healthy Snack Combo - Pack of 6"], ["mn-chivda-label.jpg", "Chivda Mix - Patal Poha"],
  ["mn-laddubar-label.jpg", "Dryfruit Instant Energy Laddubar"],
];

async function read(model, image) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false,
      messages: [
        { role: "system", content: LABEL_INSTRUCTIONS },
        { role: "user", content: [
          { type: "text", text: "Transcribe this label." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
        ] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "label_reading", strict: true, schema: LABEL_JSON_SCHEMA } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${model} ${res.status}`);
  const parsed = LabelReading.safeParse(JSON.parse(body.choices[0].message.content));
  if (!parsed.success) throw new Error(`${model} schema mismatch`);
  return { reading: parsed.data, tokens: body.usage?.total_tokens ?? 0 };
}

const full = [];
let tokens = 0;
for (const [file, product] of LABELS) {
  const image = fs.readFileSync(path.join("public", "media", file)).toString("base64");
  const brand = BRAND[file.split("-")[0]];
  try {
    const [x, y] = await Promise.all(models.map((m) => read(m, image)));
    tokens += x.tokens + y.tokens;
    // Same choice the pipeline makes: publish from the reading that took the per-100 column.
    const [pa, pb] = pickPrimary(x.reading, y.reading);
    const a = { reading: pa };
    const b = { reading: pb };
    const result = runChecks(a.reading);
    const plan = planAutoPublish({ reading: a.reading, second: b.reading, result, sku: { product, brand, others: LABELS.map(([, name]) => name).filter((name) => name !== product) } });
    const published = [plan.nutrition && "nutrition", plan.ingredients && "ingredients"].filter(Boolean);
    const failed = result.checks.filter((c) => c.ok === false && !["ingredients.visible", "identity.veg_mark"].includes(c.id)).map((c) => c.id);
    console.log(`${product.padEnd(40)} publish: ${published.join("+") || "-"}${plan.blocked.length ? `  BLOCKED ${plan.blocked.map((x) => `${x.group}: ${x.reason}`).join(" | ")}` : ""}${failed.length ? `  failed: ${failed.join(",")}` : ""}${a.reading.visible.ingredients ? "  [has ingredient list]" : ""}`);
    full.push({ product, first: a.reading, second: b.reading, checks: result.checks, agreement: plan.agreement, blocked: plan.blocked, published });
  } catch (err) {
    console.log(`${product.padEnd(40)} ERROR ${err.message}`);
    full.push({ product, error: err.message });
  }
}

fs.writeFileSync(out, JSON.stringify(full, null, 2));
console.log(`\n${tokens} tokens across ${LABELS.length * 2} readings. Full readings: ${out}`);
