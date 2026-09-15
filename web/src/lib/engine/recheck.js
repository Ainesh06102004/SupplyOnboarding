// ============================================================================
// KOI ENGINE — Re-check labels against the brands' own stores, every day
//
// SERVER ONLY. Phase 1.4. Recipes change without notice and nobody is going to
// photograph packs on a schedule, so KOI looks where brands keep their packs
// current — their own online store:
//
//   brands.website -> the store's public product feed (Shopify /products.json)
//   -> each approved SKU's listing (storeMatch.js; no confident match, no
//      source) -> every image on it:
//        seen before       still listed, so whatever was published from it is
//                          re-confirmed as of today (engine.reconfirm_labels)
//        new               downloaded, hashed, and shown to a model at low
//                          detail: does it carry an ingredient list, allergen
//                          statement or nutrition table? If so, or if its file
//                          name says so, it becomes an upload, which the
//                          scheduled reader (/api/engine/run) reads twice and
//                          publishes like any other label photo
//        no longer listed  marked gone; nothing is re-confirmed from it
//
// WHO IS CHECKED: only approved products of brands that completed onboarding
// with KOI (storeMatch.js#storeCheckEligibility). Foods from an open database
// are never store-checked; anything skipped is listed in the run report with
// the reason.
//
// A changed recipe arrives as a new label image. Its reading replaces the old
// facts (kept in engine.publish_log) and the product is re-scored. If nothing
// can be found, the label is simply never re-confirmed, and a year on the
// storefront stops relying on it (lib/recommendation/verification.js).
//
// ONE RUN, THREE PASSES, so a busy listing can never starve the others:
//   1. every store: fetch the feed, match every SKU, note which images are
//      known and which are new. One request per store — always done.
//   2. new images, within the run's time and image budget: every listing's
//      label-looking images before anyone's other images, taken in turns
//      across listings, a few at a time. What is left waits for tomorrow.
//   3. every listing: mark what is still there, what has gone, and
//      re-confirm what was published from images still listed.
//
// Fetching is narrow on purpose: https only; the brand's own domain or
// Shopify's image CDN only, checked on every redirect; named hosts only (no IP
// literals, no private suffixes); bounded bytes, redirects and time. What
// leaves KOI: the brand's public image, to the model, with nothing attached.
// ============================================================================

import "server-only";

import { createHash } from "node:crypto";
import { engineDb } from "./pipeline";
import { classifyImage, EngineConfigError } from "./providers/openai";
import {
  matchListing, storeCheckEligibility, sameStore, isPublicHostname, allowedImageUrl, isLabelHint, labelFileType,
} from "./storeMatch";

const BUCKET = "product-labels";
const USER_AGENT = "KOI-label-recheck/1.0";
const FEED_PAGE_SIZE = 250;
const FEED_MAX_PAGES = 8;
const FEED_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_EXTENSIONS = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" });
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const brief = (err) => String(err?.message || err).slice(0, 200);

async function fetchBounded(url, { store, maxBytes, accept }) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = new URL(current);
    const permitted = target.protocol === "https:"
      && isPublicHostname(target.hostname)
      && (target.hostname === "cdn.shopify.com" || sameStore(target.hostname, store));
    if (!permitted) throw new Error(`Refused to fetch from ${target.hostname}.`);

    const res = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: accept },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error(`${target.hostname} redirected without a location.`);
      current = new URL(next, target).toString();
      continue;
    }
    if (!res.ok) throw new Error(`${target.hostname} answered ${res.status}.`);
    if (Number(res.headers.get("content-length") || 0) > maxBytes) throw new Error(`${target.hostname} sent too much.`);

    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`${target.hostname} sent too much.`);
      }
      chunks.push(value);
    }
    return { bytes: Buffer.concat(chunks), type: (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() };
  }
  throw new Error("Too many redirects.");
}

async function fetchListings(store) {
  const listings = [];
  for (let page = 1; page <= FEED_MAX_PAGES; page += 1) {
    const { bytes, type } = await fetchBounded(`https://${store}/products.json?limit=${FEED_PAGE_SIZE}&page=${page}`, {
      store, maxBytes: FEED_MAX_BYTES, accept: "application/json",
    });
    if (!type.includes("json")) throw new Error(`${store} has no public product feed.`);
    const products = JSON.parse(bytes.toString("utf8"))?.products;
    if (!Array.isArray(products) || !products.length) break;
    for (const p of products) {
      listings.push({
        title: p.title,
        handle: p.handle,
        variants: (p.variants || []).map((v) => ({ title: v.title })),
        images: (p.images || []).map((i) => ({ src: i.src, alt: i.alt })),
      });
    }
    if (products.length < FEED_PAGE_SIZE) break;
  }
  return listings;
}

