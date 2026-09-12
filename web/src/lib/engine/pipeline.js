// ============================================================================
// KOI ENGINE — One upload, read twice, published when the readings agree
//
// SERVER ONLY. runExtraction(uploadId):
//   upload row -> image from Storage -> two independent model readings ->
//   Zod parse -> deterministic checks -> agreement (autopublish.js) ->
//   engine.extraction_outputs -> engine.publish_machine_read() for the groups
//   that earned it -> review_queue items ONLY for the groups that did not
//
// No one has to act. A blocked group stays unpublished and unverified on the
// storefront; its review item is there for anyone who chooses to fix it.
//
// Every step writes to `engine`, which only the service role can reach. A job
// row is opened before the model is called and closed either way, so a failed
// reading leaves a visible `failed` job with its reason rather than silence.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { LabelReading, PROMPT_VERSION } from "./labelSchema";
import { runChecks } from "./checks";
import { toReviewItems } from "./proposals";
import { planAutoPublish } from "./autopublish";
import { readLabel } from "./providers/openai";

// uploads.file_type values that can carry a label.
export const LABEL_FILE_TYPES = Object.freeze(["nutrition_label", "ingredient_label", "back_image", "front_image"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function engineDb() {
  const db = getServiceClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set; the engine cannot run without it.");
  return db;
}

const fail = (message) => { throw Object.assign(new Error(message), { expose: true }); };

/**
 * @param {string} uploadId public.uploads id
 * @returns {Promise<{ outputId: string, confidence: number, groups: string[] }>}
 */
export async function runExtraction(uploadId) {
  const db = engineDb();
  const engine = db.schema("engine");

  const { data: upload, error: uploadError } = await db
    .from("uploads")
    .select("id, sku_id, bucket_name, storage_path, mime_type, file_type, is_deleted, skus(net_weight, variant_name, products(product_name, brands(brand_name)))")
    .eq("id", uploadId)
    .maybeSingle();
  if (uploadError) throw uploadError;
  if (!upload || upload.is_deleted) fail("That upload does not exist.");
  if (!upload.sku_id) fail("That upload is not attached to a SKU, so a reading would have nowhere to go.");
  if (!LABEL_FILE_TYPES.includes(upload.file_type)) fail(`A ${upload.file_type} is not a label photo.`);

  const { data: job, error: jobError } = await engine
    .from("ai_extraction_jobs")
    .insert({ upload_id: upload.id, status: "processing", provider: "openai", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (jobError) throw jobError;

  try {
    const { data: file, error: fileError } = await db.storage.from(upload.bucket_name).download(upload.storage_path);
    if (fileError) throw fileError;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) fail("The image is over 15 MB; upload a smaller photo.");

    const image = { imageBase64: bytes.toString("base64"), mimeType: upload.mime_type || file.type || "image/jpeg" };
    // Independent readings, in parallel. A second model is the stronger check
    // (the same model tends to repeat its own misreading); without one, the
    // same model reads again.
    const [first, second] = await Promise.allSettled([
      readLabel(image),
      readLabel({ ...image, model: process.env.KOI_LABEL_VERIFIER_MODEL || undefined }),
    ]);
    if (first.status === "rejected") throw first.reason;

    const parsed = LabelReading.safeParse(first.value.json);
    if (!parsed.success) {
      fail(`The reading did not match the label schema: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")}`);
    }
    const verify = second.status === "fulfilled" ? LabelReading.safeParse(second.value.json) : null;
    const secondReading = verify?.success ? verify.data : null;

    const sku = upload.skus || {};
    const context = {
      product: sku.products?.product_name ?? "",
      brand: sku.products?.brands?.brand_name ?? null,
      variant: sku.variant_name ?? null,
      netWeight: sku.net_weight ?? null,
    };

    const result = runChecks(parsed.data);
    const plan = planAutoPublish({ reading: parsed.data, second: secondReading, result, sku: context });

    const { data: output, error: outputError } = await engine
      .from("extraction_outputs")
      .insert({
        job_id: job.id, upload_id: upload.id, sku_id: upload.sku_id,
        model: first.value.model, prompt_version: PROMPT_VERSION,
        extracted: parsed.data, checks: result.checks, confidence: result.confidence,
        usage: { first: first.value.usage, second: second.status === "fulfilled" ? second.value.usage : null },
        latency_ms: first.value.latencyMs,
        second_read: secondReading, second_model: second.status === "fulfilled" ? second.value.model : null,
        agreement: plan.agreement, blocked: plan.blocked,
      })
      .select("id")
      .single();
    if (outputError) throw outputError;

    let published = [];
    if (plan.ingredients || plan.nutrition) {
      const { data, error: publishError } = await engine.rpc("publish_machine_read", {
        p_output_id: output.id,
        p_ingredients: plan.ingredients,
        p_nutrition: plan.nutrition,
      });
      if (publishError) throw publishError;
      published = data?.published ?? [];
    }

    // Only what could not publish goes to the queue — for anyone who chooses
    // to fix it. An older reading's open items are replaced by these.
    const { error: supersedeError } = await engine
      .from("review_queue")
      .update({ status: "superseded" })
      .eq("sku_id", upload.sku_id)
      .eq("status", "pending");
    if (supersedeError) throw supersedeError;

    // A blocked ingredient list takes its allergens with it; a blocked identity
    // takes everything. Any fix also needs the identity item, because the
    // manual path publishes nothing until someone confirms the product.
    const reasons = {};
    for (const b of plan.blocked) {
      const groups = b.group === "identity" ? ["identity", "ingredients", "allergens", "nutrition"]
        : b.group === "ingredients" ? ["ingredients", "allergens"] : [b.group];
      for (const g of groups) reasons[g] ??= b.reason;
    }
    if (plan.blocked.length) reasons.identity ??= "Confirm the product to publish a fix.";
    const exceptions = toReviewItems(parsed.data, result, { netWeight: context.netWeight })
      .filter((i) => reasons[i.field_group])
      .map((i) => ({ ...i, output_id: output.id, sku_id: upload.sku_id, route_reason: reasons[i.field_group] }));
    if (exceptions.length) {
      const { error: queueError } = await engine.from("review_queue").insert(exceptions);
      if (queueError) throw queueError;
    }

    await engine.from("ai_extraction_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    return { outputId: output.id, confidence: result.confidence, published, blocked: plan.blocked };
  } catch (err) {
    await engine.from("ai_extraction_jobs")
      .update({ status: "failed", error_message: String(err?.message || err).slice(0, 500), completed_at: new Date().toISOString() })
      .eq("id", job.id);
    throw err;
  }
}

/**
 * Read every label photo that has never been read, up to `limit`, one at a
 * time. What the scheduled run calls; nobody has to press anything. A photo
 * whose reading failed is not retried here — its failed job is the signal to
 * look at it.
 * @param {{ limit?: number }} [opts]
 */
export async function runPending({ limit = 2 } = {}) {
  const db = engineDb();
  const [{ data: uploads, error: e1 }, { data: jobs, error: e2 }] = await Promise.all([
    db.from("uploads").select("id").in("file_type", LABEL_FILE_TYPES).eq("is_deleted", false)
      .not("sku_id", "is", null).order("uploaded_at", { ascending: true }),
    db.schema("engine").from("ai_extraction_jobs").select("upload_id"),
  ]);
  if (e1 || e2) throw e1 || e2;

  const attempted = new Set(jobs.map((j) => j.upload_id));
  const todo = uploads.filter((u) => !attempted.has(u.id)).slice(0, limit);

  const results = [];
  for (const u of todo) {
    try {
      results.push({ uploadId: u.id, ...(await runExtraction(u.id)) });
    } catch (err) {
      results.push({ uploadId: u.id, error: String(err?.message || err).slice(0, 200) });
    }
  }
  return { attempted: todo.length, remaining: uploads.filter((u) => !attempted.has(u.id)).length - todo.length, results };
}
