// ============================================================================
// GET /api/calendar/feed/<token> — a household's Calendar as an iCalendar feed
//
// For Google or Apple Calendar, which subscribe to an address and can't sign
// in. The address's secret (household.calendar_token, 00092) is the only key:
// the anonymous client calls calendar_feed(), which returns that household's
// events and nothing else. No service role, no session. Turning the address
// off (or making a new one) on the Calendar page retires it.
// ============================================================================

import { getSupabaseClient } from "@/lib/supabase/client";
import { toICS } from "@/lib/calendar/events";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, ctx) {
  const { token } = await ctx.params;
  // Calendar apps ask for "<token>.ics" as often as "<token>".
  const secret = String(token ?? "").replace(/\.ics$/i, "");
  if (!UUID.test(secret)) return new Response("Not found", { status: 404 });

  const { data, error } = await getSupabaseClient().rpc("calendar_feed", { p_token: secret });
  if (error) return new Response("The calendar can't be read right now.", { status: 503, headers: { "Retry-After": "900" } });
  if (!data?.length) return new Response("Not found", { status: 404 });

  return new Response(toICS(data, { name: "KOI · your household" }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"koi.ics\"",
      // Calendar apps poll; fifteen minutes keeps them current without hammering.
      "Cache-Control": "private, max-age=900",
    },
  });
}
