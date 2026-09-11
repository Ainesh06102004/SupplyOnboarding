// ============================================================================
// KOI ENGINE — One upload, read and queued for review
//
// SERVER ONLY. runExtraction(uploadId):
//   upload row -> image from Storage -> model reading -> Zod parse ->
//   deterministic checks -> engine.extraction_outputs -> engine.review_queue
//
// Every step writes to `engine`, which only the service role can reach, so
// this runs with the service client. It publishes NOTHING: the storefront
// changes only when a reviewer accepts and engine.publish_label() runs.
//
// A job row is opened before the model is called and closed either way, so a
// failed or timed-out reading leaves a visible `failed` job with its reason
// rather than silence. Older pending review items for the same SKU are
// superseded, so a reviewer never approves a reading a newer one replaced.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { LabelReading, PROMPT_VERSION } from "./labelSchema";
import { runChecks } from "./checks";
import { toReviewItems } from "./proposals";
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
    .select("id, sku_id, bucket_name, storage_path, mime_type, file_type, is_deleted, skus(net_weight)")
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

    const { json, model, usage, latencyMs } = await readLabel({
      imageBase64: bytes.toString("base64"),
      mimeType: upload.mime_type || file.type || "image/jpeg",
    });

    const parsed = LabelReading.safeParse(json);
    if (!parsed.success) {
      fail(`The reading did not match the label schema: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")}`);
    }

    const result = runChecks(parsed.data);
    const items = toReviewItems(parsed.data, result, { netWeight: upload.skus?.net_weight ?? null });

    const { data: output, error: outputError } = await engine
      .from("extraction_outputs")
      .insert({
        job_id: job.id, upload_id: upload.id, sku_id: upload.sku_id, model, prompt_version: PROMPT_VERSION,
        extracted: parsed.data, checks: result.checks, confidence: result.confidence, usage, latency_ms: latencyMs,
      })
      .select("id")
      .single();
    if (outputError) throw outputError;

    const { error: supersedeError } = await engine
      .from("review_queue")
      .update({ status: "superseded" })
      .eq("sku_id", upload.sku_id)
      .eq("status", "pending");
    if (supersedeError) throw supersedeError;

    const { error: queueError } = await engine
      .from("review_queue")
      .insert(items.map((i) => ({ ...i, output_id: output.id, sku_id: upload.sku_id })));
    if (queueError) throw queueError;

    await engine.from("ai_extraction_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    return { outputId: output.id, confidence: result.confidence, groups: items.map((i) => i.field_group) };
  } catch (err) {
    await engine.from("ai_extraction_jobs")
      .update({ status: "failed", error_message: String(err?.message || err).slice(0, 500), completed_at: new Date().toISOString() })
      .eq("id", job.id);
    throw err;
  }
}
