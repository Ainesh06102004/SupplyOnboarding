// ============================================================================
// KOI — Route gate
//
// This is a REDIRECT HINT, not a security boundary. It only checks that a
// session cookie exists, so a signed-out visitor lands on the shop with the
// login modal instead of an empty checkout.
//
// It deliberately does not verify the token: middleware runs on the Edge
// runtime, and the cookie holds a Firebase ID token that expires in an hour
// while the cookie lives seven days, so presence proves little either way.
//
// The real boundary is Postgres RLS via public.koi_uid(), which re-verifies
// issuer, audience and signature on every query. Never move an authorisation
// decision here — anything this file "protects" is protected by RLS or not at
// all. /api/auth/session verifies the token before the cookie is ever set.
//
// Upgrade path: mint a real Firebase session cookie (firebase-admin
// createSessionCookie) so lifetime and revocation line up with the gate.
// ============================================================================

import { NextResponse } from 'next/server';

export function middleware(request) {
  const token = request.cookies.get('koi-auth-token')?.value;
  const { pathname } = request.nextUrl;

  const protectedRoutes = ['/store/profile', '/store/checkout', '/store/orders'];

  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/store/shop', request.url);
    // Add a parameter to tell the shop page to open the login modal
    loginUrl.searchParams.set('login', 'required');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/store/profile/:path*', '/store/checkout/:path*', '/store/orders/:path*'],
};
