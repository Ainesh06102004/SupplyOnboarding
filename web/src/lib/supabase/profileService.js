// ============================================================================
// KOI — Customer profile
//
// Reads and writes `customer_profiles`, keyed by the Firebase UID.
//
// This used to target a table called `profiles` with a `firebase_uid` column
// that exists in no migration and was never created — so every call has failed
// silently since it shipped, on every login. There is one customer-profile
// concept, `customer_profiles`, and `id` IS the Firebase UID (text, not uuid;
// KOI has no Supabase Auth users).
//
// Access is bounded by RLS: koi_uid() must equal the row's id, so a caller can
// only ever read or write their own profile. These functions do not re-check
// ownership because the database already refuses anything else.
// ============================================================================

import { getSupabaseClient } from "./client";

const TABLE = "customer_profiles";

// PostgREST's "no rows returned" for .single(). Not an error for a lookup.
const NO_ROWS = "PGRST116";

export const profileService = {
  /**
   * @param {string} firebaseUid
   * @returns {Promise<object|null>} the profile, or null when none exists yet
   */
  async getProfileByFirebaseUid(firebaseUid) {
    if (!firebaseUid) return null;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", firebaseUid)
      .maybeSingle();

    if (error && error.code !== NO_ROWS) {
      console.error("Error fetching profile:", error);
      throw error;
    }
    return data ?? null;
  },

  /**
   * Create or update the caller's own profile.
   *
   * Only fields the caller actually supplied are written — passing `null` for
   * an absent value would overwrite a good stored value with nothing.
   *
   * @param {{ firebase_uid: string, phone?: string, name?: string, email?: string }} profileData
   * @returns {Promise<object>} the stored profile
   */
  async upsertProfile(profileData) {
    const { firebase_uid: id, phone, name, email } = profileData ?? {};
    if (!id) throw new Error("upsertProfile requires firebase_uid");

    const row = { id };
    if (phone !== undefined) row.phone = phone;
    if (name !== undefined) row.display_name = name;
    if (email !== undefined) row.email = email;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("Error upserting profile:", error);
      throw error;
    }
    return data;
  },
};
