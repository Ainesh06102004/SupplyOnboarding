import { getSupabaseClient } from "./client";

export const profileService = {
  async getProfileByFirebaseUid(firebaseUid) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching profile:", error);
      throw error;
    }
    return data;
  },

  async upsertProfile(profileData) {
    const supabase = getSupabaseClient();
    
    // We try to upsert based on firebase_uid
    const { data, error } = await supabase
      .from("profiles")
      .upsert([
        {
          firebase_uid: profileData.firebase_uid,
          phone: profileData.phone,
          name: profileData.name || null,
          email: profileData.email || null,
        }
      ], { onConflict: 'firebase_uid' })
      .select()
      .single();

    if (error) {
      console.error("Error upserting profile:", error);
      throw error;
    }
    return data;
  }
};
