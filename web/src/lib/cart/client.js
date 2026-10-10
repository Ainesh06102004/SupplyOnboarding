// ============================================================================
// KOI — the one bridge from a plan to the cart. Client-side I/O.
//
// Three things used to copy the plan into the cart, each with its own
// SKU→product lookup and each ADDING packs: the Plan's Pantry and Shop buttons
// (usePlanSession), and Agent Mode's cart approvals (AgentProvider). Pressing
// two of them doubled the basket. They all call `putPlanInCart` now, which
// REPLACES the plan's share (lib/cart/lines.js applyPlanShare).
//
// This module does I/O (the catalogue, the latest plan); the arithmetic stays
// pure in lines.js and plan.js.
// ============================================================================

import { fetchAllProducts } from "@/lib/data/productFetcher";
import { getSupabaseClient } from "@/lib/supabase/client";
import { hydrateCart, useCartStore } from "@/store/cartStore";
import { packsToBuy, basketSnapshot } from "./plan";

let catalogue = null;

/**
 * The storefront catalogue, fetched once per page load and shared by the cart,
 * the Plan bridge and the agent. A failed fetch is not cached.
 * @returns {Promise<Array<object>>}
 */
export function getCatalogue() {
  if (!catalogue) {
    catalogue = fetchAllProducts().catch((e) => {
      catalogue = null;
      throw e;
    });
  }
  return catalogue;
}

/**
 * Put a plan's packs in the one cart, replacing whatever the plan put there
 * before. The shopper's own items and extra packs stay.
 *
 * @param {object} p
 * @param {string|null} p.planId
 * @param {Array<{skuId: string|number, packs: number}>} p.basket the planner's basket
 * @param {Iterable<string|number>} [p.atHome] SKUs marked "have it"
 * @param {number|null} [p.members] how many people the plan is for
 * @param {Array<object>} [p.products] a catalogue already in hand
 * @returns {Promise<{ products: number, packs: number, missing: string[] }>}
 */
export async function putPlanInCart({ planId, basket, atHome = [], members = null, products }) {
  await hydrateCart();
  const all = products?.length ? products : await getCatalogue();
  const bySku = new Map(all.map((p) => [String(p.skuId), p]));
  const want = packsToBuy(basket, { atHome });
  const missing = [];
  const lines = [];
  for (const l of want) {
    const product = bySku.get(l.skuId);
    if (product) lines.push({ ...l, product });
    else missing.push((basket.find((b) => String(b.skuId) === l.skuId)?.name) ?? l.skuId);
  }
  useCartStore.getState().applyPlan({ planId, basket: basketSnapshot(basket), atHome: [...atHome].map(String), members, lines });
  return { products: lines.length, packs: lines.reduce((n, l) => n + l.packs, 0), missing };
}

/**
 * Bring the cart up to the latest plan, keeping what was marked at home.
 * @param {{ planId: string|null, basket: Array<object>, members?: number }} latest
 */
export async function updateCartToPlan(latest) {
  const atHome = useCartStore.getState().plan?.atHome ?? [];
  return putPlanInCart({ planId: latest.planId, basket: latest.basket, atHome, members: latest.members || null });
}

/**
 * The signed-in household's latest plan: its id and the planner's basket.
 * Null when signed out, with no household, or with no plan yet.
 * @returns {Promise<{ planId: string, basket: Array<object>, members: number, at: string }|null>}
 */
export async function fetchLatestPlan() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getSession();
  if (!auth?.session?.user) return null;
  const { data: household } = await supabase
    .from("household")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!household?.id) return null;
  const { data: row } = await supabase
    .from("plan")
    .select("id, created_at, basket:achieved->basket, members:constraints->members")
    .eq("household_id", household.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;
  return { planId: row.id, basket: Array.isArray(row.basket) ? row.basket : [], members: Array.isArray(row.members) ? row.members.length : 0, at: row.created_at };
}
