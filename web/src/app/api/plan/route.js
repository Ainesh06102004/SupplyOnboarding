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
//
// The live plan page uses /api/plan/run, which streams the same work step by
// step. Both read the body through lib/planner/requestBody.js.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { planForHousehold } from "@/lib/planner/plan";
import { readPlanRequest } from "@/lib/planner/requestBody";

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

  const read = readPlanRequest(body);
  if (read.error) return NextResponse.json({ error: read.error }, { status: 400 });

  try {
    const plan = await planForHousehold(read.value);
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
