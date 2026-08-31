// ============================================================================
// POST /api/marketplace/zone
// Collapse a pincode to a delivery zone.
//
// The response deliberately carries no `addressRef` and no credential detail —
// those are provider-scoped handles that must never reach a browser. The client
// gets an opaque zoneId it can pass back, and a serviceability state it can
// render.
// ============================================================================

import { NextResponse } from "next/server";
import { resolveZone } from "@/lib/marketplace";

export async function POST(request) {
  let pincode;
  try {
    ({ pincode } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!pincode || !/^\d{6}$/.test(String(pincode))) {
    return NextResponse.json({ error: "A six-digit pincode is required" }, { status: 400 });
  }

  const { zone, serviceability } = await resolveZone(String(pincode));

  return NextResponse.json({
    serviceability,
    zone: zone
      ? { zoneId: zone.zoneId, label: zone.label, pincode: zone.pincode }
      : null,
  });
}