// ── Pass 1: what is on a listing ────────────────────────────────────────────

async function survey(db, sku, listing, store) {
  const { data: known, error } = await db.schema("engine")
    .from("source_images").select("id, source_url, sha256, upload_id").eq("sku_id", sku.id);
  if (error) throw error;

  const job = {
    sku, store, known,
    bySha: new Map(known.map((r) => [r.sha256, r])),
    present: new Set(),
    labelUploads: new Set(),
    pending: [],
    out: { images: 0, new: 0, labels: 0, deferred: 0, failed: 0, reconfirmed: null },
  };
  const byUrl = new Map(known.map((r) => [r.source_url, r]));
  const queued = new Set();
  for (const image of listing.images || []) {
    const url = allowedImageUrl(image.src, store);
    if (!url) continue;
    job.out.images += 1;
    const seen = byUrl.get(url);
    if (seen) keep(job, seen);
    else if (!queued.has(url)) { queued.add(url); job.pending.push({ ...image, url }); }
  }
  return job;
}

function keep(job, row) {
  job.present.add(row.id);
  if (row.upload_id) job.labelUploads.add(row.upload_id);
}

// ── Pass 2: new images ──────────────────────────────────────────────────────

/** Label-looking images from every listing first, then the rest, in turns. */
function turns(jobs) {
  const inTurns = (lists) => {
    const out = [];
    for (let i = 0; lists.some((list) => i < list.length); i += 1) {
      for (const list of lists) if (i < list.length) out.push(list[i]);
    }
    return out;
  };
  const tier = (hinted) => jobs.map((job) => job.pending.filter((image) => isLabelHint(image) === hinted).map((image) => ({ job, image })));
  return [...inTurns(tier(true)), ...inTurns(tier(false))];
}

async function takeImage(db, job, image) {
  const { sku, store, out } = job;
  const engine = db.schema("engine");

  const { bytes, type } = await fetchBounded(image.url, { store, maxBytes: IMAGE_MAX_BYTES, accept: "image/*" });
  const ext = IMAGE_EXTENSIONS[type];
  if (!ext) { out.failed += 1; return; }
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const same = job.bySha.get(sha256);
  if (same?.pending) return; // the same picture, already being taken by another worker
  if (same) {
    // The same picture at a new address: nothing new to read.
    const { error } = await engine.from("source_images").update({ source_url: image.url }).eq("id", same.id);
    if (error) throw error;
    keep(job, same);
    return;
  }
  job.bySha.set(sha256, { pending: true }); // claimed before the next await

  const { shows, model } = await classifyImage({ imageBase64: bytes.toString("base64"), mimeType: type });
  const isLabel = shows.ingredient_list || shows.allergen_statement || shows.nutrition_table || isLabelHint(image);

  let uploadId = null;
  if (isLabel) {
    const path = `brand-store/${sku.id}/${sha256}.${ext}`;
    const { error: putError } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (putError) throw putError;
    let fileName = image.url.split("?")[0].split("/").pop() || `${sha256}.${ext}`;
    try { fileName = decodeURIComponent(fileName); } catch { /* keep it encoded */ }
    const { data: upload, error: uploadError } = await db.from("uploads").insert({
      brand_id: sku.products.brand_id,
      product_id: sku.products.id,
      sku_id: sku.id,
      bucket_name: BUCKET,
      file_type: labelFileType(shows),
      file_name: fileName.slice(0, 200),
      mime_type: type,
      file_size_bytes: bytes.length,
      storage_path: path,
      is_deleted: false,
    }).select("id").single();
    if (uploadError) throw uploadError;
    uploadId = upload.id;
    out.labels += 1;
  }

  const { data: row, error: insertError } = await engine.from("source_images").insert({
    sku_id: sku.id, source_url: image.url, sha256, byte_size: bytes.length, mime_type: type,
    shows, classifier_model: model, upload_id: uploadId,
  }).select("id, upload_id").single();
  if (insertError) throw insertError;
  job.bySha.set(sha256, row);
  job.present.add(row.id);
  out.new += 1;
}

// ── Pass 3: close a listing ─────────────────────────────────────────────────

