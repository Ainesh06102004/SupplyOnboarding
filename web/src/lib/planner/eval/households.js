// ============================================================================
// KOI PLANNER — Reference households, and households nobody thought of
//
// Plan §9.10.4, C8. Pure. The fixed set is the families the planner is for,
// written the way the database holds them (household_member rows with their
// avoids), so each is planned through the same memberFor() a real household
// is. Targets are what KOI would suggest for the member (goals.js: ICMR-NIN
// 2020, or Mifflin–St Jeor with body data, then their goal) unless a
// household says otherwise.
//
// The random households come from a seeded generator, so a failing one can be
// replayed exactly: same seed, same families.
//
// Households the planner cannot yet express (a Navratri week, a disliked
// cuisine) join the set with the step that builds them (plan §9.10.5).
// ============================================================================

import { suggestTargets, ENERGY_GOALS, EATING_PATTERNS } from "../goals";
import { AGE_BAND_KEYS } from "../brief";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";

export const HOUSEHOLDS_VERSION = "reference-households-v2";

/** A member row with suggested targets, overridable. `avoid` holds keys or { key, severity }. */
function person(label, ageBand, {
  sex = null, activity = null, diet = "vegetarian", avoid = [], kcal, protein,
  goal = "maintain", pattern = "balanced", ageYears = null, weightKg = null, heightCm = null,
} = {}) {
  const suggested = suggestTargets({ ageBand, sex, activity, ageYears, weightKg, heightCm, energyGoal: goal, eatingPattern: pattern });
  return {
    // No underscores: a solution names eats_<sku>_<member> and is read from the right (lp.js).
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    age_band: ageBand,
    sex,
    activity_level: activity,
    diet_type: diet,
    energy_goal: goal,
    eating_pattern: pattern,
    age_years: ageYears,
    weight_kg: weightKg,
    height_cm: heightCm,
    target_kcal: kcal === undefined ? suggested.kcal : kcal,
    target_protein_g: protein === undefined ? suggested.protein : protein,
    avoids: avoid.map((a) => (typeof a === "string" ? { key: a, severity: null } : a)),
  };
}

