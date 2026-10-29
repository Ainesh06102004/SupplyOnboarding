// ============================================================================
// Demo mode's household: what a fresh demo database holds. Pure.
//
// Three people (a lifter eating high protein, a vegetarian, a child with a
// peanut allergy), each with KOI's suggested daily targets as a save from
// Household would store them (Simple numbers: the demo's small test catalogue
// can't land a week on exact macros, so Advanced is shown live in Household,
// not seeded), an address, atta, rice and poha in the pantry, three
// Tuesday lunches out (so KOI notices the habit), training days on the
// calendar, weigh-ins, and a note in the inbox. The week's
// plan itself is made by the real planner the first time the demo is opened
// (/api/demo/db), over the test catalogue.
// ============================================================================

import { DEMO_UID } from "./mode";
import { suggestTargets } from "@/lib/planner/goals";

export const DEMO_HOUSEHOLD = "d0000000-0000-4000-8000-00000000a001";
const ME = "d0000000-0000-4000-8000-00000000b001";
const WIFE = "d0000000-0000-4000-8000-00000000b002";
const KID = "d0000000-0000-4000-8000-00000000b003";

const DAY = 86400000;
/** India's calendar date, n days from `now`. */
const istDate = (now, n = 0) => new Date(now.getTime() + 330 * 60000 + n * DAY).toISOString().slice(0, 10);
const weekdayOfIso = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

const member = (id, fields) => ({
  id, household_id: DEMO_HOUSEHOLD, relation: null, sex: null, activity_level: null, diet_type: "non_vegetarian",
  energy_goal: "maintain", eating_pattern: "balanced", age_years: null, weight_kg: null, height_cm: null, target_weight_kg: null,
  appetite: null, spice_tolerance: null, meals_from_home: [], favourite_categories: [], target_kcal: null, target_protein_g: null,
  target_carbs_g: null, target_fat_g: null, target_source: "suggested", target_tolerance_pct: 5, carb_cycling: false,
  account_profile_id: null, version: 1, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  ...fields,
});

/** A person with KOI's suggested calories and protein, and where they come from, as Household saves them. */
const suggested = (fields) => {
  const s = suggestTargets({
    ageBand: fields.age_band, sex: fields.sex ?? null, activity: fields.activity_level ?? null,
    ageYears: fields.age_years ?? null, weightKg: fields.weight_kg ?? null, heightCm: fields.height_cm ?? null,
    energyGoal: fields.energy_goal ?? "maintain", eatingPattern: fields.eating_pattern ?? "balanced",
  });
  return s ? { ...fields, target_kcal: s.kcal, target_protein_g: Math.round(s.protein), target_source: s.source } : fields;
};