async function close(db, job) {
  const engine = db.schema("engine");
  const { sku, out } = job;
  const now = new Date().toISOString();

  if (job.present.size) {
    const { error } = await engine.from("source_images").update({ last_seen_at: now, gone_at: null }).in("id", [...job.present]);
    if (error) throw error;
  }
  // Only a listing seen in full can say an image has gone.
  const missing = job.known.filter((r) => !job.present.has(r.id)).map((r) => r.id);
  if (missing.length && out.deferred === 0 && out.failed === 0) {
    const { error } = await engine.from("source_images").update({ gone_at: now }).in("id", missing).is("gone_at", null);
    if (error) throw error;
  }
  if (job.labelUploads.size) {
    const { data, error } = await engine.rpc("reconfirm_labels", { p_sku_id: sku.id, p_upload_ids: [...job.labelUploads] });
    if (error) throw error;
    out.reconfirmed = data;
  }
  return out;
}

// ── The run ─────────────────────────────────────────────────────────────────

/**
 * @param {{ deadline?: number, maxImages?: number, concurrency?: number }} [opts]
 *   deadline: epoch ms after which no new image is started
 *   maxImages: new images this run may download and classify
 *   concurrency: images in flight at once
 */
export async function recheckLabels({ deadline = Date.now() + 30_000, maxImages = 24, concurrency = 4 } = {}) {
  const db = engineDb();
  const engine = db.schema("engine");

  const [{ data: skus, error: skuError }, { data: sources, error: sourceError }] = await Promise.all([
    db.from("skus")
      .select("id, variant_name, net_weight, products!inner(id, product_name, status, brand_id, brands(brand_name, website, onboarding_status))")
      .eq("products.status", "approved"),
    engine.from("label_sources").select("sku_id, status, last_seen_at"),
  ]);
  if (skuError || sourceError) throw skuError || sourceError;
  const previous = new Map(sources.map((s) => [s.sku_id, s]));

  const byStore = new Map();
  const skipped = [];
  for (const sku of skus) {
    const eligible = storeCheckEligibility(sku);
    if (!eligible.ok) { skipped.push({ product: sku.products.product_name, reason: eligible.reason }); continue; }
    if (!byStore.has(eligible.host)) byStore.set(eligible.host, []);
    byStore.get(eligible.host).push(sku);
  }

  const report = { stores: [], skipped, imagesTaken: 0, imagesWaiting: 0 };
  const jobs = [];

  // Pass 1
  for (const [store, group] of byStore) {
    const entry = { store, skus: [] };
    report.stores.push(entry);

    let listings;
    try {
      listings = await fetchListings(store);
    } catch (err) {
      entry.error = brief(err);
      for (const sku of group) {
        const { error } = await engine.from("label_sources").upsert({
          sku_id: sku.id, store_domain: store, status: "unreachable", reason: entry.error, checked_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      continue;
    }

    for (const sku of group) {
      const product = sku.products;
      const match = matchListing({
        product: product.product_name, brand: product.brands.brand_name, variant: sku.variant_name, netWeight: sku.net_weight,
      }, listings);
      const was = previous.get(sku.id);
      const status = match.status === "no_match" && ["matched", "gone"].includes(was?.status) ? "gone" : match.status;
      const now = new Date().toISOString();

      const { error } = await engine.from("label_sources").upsert({
        sku_id: sku.id,
        kind: "shopify",
        store_domain: store,
        status,
        handle: match.listing?.handle ?? null,
        listing_title: match.listing?.title ?? null,
        reason: match.reason,
        checked_at: now,
        last_seen_at: match.listing ? now : (was?.last_seen_at ?? null),
      });
      if (error) throw error;

      const line = { product: product.product_name, status, listing: match.listing?.title ?? null };
      entry.skus.push(line);
      if (!match.listing) continue;
      try {
        const job = await survey(db, sku, match.listing, store);
        job.line = line;
        jobs.push(job);
      } catch (err) {
        line.error = brief(err);
      }
    }
  }

  // Pass 2
  const queue = turns(jobs);
  let next = 0;
  const worker = async () => {
    while (next < queue.length && next < maxImages && Date.now() <= deadline) {
      const { job, image } = queue[next];
      next += 1;
      try {
        await takeImage(db, job, image);
      } catch (err) {
        if (err instanceof EngineConfigError) throw err;
        job.out.failed += 1;
        console.error("[recheck] image", job.sku.id, brief(err));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  for (const { job } of queue.slice(next)) job.out.deferred += 1;
  report.imagesTaken = next;
  report.imagesWaiting = queue.length - next;

  // Pass 3
  for (const job of jobs) {
    try {
      Object.assign(job.line, await close(db, job));
    } catch (err) {
      job.line.error = brief(err);
    }
  }

  return report;
}
