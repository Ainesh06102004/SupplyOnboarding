"use client";

// ============================================================================
// KOI — Who is signed in, client-side
//
// Wraps Supabase Auth in the shape the app already speaks. Signed out is a
// first-class state, not a failure: guests browse the whole catalogue and are
// asked to sign in only at checkout, so `user === null` is the common case and
// must never block a render.
//
// WHY THE USER OBJECT IS NORMALISED:
// Roughly twenty call sites read `user.uid`. That name predates Supabase — it
// was the Firebase UID — but it is now simply KOI's customer key, which is what
// every customer-tier table stores in its text `profile_id` (see migration
// 00013). Mapping `id` to `uid` here keeps one vocabulary across the app and
// keeps the identity swap out of twenty unrelated files. Read `raw` when you
// need something Supabase-specific.
//
// WHAT WENT AWAY:
// The old provider mirrored every Firebase token into an httpOnly cookie by
// POSTing /api/auth/session on each auth change, because the server had no
// other way to see the session. @supabase/ssr writes cookies the server can
// already read, so that route and its round trip are gone.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const AuthContext = createContext({
  user: null,
  loading: true,
  configured: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

/** Supabase env is public and read at build time, so this is a static fact. */
function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * The Supabase user in KOI's vocabulary.
 *
 * Google returns the display name under `full_name` or `name` and the avatar
 * under `avatar_url` or `picture`, depending on which scopes came back — hence
 * the pairs. Everything falls back to null rather than a placeholder: the store
 * renders no claim it cannot source (see lib/data/productFetcher.js for the
 * same rule applied to catalogue data).
 */
function toKoiUser(supabaseUser) {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata ?? {};
  return {
    uid: supabaseUser.id,
    email: supabaseUser.email ?? null,
    displayName: meta.full_name ?? meta.name ?? null,
    photoURL: meta.avatar_url ?? meta.picture ?? null,
    phone: supabaseUser.phone || null,
    raw: supabaseUser,
  };
}

export function AuthProvider({ children }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState(null);
  // Starts settled when there is no Supabase to ask, because nothing would ever
  // resolve it. A misconfigured deploy should render a signed-out storefront,
  // not an app stuck behind "Checking your session..." forever.
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return undefined;

    const supabase = getSupabaseClient();
    let active = true;

    // onAuthStateChange emits INITIAL_SESSION on subscribe, so this one call
    // covers both first paint and every later change. Its callback must stay
    // synchronous — awaiting another supabase.auth call inside it deadlocks the
    // client's internal lock, which shows up as a page that never finishes
    // loading rather than as an error.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(toKoiUser(session?.user ?? null));
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  /**
   * Hand off to Google. Returns nothing useful — the page is navigating away,
   * and the shopper comes back through /auth/callback.
   *
   * @param {string} [next] where to land afterwards; same-origin paths only,
   *   re-validated server-side in the callback.
   */
  const signInWithGoogle = useCallback(async (next) => {
    const supabase = getSupabaseClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        queryParams: {
          // Ask Google for a chooser rather than silently reusing whichever
          // account the browser happens to be signed into. Shared and family
          // devices are common, and a diet profile is personal.
          prompt: "select_account",
        },
      },
    });

    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // No local clearing here: signOut triggers onAuthStateChange, which is the
    // single place user state is set. Two writers would race.
  }, []);

  const value = useMemo(
    () => ({ user, loading, configured, signInWithGoogle, signOut }),
    [user, loading, configured, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
