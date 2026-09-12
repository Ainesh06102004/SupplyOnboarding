// ============================================================================
// KOI ENGINE — The review queue, for the staff screen
//
// SERVER ONLY, service client (everything here lives in `engine`). The routes
// that call these functions check the reviewer first; the reviewer's id always
// comes from their verified session and is passed in, never read from a body.
// ============================================================================

import "server-only";

import { engineDb, LABEL_FILE_TYPES } from "./pipeline";
import { validateDecision, buildPublishPayload } from "./decisions";

const fail = (message) => { throw Object.assign(new Error(message), { expose: true }); };

/** SKU id -> { product, brand, netWeight } for a set of SKUs. */
async function describeSkus(db, skuIds) {
  if (!skuIds.length) return {};
  const { data, error } = await db
    .from("skus")
    .select("id, net_weight, variant_name, products(product_name, brands(brand_name))")
    .in("id", skuIds);
  if (error) throw error;
  return Object.fromEntries(data.map((s) => [s.id, {
    product: s.products?.product_name ?? "Unknown product",
    brand: s.products?.brands?.brand_name ?? null,
    variant: s.variant_name,
    netWeight: s.net_weight ?? null,
  }]));
}

/** Label photos nobody has read yet, and readings waiting on a person. */
export async function listQueue() {
  const db = engineDb();
  const engine = db.schema("engine");

  const [{ data: pending, error: e1 }, { data: uploads, error: e2 }, { data: read, error: e3 }] = await Promise.all([
    engine.from("review_queue").select("sku_id, output_id, field_group, created_at").eq("status", "pending"),
    db.from("uploads").select("id, sku_id, file_type, file_name, uploaded_at")
      .in("file_type", LABEL_FILE_TYPES).eq("is_deleted", false).not("sku_id", "is", null),
    engine.from("extraction_outputs").select("upload_id"),
  ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;

  const readIds = new Set(read.map((r) => r.upload_id));
  const unread = uploads.filter((u) => !readIds.has(u.id));

  const bySku = new Map();
  for (const p of pending) {
    const entry = bySku.get(p.sku_id) || { skuId: p.sku_id, outputId: p.output_id, groups: [], since: p.created_at };
    entry.groups.push(p.field_group);
    bySku.set(p.sku_id, entry);
  }

  const names = await describeSkus(db, [...new Set([...bySku.keys(), ...unread.map((u) => u.sku_id)])]);
  return {
    toReview: [...bySku.values()].map((e) => ({ ...e, ...names[e.skuId] })),
    toRead: unread.map((u) => ({ uploadId: u.id, skuId: u.sku_id, fileType: u.file_type, fileName: u.file_name, uploadedAt: u.uploaded_at, ...names[u.sku_id] })),
  };
}

/** The latest reading for a SKU, its checks, its items and its photo. */
export async function getSkuReview(skuId) {
  const db = engineDb();
  const engine = db.schema("engine");

  const { data: output, error } = await engine
    .from("extraction_outputs")
    .select("*")
    .eq("sku_id", skuId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!output) fail("No reading for that SKU yet.");

  const [{ data: items, error: e1 }, { data: upload, error: e2 }] = await Promise.all([
    engine.from("review_queue").select("id, field_group, proposed, route, route_reason, status, decision, reviewed_at")
      .eq("output_id", output.id),
    db.from("uploads").select("bucket_name, storage_path").eq("id", output.upload_id).maybeSingle(),
  ]);
  if (e1 || e2) throw e1 || e2;

  let imageUrl = null;
  if (upload) {
    const { data: signed } = await db.storage.from(upload.bucket_name).createSignedUrl(upload.storage_path, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const names = await describeSkus(db, [skuId]);
  const preview = buildPublishPayload(items, { netWeight: names[skuId]?.netWeight });
  return { skuId, ...names[skuId], output, items, imageUrl, blockers: preview.blockers };
}

/**
 * Record a reviewer's decision on one item.
 * @param {string} itemId review_queue id
 * @param {"accept"|"correct"|"reject"} action
 * @param {object|undefined} value the correction, for "correct"
 * @param {string} reviewerUid from the verified session
 */
export async function decide(itemId, action, value, reviewerUid) {
  if (!reviewerUid) fail("No reviewer.");
  const engine = engineDb().schema("engine");

  const { data: item, error } = await engine.from("review_queue").select("id, field_group, status").eq("id", itemId).maybeSingle();
  if (error) throw error;
  if (!item) fail("That review item does not exist.");
  if (item.status === "superseded") fail("A newer reading replaced this one. Reload the queue.");

  const verdict = validateDecision(item.field_group, action, value);
  if (!verdict.ok) fail(verdict.error);

  const { error: updateError } = await engine.from("review_queue")
    .update({ status: verdict.status, decision: verdict.decision, reviewed_by: reviewerUid, reviewed_at: new Date().toISOString() })
    .eq("id", itemId);
  if (updateError) throw updateError;
  return { status: verdict.status };
}

/**
 * Publish what a reading's decided items allow. engine.publish_label re-checks
 * the review in the database, so this cannot be talked past.
 * @param {string} outputId extraction_outputs id
 * @param {string} reviewerUid from the verified session
 */
export async function publish(outputId, reviewerUid) {
  if (!reviewerUid) fail("No reviewer.");
  const db = engineDb();
  const engine = db.schema("engine");

  const { data: output, error } = await engine.from("extraction_outputs").select("id, sku_id").eq("id", outputId).maybeSingle();
  if (error) throw error;
  if (!output) fail("That reading does not exist.");

  const [{ data: items, error: e1 }, names] = await Promise.all([
    engine.from("review_queue").select("field_group, proposed, status, decision").eq("output_id", outputId),
    describeSkus(db, [output.sku_id]),
  ]);
  if (e1) throw e1;

  const payload = buildPublishPayload(items, { netWeight: names[output.sku_id]?.netWeight });
  if (!payload.ingredients && !payload.nutrition) fail(payload.blockers.join(" ") || "Nothing is ready to publish.");

  const { data, error: rpcError } = await engine.rpc("publish_label", {
    p_output_id: outputId,
    p_reviewer: reviewerUid,
    p_ingredients: payload.ingredients,
    p_nutrition: payload.nutrition,
  });
  if (rpcError) fail(rpcError.message);
  return { published: data, stillOpen: payload.blockers };
}
