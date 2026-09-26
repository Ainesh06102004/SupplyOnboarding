// ============================================================================
// POST /api/agent — KOI Agent Mode (docs/agent-mode/PLAN.md)
//
// One segment of a run, streamed as NDJSON. Body:
//   request  { kind: "message", text } | { kind: "answer", answers }
//            | { kind: "decision", allow } | { kind: "continue" }
//   memory   the sealed memory from the last segment, or null
//   page     { route, step, productId, planId, cartCount } — kinds and ids only
//
// Events: hello · run_started · tasks · say · tool_started · tool_progress ·
// tool_result · notice · ui · ask · approval · run_paused · run_finished ·
// memory (sealed, for the next request) · error.
//
// Off unless KOI_AGENT_MODE=1. The session decides who; RLS decides whose
// household. The shopper's words live in the sealed memory in their tab;
// plan_run records tools and outcomes only (00082).
// ============================================================================

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { getServerSupabase } from "@/lib/supabase/server";
import { runSegment, newMemory } from "@/lib/agent/loop";
import { rulesModel } from "@/lib/agent/rulesModel";
import { TOOLS } from "@/lib/agent/tools";
import { loadContext, openaiModel, readPage } from "@/lib/agent/server";
import { sealMemory, openMemory } from "@/lib/agent/sign";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE = 600;
const MAX_BODY = 400_000;
const PADDING = " ".repeat(1024);
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

// Per-shopper pacing, per server instance: a person, not a script.
const recent = new Map();
function tooFast(uid) {
  const now = Date.now();
  const list = (recent.get(uid) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(uid, list);
  return list.length > 20;
}

function readRequest(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  if (r.kind === "message") {
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text) return { error: "text is required" };
    if (text.length > MAX_MESSAGE) return { error: `Keep it to ${MAX_MESSAGE} characters` };
    return { value: { kind: "message", text } };
  }
  if (r.kind === "answer") return r.answers && typeof r.answers === "object" ? { value: { kind: "answer", answers: r.answers } } : { error: "answers are required" };
  if (r.kind === "decision") return typeof r.allow === "boolean" ? { value: { kind: "decision", allow: r.allow } } : { error: "allow is required" };
  if (r.kind === "continue") return { value: { kind: "continue" } };
  return { error: "Unknown request kind" };
}

export async function POST(request) {
  if (process.env.KOI_AGENT_MODE !== "1") return bad("Not found", 404);
  const user = await getVerifiedUser(request);
  if (!user?.uid) return bad("Sign in to use KOI.", 401);
  if (tooFast(user.uid)) return bad("One moment — KOI is still catching up.", 429);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return bad("That conversation is too long; start a new chat.", 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Malformed request body");
  }
  const read = readRequest(body?.request);
  if (read.error) return bad(read.error);
  const page = readPage(body?.page);

  // Altered, someone else's or stale: start over from what the database says.
  const opened = body?.memory ? openMemory(body.memory, user.uid) : null;
  if (!opened && read.value.kind !== "message") return bad("That conversation has expired. Say it again and KOI will pick up from your saved household.", 409);
  const memory = opened ?? newMemory();

  const stop = new AbortController();
  request.signal?.addEventListener?.("abort", () => stop.abort());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      let seq = 0;
      const emit = (message) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify({ seq: seq++, at: Date.now(), ...message })}\n`));
        } catch {
          open = false;
        }
      };
      emit({ type: "hello", pad: PADDING });
      let ctx = null;
      try {
        const db = await getServerSupabase();
        ctx = await loadContext({ db, uid: user.uid, page, emit, signal: stop.signal });
        ctx.checkpoint = (m) => emit({ type: "memory", sealed: sealMemory(m, user.uid), checkpoint: true });
        const result = await runSegment({
          memory,
          request: read.value,
          ctx,
          tools: TOOLS,
          model: openaiModel(),
          rules: rulesModel,
          newRunKey: randomUUID,
        });
        emit({ type: "memory", sealed: sealMemory(result.memory, user.uid) });
        if (ctx.household?.id && (result.steps.length || result.asks || result.approvals.length)) {
          const { error: logError } = await db.from("plan_run").insert({
            household_id: ctx.household.id,
            source: result.source === "agent_rules" ? "agent_rules" : "agent",
            steps: result.steps.slice(0, 24),
            plan_id: result.memory.planId ?? null,
            run_key: /^[0-9a-f-]{36}$/i.test(result.memory.runKey ?? "") ? result.memory.runKey : null,
            segment: Math.min(Math.max(result.memory.segment || 1, 1), 50),
            turns: Math.min(result.turns, 50),
            asks: Math.min(result.asks, 50),
            approvals: result.approvals,
            outcome: result.outcome ?? "done",
            model: result.model ? String(result.model).slice(0, 64) : null,
            route: page.route,
          });
          if (logError) console.error("[agent] log", logError.message);
        }
      } catch (err) {
        console.error("[agent]", err?.message ?? "failed");
        emit({ type: "error", error: "KOI couldn't finish that. What it finished is kept." });
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      // The shopper pressed Stop (or left): no more tools, and no plan stored after this point.
      stop.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
