// Step 4 — copy every listin  g image into the private amazon-products bucket
  // and say what each one shows (front of pack / nutrition table / ingredients).
  // From web/:
  //   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/amazon/images.mjs
  //       copy new images, then sort the unsorted ones live
  //   … images.mjs --no-classify     copy only
  //   … images.mjs --batch           copy, then submit the sorting to the Batch API (half price, within 24 h)
  //   … images.mjs --collect [<id>]  store the sorting from finished batches (all pending, or one)
  //   … images.mjs --check N         sort N already-sorted photos with the sorting model and compare; writes nothing
  // Add --limit N or --model <id> (else KOI_CLASSIFY_MODEL, else KOI_LABEL_MODEL).
  // Bytes are cached on disk; identical images (variants share photos) are
  // classified once, by sha256.
  import { createHash } from "node:crypto";
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
  import { join } from "node:path";
  import sharp from "sharp";
  import * as cache from "./cache.mjs";
  import { pool, withRateLimit } from "./oxylabs.mjs";
  import { selectAll, upsert, update, uploadObject } from "./db.mjs";
  import { submitInBatches, pendingBatches, fetchReplies, markCollected } from "./batch.mjs";
  
  const BUCKET = "amazon-products";
  const IMG_DIR = join(cache.CACHE, "images");
  const JOB = "koi-amazon-sort";
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? (args[args.indexOf(name) + 1]?.startsWith("--") ? true : args[args.indexOf(name) + 1] ?? true) : null);
  const classify = !args.includes("--no-classify");
  const BATCH = args.includes("--batch");
  const COLLECT = flag("--collect");
  const CHECK = flag("--check") ? Number(flag("--check")) || 100 : 0;
  const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;
  const SORT_MODEL = typeof flag("--model") === "string" ? flag("--model") : undefined;
  
  if (!CHECK && !COLLECT) await copyImages();
  
  async function copyImages() {
  const listings = new Map((await selectAll("listing", "select=asin,is_protein_bar")).map((l) => [l.asin, l]));
  const wanted = [];
  for (const p of cache.all("product")) {
    if (!listings.get(p.asin)?.is_protein_bar) continue;
    const c = p.content || {};
    (c.images || []).forEach((url, i) => wanted.push({ asin: p.asin, role: "gallery", position: i + 1, amazon_url: url }));
    (c.description_images || []).forEach((url, i) => wanted.push({ asin: p.asin, role: "description", position: i + 1, amazon_url: url }));
  }
  const have = new Map((await selectAll("image", "select=id,asin,role,position,sha256,kind,storage_path")).map((r) => [`${r.asin}|${r.role}|${r.position}`, r]));
  console.log(`images: ${wanted.length} on ${new Set(wanted.map((w) => w.asin)).size} protein bars, ${have.size} already stored`);
  
  const rows = [];
  let n = 0;
  await pool(wanted, 12, async (w) => {
    const key = `${w.asin}|${w.role}|${w.position}`;
    if (have.get(key)?.storage_path) return;
    const dir = join(IMG_DIR, w.asin);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${w.role}-${w.position}.jpg`);
    let bytes;
    if (existsSync(file)) bytes = readFileSync(file);
    else {
      const res = await fetch(w.amazon_url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`image ${res.status} ${w.amazon_url}`);
      bytes = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, bytes);
    }
    const meta = await sharp(bytes).metadata();
    const mime = meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : "image/jpeg";
    const storage_path = `${w.asin}/${w.role}-${w.position}.${meta.format === "jpeg" ? "jpg" : meta.format}`;
    await uploadObject(BUCKET, storage_path, bytes, mime);
    rows.push({
      ...w, storage_path, width: meta.width ?? null, height: meta.height ?? null,
      bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (++n % 200 === 0) console.log(`  ${n} copied`);
  });
  await upsert("image", rows, "asin,role,position");
  console.log(`images: ${rows.length} copied to ${BUCKET}`);
  }
  
  if (!classify) process.exit(0);
  
  // ── what each unique image shows ─────────────────────────────────────────
  // Sorting runs on KOI_CLASSIFY_MODEL (a cheaper model; empty → KOI_LABEL_MODEL),
  // or --model <id>. The sorted photos were done by gpt-5.4-mini; before trusting a
  // new model, --check compares it with those.
  const { classifyImage, classifyRequestBody, panelsFrom, parseImageReply } = await import("../../src/lib/engine/providers/openai.js");
  const { kindFromPanels, sortingAgreement, costOf, PANEL } = await import("../../src/lib/engine/readPlan.js");
  const all = await selectAll("image", "select=id,asin,role,position,sha256,kind,storage_path");
  const byHash = new Map();
  for (const r of all) if (r.sha256) (byHash.get(r.sha256) || byHash.set(r.sha256, []).get(r.sha256)).push(r);
  
  const small = async (r) => {
    // Low detail is enough to see whether a panel exists; resize keeps the payload small.
    const bytes = await sharp(readFileSync(join(IMG_DIR, r.asin, `${r.role}-${r.position}.jpg`))).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    return { imageBase64: bytes.toString("base64"), mimeType: "image/jpeg" };
  };
  
  if (CHECK) {
    // A sample of photos already sorted, half of them label panels; nothing is written.
    const shuffle = (xs) => xs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
    const sorted = [...byHash.values()].filter((rs) => rs[0].kind);
    const sample = [
      ...shuffle(sorted.filter((rs) => PANEL.has(rs[0].kind))).slice(0, Math.ceil(CHECK / 2)),
      ...shuffle(sorted.filter((rs) => !PANEL.has(rs[0].kind))).slice(0, Math.floor(CHECK / 2)),
    ];
    const pairs = [];
    let spent = 0, model = null;
    await pool(sample, 5, async (rs) => {
      const r = await withRateLimit(async () => classifyImage({ ...(await small(rs[0])), model: SORT_MODEL }));
      model = r.model;
      spent += costOf(r.usage, r.model) ?? 0;
      pairs.push({ was: rs[0].kind, now: kindFromPanels(r.shows), path: rs[0].storage_path });
    });
    console.log(`check: ${model} against the stored sorting`, sortingAgreement(pairs), `$${spent.toFixed(4)}`);
    const missed = pairs.filter((p) => PANEL.has(p.was) && !PANEL.has(p.now)).slice(0, 15);
    if (missed.length) console.log("label photos it missed (worth a look):", missed.map((p) => `${p.path} ${p.was}→${p.now}`));
    process.exit(0);
  }
  
  const store = (hash, shows, model) => update("image", `sha256=eq.${hash}`, { kind: kindFromPanels(shows), kind_model: model });
  
  if (COLLECT) {
    for (const batch of pendingBatches(JOB, COLLECT === true ? null : COLLECT)) {
      const replies = await fetchReplies(batch);
      if (!replies) continue;
      let stored = 0, spent = 0;
      await pool(batch.entries, 8, async ({ sha256 }) => {
        const body = replies.get(sha256);
        if (!body) return;
        try {
          const { json, model, usage } = parseImageReply(body);
          await store(sha256, panelsFrom(json), model);
          spent += costOf(usage, model, { batch: true }) ?? 0;
          stored++;
        } catch { /* a refusal or non-JSON stays unsorted */ }
      });
      markCollected(batch, { stored, cost_usd: Math.round(spent * 1e6) / 1e6 });
      console.log(`  batch ${batch.id}: ${stored} photos sorted, $${spent.toFixed(4)} at batch prices`);
    }
    process.exit(0);
  }
  
  const todo = [...byHash.entries()].filter(([, rs]) => rs.some((r) => !r.kind)).slice(0, LIMIT);
  console.log(`classify: ${todo.length} unique images to look at (${byHash.size} unique of ${all.length})`);
  
  if (BATCH) {
    const ids = await submitInBatches(JOB, todo, async ([hash, rs]) => ({
      requests: [{ custom_id: hash, body: classifyRequestBody({ ...(await small(rs[0])), model: SORT_MODEL }) }],
      entry: { sha256: hash },
    }));
    console.log(`classify: ${ids.length} batch(es) submitted. Collect with --collect (all) or --collect <id>`);
    process.exit(0);
  }
  
  let done = 0, spent = 0;
  const tally = {};
  await pool(todo, 5, async ([hash, rs]) => {
    const { shows, model, usage } = await withRateLimit(async () => classifyImage({ ...(await small(rs[0])), model: SORT_MODEL }));
    await store(hash, shows, model);
    spent += costOf(usage, model) ?? 0;
    const kind = kindFromPanels(shows);
    tally[kind] = (tally[kind] || 0) + rs.length;
    if (++done % 100 === 0) console.log(`  classified ${done}/${todo.length} ($${spent.toFixed(3)})`);
  });
  console.log("classify:", tally, `$${spent.toFixed(3)} at list prices`);
