// ============================================================================
// Demo mode's database on the server: the tables, kept in web/.demo/db.json,
// and the few database functions the store calls. SERVER ONLY (it writes a
// file); the browser reaches it through /api/demo/db.
//
// The tables live on globalThis so every route of the dev server shares them,
// and `globalThis.__koiDemoRun` lets server code (the planner, the anonymous
// client) query them directly instead of over HTTP.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execute } from "./engine";
import { DEMO_UID } from "./mode";
import { seedTables } from "./seed";

const FILE = path.join(process.cwd(), ".demo", "db.json");
let timer = null;

function fresh() {
  return { tables: seedTables(new Date()), meta: { seededAt: new Date().toISOString(), planTried: false } };
}

function state() {
  if (!globalThis.__koiDemoState) {
    try {
      globalThis.__koiDemoState = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
      globalThis.__koiDemoState = fresh();
    }
  }
  return globalThis.__koiDemoState;
}

function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(globalThis.__koiDemoState));
    } catch (err) {
      console.warn("[demo] could not save the demo database:", err.message);
    }
  }, 150);
}

const uuid = () => globalThis.crypto.randomUUID();
const text = (v) => (v === undefined || v === null || v === "" ? null : v);
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

/** save_household_member (00089): insert or update a member, set their avoids, keep a version. */
function saveMember(tables, { p_household_id: householdId, p_member: m = {}, p_avoids: avoids = null }) {
  const has = (k) => Object.hasOwn(m, k);
  const holder = has("is_account_holder") ? Boolean(m.is_account_holder) : null;
  const fields = {
    label: m.label, relation: text(m.relation), age_band: text(m.age_band) ?? "adult_19_59", sex: text(m.sex), activity_level: text(m.activity_level),
    diet_type: text(m.diet_type), energy_goal: text(m.energy_goal) ?? "maintain", eating_pattern: text(m.eating_pattern) ?? "balanced",
    age_years: num(m.age_years), weight_kg: num(m.weight_kg), height_cm: num(m.height_cm), target_weight_kg: num(m.target_weight_kg),
    appetite: text(m.appetite), spice_tolerance: text(m.spice_tolerance), meals_from_home: m.meals_from_home ?? [], favourite_categories: [...new Set(m.favourite_categories ?? [])],
    target_kcal: num(m.target_kcal), target_protein_g: num(m.target_protein_g), target_carbs_g: num(m.target_carbs_g), target_fat_g: num(m.target_fat_g),
    target_source: text(m.target_source) ?? "stated", target_tolerance_pct: num(m.target_tolerance_pct) ?? 5, carb_cycling: Boolean(m.carb_cycling),
  };
  const now = new Date().toISOString();
  let row;
  if (!text(m.id)) {
    row = { id: uuid(), household_id: householdId, ...fields, account_profile_id: holder ? DEMO_UID : null, version: 1, created_at: now, updated_at: now };
    tables.household_member.push(row);
  } else {
    row = tables.household_member.find((r) => r.id === m.id && r.household_id === householdId);
    if (!row) return { data: null, error: { code: "P0002", message: "No such member in this household." } };
    for (const [k, v] of Object.entries(fields)) if (has(k)) row[k] = v;
    if (holder !== null) row.account_profile_id = holder ? DEMO_UID : null;
    row.version += 1;
    row.updated_at = now;
  }
  if (Array.isArray(avoids)) {
    const wanted = new Map();
    for (const a of avoids) { const key = typeof a === "string" ? a : a?.key; if (key && !wanted.has(key)) wanted.set(key, a?.severity ?? null); }
    tables.household_member_avoid = tables.household_member_avoid.filter((a) => a.member_id !== row.id || wanted.has(a.avoid_key));
    for (const [key, severity] of wanted) {
      const held = tables.household_member_avoid.find((a) => a.member_id === row.id && a.avoid_key === key);
      if (held) { if (severity) held.severity = severity; } else tables.household_member_avoid.push({ id: uuid(), member_id: row.id, avoid_key: key, severity });
    }
  }
  return { data: { id: row.id, version: row.version }, error: null };
}

/** calendar_feed (00092): the events behind a household's secret address. */
function calendarFeed(tables, { p_token: token }) {
  const household = tables.household.find((h) => token && h.calendar_token === token);
  if (!household) return { data: [], error: null };
  const label = (id) => tables.household_member.find((m) => m.id === id)?.label ?? null;
  return { data: (tables.calendar_event ?? []).filter((e) => e.household_id === household.id).map((e) => ({ ...e, member_label: label(e.member_id) })), error: null };
}

/**
 * Run one query (or database function) against the demo tables.
 * @returns {Promise<{ data, error, count }>}
 */
export async function runDemo(q) {
  const s = state();
  if (q.rpc) {
    const out = q.rpc === "save_household_member" ? saveMember(s.tables, q.args ?? {})
      : q.rpc === "calendar_feed" ? calendarFeed(s.tables, q.args ?? {})
        : { data: null, error: { message: `${q.rpc} isn't available in demo mode.` } };
    if (!out.error) persist();
    return out;
  }
  const out = execute(s.tables, q, { uid: DEMO_UID });
  if (out.changed) persist();
  return { data: out.data, error: out.error, count: out.count ?? null };
}

/** Start the demo again from its seed. */
export function resetDemo() {
  globalThis.__koiDemoState = fresh();
  persist();
}

/** Whether the first plan still has to be made, and remember that it's being made. */
export function claimFirstPlan() {
  const s = state();
  if (s.meta.planTried || (s.tables.plan ?? []).length) return false;
  s.meta.planTried = true;
  persist();
  return true;
}

globalThis.__koiDemoRun = runDemo;
