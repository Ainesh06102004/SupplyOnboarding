// ============================================================================
// KOI PLANNER — Goals for every eater, and the targets KOI can suggest
//
// Plan §9.10.1. Pure. A goal is three independent choices, and life stage
// decides which a member may have:
//
//   energy     maintain · lose (a deficit) · gain (a surplus)      adults 19+
//   pattern    balanced · high protein · low carb · keto           adults 19+
//   diet type  vegetarian, Jain, … (config.DIET_TYPES)             anyone
//
// Under 19 a member is maintain and balanced, whatever is stored: children are
// growing, and a weight goal for a child is for their doctor. The database
// refuses anything else too (00050, household_member_goals_are_for_adults).
//
// SUGGESTED TARGETS. KOI offers a figure and says where it came from; the
// owner keeps it or changes it, and target_source records which.
//   maintenance  Mifflin–St Jeor × an activity factor when an adult's weight,
//                height and age are all given (goal setup's own formula,
//                store/goalStore.js#computeTargets); otherwise ICMR-NIN 2020's
//                reference needs for the age band (referenceNeeds.js)
//   lose         20% below maintenance, 10% at 60 and over; never below
//                1,500 kcal for men or 1,200 for women (1,500 when not given),
//                the usual floor below which a diet needs supervision
//   gain         12% above maintenance
//   protein      balanced: the ICMR RDA, or 0.83 g per kg of a stated weight;
//                high protein: 1.6 g/kg maintaining, 1.9 losing, 2.0 gaining
//                (goal setup's figures; inside the ISSN's 1.4–2.0 g/kg,
//                Jäger et al., JISSN 14:20, 2017); at 60 and over at least
//                1.0 g/kg (PROT-AGE, Bauer et al., JAMDA 14(8), 2013)
//   carbohydrate low carb at most 130 g a day, keto at most 50 g (Feinman et
//                al., Nutrition 31(1), 2015) — ceilings, not targets
//
// Versioned; a nutritionist reviews these (plan §15 item 17).
// ============================================================================

import { referenceNeeds, REFERENCE_SOURCE } from "./referenceNeeds";

export const GOAL_RULES_VERSION = "goal-rules-v1";

export const ENERGY_GOALS = Object.freeze([
  { key: "maintain", label: "Maintain" },
  { key: "lose", label: "Lose weight" },
  { key: "gain", label: "Gain weight" },
]);

export const EATING_PATTERNS = Object.freeze([
  { key: "balanced", label: "Balanced" },
  { key: "high_protein", label: "High protein" },
  { key: "low_carb", label: "Low carb" },
  { key: "keto", label: "Keto" },
]);

export const GOAL_RULES = Object.freeze({
  loseShare: Object.freeze({ adult: 0.2, senior: 0.1 }),
  gainShare: 0.12,
  kcalFloor: Object.freeze({ male: 1500, female: 1200, unknown: 1500 }),
  proteinPerKg: Object.freeze({ rda: 0.83, maintain: 1.6, lose: 1.9, gain: 2.0, seniorMinimum: 1.0 }),
  carbCeiling: Object.freeze({ low_carb: 130, keto: 50 }),
  // store/goalStore.js ACTIVITY factors. A household member's activity is
  // ICMR's work level (00044): heavy is goal setup's "very active".
  activityFactor: Object.freeze({ sedentary: 1.2, light: 1.375, moderate: 1.55, heavy: 1.725, active: 1.725 }),
  // ICMR's reference adults, for g/kg figures when no weight is given.
  referenceWeightKg: Object.freeze({ male: 65, female: 55, unknown: 60 }),
});

const ADULT_BANDS = Object.freeze(["adult_19_59", "senior_60_plus"]);
const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const round10 = (v) => Math.round(v / 10) * 10;
const sexKey = (sex) => (sex === "male" || sex === "female" ? sex : "unknown");

/** May this age band have a goal other than maintain and balanced? */
export const goalsAllowed = (ageBand) => ADULT_BANDS.includes(ageBand);

/**
 * The goal the planner applies: the stored one for an adult, maintain and
 * balanced for anyone else.
 * @param {{ age_band?: string, ageBand?: string, energy_goal?: string, eating_pattern?: string }} member
 * @returns {{ energyGoal: string, eatingPattern: string }}
 */
export function effectiveGoal(member = {}) {
  const band = member.ageBand ?? member.age_band ?? null;
  if (!goalsAllowed(band)) return { energyGoal: "maintain", eatingPattern: "balanced" };
  const energyGoal = ENERGY_GOALS.some((g) => g.key === member.energy_goal) ? member.energy_goal : "maintain";
  const eatingPattern = EATING_PATTERNS.some((p) => p.key === member.eating_pattern) ? member.eating_pattern : "balanced";
  return { energyGoal, eatingPattern };
}

/** The most carbohydrate a day a pattern allows, or null when it sets no ceiling. */
export const carbCeiling = (eatingPattern) => GOAL_RULES.carbCeiling[eatingPattern] ?? null;

