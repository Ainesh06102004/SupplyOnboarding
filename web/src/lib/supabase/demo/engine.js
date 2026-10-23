// ============================================================================
// Demo mode's database: the part of PostgREST KOI uses, over tables in memory.
// Pure.
//
// A query arrives as a plain description (lib/supabase/demo/client.js builds
// it from the same chained calls supabase-js takes) and runs here:
//   filters   eq neq gt gte lt lte in is like ilike contains not match
//   select    *, columns, alias:column, JSON paths (constraints->>follows),
//             and embedded rows: household_member(*), household:household_id(…),
//             brands (brand_name) — related by the foreign keys in RELATIONS
//   writes    insert, upsert (on the conflict columns, or the primary key),
//             update, delete, each returning rows when asked
//   shape     order, limit, range, single, maybeSingle, count
// There is no row-level security: demo mode has one shopper, who owns it all.
// ============================================================================

/** Primary keys that aren't `id`. */
export const PRIMARY_KEYS = Object.freeze({
  plan_week: ["plan_id"],
  autoplan_job: ["household_id"],
  notify_consent: ["account_id", "channel"],
  household_member_version: ["member_id", "version"],
});

/** Unique keys besides the primary key, as the migrations declare them. */
const UNIQUE_KEYS = Object.freeze({
  notification: [["recipient_id", "ref"]],
  member_meal_log: [["member_id", "eaten_on", "slot"]],
  member_checkin: [["member_id", "checked_on"]],
});

/** A foreign-key column, and the table it points at. */
const FK_TABLES = Object.freeze({
  household_id: "household",
  member_id: "household_member",
  plan_id: "plan",
  brand_id: "brands",
  product_id: "products",
  sku_id: "skus",
  account_profile_id: "customer_profiles",
});

/** child table → parent table → the child's column holding the parent's id. */
const CHILD_FK = Object.freeze({
  household_member: { household: "household_id" },
  household_member_avoid: { household_member: "member_id" },
  household_member_version: { household_member: "member_id" },
  household_pantry: { household: "household_id" },
  plan: { household: "household_id" },
  plan_item: { plan: "plan_id" },
  plan_week: { plan: "plan_id" },
  skus: { products: "product_id" },
  sku_nutrition: { skus: "sku_id" },
  screening_reports: { skus: "sku_id" },
  sku_label_facts: { skus: "sku_id" },
  sku_processing: { skus: "sku_id" },
  member_meal_log: { household_member: "member_id" },
  member_checkin: { household_member: "member_id" },
  calendar_event: { household: "household_id" },
});

// ── Values and comparisons ────────────────────────────────────────────────
/** A column, or a JSON path into one: "constraints->>follows", "achieved->cost". */
export function valueAt(row, path) {
  const parts = String(path).split(/->>?/).map((p) => p.trim().replace(/^'|'$/g, ""));
  let v = row?.[parts[0]];
  for (const key of parts.slice(1)) v = v === null || v === undefined ? undefined : v[key];
  return v;
}
const isNum = (v) => v !== null && v !== "" && v !== undefined && !Number.isNaN(Number(v)) && typeof v !== "boolean";
function compare(a, b) {
  if (isNum(a) && isNum(b)) return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}
