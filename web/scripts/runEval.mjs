// ============================================================================
// KOI - Run the label reader against the evaluation set, and record the result
//
// Phase 1.7. Draws every case in src/lib/engine/eval/cases.js as a label image,
// reads it exactly as production does (two independent readings, checks,
// planAutoPublish), scores what would have been published
// (src/lib/engine/evaluation.js), and records the run in engine.eval_runs.
// The engine reads no label photo until the latest run for its prompt version
// and models passed (src/lib/engine/evalGate.js).
//
// Spends model credit: two readings per case.
//
// Usage, from web/:
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/runEval.mjs
//   ... scripts/runEval.mjs --render-only                    draw the images, read nothing
//   ... scripts/runEval.mjs --only=hindi-only,salt-not-sodium  run some cases; records nothing
//
// --conditions=react-server lets the engine's server-only modules load outside
// Next, the way Next itself resolves them on the server.
// ============================================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { CASES, EVAL_SET_VERSION } from "@/lib/engine/eval/cases.js";
import { labelSvg } from "@/lib/engine/eval/render.js";
import { readLabel } from "@/lib/engine/providers/openai.js";
import { LabelReading, PROMPT_VERSION } from "@/lib/engine/labelSchema.js";
import { runChecks } from "@/lib/engine/checks.js";
import { pickPrimary, planAutoPublish } from "@/lib/engine/autopublish.js";
import { scoreCase, summarise } from "@/lib/engine/evaluation.js";
import { evalConfig } from "@/lib/engine/evalGate.js";

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length).split(",").filter(Boolean);
const RENDER_ONLY = args.includes("--render-only");
const CONCURRENCY = 3;

const selected = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
if (!selected.length) {
  console.error("No evaluation cases selected.");
  process.exit(1);
}

const config = evalConfig();
if (!RENDER_ONLY && (!process.env.OPENAI_API_KEY || !config.primary)) {
  console.error("OPENAI_API_KEY and KOI_LABEL_MODEL are required. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

const outDir = path.join(os.tmpdir(), "koi-eval", EVAL_SET_VERSION);
fs.mkdirSync(outDir, { recursive: true });

async function draw(testCase) {
  const svg = Buffer.from(labelSvg(testCase));
  const d = testCase.distort ?? {};
  let image = sharp(svg);
  if (d.scale) {
    const { width } = await sharp(svg).metadata();
    image = image.resize(Math.round(width * d.scale));
  }
  if (d.rotate) image = image.rotate(d.rotate, { background: "#d8d2c4" });
  if (d.blur) image = image.blur(d.blur);
  const bytes = await image.jpeg({ quality: d.quality ?? 90 }).toBuffer();
  fs.writeFileSync(path.join(outDir, `${testCase.id}.jpg`), bytes);
  return bytes;
}

async function runCase(testCase) {
  const bytes = await draw(testCase);
  if (RENDER_ONLY) return { id: testCase.id, rendered: true };

  const image = { imageBase64: bytes.toString("base64"), mimeType: "image/jpeg" };
  const [first, second] = await Promise.allSettled([
    readLabel(image),
    readLabel({ ...image, model: config.verifier }),
  ]);
  if (first.status === "rejected") throw first.reason;

  const a = LabelReading.safeParse(first.value.json);
  if (!a.success) throw new Error(`The primary reading did not parse: ${a.error.issues.slice(0, 2).map((i) => i.path.join(".")).join(", ")}`);
  const b = second.status === "fulfilled" ? LabelReading.safeParse(second.value.json) : null;

  const [reading, other] = pickPrimary(a.data, b?.success ? b.data : null);
  const plan = planAutoPublish({
    reading,
    second: other,
    result: runChecks(reading),
    sku: { product: testCase.pack.name, brand: testCase.pack.brand, variant: null, netWeight: testCase.pack.net, others: [] },
  });
  return scoreCase(testCase, plan);
}

function describe(r) {
  if (r.error) return `ERROR ${r.error}`;
  if (r.rendered) return "rendered";
  const wrong = r.nutrition.filter((f) => !f.ok && f.got !== null).map((f) => `${f.field} ${f.got}≠${f.want}`);
  return [
    `published [${r.published.join(", ")}]`,
    r.blocked.length ? `blocked [${r.blocked.join(", ")}]` : "",
    r.allergenMisses.length ? `MISSED ${r.allergenMisses.join(", ")}` : "",
    r.falseAlarms.length ? `extra ${r.falseAlarms.join(", ")}` : "",
    wrong.length ? `WRONG ${wrong.join("; ")}` : "",
  ].filter(Boolean).join("  ");
}

console.log(`${EVAL_SET_VERSION}, ${selected.length} case(s), ${PROMPT_VERSION} with ${config.primary} and ${config.verifier}`);
const started = Date.now();
const results = new Array(selected.length);
let next = 0;
async function worker() {
  while (next < selected.length) {
    const i = next;
    next += 1;
    const testCase = selected[i];
    const t0 = Date.now();
    try {
      results[i] = await runCase(testCase);
    } catch (err) {
      results[i] = { id: testCase.id, error: String(err?.message || err).slice(0, 200) };
    }
    console.log(`  ${testCase.id.padEnd(28)} ${describe(results[i])}  (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (RENDER_ONLY) {
  console.log(`\nImages in ${outDir}`);
  process.exit(0);
}

const { passed, metrics, failures } = summarise(results);
console.log(`\n${JSON.stringify(metrics, null, 2)}`);
console.log(`\n${passed ? "PASSED" : "FAILED"} in ${Math.round((Date.now() - started) / 1000)} s. Images in ${outDir}`);

if (only.length) {
  console.log("A partial run (--only) is not recorded and does not open the gate.");
} else {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to record the run.");
    process.exit(1);
  }
  const res = await fetch(`${base}/rest/v1/eval_runs`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Content-Profile": "engine",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      set_version: EVAL_SET_VERSION,
      prompt_version: PROMPT_VERSION,
      primary_model: config.primary,
      verifier_model: config.verifier,
      cases: selected.length,
      passed,
      metrics,
      failures,
    }),
  });
  if (!res.ok) {
    console.error(`Recording the run failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log("Recorded in engine.eval_runs.");
}

process.exit(passed ? 0 : 1);