export const REFERENCE_HOUSEHOLDS = Object.freeze([
  {
    id: "founder_family",
    about: "The founder's example: a couple and two children, one wife gluten-free, one child allergic to tree nuts, ₹4,000",
    days: 7,
    budget: 4000,
    members: [
      person("Me", "adult_19_59", { sex: "male" }),
      person("Wife", "adult_19_59", { sex: "female", avoid: ["gluten"] }),
      person("Kid 1", "child_7_9", { avoid: ["tree_nuts"] }),
      person("Kid 2", "child_4_6"),
    ],
  },
  {
    id: "jain_couple",
    about: "A Jain couple, ₹2,500",
    days: 7,
    budget: 2500,
    members: [person("Husband", "adult_19_59", { sex: "male", diet: "jain" }), person("Wife", "adult_19_59", { sex: "female", diet: "jain" })],
  },
  {
    id: "toddler_nut_allergy",
    about: "A parent and a toddler with a peanut and tree-nut allergy, peanuts kept out of the house",
    days: 7,
    budget: 2000,
    keepOut: ["peanuts"],
    members: [person("Parent", "adult_19_59", { sex: "female" }), person("Toddler", "child_1_3", { avoid: ["peanuts", "tree_nuts"] })],
  },
  {
    id: "vegetarian_five_tight_budget",
    about: "A vegetarian family of five, grandparent included, on ₹2,000",
    days: 7,
    budget: 2000,
    members: [
      person("Father", "adult_19_59", { sex: "male" }),
      person("Mother", "adult_19_59", { sex: "female" }),
      person("Grandmother", "senior_60_plus", { sex: "female" }),
      person("Son", "teen_13_15", { sex: "male" }),
      person("Daughter", "child_10_12", { sex: "female" }),
    ],
  },
  {
    id: "eggetarian_teen_athlete",
    about: "An eggetarian 17-year-old who trains, with a parent",
    days: 7,
    budget: 3000,
    members: [person("Teen", "teen_16_18", { sex: "male", diet: "eggetarian" }), person("Parent", "adult_19_59", { sex: "male", diet: "eggetarian" })],
  },
  {
    id: "senior_couple_low_salt",
    about: "A senior couple avoiding high sodium (a preference), ₹1,500",
    days: 7,
    budget: 1500,
    members: [
      person("Grandfather", "senior_60_plus", { sex: "male", avoid: ["high_sodium"] }),
      person("Grandmother", "senior_60_plus", { sex: "female", avoid: ["high_sodium"] }),
    ],
  },
  {
    id: "vegan_adult",
    about: "A vegan adult living alone, no budget",
    days: 7,
    budget: null,
    members: [person("Me", "adult_19_59", { sex: "female", diet: "vegan" })],
  },
  {
    id: "gym_bulking",
    about: "A non-vegetarian adult who lifts and is bulking: a surplus, high protein, no budget",
    days: 7,
    budget: null,
    members: [person("Me", "adult_19_59", { sex: "male", activity: "heavy", diet: "non_vegetarian", goal: "gain", pattern: "high_protein", ageYears: 26, weightKg: 72, heightCm: 176 })],
  },
  {
    id: "gym_cutting",
    about: "An eggetarian adult cutting: a deficit, high protein, ₹3,000",
    days: 7,
    budget: 3000,
    members: [person("Me", "adult_19_59", { sex: "male", activity: "moderate", diet: "eggetarian", goal: "lose", pattern: "high_protein", ageYears: 31, weightKg: 84, heightCm: 178 })],
  },
  {
    id: "keto_adult",
    about: "A non-vegetarian adult on keto, losing weight, with a vegetarian partner, ₹3,500",
    days: 7,
    budget: 3500,
    members: [
      person("Me", "adult_19_59", { sex: "female", diet: "non_vegetarian", goal: "lose", pattern: "keto", ageYears: 38, weightKg: 70, heightCm: 162 }),
      person("Partner", "adult_19_59", { sex: "male", activity: "moderate" }),
    ],
  },
  {
    id: "middle_aged_low_carb",
    about: "A 52-year-old man on low carb who dislikes spicy food, with a teenage daughter",
    days: 7,
    budget: 3000,
    members: [
      person("Me", "adult_19_59", { sex: "male", pattern: "low_carb", ageYears: 52, weightKg: 88, heightCm: 172, avoid: [{ key: "spicy", severity: "dislike" }, { key: "high_sodium", severity: "dislike" }] }),
      person("Daughter", "teen_13_15", { sex: "female" }),
    ],
  },
  {
    id: "senior_losing",
    about: "A 67-year-old losing weight gently (10%), with protein kept up, and a spouse",
    days: 7,
    budget: 2500,
    members: [
      person("Grandfather", "senior_60_plus", { sex: "male", goal: "lose", ageYears: 67, weightKg: 82, heightCm: 170 }),
      person("Grandmother", "senior_60_plus", { sex: "female" }),
    ],
  },
  {
    id: "single_parent_two_young",
    about: "A single parent with a toddler and a 9-year-old, ₹2,500",
    days: 7,
    budget: 2500,
    members: [person("Parent", "adult_19_59", { sex: "female" }), person("Toddler", "child_1_3"), person("Kid", "child_7_9")],
  },
  {
    id: "pescatarian_shellfish",
    about: "A pescatarian couple, one allergic to shellfish",
    days: 7,
    budget: 3500,
    members: [
      person("Me", "adult_19_59", { sex: "male", diet: "pescatarian", avoid: ["shellfish"] }),
      person("Partner", "adult_19_59", { sex: "female", diet: "pescatarian" }),
    ],
  },
  {
    id: "milk_allergy_child",
    about: "Two parents and a 5-year-old allergic to milk",
    days: 7,
    budget: 3000,
    members: [person("Father", "adult_19_59", { sex: "male" }), person("Mother", "adult_19_59", { sex: "female" }), person("Child", "child_4_6", { avoid: ["milk"] })],
  },
  {
    id: "grandparents_small_budget",
    about: "Two vegetarian grandparents on ₹1,200",
    days: 7,
    budget: 1200,
    members: [person("Grandfather", "senior_60_plus", { sex: "male" }), person("Grandmother", "senior_60_plus", { sex: "female" })],
  },
  {
    id: "joint_family_eight",
    about: "A joint family of eight across three generations, ₹6,000",
    days: 7,
    budget: 6000,
    members: [
      person("Grandfather", "senior_60_plus", { sex: "male", diet: "vegetarian" }),
      person("Grandmother", "senior_60_plus", { sex: "female", diet: "jain" }),
      person("Father", "adult_19_59", { sex: "male", diet: "eggetarian" }),
      person("Mother", "adult_19_59", { sex: "female", avoid: ["gluten"] }),
      person("Uncle", "adult_19_59", { sex: "male", activity: "heavy", diet: "non_vegetarian" }),
      person("Teen", "teen_16_18", { sex: "female" }),
      person("Kid", "child_7_9", { avoid: ["peanuts"] }),
      person("Toddler", "child_1_3"),
    ],
  },
  {
    id: "multi_allergy_child",
    about: "A 4-year-old allergic to gluten, soy and peanuts, peanuts kept out of the house",
    days: 7,
    budget: 3000,
    keepOut: ["peanuts"],
    members: [person("Mother", "adult_19_59", { sex: "female" }), person("Child", "child_4_6", { avoid: ["gluten", "soy", "peanuts"] })],
  },
  {
    id: "caffeine_free_adult_and_child",
    about: "An adult avoiding caffeine and an 11-year-old (no caffeine by age)",
    days: 7,
    budget: 2500,
    members: [person("Me", "adult_19_59", { sex: "male", avoid: ["caffeine"] }), person("Child", "child_10_12", { sex: "female" })],
  },
  {
    id: "protein_only_adult",
    about: "An adult who gives only a protein target, no budget",
    days: 7,
    budget: null,
    members: [person("Me", "adult_19_59", { sex: "female", kcal: null, protein: 60 })],
  },
  {
    id: "budget_far_too_small",
    about: "A couple on ₹300 for a week: the plan stays within it and falls short, rather than spending more",
    days: 7,
    budget: 300,
    members: [person("Me", "adult_19_59", { sex: "male" }), person("Partner", "adult_19_59", { sex: "female" })],
  },
  {
    id: "three_day_couple",
    about: "A couple planning three days, ₹1,000",
    days: 3,
    budget: 1000,
    members: [person("Me", "adult_19_59", { sex: "male" }), person("Partner", "adult_19_59", { sex: "female" })],
  },
  {
    id: "lactose_and_egg",
    about: "A lactose-intolerant adult and an egg-allergic teenager",
    days: 7,
    budget: 3000,
    members: [person("Me", "adult_19_59", { sex: "female", avoid: ["lactose"] }), person("Teen", "teen_13_15", { sex: "male", avoid: ["eggs"] })],
  },
]);

