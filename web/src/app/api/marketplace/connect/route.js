// ============================================================================
// GET    /api/marketplace/connect   — is this shopper connected?
// DELETE /api/marketplace/connect   — disconnect
//
// The token itself never crosses this boundary, in either direction. The
// browser learns whether a usable connection exists and when it expires, which
// is everything the UI needs to decide between "Connect" and "Connected", and
// nothing it could leak.
//
// `connected` reflects getCredential(), which returns null for a token that is
// missing, undecryptable OR expired. Swiggy issues no refresh token in v1.0, so
// expiry is a routine end-of-life rather than a fault: a shopper whose five
// days are up is simply not connected, and is asked to reconnect rather than
// meeting a 401 later dressed as an outage.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { getCredential, deleteCredential, credentialStoreReady } from "@/lib/marketplace/credentials";
import { oauthReady } from "@/lib/marketplace/adapters/swiggy/oauth";
import { getMarketplaceAdapter } from "@/lib/marketplace";


export async function GET(request) {
  const user = await getVerifiedUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Whichever supply source is configured owns the credential — the mock
  // stores one too, so that development exercises the same connected /
  // not-connected states production will have.
  const adapter = getMarketplaceAdapter();
  const marketplace = adapter.id;

  // Reasons connecting cannot work, and the UI must not offer a button for any
  // of them: nothing to connect to, no OAuth client, or no key to encrypt the
  // token with.
  const available =
    marketplace !== "null" &&
    credentialStoreReady() &&
    (marketplace === "mock" || oauthReady());

  const cred = await getCredential(user.uid, marketplace);
  return NextResponse.json({
    marketplace,
    available,
    connected: Boolean(cred),
    // Whether KOI knows which address to query for them. Connected without one
    // is a real state — every lookup answers `unknown` until it is resolved.
    hasAddress: Boolean(cred?.externalAccountRef),
    expiresAt: cred?.expiresAt ?? null,
  });
}

export async function DELETE(request) {
  const user = await getVerifiedUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const ok = await deleteCredential(user.uid, getMarketplaceAdapter().id);
  return NextResponse.json({ disconnected: ok }, { status: ok ? 200 : 500 });
}
