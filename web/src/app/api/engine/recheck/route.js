// ============================================================================
// GET /api/engine/recheck — the daily label re-check
//
// Looks at every approved SKU's listing on its brand's own store, re-confirms
// the labels still shown there, and turns new label images into uploads for
// the reader (/api/engine/run, scheduled an hour later). Then re-scores the
// catalogue, because a label passing a year without confirmation changes what
// its score may count. See lib/engine/recheck.js.
//
// Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`, like the
// reader, and closed unless CRON_SECRET is set: it spends model credit.
// ============================================================================

import { NextResponse } from "next/server";
import { cronRefusal } from "@/lib/auth/cronSecret";
import { recheckLabels } from "@/lib/engine/recheck";
import { rescoreSkus } from "@/lib/screening/rescore";

export const maxDuration = 60;
// Leaves room inside maxDuration for the images still in flight, closing each
// listing, and the rescore. A full local run with a 35 s budget took 48 s.
const WORK_MS = 25_000;

export async function GET(request) {
  const refused = cronRefusal(request);
  if (refused) return NextResponse.json(refused.body, { status: refused.status });

  try {
    const recheck = await recheckLabels({ deadline: Date.now() + WORK_MS });
    const rescored = await rescoreSkus();
    return NextResponse.json({
      recheck,
      rescored: {
        skus: rescored.length,
        changed: rescored.filter((r) => r.changed).length,
        errors: rescored.filter((r) => r.error).length,
      },
    });
  } catch (err) {
    console.error("[engine/recheck]", err);
    return NextResponse.json({ error: "The label re-check hit an error. Details are in the server log." }, { status: 500 });
  }
}
