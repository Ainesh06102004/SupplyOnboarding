// ============================================================================
// Demo mode: the whole store, signed in as a demo household, with no Supabase.
//
// For trying KOI while the real database can't be reached (or isn't wanted):
// every Supabase call — browser, server, the planner — goes to a small local
// stand-in (lib/supabase/demo/*) that keeps its tables in web/.demo/db.json.
//
// ON ONLY WHEN ASKED, AND NEVER IN PRODUCTION: NEXT_PUBLIC_KOI_DEMO=1 in a
// development build (`npm run dev:demo` sets it). A production build reads
// NODE_ENV as "production" and every demo path is dead code.
// ============================================================================

export const isDemo = () => process.env.NEXT_PUBLIC_KOI_DEMO === "1" && process.env.NODE_ENV !== "production";

/** The demo shopper: an auth user, as Supabase would hand one back. */
export const DEMO_UID = "00000000-0000-4000-8000-00000000d001";
export const DEMO_USER = Object.freeze({
  id: DEMO_UID,
  aud: "authenticated",
  role: "authenticated",
  phone: "919000000000",
  email: null,
  app_metadata: Object.freeze({ provider: "phone", providers: ["phone"] }),
  user_metadata: Object.freeze({ full_name: "Demo shopper" }),
  identities: [],
  created_at: "2026-09-01T00:00:00Z",
});
export const DEMO_SESSION = Object.freeze({
  access_token: "demo",
  refresh_token: "demo",
  token_type: "bearer",
  expires_in: 315360000,
  expires_at: 4102444800,
  user: DEMO_USER,
});
