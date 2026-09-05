// ============================================================================
// KOI — OAuth landing
//
// Google sends the shopper back here with a one-time `code`. Exchanging it sets
// the session cookies; until that happens the shopper is not signed in, no
// matter what Google said.
//
// WHY THE EXCHANGE IS SERVER-SIDE:
// The PKCE verifier lives in an httpOnly cookie that client JS cannot read, so
// only a server route can complete the flow. This is also what lets the session
// cookies be set before the destination page renders — a client-side exchange
// would flash a signed-out shop first.
//
// OPEN-REDIRECT NOTE:
// `next` is attacker-controllable — it survives the whole trip through Google
// and comes back in the URL. Only same-origin PATHS are honoured, so a crafted
// link cannot use KOI's domain to bounce someone somewhere else wearing a fresh
// session. Anything else falls back to the shop.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const DEFAULT_NEXT = '/store/shop';

/**
 * A safe same-origin destination, or the shop.
 *
 * Rejects absolute URLs, protocol-relative `//evil.com` (which `new URL` would
 * happily resolve against our origin), and anything not starting with `/`.
 */
function safeNext(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_NEXT;
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_NEXT;
  return raw;
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  // Google reports a refusal (closed window, denied consent) as an error param,
  // not an absent code. Send them back to the shop rather than showing a raw
  // error page — declining to sign in is a normal thing to do.
  const oauthError = searchParams.get('error');
  if (oauthError) {
    console.error('OAuth provider returned an error:', oauthError);
    return NextResponse.redirect(`${origin}${DEFAULT_NEXT}?login=failed`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${DEFAULT_NEXT}?login=failed`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('OAuth callback reached with Supabase unconfigured');
    return NextResponse.redirect(`${origin}${DEFAULT_NEXT}?login=failed`);
  }

  // Built around the redirect response so the session cookies ride along with
  // it. Setting them on a throwaway response would exchange the code
  // successfully and still land the shopper signed out.
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // A code that will not exchange is spent, expired, or was not ours.
    console.error('Failed to exchange OAuth code:', error.message);
    return NextResponse.redirect(`${origin}${DEFAULT_NEXT}?login=failed`);
  }

  return response;
}
