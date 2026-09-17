// ============================================================================
// POST /api/plan/followup
//
// Phase 4.3. { planId, text } — a change to a stored plan in the shopper's
// words ("cheaper", "swap the oats"). Solved again and stored as a new plan
// that follows the old one (lib/planner/plan.js planFollowUp). The message is
// not stored. Identity comes from the verified session; row-level security
// decides whether the plan is this shopper's.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { planFollowUp } from "@/lib/planner/plan";
import { MAX_FOLLOWUP_CHARS } from "@/lib/planner/followup";

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
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!planId || !text) {
    return NextResponse.json({ error: "planId and text are required" }, { status: 400 });
  }
  if (text.length > MAX_FOLLOWUP_CHARS) {
    return NextResponse.json({ error: `Keep it to ${MAX_FOLLOWUP_CHARS} characters` }, { status: 400 });
  }

  try {
    return NextResponse.json(await planFollowUp({ planId, text }));
  } catch (err) {
    const message = err?.message ?? "The plan could not be changed.";
    const status = /No such plan|no members/i.test(message) ? 404 : 500;
    if (status === 500) console.error("[plan/followup]", message);
    return NextResponse.json({ error: status === 404 ? message : "The plan could not be changed." }, { status });
  }
}
