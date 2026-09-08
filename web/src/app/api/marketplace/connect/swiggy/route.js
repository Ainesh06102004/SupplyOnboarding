// ============================================================================
// GET /api/marketplace/connect/swiggy
//
// Starts the OAuth 2.1 + PKCE flow that connects a shopper's own Swiggy account.
//
// A GET that redirects, because it is reached by a link the shopper clicks and
// ends in a full navigation to Swiggy's consent screen. It changes nothing on
// KOI's side — the only thing it writes is a short-lived cookie holding the
// PKCE verifier, which exists precisely so nothing is trusted on the way back.
//
// THE COOKIE IS THE SECURITY BOUNDARY OF THIS FLOW:
//   - httpOnly, so the verifier is unreadable by any script on the page
//   - SameSite=Lax, which still arrives on the top-level GET back from Swiggy
//     but not on a cross-site subrequest
//   - carries the KOI uid, so a code cannot be redeemed into a DIFFERENT
//     account than the one that started the flow
//   - short-lived, because an authorization request nobody completed in ten
//     minutes is abandoned, not pending
// ============================================================================

import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/verifyRequest";
import { createPkce, buildAuthorizeUrl, oauthReady, callbackUri } from "@/lib/marketplace/adapters/swiggy/oauth";

export const PKCE_COOKIE = "koi-swiggy-pkce";
const TEN_MINUTES = 600;

/** Same-origin path only — see the open-redirect note in /auth/callback. */
function safeNext(raw) {
  if (!raw || typeof raw !== "string") return "/store/shop";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/store/shop";
  return raw;
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));

  // Connecting is an act by a specific KOI shopper. Without a verified session
  // there is nobody to attach the credential to.
  const user = await getVerifiedUser(request);
  if (!user) {
    return NextResponse.redirect(`${origin}/store/shop?login=required`);
  }

  if (!oauthReady()) {
    // No client id: KOI has not been issued Swiggy credentials yet. Not an
    // error the shopper caused, and not something a retry fixes.
    return NextResponse.redirect(`${origin}${next}?swiggy=unavailable`);
  }

  const { verifier, challenge, state } = createPkce();
  // NOT derived from `origin` — Swiggy matches this string exactly, and a
  // per-build deployment hostname would never match what is registered.
  const redirectUri = callbackUri(origin);

  const response = NextResponse.redirect(
    buildAuthorizeUrl({ challenge, state, redirectUri })
  );

  response.cookies.set(PKCE_COOKIE, JSON.stringify({ verifier, state, uid: user.uid, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/marketplace/connect",
    maxAge: TEN_MINUTES,
  });

  return response;
}
