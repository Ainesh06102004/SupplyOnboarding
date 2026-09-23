// ============================================================================
// POST /api/plan/agent
//
// The Plan page's command box. One message, read for what the shopper means
// (lib/agent/router.js), done as a few steps by KOI's own tools
// (lib/agent/run.js), streamed as NDJSON while it works:
//
//   { type: "hello" }                                  Safari padding
//   { type: "agent", steps: [{ tool, text, label }], source }   what KOI will do
//   { type: "step", stage: "tool", index, status, … }  each step starting / done
//   { type: "step", stage: …planner stages }           the planner's own progress
//   { type: "draft", … }                               a basket as it is solved
//   { type: "plan_result", index, kind, payload }      a plan made or changed
//   { type: "without_result", index, skuId, payload }  "if you can't get X"
//   { type: "action", index, action, args }            for the page: cart, show, explain
//   { type: "done", planId }  |  { type: "error", error, status }
//
// Identity and bounds are the JSON routes': the session decides who, RLS
// decides whose household, requestBody.js bounds the rest.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { readPlanRequest } from "@/lib/planner/requestBody";
import { runAgent } from "@/lib/agent/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE = 600;
const PADDING = " ".repeat(1024);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return bad("text is required");
  if (text.length > MAX_MESSAGE) return bad(`Keep it to ${MAX_MESSAGE} characters`);
  const read = readPlanRequest(body);
  if (read.error) return bad(read.error);
  const planId = typeof body?.planId === "string" && UUID.test(body.planId) ? body.planId : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const emit = (message) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify({ at: Date.now(), ...message, type: message.type ?? (message.stage === "draft" ? "draft" : "step") })}\n`));
        } catch {
          open = false;
        }
      };
      emit({ type: "hello", pad: PADDING });
      try {
        await runAgent({ householdId: read.value.householdId, planId, text, defaults: read.value, emit });
      } catch (err) {
        const message = err?.message ?? "";
        const notFound = /No such household|No such plan|no members/i.test(message);
        if (!notFound) console.error("[plan/agent]", message);
        emit({ type: "error", status: notFound ? 404 : 500, error: notFound ? message : "KOI could not finish that." });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
