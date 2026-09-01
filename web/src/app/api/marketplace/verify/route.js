// ============================================================================
// POST /api/marketplace/verify
//
// Ask the provider about specific KOI SKUs — the demand-driven half of the
// supply design. A shelf render costs one call and serves everyone looking at
// it; a verify costs one call per SKU and serves one shopper, so it fires on
// ENGAGEMENT (a shopper opened a product) and never on render.
//
// There is no lookup-by-id at the provider, so verifying one product costs a
// search. That is the entire reason this route is bounded, cached and
// coalesced rather than called freely.
//
// Same leak-safe projection as the shelf route: availability, price and the
// provider's opaque id cross this boundary. Names, brands and pack sizes stay
// server-side as matching input.
//
// Substitutes are NOT returned from here. See the note on MAX_SKUS below.
// ============================================================================

import { NextResponse } from "next/server";
import { verifyItems, getMarketplaceAdapter } from "@/lib/marketplace";
import { resolveSkuMappings } from "@/lib/marketplace/skuMapRepo";

// A hard ceiling on how much provider quota one browser request can spend.
// Without it, a client could post 500 ids and turn a per-item endpoint into
// the unbounded key space the shelf route was carefully designed to avoid.
//
// Five covers the real cases: one product being viewed, plus up to four KOI
// alternatives when it turns out to be unavailable.
const MAX_SKUS = 5;

export async function POST(request) {
  let zoneId, koiSkuIds;
  try {
    ({ zoneId, koiSkuIds } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!zoneId || !Array.isArray(koiSkuIds) || koiSkuIds.length === 0) {
    return NextResponse.json(
      { error: "zoneId and a non-empty koiSkuIds array are required" },
      { status: 400 }
    );
  }

  if (koiSkuIds.length > MAX_SKUS) {
    return NextResponse.json(
      { error: `At most ${MAX_SKUS} SKUs per request` },
      { status: 400 }
    );
  }

  // De-duplicate before spending anything: the same id twice is one call's
  // worth of information.
  const ids = [...new Set(koiSkuIds.map(String).filter(Boolean))];

  // How to ask about each SKU comes from marketplace_sku_map, resolved
  // server-side against a table the browser cannot read. The client supplies
  // only KOI's own ids — never an externalId and never a search string, so
  // free-text from a browser can never reach a provider's search box.
  //
  // A SKU with no trusted mapping arrives at the adapter with externalId null,
  // and the adapter answers `unknown`. That is correct: unmapped means KOI has
  // never established which provider product is the one it screened, and
  // guessing would risk reporting stock for different food under a similar
  // name.
  const adapter = getMarketplaceAdapter();
  const mappings = await resolveSkuMappings(adapter.id, ids, { zoneId });

  const results = await verifyItems({
    zoneId,
    items: ids.map((koiSkuId) => ({
      koiSkuId,
      externalId: mappings[koiSkuId]?.externalId ?? null,
      matchQuery: mappings[koiSkuId]?.matchQuery ?? null,
    })),
    withSubstitutes: false,
  });

  const items = {};
  for (const [koiSkuId, r] of Object.entries(results)) {
    items[koiSkuId] = {
      availability: r.availability,
      // Price only when the thing is actually buyable — the adapter already
      // nulls it otherwise, and this keeps that guarantee at the boundary.
      price: r.item?.price ?? null,
      mrp: r.item?.mrp ?? null,
      deliveryEta: r.item?.deliveryEta ?? null,
      observedAt: r.item?.observedAt ?? r.checkedAt,
      source: r.source,
      // Lets the UI distinguish "nobody has been asked" from "asked, no
      // answer" without exposing anything about the mapping itself.
      mapped: mappings[koiSkuId]?.trusted ?? false,
    };
  }

  return NextResponse.json({ zoneId, items });
}
