// ============================================================================
// KOI — Route gate (Next 16 `proxy`, formerly `middleware`)
//
// This is a REDIRECT HINT, not a security boundary. It sends a signed-out
// visitor to the shop with the login sheet open instead of an empty checkout.
//
// The real boundary is Postgres RLS via public.koi_uid(), which re-derives the
// caller from a signature-checked JWT on every query. Never move an
// authorisation decision here — anything this file "protects" is protected by
// RLS or not at all.
//
// WHAT THE MOVE TO SUPABASE AUTH FIXED HERE:
// The old version checked that a `koi-auth-token` cookie merely EXISTED, and
// said so apologetically: it could not verify, because the cookie held a
// Firebase ID token good for an hour inside a cookie that lived seven days, so
// presence proved nothing. getUser() actually resolves the session and
// refreshes it in passing, so the gate now agrees with what the page will find.
//
// That old note also blamed the Edge runtime for the weakness. Next 16 renamed
// this file from `middleware` to `proxy` and runs it on `nodejs` — the edge
// runtime is not supported here and the runtime is not configurable — so the
// constraint the excuse rested on is gone in any case.
//
// WHY THE MATCHER STAYS NARROW:
// getUser() is a round trip to the Auth server. Matching every route would put
// one in front of every page load to keep sessions warm — but the browser
// client already refreshes on its own timer, so that spend buys very little.
// Guests browsing the catalogue are the common case and must stay fast, so this
// runs only where a decision is actually made.
//
// GUEST BROWSING IS THE DEFAULT:
// /store, /store/shop, /store/product/* and /store/cart are deliberately absent
// below. A shopper fills a cart signed out and is asked to sign in only at
// checkout — see StoreNavigation for the same rule in the UI.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED = ['/store/profile', '/store/checkout', '/store/orders'];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((route) => pathname.startsWith(route));

  // The matcher should already guarantee this, but a matcher edit should not be
  // able to turn this file into an auth round trip on every request.
  if (!isProtected) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Fail closed: an unconfigured project must not mean "everyone is signed in".
  if (!url || !key) return redirectToLogin(request, pathname);

  // Refreshed cookies have to reach BOTH the downstream render (via
  // request.cookies) and the browser (via response.cookies), so the response is
  // rebuilt around the mutated request. Dropping either half logs the user out
  // on the next navigation.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) return redirectToLogin(request, pathname);

  return response;
}

/**
 * Send them to the shop with the login sheet open, remembering where they were
 * headed so signing in finishes the journey instead of stranding them on the
 * shelf.
 */
function redirectToLogin(request, pathname) {
  const loginUrl = new URL('/store/shop', request.url);
  loginUrl.searchParams.set('login', 'required');
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/store/profile/:path*', '/store/checkout/:path*', '/store/orders/:path*'],
};