/** @param {Date} now */
export function seedTables(now = new Date()) {
  // The last three Tuesdays before today.
  const tuesdays = [];
  for (let n = -1; tuesdays.length < 3 && n > -30; n--) if (weekdayOfIso(istDate(now, n)) === 2) tuesdays.push(istDate(now, n));
  const at = now.toISOString();
  return {
    customer_profiles: [{ id: DEMO_UID, display_name: "Demo shopper", email: null, phone: "+919000000000", city: "Bengaluru", pincode: "560001", created_at: "2026-09-01T00:00:00Z" }],
    delivery_addresses: [{ id: "d0000000-0000-4000-8000-00000000c001", profile_id: DEMO_UID, label: "Home", line1: "12, 4th Cross, Indiranagar", city: "Bengaluru", state: "Karnataka", pincode: "560038", is_default: true, created_at: "2026-09-01T00:00:00Z" }],
    household: [{
      id: DEMO_HOUSEHOLD, label: "Demo household", owner_id: DEMO_UID, keep_out: [], refused_brands: [], preferred_brands: [],
      waste_tolerance: "some", repeat_tolerance: "usual", priorities: [], processing_ceiling: null, shelf_stable_only: false, cuisine_leaning: "indian",
      cooking_style: "fresh", prep_days: [0, 3], calendar_token: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    }],
    household_member: [
      member(ME, suggested({
        label: "Me", relation: "self", age_band: "adult_19_59", sex: "male", activity_level: "moderate", age_years: 31, weight_kg: 76, height_cm: 178,
        eating_pattern: "high_protein", account_profile_id: DEMO_UID,
      })),
      member(WIFE, suggested({ label: "Wife", relation: "spouse", age_band: "adult_19_59", sex: "female", activity_level: "light", age_years: 29, weight_kg: 58, height_cm: 162, diet_type: "vegetarian", created_at: "2026-09-02T00:00:00Z" })),
      member(KID, suggested({ label: "Kid", relation: "child", age_band: "child_7_9", diet_type: "vegetarian", created_at: "2026-09-03T00:00:00Z" })),
    ],
    household_member_avoid: [{ id: "d0000000-0000-4000-8000-00000000e001", member_id: KID, avoid_key: "peanuts", severity: "allergy" }],
    // What the kitchen already has, as most do: the week cooks with it and doesn't buy it.
    household_pantry: [
      { id: "d0000000-0000-4000-8000-000000004001", household_id: DEMO_HOUSEHOLD, sku_id: "off-8901725016838", label: "Atta", created_at: "2026-09-01T00:00:00Z" },
      { id: "d0000000-0000-4000-8000-000000004002", household_id: DEMO_HOUSEHOLD, sku_id: "off-8901537007123", label: "Basmati rice", created_at: "2026-09-01T00:00:00Z" },
      { id: "d0000000-0000-4000-8000-000000004003", household_id: DEMO_HOUSEHOLD, sku_id: "off-8906008812817", label: "Poha", created_at: "2026-09-01T00:00:00Z" },
    ],
    plan: [],
    plan_item: [],
    plan_week: [],
    member_checkin: [
      { id: "d0000000-0000-4000-8000-00000000f001", member_id: ME, checked_on: istDate(now, -21), weight_kg: 77.4, created_at: at },
      { id: "d0000000-0000-4000-8000-00000000f002", member_id: ME, checked_on: istDate(now, -14), weight_kg: 77.0, created_at: at },
      { id: "d0000000-0000-4000-8000-00000000f003", member_id: ME, checked_on: istDate(now, -7), weight_kg: 76.6, created_at: at },
    ],
    member_meal_log: tuesdays.map((d, i) => ({
      id: `d0000000-0000-4000-8000-0000000010${i}1`, member_id: ME, eaten_on: d, slot: "lunch", status: "other", planned: null,
      other: { items: [{ dish_key: "veg_thali", portion: "usual", count: 1 }], setting: "canteen" },
      estimate: { point: { kcal: 1010, protein: 32, carbs: 139, fat: 36, fibre: 9 }, low: { kcal: 760, protein: 24, carbs: 104, fat: 27, fibre: 7 }, high: { kcal: 1260, protein: 40, carbs: 174, fat: 45, fibre: 11 }, basis: ["Veg thali: as a canteen makes it."] },
      source: "track", created_at: at, updated_at: at,
    })),
    calendar_event: [{
      id: "d0000000-0000-4000-8000-000000002001", household_id: DEMO_HOUSEHOLD, member_id: ME, kind: "training", title: null,
      starts_on: istDate(now, -14), ends_on: null, at_time: null, slot: null, repeat_days: [1, 3, 5], until: null, plan_effect: {}, source: "user", created_at: at, updated_at: at,
    }],
    autoplan_job: [],
    notification: [{
      id: "d0000000-0000-4000-8000-000000003001", recipient_id: DEMO_UID, household_id: DEMO_HOUSEHOLD, kind: "reminder",
      title: "You're in demo mode", body: "Everything here lives on this computer (web/.demo/db.json), not in Supabase. Change anything; Demo · reset in the header starts again.",
      href: "/store/plan", template: null, template_params: [], channels: ["in_app"], sent: { in_app: { at } }, ref: "demo:welcome", read_at: null, created_at: at,
    }],
    notify_consent: [],
    fulfilment_intents: [],
  };
}
