// ============================================================================
// POST /api/plan/without — the same plan, without one item (Phase 3.5)
//
// Identity from the session; the body names a plan and a SKU, and row-level
// security decides whether the plan is this shopper's. Nothing is stored.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { planWithout } from "@/lib/planner/plan";

export async function POST(request) {
  const user = await getVerifiedUser(request);
  if (!user?.uid) {
    return NextResponse.json({ error: "Sign in to change a plan." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }
  const planId = body?.planId ? String(body.planId) : null;
  const skuId = body?.skuId ? String(body.skuId) : null;
  if (!planId || !skuId) {
    return NextResponse.json({ error: "planId and skuId are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await planWithout({ planId, skuId }));
  } catch (err) {
    const message = err?.message ?? "";
    if (/No such plan|no members/i.test(message)) return NextResponse.json({ error: message }, { status: 404 });
    console.error("[plan/without]", message);
    return NextResponse.json({ error: "The plan could not be re-solved." }, { status: 500 });
  }
}
