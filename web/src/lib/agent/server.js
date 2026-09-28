// ============================================================================
// Agent Mode: the loop's view of the database, and the model. SERVER ONLY.
//
// Every request reads the household, its people and the plan afresh, as the
// shopper (RLS): the browser's memory is the conversation, never the state.
// ============================================================================

import "server-only";

import { callTools } from "@/lib/ai/providers/openai";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { profileFromRow } from "@/lib/household/profile";
import { AGENT_INSTRUCTIONS, TOOL_SCHEMAS } from "./tools/schemas";
import { digestFor } from "./digest";

const MEMBER_FIELDS = "id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, target_weight_kg, appetite, spice_tolerance, meals_from_home, favourite_categories, target_kcal, target_protein_g, target_source, account_profile_id, version, created_at, household_member_avoid(avoid_key, severity)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ROUTES = Object.freeze(["plan", "product", "shop", "cart", "household", "home", "other"]);
const STEPS = ["define", "you", "plan", "pantry", "shop", "track"];

/** The page the dock is on, as the browser describes it: kinds and ids only, never text. */
export function readPage(raw) {
  const page = raw && typeof raw === "object" ? raw : {};
  return {
    route: ROUTES.includes(page.route) ? page.route : "other",
    step: STEPS.includes(page.step) ? page.step : null,
    productId: typeof page.productId === "string" && page.productId.length <= 64 && /^[\w-]+$/.test(page.productId) ? page.productId : null,
    planId: typeof page.planId === "string" && UUID.test(page.planId) ? page.planId : null,
    cartCount: Number.isInteger(page.cartCount) && page.cartCount >= 0 ? Math.min(page.cartCount, 999) : 0,
    week: readWeek(page.week),
  };
}

const SLOTS = ["breakfast", "lunch", "snack", "dinner", "drinks"];
const clip = (s, n) => String(s ?? "").replace(/[<>]/g, "").slice(0, n);
/**
 * The week of dishes as the Plan page describes it: KOI's own dish names, per
 * day and meal (lib/plan/schedule.js). Bounded, and never the shopper's text.
 */
function readWeek(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 14).map((d) => ({
    day: clip(d?.day, 12),
    date: clip(d?.date, 10),
    slots: Object.fromEntries(SLOTS.filter((s) => typeof d?.slots?.[s] === "string").map((s) => [s, clip(d.slots[s], 120)])),
  })).filter((d) => d.day);
}

/**
 * @param {{ db, uid: string, page: object, emit: Function, signal: AbortSignal }} input
 * @returns {Promise<object>} the ctx the loop and tools use
 */
export async function loadContext({ db, uid, page, emit, signal }) {
  const ctx = { db, uid, page, emit, signal, household: null, saved: [], savedRows: [], plan: null };
  let catalogue = null;
  ctx.catalogue = async () => (catalogue ??= await fetchAllProducts());

  ctx.reload = async () => {
    const { data: households, error } = await db.from("household").select("id, label").order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    ctx.household = households?.[0] ?? null;
    ctx.saved = [];
    ctx.savedRows = [];
    if (ctx.household) {
      const { data: rows, error: memberError } = await db.from("household_member").select(MEMBER_FIELDS).eq("household_id", ctx.household.id).order("created_at");
      if (memberError) throw memberError;
      ctx.savedRows = rows ?? [];
      ctx.saved = ctx.savedRows.map(profileFromRow);
    }
  };
  await ctx.reload();

  if (ctx.household) {
    // The plan on screen if the page names one of this shopper's plans, else their latest.
    const byId = page.planId ? await db.from("plan").select("id, days, achieved").eq("id", page.planId).maybeSingle() : { data: null };
    const latest = byId.data ? byId : await db.from("plan").select("id, days, achieved").eq("household_id", ctx.household.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    ctx.plan = latest.data ?? null;
  }

  ctx.labels = () => ctx.saved.map((p) => p.label).concat((ctx.memory?.draft?.members ?? []).map((m) => m.label));
  ctx.products = () => (ctx.plan?.achieved?.basket ?? []).map((l) => l.name).filter(Boolean);

  ctx.snapshot = async () => {
    const planId = ctx.memory?.planId ?? ctx.plan?.id ?? null;
    let basket = ctx.products();
    if (planId && planId !== ctx.plan?.id) {
      const { data } = await db.from("plan").select("id, days, achieved").eq("id", planId).maybeSingle();
      if (data) ctx.plan = data;
      basket = ctx.products();
    }
    let productName = null;
    if (page.productId) {
      const all = await ctx.catalogue();
      productName = all.find((p) => String(p.id) === page.productId || String(p.skuId) === page.productId)?.name ?? null;
    }
    return { saved: ctx.saved, savedCount: ctx.saved.length, draft: ctx.memory?.draft ?? null, planId, hasPlan: Boolean(planId), basket, page, productName, cartCount: page.cartCount };
  };
  return ctx;
}

/** The model, when there is one: KOI_AI_INTERPRETER=openai and an agent model named. */
export function openaiModel() {
  if (process.env.KOI_AI_INTERPRETER !== "openai" || !process.env.KOI_OPENAI_AGENT_MODEL) return null;
  return async ({ memory, state, signal }) => {
    const input = [...memory.items, { role: "developer", content: digestFor(state) }];
    const out = await callTools({
      modelEnv: "KOI_OPENAI_AGENT_MODEL",
      effortEnv: "KOI_OPENAI_AGENT_EFFORT",
      instructions: AGENT_INSTRUCTIONS,
      input,
      tools: TOOL_SCHEMAS,
      maxOutputTokens: 900,
      signal,
    });
    return { call: out.call, carry: out.carry, text: out.text, model: out.model, usage: out.usage };
  };
}
