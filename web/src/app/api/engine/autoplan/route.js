// ============================================================================
// GET /api/engine/autoplan — the hourly auto-plan and reminders (P7)
//
// Called by Vercel Cron every hour (web/vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; closed unless that secret is set.
// The run itself is lib/plan/autoplanRun.js: drafts for the households whose
// owners asked for them (kept as drafts until approved; nothing is ordered),
// then the calendar's reminders. The service client is used because nobody is
// signed in; that code scopes every read and write to the household it is for.
// ============================================================================

import { NextResponse } from "next/server";
import { cronRefusal } from "@/lib/auth/cronSecret";
import { getServiceClient } from "@/lib/supabase/admin";
import { planForHousehold } from "@/lib/planner/plan";
import { dispatch } from "@/lib/notify/dispatch";
import { runAutoplan, runReminders } from "@/lib/plan/autoplanRun";

export const maxDuration = 60;

export async function GET(request) {
  const refused = cronRefusal(request);
  if (refused) return NextResponse.json(refused.body, { status: refused.status });
  const db = getServiceClient();
  if (!db) return NextResponse.json({ error: "The service key is not set, so auto-plan can't run." }, { status: 503 });
  const now = new Date();
  try {
    const drafted = await runAutoplan({ db, now, planFor: planForHousehold, notify: dispatch });
    const reminded = await runReminders({ db, now, notify: dispatch });
    return NextResponse.json({ at: now.toISOString(), drafted, reminded });
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Auto-plan failed." }, { status: 500 });
  }
}
