// ============================================================================
// POST /api/plan
//
// Plan a household's shopping for a period. Phase 3.
//
// Identity comes from the verified session, never from the body: the body
// carries a household id, and row-level security decides whether this caller
// owns it (lib/planner/plan.js reads as the shopper). A signed-out caller has
// no household, so they are refused here rather than handed an empty plan.
//
// Solving is bounded on purpose. The solver runs with a time limit
// (lib/planner/solve.js) and the catalogue is capped before it enters the
// program, so one request cannot spend the server's afternoon on a
// mixed-integer search.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { planForHousehold } from "@/lib/planner/plan";
import { DIET_TYPES } from "@/lib/recommendation/config";
import { nodeInfo } from "@/lib/food/taxonomy";

/** A fortnight is the most a plan can be trusted to; the table agrees. */
const MAX_DAYS = 14;
/** As many as a household may hold (lib/planner/brief.js MAX_MEMBERS). */
const MAX_MEMBERS = 12;
const MAX_CATEGORIES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIET_KEYS = DIET_TYPES.map((d) => d.key);

export async function POST(request) {
  const user = await getVerifiedUser(request);
  if (!user?.uid) {
    return NextResponse.json({ error: "Sign in to plan for a household." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const householdId = body?.householdId ? String(body.householdId) : null;
  if (!householdId) {
    return NextResponse.json({ error: "householdId is required" }, { status: 400 });
  }

  const days = Number(body?.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json({ error: `days must be a whole number from 1 to ${MAX_DAYS}` }, { status: 400 });
  }

  const budget = body?.budget === null || body?.budget === undefined ? null : Number(body.budget);
  if (budget !== null && !(Number.isFinite(budget) && budget > 0)) {
    return NextResponse.json({ error: "budget must be a positive number of rupees, or omitted" }, { status: 400 });
  }

  // Availability is only asked of a marketplace when a zone is known, and
  // "unknown" is not "available" — so requiring it without a zone would make
  // every plan infeasible. The caller says which they want; the plan records it.
  const zoneId = body?.zoneId ? String(body.zoneId) : null;
  const availability = body?.requireAvailable === true ? "require_available" : "allow_unknown";
  if (availability === "require_available" && !zoneId) {
    return NextResponse.json({ error: "requireAvailable needs a zoneId" }, { status: 400 });
  }

  // Who is eating, and what they chose for this plan alone. Both are checked
  // here: a member id only ever narrows the caller's own household (RLS still
  // decides), a diet must be one KOI knows, and a category must be one in the
  // tree — anything else is dropped rather than passed to the solver.
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

  try {
    const plan = await planForHousehold({ householdId, days, budget, zoneId, availability, memberIds, thisWeek });
    return NextResponse.json(plan);
  } catch (err) {
    // A household that is not this shopper's reads as absent, which is the
    // honest answer and gives nothing away.
    const message = err?.message ?? "The plan could not be built.";
    const status = /No such household|no members/i.test(message) ? 404 : 500;
    if (status === 500) console.error("[plan]", message);
    return NextResponse.json({ error: status === 404 ? message : "The plan could not be built." }, { status });
  }
}
