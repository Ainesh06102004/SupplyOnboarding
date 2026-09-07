// ============================================================================
// GET /api/marketplace/connect/swiggy/callback
//
// Where Swiggy sends the shopper back with an authorization code.
//
// EVERYTHING IN THE URL IS ATTACKER-CONTROLLABLE. The code, the state and any
// error all survive a round trip through a third party and a browser, so none
// of them is trusted on its own. The PKCE cookie is the only thing this route
// believes, and three checks run before a token is ever requested:
//
//   1. the cookie exists and parses — otherwise this is a callback for a flow
//      KOI never started
//   2. the returned `state` equals the cookie's — CSRF, so someone else's
//      authorization code cannot be planted into this shopper's session
//   3. the current KOI session is the SAME uid that began the flow — otherwise
//      signing out and into another account mid-consent would attach a Swiggy
//      account to the wrong shopper
//
// The cookie is cleared on every exit path, success or failure. A spent
// verifier is a liability, and a failed attempt must not leave one behind for
// the next request to reuse.
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { exchangeCode, fetchDefaultAddressId } from "@/lib/marketplace/adapters/swiggy/oauth";
import { saveCredential } from "@/lib/marketplace/credentials";
import { PKCE_COOKIE } from "../route";

const MARKETPLACE = "swiggy";

function finish(origin, next, status) {
  const url = new URL(`${origin}${next}`);
  url.searchParams.set("swiggy", status);
  const response = NextResponse.redirect(url.toString());
  // Always. See the header note.
  response.cookies.set(PKCE_COOKIE, "", { path: "/api/marketplace/connect", maxAge: 0 });
  return response;
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);

  let stash = null;
  try {
    stash = JSON.parse(request.cookies.get(PKCE_COOKIE)?.value ?? "null");
  } catch {
    stash = null;
  }
  const next = typeof stash?.next === "string" && stash.next.startsWith("/") ? stash.next : "/store/shop";

  if (!stash?.verifier || !stash?.state) return finish(origin, next, "failed");

  // Declining consent is a normal thing to do, and it comes back as an error
  // param rather than an absent code.
  if (searchParams.get("error")) return finish(origin, next, "declined");

  const code = searchParams.get("code");
  if (!code) return finish(origin, next, "failed");

  // Constant-time is unnecessary here — `state` is a nonce KOI minted this
  // request, not a long-lived secret — but the comparison must still happen.
  if (searchParams.get("state") !== stash.state) return finish(origin, next, "failed");

  const user = await getVerifiedUser(request);
  if (!user || user.uid !== stash.uid) return finish(origin, next, "failed");

  try {
    const token = await exchangeCode({
      code,
      verifier: stash.verifier,
      redirectUri: `${origin}/api/marketplace/connect/swiggy/callback`,
    });

    // The shopper's own default address. Best-effort: a token with no address
    // is a real connection whose lookups resolve to `unknown`, which is honest
    // and recoverable. Failing the whole connection over it would not be.
    const addressId = await fetchDefaultAddressId(token.accessToken);

    const stored = await saveCredential({
      profileId: user.uid,
      marketplace: MARKETPLACE,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
      externalAccountRef: addressId,
    });

    // A token KOI holds but cannot store is not a connection. Saying so beats
    // a storefront that reports itself connected and answers `unknown` forever.
    if (!stored) return finish(origin, next, "failed");

    return finish(origin, next, addressId ? "connected" : "connected_no_address");
  } catch (err) {
    // Never the body, never the code, never the verifier.
    console.error("Swiggy connect failed:", err?.message);
    return finish(origin, next, "failed");
  }
}