const same = (a, b) => (a === null || a === undefined ? b === null || b === undefined : b !== null && b !== undefined && String(a) === String(b));
const likeRe = (pattern, flags) => new RegExp(`^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, flags);

function test(row, [op, col, val]) {
  if (op === "not") { const [inner, v] = val; return !test(row, [inner, col, v]); }
  if (op === "or") return String(col).split(",").some((part) => { const [c, o, ...rest] = part.split("."); return test(row, [o, c, rest.join(".") === "null" ? null : rest.join(".")]); });
  const v = valueAt(row, col);
  switch (op) {
    case "eq": return same(v, val);
    case "neq": return !same(v, val);
    case "gt": return v !== null && v !== undefined && compare(v, val) > 0;
    case "gte": return v !== null && v !== undefined && compare(v, val) >= 0;
    case "lt": return v !== null && v !== undefined && compare(v, val) < 0;
    case "lte": return v !== null && v !== undefined && compare(v, val) <= 0;
    case "in": return (val ?? []).some((x) => same(v, x));
    case "is": return val === null ? v === null || v === undefined : v === val;
    case "like": return v !== null && v !== undefined && likeRe(val, "").test(String(v));
    case "ilike": return v !== null && v !== undefined && likeRe(val, "i").test(String(v));
    case "contains":
      if (Array.isArray(val)) return Array.isArray(v) && val.every((x) => v.some((y) => same(x, y)));
      return v && typeof v === "object" && Object.entries(val ?? {}).every(([k, x]) => same(v[k], x));
    default: return true;
  }
}

// ── Select ────────────────────────────────────────────────────────────────
/** Split on commas that aren't inside parentheses. */
function topLevel(text) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(text)) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** "household_member(*, household_member_avoid(avoid_key))" → items. */
export function parseSelect(text) {
  if (text === null || text === undefined || String(text).trim() === "" || String(text).trim() === "*") return [{ kind: "star" }];
  return topLevel(text).map((item) => {
    const open = item.indexOf("(");
    if (open >= 0) {
      const head = item.slice(0, open).trim();
      const inner = item.slice(open + 1, item.lastIndexOf(")"));
      const [alias, rest] = head.includes(":") ? head.split(":") : [null, head];
      const [name, hint] = rest.trim().split("!");
      return { kind: "embed", alias: alias?.trim() || null, name: name.trim(), hint: hint ?? null, children: parseSelect(inner) };
    }
    if (item === "*") return { kind: "star" };
    const clean = item.replace(/::[a-z0-9_]+/gi, "");
    const colon = clean.search(/:(?!:)/);
    const [alias, path] = colon > 0 && !clean.slice(0, colon).includes("-") ? [clean.slice(0, colon).trim(), clean.slice(colon + 1).trim()] : [null, clean.trim()];
    return { kind: "col", alias, path };
  });
}

function embed(tables, table, row, e) {
  // Rows that already carry it (the test catalogue's products hold their skus).
  if (row[e.name] !== undefined && typeof row[e.name] === "object" && !FK_TABLES[e.name]) {
    const held = row[e.name];
    return Array.isArray(held) ? held.map((r) => project(tables, e.name, r, e.children)) : held && project(tables, e.name, held, e.children);
  }
  // Many to one, through a key on this row: household:household_id(…), or
  // brands(…) on a product that has a brand_id.
  let fkCol = null;
  if (FK_TABLES[e.name] && e.name in row) fkCol = e.name;
  else if (e.hint && FK_TABLES[e.hint] && e.hint in row) fkCol = e.hint;
  else fkCol = Object.keys(FK_TABLES).find((c) => FK_TABLES[c] === e.name && c in row && !CHILD_FK[e.name]?.[table]) ?? null;
  if (fkCol) {
    const parent = (tables[FK_TABLES[fkCol]] ?? []).find((p) => same(p.id, row[fkCol]));
    return parent ? project(tables, FK_TABLES[fkCol], parent, e.children) : null;
  }
  // One to many: the child rows that point at this one.
  const childCol = CHILD_FK[e.name]?.[table] ?? `${table.replace(/s$/, "")}_id`;
  return (tables[e.name] ?? []).filter((c) => same(c[childCol], row.id)).map((c) => project(tables, e.name, c, e.children));
}

function project(tables, table, row, items) {
  const out = {};
  for (const item of items) {
    if (item.kind === "star") Object.assign(out, structuredClone(row));
    else if (item.kind === "col") out[item.alias ?? item.path.split(/->>?/).at(-1).trim()] = structuredClone(valueAt(row, item.path) ?? null);
    else out[item.alias ?? item.name] = embed(tables, table, row, item);
  }
  return out;
}

// ── Writes ────────────────────────────────────────────────────────────────
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (Math.random() * 16) >> (c / 4)).toString(16)));
const keysOf = (table, onConflict) => (onConflict ? String(onConflict).split(",").map((s) => s.trim()) : PRIMARY_KEYS[table] ?? ["id"]);

/** A new row as the database would fill it in. */
function withDefaults(table, row, { uid, now }) {
  const r = { ...row };
  if (!PRIMARY_KEYS[table] && (r.id === undefined || r.id === null)) r.id = uuid();
  r.created_at ??= now;
  if (table !== "household_member_avoid") r.updated_at ??= now;
  if (table === "household") { r.owner_id ??= uid; r.keep_out ??= []; }
  if (table === "notify_consent") r.account_id ??= uid;
  if (table === "household_member") r.version ??= 1;
  if (table === "plan_week") { r.picks ??= {}; r.adjustments ??= []; }
  if (table === "calendar_event") { r.plan_effect ??= {}; r.source ??= "user"; }
  if (table === "notification") { r.template_params ??= []; r.channels ??= ["in_app"]; r.sent ??= {}; }
  return r;
}

/**
 * Run one query against the tables (which it changes for writes).
 * @param {Object<string, Array>} tables
 * @param {object} q { table, schema, op, select, values, filters, orders, limit, range, single, count, head, onConflict, ignoreDuplicates, returning }
 * @param {{ uid: string, now?: string }} ctx
 * @returns {{ data: any, error: object|null, count?: number|null, changed: boolean }}
 */
export function execute(tables, q, { uid, now = new Date().toISOString() } = {}) {
  const name = q.schema && q.schema !== "public" ? `${q.schema}.${q.table}` : q.table;
  tables[name] ??= [];
  const rows = tables[name];
  const filters = q.filters ?? [];
  const matching = () => rows.filter((r) => filters.every((f) => test(r, f)));
  let result = [];
  let changed = false;

  if (q.op === "insert" || q.op === "upsert") {
    const values = [].concat(q.values ?? []);
    const keys = keysOf(name, q.onConflict);
    for (const v of values) {
      const existing = q.op === "upsert" ? rows.find((r) => keys.every((k) => same(r[k], v[k]))) : null;
      if (existing) {
        if (q.ignoreDuplicates) continue;
        Object.assign(existing, v, { updated_at: v.updated_at ?? now });
        result.push(existing);
      } else {
        const row = withDefaults(name, v, { uid, now });
        // A unique key already taken is the database's 23505.
        const taken = [keysOf(name), ...(UNIQUE_KEYS[name] ?? [])].some((ks) => ks.every((k) => row[k] !== null && row[k] !== undefined) && rows.some((r) => ks.every((k) => same(r[k], row[k]))));
        if (taken) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${name}` }, changed };
        rows.push(row);
        result.push(row);
      }
      changed = true;
    }
  } else if (q.op === "update") {
    result = matching();
    for (const r of result) Object.assign(r, q.values ?? {});
    changed = result.length > 0;
  } else if (q.op === "delete") {
    result = matching();
    tables[name] = rows.filter((r) => !result.includes(r));
    changed = result.length > 0;
  } else {
    result = matching();
  }

  // Order, then count, then page.
  const orders = q.orders ?? [];
  if (orders.length) {
    result = [...result].sort((a, b) => {
      for (const [col, ascending = true, nullsFirst = null] of orders) {
        const x = valueAt(a, col);
        const y = valueAt(b, col);
        if (x === y) continue;
        if (x === null || x === undefined) return nullsFirst ?? !ascending ? -1 : 1;
        if (y === null || y === undefined) return nullsFirst ?? !ascending ? 1 : -1;
        const c = compare(x, y);
        if (c) return ascending ? c : -c;
      }
      return 0;
    });
  }
  const count = q.count ? result.length : null;
  if (q.range) result = result.slice(q.range[0], q.range[1] + 1);
  if (Number.isInteger(q.limit)) result = result.slice(0, q.limit);

  const writes = q.op !== "select";
  if (writes && !q.returning) return { data: null, error: null, count, changed };
  if (q.head) return { data: null, error: null, count, changed };
  const items = parseSelect(q.select ?? "*");
  let data = result.map((r) => project(tables, name, r, items));
  if (q.single) {
    if (data.length === 1) data = data[0];
    else if (!data.length && q.single === "maybe") data = null;
    else return { data: null, error: { code: "PGRST116", message: `JSON object requested, ${data.length} rows returned` }, count, changed };
  }
  return { data, error: null, count, changed };
}
