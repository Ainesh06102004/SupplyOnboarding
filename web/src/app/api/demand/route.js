// ============================================================================
// POST /api/demand — count search terms KOI could not answer
//
// Body: { terms: [{ term, kind }] }, at most four, built on the device by
// lib/demand/terms.js. Answers 204 whether or not anything was counted, so the
// response says nothing about what is stored.
//
// What this route never does:
//   - read identity. There is no session lookup, and the client sends no
//     cookies. A count is not about anyone.
//   - store or log the request's IP. It keys an in-memory rate limit and is
//     gone when the instance is.
//   - log a term. An error logs its code only, because a Postgres message can
//     quote the failing row, and a term beside a request log's time and IP is
//     the link this table exists not to make.
//   - send anything to a provider. The terms go to KOI's own database only.
//
// Every term is cleaned again here with the same rule the device used.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/admin";
import { sanitiseTerm, DEMAND_KINDS, MAX_TERMS } from "@/lib/demand/terms";

const MAX_BODY_BYTES = 1024;
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 12;
const windows = new Map();

const Body = z.object({
  terms: z.array(z.object({ term: z.string().max(80), kind: z.enum(DEMAND_KINDS) })).min(1).max(MAX_TERMS),
});

const done = () => new NextResponse(null, { status: 204 });

function overLimit(request) {
  const key = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const now = Date.now();
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  w.count += 1;
  return w.count > PER_WINDOW;
}

export async function POST(request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }
  // Counts are best-effort; a flood is dropped quietly rather than argued with.
  if (overLimit(request)) return done();

  let body;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const terms = [];
  for (const { term, kind } of body.terms) {
    const clean = sanitiseTerm(term);
    if (clean && !terms.some((t) => t.term === clean && t.kind === kind)) terms.push({ term: clean, kind });
  }
  if (!terms.length) return done();

  const db = getServiceClient();
  if (!db) return done();

  const { error } = await db.schema("engine").rpc("record_demand", { p_terms: terms });
  if (error) console.error("[demand] record failed", error.code ?? "unknown");
  return done();
}