/**
 * Daily targets KOI can suggest for a member, with where each came from.
 *
 * @param {object} input
 * @param {string} input.ageBand
 * @param {string|null} [input.sex] male | female | anything else
 * @param {string|null} [input.activity] sedentary | moderate | heavy (or goal setup's keys)
 * @param {number|null} [input.ageYears] adults only
 * @param {number|null} [input.weightKg] adults only
 * @param {number|null} [input.heightCm] adults only
 * @param {string} [input.energyGoal]
 * @param {string} [input.eatingPattern]
 * @returns {{ kcal: number, protein: number, carbsMax: number|null, source: string, basis: string[], version: string }|null}
 */
export function suggestTargets({ ageBand, sex = null, activity = null, ageYears = null, weightKg = null, heightCm = null, energyGoal = "maintain", eatingPattern = "balanced" }) {
  const reference = referenceNeeds({ ageBand, sex, activity });
  if (!reference) return null;
  const adult = goalsAllowed(ageBand);
  const senior = ageBand === "senior_60_plus";
  const goal = effectiveGoal({ ageBand, energy_goal: energyGoal, eating_pattern: eatingPattern });
  const s = sexKey(sex);
  const basis = [];

  // Maintenance energy.
  let kcal;
  let source;
  const body = adult && isNum(weightKg) && isNum(heightCm) && isNum(ageYears);
  if (body) {
    const offset = { male: 5, female: -161, unknown: -78 }[s];
    const bmr = 10 * Number(weightKg) + 6.25 * Number(heightCm) - 5 * Number(ageYears) + offset;
    const factor = GOAL_RULES.activityFactor[activity] ?? GOAL_RULES.activityFactor.sedentary;
    kcal = round10(bmr * factor);
    source = "mifflin_st_jeor";
    basis.push(`Maintenance ${kcal.toLocaleString("en-IN")} kcal: Mifflin–St Jeor for ${weightKg} kg, ${heightCm} cm, ${ageYears} years, × ${factor} for activity`);
  } else {
    kcal = reference.kcal;
    source = REFERENCE_SOURCE;
    basis.push(`Maintenance ${kcal.toLocaleString("en-IN")} kcal: ICMR-NIN 2020 reference needs for this age${adult ? " and activity" : ""}`);
    if (reference.note) basis.push(reference.note);
  }

  // The energy goal.
  if (goal.energyGoal === "lose") {
    const share = senior ? GOAL_RULES.loseShare.senior : GOAL_RULES.loseShare.adult;
    const floor = GOAL_RULES.kcalFloor[s];
    const cut = round10(kcal * (1 - share));
    kcal = Math.max(cut, floor);
    basis.push(cut < floor
      ? `Losing: ${Math.round(share * 100)}% below would be under ${floor.toLocaleString("en-IN")} kcal, so ${floor.toLocaleString("en-IN")}`
      : `Losing: ${Math.round(share * 100)}% below maintenance`);
  } else if (goal.energyGoal === "gain") {
    kcal = round10(kcal * (1 + GOAL_RULES.gainShare));
    basis.push(`Gaining: ${Math.round(GOAL_RULES.gainShare * 100)}% above maintenance`);
  }

  // Protein.
  let protein;
  if (!adult) {
    protein = reference.protein;
    basis.push(`Protein ${protein} g: ICMR-NIN 2020 recommended allowance for this age`);
  } else {
    const weight = isNum(weightKg) ? Number(weightKg) : GOAL_RULES.referenceWeightKg[s];
    const weightWords = isNum(weightKg) ? `${weight} kg` : `a reference ${weight} kg`;
    if (goal.eatingPattern === "high_protein") {
      const perKg = GOAL_RULES.proteinPerKg[goal.energyGoal];
      protein = Math.round(perKg * weight);
      basis.push(`Protein ${protein} g: ${perKg} g per kg of ${weightWords}, for high protein`);
    } else {
      protein = isNum(weightKg) ? Math.round(GOAL_RULES.proteinPerKg.rda * weight) : reference.protein;
      basis.push(isNum(weightKg)
        ? `Protein ${protein} g: the ICMR-NIN allowance of 0.83 g per kg of ${weightWords}`
        : `Protein ${protein} g: ICMR-NIN 2020 recommended allowance`);
    }
    if (senior) {
      const minimum = Math.round(GOAL_RULES.proteinPerKg.seniorMinimum * weight);
      if (protein < minimum) {
        protein = minimum;
        basis.push(`At least 1.0 g per kg at 60 and over: ${minimum} g`);
      }
    }
  }

  const carbsMax = adult ? carbCeiling(goal.eatingPattern) : null;
  if (carbsMax !== null) basis.push(`Carbohydrate at most ${carbsMax} g a day, for ${goal.eatingPattern === "keto" ? "keto" : "low carb"}`);

  return { kcal, protein, carbsMax, source, basis, version: GOAL_RULES_VERSION };
}
