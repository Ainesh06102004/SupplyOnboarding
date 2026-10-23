// ============================================================================
// /api/demo/db — demo mode's database, for the browser (lib/supabase/demo).
//
//   POST    one query (or database function) → { data, error, count }
//   DELETE  start the demo again from its seed
//
// Not found unless demo mode is on (NEXT_PUBLIC_KOI_DEMO=1 in a development
// build). The first time the demo is opened, the real planner makes the
// household's first plan over the test catalogue, so the week, Track and the
// Calendar have something to show.
// ============================================================================

import { NextResponse } from "next/server";
import { isDemo } from "@/lib/supabase/demo/mode";
import { runDemo, resetDemo, claimFirstPlan } from "@/lib/supabase/demo/store";
import { createDemoClient } from "@/lib/supabase/demo/client";
import { DEMO_HOUSEHOLD } from "@/lib/supabase/demo/seed";

export const maxDuration = 60;

async function firstPlan() {
  if (!claimFirstPlan()) return globalThis.__koiDemoPlanning;
  globalThis.__koiDemoPlanning = (async () => {
    try {
      const { planForHousehold } = await import("@/lib/planner/plan");
      await planForHousehold({ householdId: DEMO_HOUSEHOLD, days: 7, db: createDemoClient({ send: runDemo }) });
    } catch (err) {
      console.warn("[demo] the first plan couldn't be made; make one on the Plan page:", err?.message);
    }
  })();
  return globalThis.__koiDemoPlanning;
}

export async function POST(request) {
  if (!isDemo()) return new Response("Not found", { status: 404 });
  const q = await request.json().catch(() => null);
  if (!q || (!q.table && !q.rpc)) return NextResponse.json({ data: null, error: { message: "Not a query." } }, { status: 400 });
  await firstPlan();
  return NextResponse.json(await runDemo(q));
}

export async function DELETE() {
  if (!isDemo()) return new Response("Not found", { status: 404 });
  resetDemo();
  globalThis.__koiDemoPlanning = null;
  await firstPlan();
  return NextResponse.json({ ok: true });
}
