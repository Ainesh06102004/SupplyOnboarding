// OpenAI's Batch API for the Amazon scripts: the same requests at half the
// price, answered within 24 hours. A batch file may be at most 200 MB, so work
// is split across as many batches as it needs; each batch keeps a manifest on
// disk (cache/batches/<id>.json) saying what its requests were for.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as cache from "./cache.mjs";

const OAI = "https://api.openai.com/v1";
export const BATCH_DIR = join(cache.CACHE, "batches");
const auth = () => ({ Authorization: `Bearer ${process.env.OPENAI_API_KEY}` });

async function submitOne(job, lines, entries) {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append("file", new Blob([lines.join("\n")], { type: "application/jsonl" }), `${job}.jsonl`);
  const file = await (await fetch(`${OAI}/files`, { method: "POST", headers: auth(), body: form })).json();
  if (!file.id) throw new Error(`upload failed: ${JSON.stringify(file).slice(0, 300)}`);
  const batch = await (await fetch(`${OAI}/batches`, {
    method: "POST", headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ input_file_id: file.id, endpoint: "/v1/chat/completions", completion_window: "24h", metadata: { job } }),
  })).json();
  if (!batch.id) throw new Error(`batch failed: ${JSON.stringify(batch).slice(0, 300)}`);
  writeFileSync(join(BATCH_DIR, `${batch.id}.json`), JSON.stringify({ job, submitted: new Date().toISOString(), collected: false, entries }));
  console.log(`  batch ${batch.id}: ${lines.length} requests, ${(lines.reduce((s, l) => s + l.length, 0) / 1e6).toFixed(0)} MB`);
  return batch.id;
}

/**
 * Submit every item, split across batches under the size limit. An item's
 * requests always travel in the same batch.
 * @param {string} job  e.g. "koi-amazon-labels"
 * @param {Array} items
 * @param {(item) => Promise<{ requests: Array<{ custom_id, body }>, entry: object }>} build
 * @returns {Promise<string[]>} batch ids
 */
export async function submitInBatches(job, items, build, { maxBytes = 95e6, maxRequests = 20_000 } = {}) {
  mkdirSync(BATCH_DIR, { recursive: true });
  const ids = [];
  let lines = [], entries = [], bytes = 0;
  for (const item of items) {
    const { requests, entry } = await build(item);
    const add = requests.map((r) => JSON.stringify({ custom_id: r.custom_id, method: "POST", url: "/v1/chat/completions", body: r.body }));
    const size = add.reduce((s, l) => s + l.length + 1, 0);
    if (lines.length && (bytes + size > maxBytes || lines.length + add.length > maxRequests)) {
      ids.push(await submitOne(job, lines, entries));
      lines = []; entries = []; bytes = 0;
    }
    lines.push(...add); entries.push(entry); bytes += size;
  }
  if (lines.length) ids.push(await submitOne(job, lines, entries));
  return ids;
}

/** Batches this machine submitted for a job and hasn't collected yet (or just `id`). */
export function pendingBatches(job, id = null) {
  if (!existsSync(BATCH_DIR)) return [];
  return readdirSync(BATCH_DIR).filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.slice(0, -5), ...JSON.parse(readFileSync(join(BATCH_DIR, f), "utf8")) }))
    .filter((b) => b.job === job && (id ? b.id === id : !b.collected));
}

/**
 * A finished batch's replies by custom_id (the chat-completions body), or null
 * with its status printed while it's still running.
 */
export async function fetchReplies(batch) {
  const status = await (await fetch(`${OAI}/batches/${batch.id}`, { headers: auth() })).json();
  if (status.status !== "completed") {
    console.log(`  batch ${batch.id}: ${status.status} (${status.request_counts?.completed ?? 0}/${status.request_counts?.total ?? "?"} done)${status.errors?.data?.length ? ` — ${status.errors.data[0].message}` : ""}`);
    return null;
  }
  const replies = new Map();
  if (status.output_file_id) {
    const text = await (await fetch(`${OAI}/files/${status.output_file_id}/content`, { headers: auth() })).text();
    for (const line of text.split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.response?.status_code === 200) replies.set(r.custom_id, r.response.body);
    }
  }
  const failed = (status.request_counts?.failed ?? 0);
  if (failed) console.log(`  batch ${batch.id}: ${failed} requests failed; they stay unread and go in the next batch`);
  return replies;
}

/** Mark a batch collected so the next --collect skips it. */
export function markCollected(batch, summary) {
  const { id, ...rest } = batch;
  writeFileSync(join(BATCH_DIR, `${id}.json`), JSON.stringify({ ...rest, collected: new Date().toISOString(), summary }));
}
