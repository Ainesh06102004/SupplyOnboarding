// ============================================================================
// KOI — Supabase client for server code, acting as the signed-in shopper
//
// SERVER ONLY. Reads the session from the request's cookies, so RLS sees the
// same caller the browser is. This is the counterpart to lib/supabase/client.js,
// which is deliberately anonymous on the server: any route that acts on a
// specific shopper — reading their addresses, spending their provider quota,
// opening a fulfilment intent — must build its client here instead.
//
// WHY TWO FILES AND NOT ONE SMART ONE:
// The distinction between "query the public catalogue" and "query as this
// shopper" is a security boundary, and a single auto-detecting helper would
// make it invisible at the call site. Picking the wrong one here fails loudly
// (no rows, because koi_uid() is NULL) rather than quietly over-serving.
// ============================================================================

import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see web/.env.example).'
    )
  }
  return { url, key }
}

/**
 * A Supabase client carrying the current request's session.
 *
 * Safe to call from Server Components as well as route handlers: writing
 * cookies from a Server Component throws in Next, so the setter swallows that
 * one case. Losing a refreshed token there is harmless — proxy.js refreshes
 * the session on every matched navigation, which is where it belongs.
 *
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getServerSupabase() {
  const { url, key } = credentials()
  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component render — see the note above.
        }
      },
    },
  })
}
