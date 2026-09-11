// ============================================================================
// KOI — Who may review label readings
//
// SERVER ONLY. A reviewer is a signed-in Supabase Auth user whose
// app_metadata.koi_role is "reviewer". app_metadata is writable only with the
// service role — a user cannot set it on themselves the way they can
// user_metadata — so the role is granted by scripts/grantReviewer.mjs and read
// here from the verified session. Never from a request body, never from a
// cookie's contents: getUser() asks the Auth server.
//
// Reviewing is the step that turns a model's reading into a fact shoppers rely
// on for allergens, so this gate is what makes "a person checked it" true.
// ============================================================================

import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";

export const REVIEWER_ROLE = "reviewer";

/** @param {{ role?: string|null }|null} user from getVerifiedUser() */
export const isReviewer = (user) => user?.role === REVIEWER_ROLE;

/**
 * The signed-in reviewer, for Server Components. Null when signed out or not a
 * reviewer — callers render nothing sensitive either way.
 * @returns {Promise<{ uid: string, email: string|null }|null>}
 */
export async function getReviewer() {
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    const user = data?.user;
    if (error || !user || user.app_metadata?.koi_role !== REVIEWER_ROLE) return null;
    return { uid: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}
