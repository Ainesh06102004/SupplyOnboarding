// ============================================================================
// POST /api/plan/run
//
// The live plan page. The same work as /api/plan, /api/plan/followup and
// /api/plan/without, streamed as it happens, so the page can show KOI working
// — which household it read, how many products it checked, each rung of the
// ladder solving, the basket as a draft — before the stored plan arrives.
//
// Body: { action: "plan" | "followup" | "without", ...that route's fields }
// Response: NDJSON, one JSON object per line:
//   { type: "hello" }                      padding, so Safari starts rendering
//   { type: "step",  stage, status, ... }  progress facts (counts, statuses, ms)
//   { type: "draft", basket, cost, ... }   the solved basket, before it is explained and stored
//   { type: "result", payload }            exactly what the JSON route returns
//   { type: "error", error, status }
//
// Progress events carry facts only; the words are the page's templates
// (lib/plan/runSteps.js). Identity and bounds are exactly the JSON routes'.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { planForHousehold, planFollowUp, planWithout } from "@/lib/planner/plan";
import { readPlanRequest, readStructuredChange } from "@/lib/planner/requestBody";
import { MAX_FOLLOWUP_CHARS } from "@/lib/planner/followup";

// HiGHS is WebAssembly on Node (next.config serverExternalPackages); one run can
// take several bounded solves (ladder, priority, conflicts).
export const runtime = "nodejs";
export const maxDuration = 60;

/** Safari buffers the first 1,024 bytes of a stream before it renders anything. */
const PADDING = " ".repeat(1024);

const bad = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request) {
  const user = await getVerifiedUser(request);
  if (!user?.uid) return bad("Sign in to plan for a household.", 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Malformed request body");
  }

  let job;
  const action = body?.action;
  if (action === "plan") {
    const read = readPlanRequest(body);
    if (read.error) return bad(read.error);
    job = (onStep) => planForHousehold({ ...read.value, onStep });
  } else if (action === "followup") {
    const planId = body?.planId ? String(body.planId) : null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!planId || !text) return bad("planId and text are required");
    if (text.length > MAX_FOLLOWUP_CHARS) return bad(`Keep it to ${MAX_FOLLOWUP_CHARS} characters`);
    const reading = readStructuredChange(body?.reading);
    job = (onStep) => planFollowUp({ planId, text, reading, onStep });
  } else if (action === "without") {
    const planId = body?.planId ? String(body.planId) : null;
    const skuId = body?.skuId ? String(body.skuId) : null;
    if (!planId || !skuId) return bad("planId and skuId are required");
    job = () => planWithout({ planId, skuId });
  } else {
    return bad('action must be "plan", "followup" or "without"');
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (message) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
        } catch {
          open = false; // the shopper left; the plan still finishes and is stored
        }
      };
      send({ type: "hello", pad: PADDING });
      try {
        const payload = await job((event) => send({ type: event.stage === "draft" ? "draft" : "step", at: Date.now(), ...event }));
        send({ type: "result", payload });
      } catch (err) {
        const message = err?.message ?? "";
        const notFound = /No such household|No such plan|no members/i.test(message);
        if (!notFound) console.error("[plan/run]", action, message);
        send({ type: "error", status: notFound ? 404 : 500, error: notFound ? message : "The plan could not be built." });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
