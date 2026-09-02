// ============================================================================
// POST /api/marketplace/handoff/commit
//
// The only destructive call in the system. The provider's cart is singular and
// update_cart REPLACES it, so committing twice does not double an order — it
// discards what the first commit did and rebuilds from a stale plan.
//
// Exactly-once is enforced in Postgres by a conditional update on the plan's
// committed_at, not here. This route only carries the verified identity and
// the plan id.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { commitHandoff } from "@/lib/marketplace/handoff";
import { NotConfiguredError, RateLimitError, AuthExpiredError } from "@/lib/marketplace/errors";

export async function POST(request) {
  const user = await getVerifiedUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let planId;
  try {
    ({ planId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }
  if (!planId) return NextResponse.json({ error: "planId is required" }, { status: 400 });

  try {
    const result = await commitHandoff({ profileId: user.uid, planId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      // 5-day tokens with no refresh grant in v1.0: this genuinely requires
      // the shopper to reconnect, so say that rather than retrying.
      return NextResponse.json({ error: "Your Swiggy connection expired", code: "REAUTH" }, { status: 401 });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests, try shortly", code: "RATE_LIMITED" }, { status: 429 });
    }
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: "No delivery partner is connected", code: "NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("commit handoff:", err?.message);
    return NextResponse.json({ error: "Could not complete the hand-off" }, { status: 502 });
  }
}
