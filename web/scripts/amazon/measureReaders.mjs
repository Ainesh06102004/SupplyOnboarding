// Is an open model as good a label reader as the two KOI pays OpenAI for?
// From web/:
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/amazon/measureReaders.mjs [flags]
//
//   --readers a,b,c   who to measure (providers/readers.js names). Default: the
//                     three open models the cost study shortlisted.
//   --limit N         only the first N photos (a stable order, so a larger run
//                     reuses a smaller one's readings)
//   --max-usd X       stop asking once this much is spent (default 0.6 ≈ ₹53)
//   --dry             ask nobody: score only readings already on disk, and score
//                     gpt-4.1-mini's stored reading as if it were a candidate —
//                     it must come out at exactly its own baseline, which is
//                     the check that the yardstick is level.
//
// The photos are the 249 both OpenAI readers already read
// (amazon_products.label_reading). Each candidate reads the same image, sized
// the same way labels.mjs sized it, and lib/engine/readerEval.js compares them
// with the rule KOI publishes by. Every reply is kept on disk under
// <AMAZON_CACHE_DIR>/reader-eval/, so a second run never pays for a photo
// twice, and the report lands beside them. Nothing is written to the database.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as cache from "./cache.mjs";
import { selectAll } from "./db.mjs";

// oxylabs.mjs has a pool and a retry like these, but it refuses to load without
// the scraper's login, which measuring a model has no business needing.
async function pool(items, workers, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
}

async function withRateLimit(fn, tries = 6) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const limited = /\b429\b|rate limit|timed out|timeout|abort|\b50[234]\b/i.test(err.message || "");
      if (err.fatal || !limited || attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, Math.min(60_000, 3000 * 2 ** (attempt - 1)) + Math.random() * 2000));
    }
  }
}

