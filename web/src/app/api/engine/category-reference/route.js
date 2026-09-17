// ============================================================================
// GET /api/engine/category-reference — rebuild the category reference
//
// Plan §11.2. Weekly, after the Open Food Facts sync has had a week of deltas:
// a new, dated reference_version in engine.category_reference. Internal only.
// Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`, like the
// other scheduled engine routes.
// ============================================================================

import { NextResponse } from "next/server";
import { cronRefusal } from "@/lib/auth/cronSecret";
import { buildCategoryReference } from "@/lib/screening/categoryReference";

export const maxDuration = 60;

export async function GET(request) {
  const refused = cronRefusal(request);
  if (refused) return NextResponse.json(refused.body, { status: refused.status });

  try {
    const built = await buildCategoryReference();
    return NextResponse.json({ ...built, skipped: built.skipped.length });
  } catch (err) {
    console.error("[engine/category-reference]", err);
    return NextResponse.json({ error: "The category reference could not be built. Details are in the server log." }, { status: 500 });
  }
}
