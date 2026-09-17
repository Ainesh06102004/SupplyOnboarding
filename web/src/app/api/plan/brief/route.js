// ============================================================================
// POST /api/plan/brief
//
// Phase 4.2. A household described in words, returned as a DRAFT for the
// /store/plan form. Nothing is saved and nothing is solved here: the shopper
// checks the draft and presses "Plan it", which is the confirmation.
//
// Signed-in only, like /api/plan: a configured model costs money per call, and
// the draft is only useful to someone who can plan. The body carries text and
// nothing else; identity comes from the verified session.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { draftHousehold } from "@/lib/planner/briefModel";
import { MAX_BRIEF_CHARS } from "@/lib/planner/brief";

export async function POST(request) {
  const user = await getVerifiedUser(request);
  if (!user?.uid) {
    return NextResponse.json({ error: "Sign in to plan for a household." }, { status: 401 });
  }

  let text;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > MAX_BRIEF_CHARS) {
    return NextResponse.json({ error: `Keep it to ${MAX_BRIEF_CHARS} characters` }, { status: 400 });
  }

  return NextResponse.json({ draft: await draftHousehold(text) });
}
