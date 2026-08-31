// ============================================================================
// KOI — Goal profile persistence
//
// Moves the shopper's goal, body stats and food preferences out of localStorage
// and into the normalised schema that migration 00008 creates. That schema was
// designed for exactly this and nothing had ever written to it.
//
// Shape on the client is one flat object (see store/goalStore.js); shape in the
// database is one row per preference, so it can be queried, indexed and joined.
// This module is the only place that translation lives.
//
// Keys are NOT translated. `dietType`, `budget`, `cooking`, and every entry in
// `foodsLove` / `foodsAvoid` / `mealPrefs` are the same strings the engine uses
// in lib/recommendation/config.js and the same ones the CHECK constraints and
// foreign keys accept. Any mapping table here would be a place for them to
// drift apart.
//
// Access is bounded by RLS: every table gates on koi_uid() = profile_id, so a
// caller can only touch their own rows. localStorage stays the guest tier and
// the offline fallback.
// ============================================================================

import { getSupabaseClient } from "./client";

/** Single-value preference tables, and the profile field each one stores. */
const SINGLE_VALUE = [
  { table: "user_diet_type", column: "diet_type", field: "dietType" },
  { table: "user_budget_preference", column: "budget", field: "budget" },
  { table: "user_cooking_preference", column: "cooking", field: "cooking" },
];

/** Multi-value preference tables, and the profile array each one stores. */
const MULTI_VALUE = [
  { table: "user_food_preference", column: "food_key", field: "foodsLove" },
  { table: "user_avoided_food", column: "avoid_key", field: "foodsAvoid" },
  { table: "user_meal_preference", column: "meal_key", field: "mealPrefs" },
];

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Write the whole profile. Replaces rather than merges — the modal always
 * submits a complete profile, so a partial write would leave stale preferences
 * the shopper had just removed.
 *
 * Not transactional: PostgREST has no multi-statement transaction. A failure
 * part-way leaves the profile inconsistent, which is why localStorage remains
 * the source the UI reads. Moving this to an RPC would fix it.
 *
 * @param {string} uid Firebase UID
 * @param {object} profile from goalStore
 */
export async function saveGoalProfile(uid, profile) {
  if (!uid || !profile) return;
  const supabase = getSupabaseClient();
  const t = profile.targets || {};

  const { error: healthError } = await supabase.from("user_health_profile").upsert(
    {
      profile_id: uid,
      gender: profile.sex || null,
      age: num(profile.age),
      height_cm: num(profile.height),
      weight_kg: num(profile.weightNow),
      goal_weight_kg: num(profile.weightTarget),
      activity_level: profile.activity || null,
      goal: profile.goal || null,
      target_kcal: num(t.kcal),
      target_protein_g: num(t.protein),
      target_carbs_g: num(t.carbs),
      target_fat_g: num(t.fat),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );
  if (healthError) throw healthError;

  for (const { table, column, field } of SINGLE_VALUE) {
    const value = profile[field];
    if (!value) continue;
    const { error } = await supabase
      .from(table)
      .upsert(
        { profile_id: uid, [column]: value, updated_at: new Date().toISOString() },
        { onConflict: "profile_id" }
      );
    if (error) throw error;
  }

  for (const { table, column, field } of MULTI_VALUE) {
    const keys = Array.isArray(profile[field]) ? profile[field] : [];
    // Replace the set: clear, then insert what was chosen.
    const { error: delError } = await supabase.from(table).delete().eq("profile_id", uid);
    if (delError) throw delError;
    if (!keys.length) continue;
    const { error: insError } = await supabase
      .from(table)
      .insert(keys.map((k) => ({ profile_id: uid, [column]: k })));
    if (insError) throw insError;
  }
}

/**
 * Read the profile back into the flat client shape.
 *
 * @param {string} uid Firebase UID
 * @returns {Promise<object|null>} null when this shopper has no stored profile
 */
export async function loadGoalProfile(uid) {
  if (!uid) return null;
  const supabase = getSupabaseClient();

  const { data: health, error } = await supabase
    .from("user_health_profile")
    .select("*")
    .eq("profile_id", uid)
    .maybeSingle();

  if (error) throw error;
  if (!health) return null;

  const profile = {
    goal: health.goal || "",
    sex: health.gender || "male",
    age: health.age,
    height: health.height_cm,
    weightNow: health.weight_kg,
    weightTarget: health.goal_weight_kg,
    activity: health.activity_level || "moderate",
    targets: {
      kcal: health.target_kcal,
      protein: health.target_protein_g,
      carbs: health.target_carbs_g,
      fat: health.target_fat_g,
    },
  };

  const singles = await Promise.all(
    SINGLE_VALUE.map(({ table, column }) =>
      supabase.from(table).select(column).eq("profile_id", uid).maybeSingle()
    )
  );
  SINGLE_VALUE.forEach(({ column, field }, i) => {
    profile[field] = singles[i].data?.[column] ?? null;
  });

  const multis = await Promise.all(
    MULTI_VALUE.map(({ table, column }) =>
      supabase.from(table).select(column).eq("profile_id", uid)
    )
  );
  MULTI_VALUE.forEach(({ column, field }, i) => {
    profile[field] = (multis[i].data || []).map((r) => r[column]);
  });

  return profile;
}
