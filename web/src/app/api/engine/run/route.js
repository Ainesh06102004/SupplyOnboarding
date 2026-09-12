// ============================================================================
// GET /api/engine/run — the scheduled label reader
//
// Reads label photos nobody has read yet, a couple per call, and publishes
// what the two readings agree on. Called by Vercel Cron (web/vercel.json),
// which sends `Authorization: Bearer $CRON_SECRET`; the same header works by
// hand for a local run (scripts/runEngine.mjs).
//
// Closed unless CRON_SECRET is set: every call spends model credit, so an
// unconfigured deployment refuses rather than running for anyone who finds it.
// ============================================================================

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runPending } from "@/lib/engine/pipeline";

// Two readings per photo, in parallel; a couple of photos fit in a minute.
export const maxDuration = 60;
const PER_RUN = 2;

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set, so the label reader is off." }, { status: 503 });
  }
  if (!authorised(request)) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  try {
    return NextResponse.json(await runPending({ limit: PER_RUN }));
  } catch (err) {
    console.error("[engine/run]", err);
    return NextResponse.json({ error: "The label reader hit an error. Details are in the server log." }, { status: 500 });
  }
}
