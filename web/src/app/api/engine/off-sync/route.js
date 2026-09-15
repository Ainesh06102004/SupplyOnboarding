// ============================================================================
// GET /api/engine/off-sync — keep the Open Food Facts staging current
//
// Reads the day's Open Food Facts delta files into engine.off_products, then
// cross-checks every approved SKU against them (engine.off_matches). Staging
// only: nothing here reaches the storefront. See lib/off/.
//
// Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`, like the
// other scheduled engine routes.
// ============================================================================

import { NextResponse } from "next/server";
import { cronRefusal } from "@/lib/auth/cronSecret";
import { syncOpenFoodFacts } from "@/lib/off/sync";
import { crosscheckSkus } from "@/lib/off/crosscheck";

export const maxDuration = 60;
// A delta takes about four seconds; the rest is headroom for the one in flight
// and the cross-check.
const WORK_MS = 30_000;

export async function GET(request) {
  const refused = cronRefusal(request);
  if (refused) return NextResponse.json(refused.body, { status: refused.status });

  try {
    const sync = await syncOpenFoodFacts({ deadline: Date.now() + WORK_MS });
    const crosscheck = await crosscheckSkus();
    return NextResponse.json({ sync, crosscheck });
  } catch (err) {
    console.error("[engine/off-sync]", err);
    return NextResponse.json({ error: "The Open Food Facts sync hit an error. Details are in the server log." }, { status: 500 });
  }
}