const { readLabel } = await import("../../src/lib/engine/providers/openai.js");
const { LabelReading } = await import("../../src/lib/engine/labelSchema.js");
const { costOf } = await import("../../src/lib/engine/readPlan.js");
const { scorePhoto, summarize, summarizePair, PARTS } = await import("../../src/lib/engine/readerEval.js");

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const DRY = args.includes("--dry");
const LIMIT = Number(flag("--limit", Infinity));
const MAX_USD = Number(flag("--max-usd", 0.6));
const READERS = flag("--readers", [
  "openrouter:qwen/qwen3-vl-30b-a3b-instruct",
  "openrouter:google/gemma-4-26b-a4b-it",
  "openrouter:qwen/qwen3.5-35b-a3b",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const STORED_B = "gpt-4.1-mini (stored)";

const slug = (name) => name.replace(/[^a-zA-Z0-9._-]+/g, "_");
const kindFor = (name) => `reader-eval/${slug(name)}`;

// ── The yardstick: photos both OpenAI readers read ───────────────────────────
const stored = await selectAll("label_reading", "select=image_id,asin,model,verifier_model,reading,second&second_source=eq.model&order=image_id");
const ids = stored.map((r) => r.image_id);
const images = new Map();
for (let i = 0; i < ids.length; i += 150) {
  for (const img of await selectAll("image", `select=id,asin,role,position&id=in.(${ids.slice(i, i + 150).join(",")})`)) images.set(img.id, img);
}

const photos = [];
let unusable = 0;
for (const r of stored) {
  const a = LabelReading.safeParse(r.reading);
  const b = LabelReading.safeParse(r.second);
  const img = images.get(r.image_id);
  if (!a.success || !b.success || !img) { unusable++; continue; }
  photos.push({ id: r.image_id, img, a: a.data, b: b.data, aModel: r.model, bModel: r.verifier_model });
}
const sample = photos.slice(0, LIMIT);
console.log(`yardstick: ${sample.length} photos read by ${sample[0]?.aModel} (A) and ${sample[0]?.bModel} (B)${unusable ? `; ${unusable} left out (a stored reading no longer parses, or the photo row is gone)` : ""}`);

async function photoPayload(img) {
  const bytes = readFileSync(join(cache.CACHE, "images", img.asin, `${img.role}-${img.position}.jpg`));
  const jpg = await sharp(bytes).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { imageBase64: jpg.toString("base64"), mimeType: "image/jpeg" };
}

// ── Asking the candidates ────────────────────────────────────────────────────
let spent = 0;
let overBudget = false;

/** One candidate's reading of one photo: from disk, or asked and then kept. */
async function readingOf(reader, p) {
  const kind = kindFor(reader);
  if (cache.has(kind, p.id)) return cache.read(kind, p.id);
  if (DRY) return null;
  if (spent >= MAX_USD) { overBudget = true; return null; }

  const started = Date.now();
  try {
    const reply = await withRateLimit(async () => {
      try {
        return await readLabel({ ...(await photoPayload(p.img)), model: reader });
      } catch (err) {
        // Out of OpenRouter credit is a 402; retrying will not top it up.
        if (/\b402\b|insufficient credits/i.test(err.message)) throw Object.assign(err, { fatal: true });
        throw err;
      }
    });
    const costUsd = costOf(reply.usage, reply.model);
    if (Number.isFinite(costUsd)) spent += costUsd;
    const parsed = LabelReading.safeParse(reply.json);
    const kept = {
      json: reply.json, model: reply.model, host: reply.host ?? null, usage: reply.usage, costUsd, latencyMs: reply.latencyMs ?? Date.now() - started,
      error: parsed.success ? null : "the reading did not match the label schema",
    };
    cache.write(kind, p.id, kept);
    return kept;
  } catch (err) {
    if (err.fatal) throw err;
    // A failed call is not the model's answer, so it is not kept: the next run asks again.
    return { error: err.message.slice(0, 300), transient: true };
  }
}

const results = new Map(); // reader → Map(photoId → kept reading)

for (const reader of READERS) {
  const got = new Map();
  results.set(reader, got);
  const cached = sample.filter((p) => cache.has(kindFor(reader), p.id)).length;
  console.log(`\n${reader}: ${cached} of ${sample.length} already read`);
  if (DRY) {
    for (const p of sample) { const k = await readingOf(reader, p); if (k) got.set(p.id, k); }
    continue;
  }

  // One photo first. A reader that cannot answer at all — no host honours the
  // schema, a wrong model id, a missing key — says so once, not 249 times.
  const first = sample.find((p) => !cache.has(kindFor(reader), p.id));
  if (first) {
    const k = await readingOf(reader, first);
    if (k?.transient) {
      console.log(`  skipped: the first photo failed — ${k.error}`);
      continue;
    }
    if (k) got.set(first.id, k);
  }

  let done = 0;
  try {
    await pool(sample, 4, async (p) => {
      if (got.has(p.id)) return;
      const k = await readingOf(reader, p);
      if (k) got.set(p.id, k);
      if (++done % 25 === 0) console.log(`  ${done}/${sample.length} · $${spent.toFixed(4)} spent so far`);
    });
  } catch (err) {
    // Out of credit stops every reader, not just this one; what was read is still scored.
    console.log(`  stopped: ${err.message.slice(0, 300)}`);
    break;
  }
  const failed = [...got.values()].filter((k) => k.transient).length;
  console.log(`  done: ${got.size - failed} answered, ${failed} failed and will be asked again next run · $${spent.toFixed(4)} spent so far`);
  if (overBudget) console.log(`  stopped asking at the $${MAX_USD} cap; raise --max-usd to finish`);
}

// The level check: B scored as a candidate must land exactly on its own baseline.
if (DRY) {
  const got = new Map(sample.map((p) => [p.id, { json: p.b, model: p.bModel }]));
  results.set(STORED_B, got);
}

// ── Scoring ──────────────────────────────────────────────────────────────────
const parsedOf = (k) => {
  if (!k || k.transient || k.error) return null;
  const r = LabelReading.safeParse(k.json);
  return r.success ? r.data : null;
};

const report = { at: new Date().toISOString(), photos: sample.length, readers: {}, pairs: {}, spentUsd: Math.round(spent * 1e6) / 1e6 };
for (const [reader, got] of results) {
  const rows = sample.filter((p) => got.has(p.id) && !got.get(p.id).transient).map((p) => {
    const k = got.get(p.id);
    return { score: scorePhoto(p.a, p.b, parsedOf(k)), costUsd: k.costUsd ?? null, latencyMs: k.latencyMs ?? null, error: k.error ?? null };
  });
  if (!rows.length) continue;
  report.readers[reader] = summarize(rows);
  const hosts = {};
  for (const k of got.values()) if (k.host) hosts[k.host] = (hosts[k.host] ?? 0) + 1;
  report.readers[reader].hosts = hosts;
}

const measured = [...results.keys()].filter((r) => r !== STORED_B && report.readers[r]);
for (let i = 0; i < measured.length; i++) {
  for (let j = i + 1; j < measured.length; j++) {
    const [r1, r2] = [measured[i], measured[j]];
    const g1 = results.get(r1), g2 = results.get(r2);
    report.pairs[`${r1} + ${r2}`] = summarizePair(sample.map((p) => ({ a: p.a, b: p.b, c1: parsedOf(g1.get(p.id)), c2: parsedOf(g2.get(p.id)) })));
  }
}

// ── The report ───────────────────────────────────────────────────────────────
const pct = (r) => (r?.n ? `${r.pct}% (${r.k}/${r.n})` : "—");
for (const [reader, s] of Object.entries(report.readers)) {
  console.log(`\n■ ${reader}`);
  console.log(`  answered ${s.photos} · valid ${pct(s.valid)} · ${s.cost.perPhotoUsd !== null ? `$${s.cost.perPhotoUsd}/photo (₹${(s.cost.perPhotoUsd * 88).toFixed(3)})` : "unpriced"} · p50 ${s.latencyMs.p50 ?? "—"} ms`);
  console.log(`  photo has an agreed result with A: ${pct(s.photo.candidate)}   — B manages ${pct(s.photo.baselineB)}`);
  for (const p of PARTS) {
    const d = s.whereABDisagreed[p];
    console.log(`  ${p.padEnd(11)} with A ${pct(s.asReader2[p].candidate).padEnd(16)} B: ${pct(s.asReader2[p].baselineB).padEnd(16)} where A=B ${pct(s.whereABAgreed[p]).padEnd(16)} settles A≠B ${pct(d.settles)} (A ${d.sidesWithA} · B ${d.sidesWithB})${s.phantomPanels[p] ? ` · ${s.phantomPanels[p]} panel(s) only it saw` : ""}`);
  }
  const al = s.declaredAllergens;
  console.log(`  declared allergens (A=B): ${al.declared} on ${al.photos} photos — missed ${al.missed}, demoted to "may contain" ${al.demoted}`);
  if (Object.keys(s.hosts).length) console.log(`  answered by: ${Object.entries(s.hosts).map(([h, n]) => `${h} ${n}`).join(", ")}`);
}
for (const [pair, s] of Object.entries(report.pairs)) {
  console.log(`\n■ pair: ${pair}`);
  console.log(`  photo agreed: open pair ${pct(s.photo.pair)} · OpenAI pair ${pct(s.photo.openai)}`);
  for (const p of PARTS) {
    console.log(`  ${p.padEnd(11)} open pair agrees ${pct(s.parts[p].pair).padEnd(16)} OpenAI ${pct(s.parts[p].openai).padEnd(16)} both agreed, on something else: ${pct(s.parts[p].agreedOnSomethingElse)}`);
  }
}

const dir = join(cache.CACHE, "reader-eval");
mkdirSync(dir, { recursive: true });
const file = join(dir, `report-${report.at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\nspent $${report.spentUsd} (₹${(report.spentUsd * 88).toFixed(1)}) · report: ${file}`);
