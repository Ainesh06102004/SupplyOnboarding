// ============================================================================
// What a plan request may ask for, checked once for every route that plans
// (/api/plan and the live /api/plan/run). Pure.
//
// Identity is never in here: the body carries a household id, and row-level
// security decides whether the caller owns it. What is checked is shape and
// bounds — a member id only ever narrows the caller's own household, a diet
// must be one KOI knows, a category must be in the tree — and anything else is
// dropped rather than handed to the solver.
// ============================================================================

import { DIET_TYPES } from "@/lib/recommendation/config";
import { nodeInfo } from "@/lib/food/taxonomy";

/** A fortnight is the most a plan can be trusted to; the table agrees. */
export const MAX_DAYS = 14;
/** As many as a household may hold (lib/planner/brief.js MAX_MEMBERS). */
export const MAX_MEMBERS = 12;
const MAX_CATEGORIES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A catalogue SKU id: a uuid, or a test-catalogue id ("off-…"). */
const SKU_ID = /^[A-Za-z0-9-]{1,64}$/;
const DIET_KEYS = DIET_TYPES.map((d) => d.key);

/**
 * @param {object} body the parsed request body
 * @returns {{ error: string } | { value: { householdId, days, budget, zoneId, availability, memberIds, thisWeek } }}
 */
export function readPlanRequest(body) {
  const householdId = body?.householdId ? String(body.householdId) : null;
  if (!householdId) return { error: "householdId is required" };

  const days = Number(body?.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return { error: `days must be a whole number from 1 to ${MAX_DAYS}` };
  }

  const budget = body?.budget === null || body?.budget === undefined ? null : Number(body.budget);
  if (budget !== null && !(Number.isFinite(budget) && budget > 0)) {
    return { error: "budget must be a positive number of rupees, or omitted" };
  }

  // Availability is only asked of a marketplace when a zone is known, and
  // "unknown" is not "available" — so requiring it without a zone would make
  // every plan infeasible.
  const zoneId = body?.zoneId ? String(body.zoneId) : null;
  const availability = body?.requireAvailable === true ? "require_available" : "allow_unknown";
  if (availability === "require_available" && !zoneId) return { error: "requireAvailable needs a zoneId" };

  const memberIds = Array.isArray(body?.memberIds)
    ? [...new Set(body.memberIds.filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, MAX_MEMBERS)
    : null;

  const thisWeek = {};
  for (const [memberId, choice] of Object.entries(body?.thisWeek ?? {})) {
    if (!UUID.test(String(memberId)) || !choice || typeof choice !== "object") continue;
    const dietType = DIET_KEYS.includes(choice.dietType) ? choice.dietType : null;
    const categories = (list) => (Array.isArray(list) ? list : [])
      .filter((key) => typeof key === "string" && nodeInfo(key))
      .slice(0, MAX_CATEGORIES);
    const prefer = categories(choice.prefer);
    const skip = categories(choice.skip);
    // A target for this plan alone. Bounded here; the profile is untouched.
    const targets = {};
    const protein = Number(choice.targets?.protein);
    const kcal = Number(choice.targets?.kcal);
    if (Number.isFinite(protein) && protein > 0 && protein <= 400) targets.protein = protein;
    if (Number.isFinite(kcal) && kcal > 0 && kcal <= 6000) targets.kcal = kcal;
    if (dietType || prefer.length || skip.length || Object.keys(targets).length) {
      thisWeek[memberId] = { dietType, prefer, skip, targets };
    }
  }

  return { value: { householdId, days, budget, zoneId, availability, memberIds, thisWeek } };
}

/**
 * A change the page built from a card rather than read from a sentence: today,
 * swaps by SKU id (an upgrade card). Anything else in it is dropped.
 *
 * @param {object|null|undefined} reading
 * and products to include by SKU id (the week's menu asking for its staples).
 * @returns {{ swaps: { from: string, to: string, fromSku: string, toSku: string }[], includeSkus: string[] } | null}
 */
export function readStructuredChange(reading) {
  if (!reading || typeof reading !== "object") return null;
  const swaps = (Array.isArray(reading.swaps) ? reading.swaps : [])
    .filter((s) => s && SKU_ID.test(String(s.fromSku ?? "")) && SKU_ID.test(String(s.toSku ?? "")) && s.fromSku !== s.toSku)
    .slice(0, 2)
    .map((s) => ({
      fromSku: String(s.fromSku),
      toSku: String(s.toSku),
      from: String(s.from ?? "").slice(0, 80),
      to: String(s.to ?? "").slice(0, 80),
    }));
  const includeSkus = [...new Set((Array.isArray(reading.includeSkus) ? reading.includeSkus : [])
    .map(String)
    .filter((id) => SKU_ID.test(id)))]
    .slice(0, 8);
  return swaps.length || includeSkus.length ? { swaps, includeSkus } : null;
}
