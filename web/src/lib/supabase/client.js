// ============================================================================
// KOI — Supabase client (singleton)
//
// Carries the caller's Firebase ID token so Row Level Security can see who is
// asking. Supabase is configured with Firebase as a third-party auth provider,
// which makes `auth.jwt() ->> 'sub'` the Firebase UID inside a policy — that is
// what public.koi_uid() reads.
//
// Note `auth.uid()` is NOT usable here: it casts the claim to uuid, and a
// Firebase UID is a 28-character string. Policies must use koi_uid().
//
// Passing `accessToken` disables supabase-js's own auth methods
// (supabase.auth.*). Nothing in this codebase uses them — Firebase is the only
// identity provider — but do not add them without removing this first.
//
// Without a signed-in user the token is null, the request is anonymous, and
// koi_uid() returns NULL, so every customer-tier policy denies. That is the
// correct direction to fail.
// ============================================================================

import { createClient } from '@supabase/supabase-js'

let client = null

/**
 * The caller's current Firebase ID token, or null when signed out.
 *
 * Never forces a refresh: the Firebase SDK already refreshes tokens shortly
 * before expiry, and forcing one on every query would add a network round trip
 * to each request. Returns null rather than throwing so an auth failure
 * degrades to an anonymous request instead of breaking the page.
 *
 * @returns {Promise<string|null>}
 */
async function firebaseAccessToken() {
  if (typeof window === 'undefined') return null
  try {
    // Imported lazily so server-side callers and the seed scripts never pull
    // the Firebase SDK into their bundle.
    const { getFirebaseAuth } = await import('@/lib/firebase/client')
    const user = getFirebaseAuth()?.currentUser
    return user ? await user.getIdToken(false) : null
  } catch {
    return null
  }
}

export function getSupabaseClient() {
    if (!client) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!url || !key) {
            throw new Error(
                'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see web/.env.example).'
            )
        }

        client = createClient(url, key, {
            accessToken: firebaseAccessToken,
        })
    }
    return client
}
