// ============================================================================
// KOI — Supabase client (browser + anonymous server)
//
// Identity is Supabase Auth. The session lives in cookies rather than
// localStorage, which is the whole reason this file uses @supabase/ssr instead
// of plain supabase-js: proxy.js and every server route have to be able to
// read the same session the browser holds. A localStorage session is invisible
// to the server, and this app gates routes server-side.
//
// WHAT REPLACED WHAT:
// This used to pass an `accessToken` callback that handed supabase-js a
// Firebase ID token, with Supabase configured to trust Firebase as a
// third-party provider. That indirection is gone — supabase-js now owns the
// session, so supabase.auth.* works normally and signInWithOAuth is available.
//
// THE COOKIE IS NOT httpOnly, AND THAT IS THE DOCUMENTED TRADE-OFF:
// The old koi-auth-token cookie was httpOnly, written by /api/auth/session.
// A browser client that manages its own session must be able to read and
// rotate it, so @supabase/ssr writes a JS-readable cookie. What that costs is
// narrow: an XSS on this origin can now lift the session, where before it could
// only ride along on requests. What it does not cost is the authorisation
// model — RLS still re-derives the caller from a signature-checked JWT inside
// Postgres on every query, and public.koi_uid() still returns NULL for anyone
// it cannot verify. Nothing was moved from the database into the browser.
//
// SERVER CALLERS GET AN ANONYMOUS CLIENT:
// getSupabaseClient() is imported by 16 modules, some of which run during
// server rendering (lib/data/*, lib/dashboard/*). Those previously got an
// anonymous client too, because the old accessToken callback returned null when
// `window` was undefined — so this preserves behaviour exactly rather than
// changing it. Server code that needs to act AS the signed-in shopper must use
// lib/supabase/server.js, which reads the request's cookies. Reaching for this
// one there would silently query as a guest and return nothing, which is the
// failure the split is designed to make obvious.
// ============================================================================

import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

let browserClient = null
let anonServerClient = null

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
 * The shared Supabase client for the current environment.
 *
 * In the browser: carries the signed-in shopper's session and refreshes it.
 * On the server: anonymous — see the header note before using it there.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
    const { url, key } = credentials()

    if (typeof window === 'undefined') {
        // No cookies to read and no session to keep, so persistence and refresh
        // are switched off: a background timer on the server would refresh a
        // token nobody is holding.
        if (!anonServerClient) {
            anonServerClient = createClient(url, key, {
                auth: { persistSession: false, autoRefreshToken: false },
            })
        }
        return anonServerClient
    }

    if (!browserClient) {
        browserClient = createBrowserClient(url, key)
    }
    return browserClient
}
