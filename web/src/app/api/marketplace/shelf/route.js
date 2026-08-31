// ============================================================================
// POST /api/marketplace/shelf
// Render one shelf: a single provider call, coalesced across every shopper
// looking at the same shelf in the same zone.
//
// The shelf's query string is looked up server-side from the shelf id. The
// client never supplies a query, because an arbitrary query from a browser is
// an unbounded key space pointed at a scarce shared quota — the fastest way to
// exhaust the storefront's entire browse budget.
//
// Only availability, price and the provider's opaque id cross this boundary.
// Names and pack sizes stay server-side as matching input.
// ============================================================================

import { NextResponse } from "next/server";
import { runShelfQuery } from "@/lib/marketplace";
import { getShelfById } from "@/lib/marketplace/shelves";

export async function POST(request) {
  let zoneId, shelfId;
  try {
    ({ zoneId, shelfId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!zoneId || !shelfId) {
    return NextResponse.json({ error: "zoneId and shelfId are required" }, { status: 400 });
  }

  const shelf = getShelfById(shelfId);
  if (!shelf) {
    // Unknown shelf ids are rejected rather than passed through: the set of
    // queries KOI will ever send has to stay bounded and auditable.
    return NextResponse.json({ error: "Unknown shelf" }, { status: 404 });
  }

  const result = await runShelfQuery({
    zoneId,
    shelfId: shelf.id,
    query: shelf.query,
    limit: shelf.limit,
  });

  return NextResponse.json({
    shelfId: shelf.id,
    title: shelf.title,
    source: result.source,
    degraded: result.degraded,
    fetchedAt: result.fetchedAt,
    items: result.items.map((i) => ({
      externalId: i.externalId,
      availability: i.availability,
      price: i.price,
      mrp: i.mrp,
      deliveryEta: i.deliveryEta,
      observedAt: i.observedAt,
    })),
  });
}
