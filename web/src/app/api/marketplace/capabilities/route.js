// ============================================================================
// KOI — GET /api/marketplace/capabilities
//
// What the configured supply source can and cannot do. The storefront branches
// on THIS, never on an adapter's name: no `if (marketplace === 'swiggy')` in a
// component, and a second supply partner drops in without touching the UI.
//
// Safe to expose. Capabilities describe a shape of integration, not a
// credential and not a catalogue — `merchantOfRecord: false` is a fact about
// KOI's business model that the storefront states out loud anyway.
// ============================================================================

import { NextResponse } from "next/server";
import { getMarketplaceAdapter } from "@/lib/marketplace";

export async function GET() {
  try {
    const adapter = getMarketplaceAdapter();
    return NextResponse.json(
      {
        // The adapter's id is included for debugging only. Nothing in the UI
        // may branch on it — that is what `capabilities` is for.
        adapter: adapter.id,
        capabilities: adapter.capabilities,
      },
      // A minute of caching: the answer changes only on redeploy, and the
      // checkout page asks on every mount.
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch {
    // Fail to the honest floor: a source that can do nothing. Checkout then
    // says hand-off is unavailable, which is the safe wrong answer — it never
    // invites a shopper into a flow that cannot complete.
    return NextResponse.json({
      adapter: "null",
      capabilities: {
        browse: "search_only",
        maxResultsPerQuery: null,
        supportsPagination: false,
        cartModel: "none",
        merchantOfRecord: false,
        paymentHandoff: "none",
        supportsSubstitutes: false,
        rateBudget: { requestsPerMinute: 0, scope: "per_credential" },
      },
    });
  }
}
