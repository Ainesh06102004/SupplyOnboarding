// ============================================================================
// KOI — Customer profile
//
// Reads and writes `customer_profiles`, keyed by the shopper's Supabase Auth
// user id. There is one customer-profile concept, `customer_profiles`, and `id`
// IS that user id — text, not uuid, because the column predates the move to
// Supabase Auth and a uuid stores in it losslessly (see migration 00013).
//
// This used to target a table called `profiles` with a `firebase_uid` column
// that exists in no migration and was never created, so every call failed
// silently on every login. The names here now match the schema.
//
// CREATION IS NOT THIS FILE'S JOB:
// A profile row is created by the on_auth_user_created trigger the moment the
// auth user exists (migration 00013), so nothing has to remember to call
// upsertProfile after sign-in. That matters because delivery_addresses and the
// seven user_* tables carry a foreign key to this table — a missing row breaks
// them, and a trigger cannot be forgotten the way a call site can. What is left
// here is editing: the shopper correcting their own name or phone.
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
   * @param {string} uid the shopper's Supabase Auth user id
   * @returns {Promise<object|null>} the profile, or null when none exists
   */
  async getProfile(uid) {
    if (!uid) return null;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", uid)
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
   * @param {{ uid: string, phone?: string, name?: string, email?: string }} profileData
   * @returns {Promise<object>} the stored profile
   */
  async upsertProfile(profileData) {
    const { uid: id, phone, name, email } = profileData ?? {};
    if (!id) throw new Error("upsertProfile requires uid");

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
