// Supabase REST (PostgREST + Storage) with the service role, schema amazon_products.
// Plain fetch, like importOpenFoodFacts.mjs — supabase-js needs a websocket flag on Node 20.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}
const SCHEMA = "amazon_products";
const base = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path, { method = "GET", body, prefer, schema = SCHEMA } = {}) {
  const headers = { ...base, "Accept-Profile": schema, "Content-Profile": schema };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL_}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const select = (table, qs = "select=*", opts) => rest(`${table}?${qs}`, opts);

// Reads every row, 1000 at a time.
export async function selectAll(table, qs = "select=*", opts) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await rest(`${table}?${qs}&limit=1000&offset=${from}`, opts);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    await rest(`${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
      method: "POST",
      body: rows.slice(i, i + 500),
      prefer: `resolution=merge-duplicates,return=minimal`,
    });
  }
}

export const insert = (table, rows) =>
  rest(table, { method: "POST", body: rows, prefer: "return=minimal" });

export const update = (table, qs, patch) =>
  rest(`${table}?${qs}`, { method: "PATCH", body: patch, prefer: "return=minimal" });

export const rpc = (fn, args = {}) => rest(`rpc/${fn}`, { method: "POST", body: args });

export async function uploadObject(bucket, path, bytes, contentType) {
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { ...base, "Content-Type": contentType, "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
