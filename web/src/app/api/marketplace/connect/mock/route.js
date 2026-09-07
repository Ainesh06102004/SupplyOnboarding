// ============================================================================
// POST /api/marketplace/connect/mock
//
// DEVELOPMENT ONLY. Stands in for the OAuth round trip so the connected and
// not-connected halves of the storefront can both be exercised before Swiggy
// issues anything.
//
// It writes a synthetic credential through the SAME encrypted store the real
// flow uses, so what is being tested is the actual code path — the adapter
// reading a credential, the audience-scoped cache, the hand-off running on a
// shopper's account — and not a stub of it.
//
// REFUSES TO RUN IN PRODUCTION, and refuses when the mock adapter is not the
// configured one. A route that can mint a credential is exactly the sort of
// thing that must not be reachable by accident: the guard is the point, not
// paperwork around it.
//
// There is deliberately no GET. Connecting is a state change and arrives as a
// POST, so it cannot happen because something prefetched a link.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { saveCredential, credentialStoreReady } from "@/lib/marketplace/credentials";
import { getMarketplaceAdapter } from "@/lib/marketplace";

export async function POST(request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const adapter = getMarketplaceAdapter();
  if (adapter.id !== "mock") {
    return NextResponse.json(
      { error: "The mock adapter is not configured", code: "NOT_MOCK" },
      { status: 409 }
    );
  }

  const user = await getVerifiedUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!credentialStoreReady()) {
    // No KOI_CREDENTIAL_KEY. Saying so beats writing nothing and reporting
    // success, which would leave the storefront answering `unknown` forever
    // with a green tick over it.
    return NextResponse.json(
      { error: "KOI_CREDENTIAL_KEY is not set, so no credential can be stored", code: "NO_KEY" },
      { status: 503 }
    );
  }

  const ok = await saveCredential({
    profileId: user.uid,
    marketplace: "mock",
    // Obviously fake, and obviously fake ON PURPOSE. If this string ever turns
    // up in a log or a request to a real provider, it names itself.
    accessToken: `mock-token-${user.uid}`,
    refreshToken: null,
    scopes: ["read:catalogue", "write:cart"],
    // Short, so the expiry path — which under Swiggy v1.0 has no refresh and
    // must end in "please reconnect" — gets exercised in development too.
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    externalAccountRef: `mock-addr-${user.uid.slice(0, 8)}`,
  });

  return NextResponse.json({ connected: ok }, { status: ok ? 200 : 500 });
}
