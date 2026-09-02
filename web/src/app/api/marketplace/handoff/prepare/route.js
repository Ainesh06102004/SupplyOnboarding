// ============================================================================
// POST /api/marketplace/handoff/prepare
//
// Read-only. Asks the provider what it would accept for this basket and
// returns a plan the reconciliation screen renders. Repeatable: a shopper can
// reload the screen as often as they like, and nothing anywhere changes.
//
// The shopper is taken from the VERIFIED session cookie, never from the body.
// A profileId in a request payload is a request to act as someone else.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { prepareHandoff } from "@/lib/marketplace/handoff";
import { NotConfiguredError } from "@/lib/marketplace/errors";

// One basket's worth. Each line costs a provider search, so this is a real
// spending limit, not a sanity check.
const MAX_LINES = 30;

export async function POST(request) {
  const user = await getVerifiedUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let zoneId, lines;
  try {
    ({ zoneId, lines } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!zoneId || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "zoneId and a non-empty lines array are required" }, { status: 400 });
  }
  if (lines.length > MAX_LINES) {
    return NextResponse.json({ error: `At most ${MAX_LINES} lines per hand-off` }, { status: 400 });
  }

  const clean = lines
    .map((l) => ({ koiSkuId: String(l?.koiSkuId ?? ""), quantity: Math.max(1, Number(l?.quantity) || 1) }))
    .filter((l) => l.koiSkuId);

  if (!clean.length) {
    return NextResponse.json({ error: "No valid lines" }, { status: 400 });
  }

  try {
    const plan = await prepareHandoff({ profileId: user.uid, zoneId, lines: clean });

    return NextResponse.json({
      planId: plan.planId,
      mode: plan.mode,
      accepted: plan.accepted,
      rejected: plan.rejected,
      totals: plan.totals,
      warnings: plan.warnings,
      expiresAt: plan.expiresAt,
      // Without this, commit cannot be made exactly-once, so the UI must not
      // offer to commit at all.
      persisted: plan.persisted,
    });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      // No supply source. Not a failure — there is simply nowhere to hand off,
      // and the basket stays a draft.
      return NextResponse.json({ error: "No delivery partner is connected", code: "NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("prepare handoff:", err?.message);
    return NextResponse.json({ error: "Could not prepare the hand-off" }, { status: 502 });
  }
}
