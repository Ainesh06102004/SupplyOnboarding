// ============================================================================
// POST /api/assistant/interpret
//
// The provider path for query interpretation, and nothing else. The answer a
// shopper actually sees is produced client-side by the deterministic
// interpreter before this route is ever called, so this endpoint only ever
// REFINES — and when it is unreachable, slow, or misconfigured, search is
// unaffected. That is the reason it can be this small.
//
// Two boundaries worth stating:
//
//   - It receives text and returns keys. The catalogue is not visible from
//     here, so a provider cannot be asked what KOI stocks, and no shape it
//     returns can carry a nutrition figure, a KOI score or an availability
//     claim — `IntentSchema` has no field for one.
//
//   - A configured provider requires a signed-in shopper. An anonymous caller
//     gets the honest "nothing to refine" answer instead. Interpretation costs
//     money the moment a real model is wired, and an unmetered public endpoint
//     billed per call is the kind of thing that gets discovered by a crawler
//     rather than by a shopper. The deterministic path needs no route at all,
//     so gating this one costs a logged-out visitor nothing.
//
// Identity is never taken from the body — see getVerifiedUser.
// ============================================================================

import { NextResponse } from "next/server";
import { getIntentAdapter } from "@/lib/ai/intent/adapter";
import { parseIntent } from "@/lib/ai/intent/schema";
import { sanitiseIntent } from "@/lib/ai/intent/merge";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";

// A shopper's query, not a document. Anything longer is a paste or an attempt
// to run up a bill one request at a time.
const MAX_QUERY_CHARS = 200;

export async function POST(request) {
  let text;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `Query must be ${MAX_QUERY_CHARS} characters or fewer` },
      { status: 400 },
    );
  }

  const adapter = getIntentAdapter();

  // Production today. The client's own interpretation stands, and saying so
  // plainly is more useful than a 404 or an empty object.
  if (adapter.name === "none") {
    return NextResponse.json({ intent: null, source: "none", refined: false });
  }

  const user = await getVerifiedUser(request);
  if (!user?.uid) {
    return NextResponse.json({ intent: null, source: "none", refined: false });
  }

  let raw = null;
  try {
    raw = await adapter.interpret(text);
  } catch {
    // A provider failing is not a request failing. The shopper already has an
    // answer; this one simply does not improve on it.
    return NextResponse.json({ intent: null, source: adapter.name, refined: false });
  }

  const parsed = parseIntent(raw);
  if (!parsed.ok) {
    return NextResponse.json({
      intent: null,
      source: adapter.name,
      refined: false,
      issues: parsed.issues,
    });
  }

  return NextResponse.json({
    intent: sanitiseIntent(parsed.intent, text),
    source: adapter.name,
    refined: true,
  });
}
