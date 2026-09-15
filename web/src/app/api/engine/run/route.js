// ============================================================================
// GET /api/engine/run — the scheduled label reader
//
// Reads label photos nobody has read yet, a couple per call, and publishes
// what the two readings agree on. Called by Vercel Cron (web/vercel.json),
// which sends `Authorization: Bearer $CRON_SECRET`; the same header works by
// hand for a local run (scripts/runEngine.mjs).
//
// GET ?upload=<id> re-reads one photo even if it has been read before — for
// when the engine's rules change and an earlier reading should be redone.
// The new reading replaces what the automatic path published before, except
// anything a person verified, which it never overwrites.
//
// Closed unless CRON_SECRET is set: every call spends model credit, so an
// unconfigured deployment refuses rather than running for anyone who finds it.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { cronRefusal } from "@/lib/auth/cronSecret";
import { runPending, runExtraction } from "@/lib/engine/pipeline";
import { rescoreSkus } from "@/lib/screening/rescore";

// Two readings per photo, in parallel; a couple of photos fit in a minute.
export const maxDuration = 60;
const PER_RUN = 2;

export async function GET(request) {
  const refused = cronRefusal(request);
  if (refused) return NextResponse.json(refused.body, { status: refused.status });

  const params = new URL(request.url).searchParams;
  const upload = params.get("upload");
  if (upload !== null && !z.uuid().safeParse(upload).success) {
    return NextResponse.json({ error: "upload must be an upload id." }, { status: 400 });
  }
  // ?rescore=all recomputes every approved product's KOI score (after a rubric
  // change); ?rescore=<sku id> recomputes one.
  const rescore = params.get("rescore");
  if (rescore !== null && rescore !== "all" && !z.uuid().safeParse(rescore).success) {
    return NextResponse.json({ error: "rescore must be 'all' or a SKU id." }, { status: 400 });
  }

  try {
    if (rescore) return NextResponse.json(await rescoreSkus(rescore === "all" ? null : [rescore]));
    if (upload) return NextResponse.json(await runExtraction(upload));
    return NextResponse.json(await runPending({ limit: PER_RUN }));
  } catch (err) {
    if (err?.expose) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[engine/run]", err);
    return NextResponse.json({ error: "The label reader hit an error. Details are in the server log." }, { status: 500 });
  }
}
