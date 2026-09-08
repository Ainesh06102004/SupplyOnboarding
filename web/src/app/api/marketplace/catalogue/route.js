// ============================================================================
// POST /api/marketplace/catalogue
//
// Availability for KOI's catalogue in one zone, so a grid can show whether
// things can actually be bought without spending a provider search per card.
//
// It runs the closed shelf set for the zone and reports only the results that
// map to a KOI SKU. The client sends a PINCODE and nothing else — no zone, no
// query, no product list, no provider ids. What is asked of the provider is
// decided entirely server-side, from `shelves.js`.
//
// WHY A PINCODE AND NOT A zoneId, even though the caller has one. A zoneId
// from the browser is an unbounded key space aimed at the cache, and every
// distinct value is a fresh miss costing one provider call PER SHELF — the
// same objection that keeps shopper free-text out of a provider's search box.
// Pincodes collapse many-to-one onto real zones through a 24h-cached lookup,
// so probing cannot manufacture new zones and cannot outrun the cache.
//
// SIGNING IN IS OPTIONAL, AND THAT IS THE POINT. Logged-out browse is a real
// state of this storefront, so this does not 401 — it falls back to the house
// credential, and with no house credential everything is `unknown`, which is
// the honest description of what KOI knows about a stranger's address.
//
// A signed-in shopper's uid comes from the verified session and NEVER from the
// body. A profileId in a payload is a request to be answered as someone else,
// and their availability is answered at their own delivery address.
// ============================================================================

import { NextResponse } from "next/server";
import { catalogueSupply, resolveZone, SIGNAL_SOURCE } from "@/lib/marketplace";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";

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

  // No zone and "not serviceable" are DIFFERENT answers and the grid says so.
  // A provider that declines the area has told us something; KOI failing to
  // place a pincode has not. Both leave every product unknown — neither is
  // evidence about stock — but only one of them is worth explaining.
  if (!zone?.zoneId) {
    return NextResponse.json({
      source: SIGNAL_SOURCE.NONE,
      degraded: false,
      serviceability,
      items: {},
    });
  }

  // Null for a signed-out shopper, which resolves to the house credential.
  const user = await getVerifiedUser(request);

  const result = await catalogueSupply({ zoneId: zone.zoneId, profileId: user?.uid ?? null });

  return NextResponse.json({
    source: result.source,
    degraded: result.degraded,
    serviceability,
    items: result.items,
  });
}
