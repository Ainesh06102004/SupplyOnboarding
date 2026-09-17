// ============================================================================
// KOI PLANNER — Reference households, and households nobody thought of
//
// Plan §9.10.4, C8. Pure. The fixed set is the families the planner is for,
// written the way the database holds them (household_member rows with their
// avoid keys), so each is planned through the same memberFor() a real
// household is. Targets are ICMR-NIN 2020's reference needs for the member's
// age band (referenceNeeds.js) unless a household says otherwise.
//
// The random households come from a seeded generator, so a failing one can be
// replayed exactly: same seed, same families.
//
// Households the planner cannot yet express (a keto adult, a Navratri week, a
// deficit) join the set with the step that builds them (plan §9.10.5).
// ============================================================================

import { referenceNeeds } from "../referenceNeeds";
import { AGE_BAND_KEYS } from "../brief";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";

export const HOUSEHOLDS_VERSION = "reference-households-v1";

/** A member row with reference targets, overridable. */
function person(label, ageBand, { sex = null, activity = null, diet = "vegetarian", avoid = [], kcal, protein } = {}) {
  const needs = referenceNeeds({ ageBand, sex, activity });
  return {
    // No underscores: a solution names eats_<sku>_<member> and is read from the right (lp.js).
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    age_band: ageBand,
    sex,
    diet_type: diet,
    target_kcal: kcal === undefined ? needs.kcal : kcal,
    target_protein_g: protein === undefined ? needs.protein : protein,
    avoidKeys: avoid,
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
    about: "A non-vegetarian adult who lifts, asking 3,000 kcal and 150 g protein, no budget",
    days: 7,
    budget: null,
    members: [person("Me", "adult_19_59", { sex: "male", activity: "active", diet: "non_vegetarian", kcal: 3000, protein: 150 })],
  },
  {
    id: "gym_cutting",
    about: "An adult cutting: 1,700 kcal and 140 g protein, ₹3,000",
    days: 7,
    budget: 3000,
    members: [person("Me", "adult_19_59", { sex: "male", activity: "moderate", diet: "eggetarian", kcal: 1700, protein: 140 })],
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
      person("Uncle", "adult_19_59", { sex: "male", activity: "active", diet: "non_vegetarian" }),
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

/**
 * Households nobody wrote down: one to six members of any age band, diet and
 * sex, with up to two hard and one soft avoid each, sometimes a food kept out
 * of the house, and any budget from none to ₹6,000.
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
      const avoid = new Set();
      if (random() < 0.35) avoid.add(one(HARD_AVOID_KEYS));
      if (random() < 0.15) avoid.add(one(HARD_AVOID_KEYS));
      if (random() < 0.25) avoid.add(one(SOFT_AVOID_KEYS));
      members.push(person(`Member ${i + 1}`, one(AGE_BAND_KEYS), {
        sex: one(["male", "female", null]),
        activity: one(["sedentary", "light", "moderate", "active"]),
        diet: one(DIET_KEYS),
        avoid: [...avoid],
      }));
    }
    const memberHardAvoids = members.flatMap((m) => m.avoidKeys.filter((k) => HARD_AVOID_KEYS.includes(k)));
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