/** mulberry32: a small seeded generator, so a random household can be replayed. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HARD_AVOID_KEYS = FOODS_AVOID.filter((a) => a.mode === "hard").map((a) => a.key);
const SOFT_AVOID_KEYS = FOODS_AVOID.filter((a) => a.mode === "soft").map((a) => a.key);
const DIET_KEYS = DIET_TYPES.map((d) => d.key);
const ADULT_BANDS = ["adult_19_59", "senior_60_plus"];

/**
 * Households nobody wrote down: one to six members of any age band, diet and
 * sex, with up to two hard and one soft avoid each (a hard one sometimes only
 * disliked), adults sometimes with a goal and body data, sometimes a food
 * kept out of the house, and any budget from none to ₹6,000.
 *
 * @param {{ count: number, seed: number }} input
 * @returns {Array} households in the REFERENCE_HOUSEHOLDS shape
 */
export function randomHouseholds({ count = 30, seed = 20260917 } = {}) {
  const random = seeded(seed);
  const one = (list) => list[Math.floor(random() * list.length)];
  const households = [];
  for (let h = 0; h < count; h++) {
    const size = 1 + Math.floor(random() * 6);
    const members = [];
    for (let i = 0; i < size; i++) {
      const avoid = new Map();
      if (random() < 0.35) avoid.set(one(HARD_AVOID_KEYS), null);
      if (random() < 0.15) avoid.set(one(HARD_AVOID_KEYS), random() < 0.3 ? "dislike" : null);
      if (random() < 0.25) avoid.set(one(SOFT_AVOID_KEYS), random() < 0.2 ? "rule" : null);
      const ageBand = one(AGE_BAND_KEYS);
      const adult = ADULT_BANDS.includes(ageBand);
      const withBody = adult && random() < 0.5;
      members.push(person(`Member ${i + 1}`, ageBand, {
        sex: one(["male", "female", null]),
        activity: one(["sedentary", "moderate", "heavy", null]),
        diet: one(DIET_KEYS),
        avoid: [...avoid].map(([key, severity]) => ({ key, severity })),
        goal: adult ? one(ENERGY_GOALS.map((g) => g.key)) : "maintain",
        pattern: adult ? one(EATING_PATTERNS.map((p) => p.key)) : "balanced",
        ageYears: withBody ? (ageBand === "senior_60_plus" ? 60 + Math.floor(random() * 25) : 19 + Math.floor(random() * 41)) : null,
        weightKg: withBody ? 45 + Math.floor(random() * 60) : null,
        heightCm: withBody ? 145 + Math.floor(random() * 45) : null,
      }));
    }
    // Only an avoid someone holds as a refusal can be kept out of the house.
    const memberHardAvoids = members.flatMap((m) => m.avoids.filter((a) => HARD_AVOID_KEYS.includes(a.key) && a.severity !== "dislike").map((a) => a.key));
    households.push({
      id: `random_${seed}_${h + 1}`,
      about: `Random household ${h + 1} of seed ${seed}`,
      days: one([3, 7, 7]),
      budget: one([null, 600, 1500, 3000, 6000]),
      keepOut: memberHardAvoids.length && random() < 0.2 ? [one(memberHardAvoids)] : [],
      members,
    });
  }
  return households;
}
