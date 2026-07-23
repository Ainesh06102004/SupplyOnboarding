import { create } from "zustand";

// ============================================================================
// KOI — Goal profile store
// Captures the shopper's goal, body stats and dietary preferences and derives
// estimated daily macro targets. Persisted to localStorage; designed so a
// future AI layer can read `profile` + `targets` to match products to macros.
// ============================================================================

const KEY = "koi_goal_profile";

function load() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export const useGoalStore = create((set) => ({
  // Start null on every render (SSR-safe); hydrate() fills it in on the client.
  profile: null,
  hydrated: false,

  hydrate: () => set({ profile: load(), hydrated: true }),

  setProfile: (profile) => {
    const withTargets = { ...profile, targets: computeTargets(profile), updatedAt: Date.now() };
    if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(withTargets));
    set({ profile: withTargets, hydrated: true });
  },

  clearProfile: () => {
    if (typeof window !== "undefined") localStorage.removeItem(KEY);
    set({ profile: null });
  },
}));

// Activity multipliers for TDEE.
export const ACTIVITY = {
  sedentary: { label: "Sedentary", hint: "Little to no exercise", factor: 1.2 },
  light: { label: "Lightly active", hint: "1–3 days / week", factor: 1.375 },
  moderate: { label: "Moderately active", hint: "3–5 days / week", factor: 1.55 },
  active: { label: "Very active", hint: "6–7 days / week", factor: 1.725 },
};

export const GOAL_DEFS = {
  fatloss: { label: "Fat loss", blurb: "Lean out at a steady pace", adj: -0.2, proteinPerKg: 1.9, icon: "TrendingDown" },
  muscle: { label: "Muscle gain", blurb: "Build with a lean surplus", adj: 0.12, proteinPerKg: 2.0, icon: "Dumbbell" },
  maintenance: { label: "Maintenance", blurb: "Hold your current shape", adj: 0, proteinPerKg: 1.6, icon: "Scale" },
  wellness: { label: "General wellness", blurb: "Eat cleaner, feel better", adj: 0, proteinPerKg: 1.4, icon: "Sparkles" },
};

// Mifflin–St Jeor BMR → TDEE → goal-adjusted calories + a sensible macro split.
export function computeTargets(p) {
  if (!p) return null;
  const kg = Number(p.weightNow) || 70;
  const cm = Number(p.height) || 170;
  const age = Number(p.age) || 28;
  const s = p.sex === "female" ? -161 : p.sex === "other" ? -78 : 5;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + s;

  const factor = ACTIVITY[p.activity]?.factor || 1.55;
  const tdee = bmr * factor;

  const def = GOAL_DEFS[p.goal] || GOAL_DEFS.maintenance;
  const kcal = Math.max(1200, Math.round((tdee * (1 + def.adj)) / 10) * 10);

  const protein = Math.round(kg * def.proteinPerKg);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { kcal, protein, carbs, fat, tdee: Math.round(tdee) };
}
