// ============================================================================
// KOI — A household member's profile: the form's shape, and what is saved
//
// Plan §9.10.2. Pure, so the profile page and the plan page save the same way
// and the rules are tested once:
//
//   * what a save sends to public.save_household_member (00050): only the
//     fields a form holds, with everything adult-only reset for anyone under
//     19 so a member moved to a child's age band cannot keep a keto goal;
//   * how strict an avoid can be, by what kind of avoid it is;
//   * what a member must have before they can be planned for;
//   * how the account holder's own goal setup fills "Me".
// ============================================================================

import { FOODS_AVOID, DIET_TYPES } from "@/lib/recommendation/config";
import { AGE_BANDS } from "@/lib/planner/brief";
import { goalsAllowed, ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";

export const SEVERITIES = Object.freeze([
  { key: "allergy", label: "Allergy", hint: "Never, for safety" },
  { key: "intolerance", label: "Intolerance", hint: "Never" },
  { key: "rule", label: "Never", hint: "By choice or belief" },
  { key: "dislike", label: "Dislikes", hint: "Rather not; the plan may still use it" },
]);

export const ACTIVITY_LEVELS = Object.freeze([
  { key: "sedentary", label: "Mostly sitting" },
  { key: "moderate", label: "On their feet, or exercises most days" },
  { key: "heavy", label: "Physical work, or trains hard" },
]);

export const MEALS_FROM_HOME = Object.freeze([
  { key: "breakfast", label: "Breakfast" },
  { key: "tiffin", label: "Packed lunch" },
  { key: "lunch", label: "Lunch at home" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
]);

export const APPETITES = Object.freeze([
  { key: "small", label: "Small eater" },
  { key: "usual", label: "Usual" },
  { key: "large", label: "Big eater" },
]);

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const blankToNull = (v) => (v === "" || v === undefined ? null : v);
const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** The severities an avoid may have: only an allergen can be an allergy (00050). */
export function severitiesFor(avoidKey) {
  const entry = AVOID_BY_KEY[avoidKey];
  const keys = entry?.kind === "allergen" ? ["allergy", "intolerance", "dislike"] : ["rule", "intolerance", "dislike"];
  return keys.map((key) => SEVERITIES.find((s) => s.key === key));
}

/** What an avoid means when nobody chose: a hard allergen an allergy, another hard avoid a rule, a soft one a dislike. */
export function defaultSeverityFor(avoidKey) {
  const entry = AVOID_BY_KEY[avoidKey];
  if (entry?.mode !== "hard") return "dislike";
  return entry.kind === "allergen" ? "allergy" : "rule";
}

/** A blank member, as the profile form holds one. */
export function blankProfile() {
  return {
    memberId: null,
    label: "",
    relation: "",
    age_band: "adult_19_59",
    sex: "",
    activity_level: "",
    diet_type: "vegetarian",
    energy_goal: "maintain",
    eating_pattern: "balanced",
    age_years: "",
    weight_kg: "",
    height_cm: "",
    appetite: "",
    meals_from_home: [],
    target_kcal: "",
    target_protein_g: "",
    target_source: "stated",
    is_account_holder: false,
    avoids: [],
    version: null,
  };
}

/** A stored household_member row (with household_member_avoid) as the profile form. */
export function profileFromRow(row) {
  const text = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    ...blankProfile(),
    memberId: row.id,
    label: text(row.label),
    relation: text(row.relation),
    age_band: row.age_band ?? "adult_19_59",
    sex: text(row.sex),
    activity_level: text(row.activity_level),
    diet_type: row.diet_type ?? "",
    energy_goal: row.energy_goal ?? "maintain",
    eating_pattern: row.eating_pattern ?? "balanced",
    age_years: text(row.age_years),
    weight_kg: text(row.weight_kg),
    height_cm: text(row.height_cm),
    appetite: text(row.appetite),
    meals_from_home: row.meals_from_home ?? [],
    target_kcal: text(row.target_kcal),
    target_protein_g: text(row.target_protein_g),
    target_source: row.target_source ?? "stated",
    is_account_holder: Boolean(row.account_profile_id),
    avoids: (row.household_member_avoid ?? []).map((a) => ({ key: a.avoid_key, severity: a.severity ?? defaultSeverityFor(a.avoid_key) })),
    version: row.version ?? null,
  };
}

/**
 * The p_member argument for save_household_member: every field of the profile
 * form, with adult-only fields reset for anyone under 19.
 *
 * @param {object} form from blankProfile/profileFromRow
 * @returns {object}
 */
export function memberPayload(form) {
  const adult = goalsAllowed(form.age_band);
  const whole = (v) => (isNum(v) ? String(Math.round(Number(v))) : null);
  return {
    ...(form.memberId ? { id: form.memberId } : {}),
    label: String(form.label ?? "").trim(),
    relation: blankToNull(String(form.relation ?? "").trim()),
    age_band: form.age_band,
    sex: blankToNull(form.sex),
    activity_level: blankToNull(form.activity_level),
    diet_type: blankToNull(form.diet_type),
    energy_goal: adult ? form.energy_goal || "maintain" : "maintain",
    eating_pattern: adult ? form.eating_pattern || "balanced" : "balanced",
    age_years: adult && isNum(form.age_years) ? String(Math.round(Number(form.age_years))) : null,
    weight_kg: adult && isNum(form.weight_kg) ? String(Number(form.weight_kg)) : null,
    height_cm: adult && isNum(form.height_cm) ? String(Number(form.height_cm)) : null,
    appetite: blankToNull(form.appetite),
    meals_from_home: form.meals_from_home ?? [],
    target_kcal: whole(form.target_kcal),
    target_protein_g: whole(form.target_protein_g),
    target_source: form.target_source || "stated",
    is_account_holder: Boolean(form.is_account_holder),
  };
}

/** The p_avoids argument: each avoid with its severity. */
export const avoidsPayload = (form) => (form.avoids ?? []).map(({ key, severity }) => ({ key, severity: severity || defaultSeverityFor(key) }));

/**
 * What stops this member being saved or planned for, in words. Empty when nothing does.
 * @param {object} form
 * @returns {string[]}
 */
export function profileProblems(form) {
  const problems = [];
  if (!String(form.label ?? "").trim()) problems.push("Give them a label, like Me, Wife or Kid 1.");
  if (!AGE_BANDS.some((b) => b.key === form.age_band)) problems.push("Choose their age group.");
  if (!DIET_TYPES.some((d) => d.key === form.diet_type)) problems.push("Choose their diet.");
  if (!isNum(form.target_kcal) && !isNum(form.target_protein_g)) problems.push("Give at least one daily target, or use KOI's suggestion.");
  if (goalsAllowed(form.age_band)) {
    const age = Number(form.age_years);
    if (isNum(form.age_years) && form.age_band === "adult_19_59" && (age < 19 || age > 59)) problems.push("An age between 19 and 59 goes with the Adult group.");
    if (isNum(form.age_years) && form.age_band === "senior_60_plus" && (age < 60 || age > 120)) problems.push("An age of 60 or over goes with the 60 or over group.");
    if (isNum(form.weight_kg) && (Number(form.weight_kg) < 25 || Number(form.weight_kg) > 300)) problems.push("Weight should be between 25 and 300 kg.");
    if (isNum(form.height_cm) && (Number(form.height_cm) < 100 || Number(form.height_cm) > 250)) problems.push("Height should be between 100 and 250 cm.");
  }
  return problems;
}

/** One line about a member: "Adult (19–59) · Vegetarian · Lose weight, high protein · 1,900 kcal · 150 g protein". */
export function profileSummary(form) {
  const label = (list, key) => list.find((x) => x.key === key)?.label ?? null;
  const goal = goalsAllowed(form.age_band) && (form.energy_goal !== "maintain" || form.eating_pattern !== "balanced")
    ? [form.energy_goal !== "maintain" ? label(ENERGY_GOALS, form.energy_goal) : null, form.eating_pattern !== "balanced" ? label(EATING_PATTERNS, form.eating_pattern)?.toLowerCase() : null].filter(Boolean).join(", ")
    : null;
  return [
    label(AGE_BANDS, form.age_band),
    label(DIET_TYPES, form.diet_type),
    goal,
    isNum(form.target_kcal) ? `${Number(form.target_kcal).toLocaleString("en-IN")} kcal` : null,
    isNum(form.target_protein_g) ? `${form.target_protein_g} g protein` : null,
  ].filter(Boolean).join(" · ");
}

/** Goal setup's goals as a member's energy goal and pattern (00007 goal keys). */
const GOAL_SETUP_GOALS = Object.freeze({
  fatloss: { energy_goal: "lose", eating_pattern: "high_protein" },
  muscle: { energy_goal: "gain", eating_pattern: "high_protein" },
  weight_gain: { energy_goal: "gain", eating_pattern: "balanced" },
  maintenance: { energy_goal: "maintain", eating_pattern: "high_protein" },
  high_protein: { energy_goal: "maintain", eating_pattern: "high_protein" },
});

/**
 * Fill the account holder's member from their own goal setup
 * (goalProfileService.loadGoalProfile). Only what goal setup holds changes;
 * anything it does not know is left as it was.
 *
 * @param {object} form the member form
 * @param {object} setup goal setup's flat profile
 * @returns {object} the form, filled
 */
export function fromGoalSetup(form, setup) {
  if (!setup) return form;
  const next = { ...form, is_account_holder: true };
  const age = Number(setup.age);
  if (isNum(setup.age)) next.age_band = age >= 60 ? "senior_60_plus" : age >= 19 ? "adult_19_59" : form.age_band;
  if (setup.sex === "male" || setup.sex === "female") next.sex = setup.sex;
  else if (setup.sex) next.sex = "unspecified";
  const activity = { sedentary: "sedentary", light: "sedentary", moderate: "moderate", active: "heavy" }[setup.activity];
  if (activity) next.activity_level = activity;
  if (DIET_TYPES.some((d) => d.key === setup.dietType)) next.diet_type = setup.dietType;
  if (goalsAllowed(next.age_band)) {
    Object.assign(next, GOAL_SETUP_GOALS[setup.goal] ?? { energy_goal: "maintain", eating_pattern: "balanced" });
    if (isNum(setup.age)) next.age_years = String(age);
    if (isNum(setup.weightNow)) next.weight_kg = String(setup.weightNow);
    if (isNum(setup.height)) next.height_cm = String(setup.height);
  }
  if (isNum(setup.targets?.kcal)) {
    next.target_kcal = String(setup.targets.kcal);
    next.target_source = "mifflin_st_jeor";
  }
  if (isNum(setup.targets?.protein)) next.target_protein_g = String(setup.targets.protein);
  const held = new Map((form.avoids ?? []).map((a) => [a.key, a]));
  for (const key of setup.foodsAvoid ?? []) {
    if (AVOID_BY_KEY[key] && !held.has(key)) held.set(key, { key, severity: defaultSeverityFor(key) });
  }
  next.avoids = [...held.values()];
  return next;
}
