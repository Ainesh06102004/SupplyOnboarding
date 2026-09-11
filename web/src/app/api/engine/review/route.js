// ============================================================================
// /api/engine/review — the label engine, for KOI reviewers only
//
//   GET                  the queue: photos to read, readings to review
//   GET ?sku=<id>        one SKU's latest reading, checks, items and photo
//   POST { op: "read",    uploadId }                read a label photo (calls the model)
//   POST { op: "decide",  itemId, action, value? }  accept / correct / reject one item
//   POST { op: "publish", outputId }                publish what the decisions allow
//
// Every call requires a verified session whose app_metadata.koi_role is
// "reviewer". The reviewer recorded against a decision or a publish is that
// session's user — nothing in a body can name someone else. "read" spends
// model credit, which is one more reason it sits behind the same gate.
// ============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { isReviewer } from "@/lib/auth/reviewer";
import { runExtraction } from "@/lib/engine/pipeline";
import { listQueue, getSkuReview, decide, publish } from "@/lib/engine/review";
import { ACTIONS } from "@/lib/engine/decisions";

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("read"), uploadId: z.uuid() }),
  z.object({ op: z.literal("decide"), itemId: z.uuid(), action: z.enum(ACTIONS), value: z.unknown().optional() }),
  z.object({ op: z.literal("publish"), outputId: z.uuid() }),
]);

async function gate(request) {
  const user = await getVerifiedUser(request);
  if (!user?.uid) return { error: NextResponse.json({ error: "Sign in to review labels." }, { status: 401 }) };
  if (!isReviewer(user)) return { error: NextResponse.json({ error: "This account is not a KOI reviewer." }, { status: 403 }) };
  return { user };
}

// Messages written for the reviewer pass through; anything else is logged and
// replaced, because a database or provider error can name internals.
function failure(err) {
  if (err?.expose) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error("[engine]", err);
  return NextResponse.json({ error: "The engine hit an error. Details are in the server log." }, { status: 500 });
}

export async function GET(request) {
  const { error } = await gate(request);
  if (error) return error;
  const sku = new URL(request.url).searchParams.get("sku");
  try {
    if (sku) {
      if (!z.uuid().safeParse(sku).success) return NextResponse.json({ error: "sku must be a uuid" }, { status: 400 });
      return NextResponse.json(await getSkuReview(sku));
    }
    return NextResponse.json(await listQueue());
  } catch (err) {
    return failure(err);
  }
}

export async function POST(request) {
  const { user, error } = await gate(request);
  if (error) return error;

  let body;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    if (body.op === "read") return NextResponse.json(await runExtraction(body.uploadId));
    if (body.op === "decide") return NextResponse.json(await decide(body.itemId, body.action, body.value, user.uid));
    return NextResponse.json(await publish(body.outputId, user.uid));
  } catch (err) {
    return failure(err);
  }
}
