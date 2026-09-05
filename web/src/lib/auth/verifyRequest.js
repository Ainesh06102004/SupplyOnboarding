// ============================================================================
// KOI — Who is calling this route?
//
// SERVER ONLY. Resolves the signed-in shopper from the request's Supabase
// session cookies, or null.
//
// This exists because proxy.js is a REDIRECT HINT, not a boundary: it decides
// where to send a browser, it runs only on the three /store paths it matches,
// and it does not run for API routes at all. Any route that acts on a specific
// shopper — spending their provider quota, replacing their cart — has to
// establish who they are for itself.
//
// WHAT CHANGED WITH THE MOVE OFF FIREBASE:
// This used to verify a Firebase ID token against Google's published JWKS by
// hand, checking signature, issuer, audience and expiry. supabase.auth.getUser()
// does the equivalent and more: it does not trust the cookie's contents at all,
// it asks the Auth server whether this token is currently valid. That closes a
// gap the old code could not — a token revoked mid-life still passed a local
// signature check until it expired.
//
// It costs a network round trip per call. That is the right trade for the two
// routes using it, which already make provider calls; do not reach for it in a
// hot read path. getSession() is the cheap alternative and is NOT a substitute:
// it decodes the cookie without validating it, so it answers "what does this
// cookie claim" rather than "who is this".
//
// Two independent checks guard shopper data, and neither trusts the other:
// this one (KOI's own routes) and public.koi_uid() inside Postgres (RLS).
// ============================================================================

import 'server-only'

import { createServerClient } from '@supabase/ssr'

/**
 * The verified shopper behind a request, or null.
 *
 * Reads the session cookies off the request — never a uid from the request
 * body, which would let any caller name whoever they liked.
 *
 * `uid` is the Supabase Auth user id and is what every customer-tier table
 * keys on (see migration 00013). The field keeps its name because it is KOI's
 * customer key, not because it is still a Firebase UID.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<{ uid: string, email: string|null }|null>}
 */
export async function getVerifiedUser(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Fail closed. An unconfigured project must never mean "accept anything".
  if (!url || !key) {
    console.error('Rejected request: Supabase is not configured')
    return null
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      // Verification only — this must not rotate the caller's session as a
      // side effect. proxy.js owns refresh.
      setAll() {},
    },
  })

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) return null
    return { uid: data.user.id, email: data.user.email ?? null }
  } catch (error) {
    // The reason stays in the log: telling a caller which check failed tells
    // an attacker which check to work on.
    console.error('Rejected request token:', error?.message)
    return null
  }
}
