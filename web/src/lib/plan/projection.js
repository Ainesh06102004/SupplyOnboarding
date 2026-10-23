// ============================================================================
// The You step's "journey": energy-balance arithmetic, shown as arithmetic.
// Pure.
//
// The design promised "we predict your results down to the kilo" and a
// "probability of success". KOI can do neither honestly, so it does the one
// thing it can: take the maintenance figure goals.js already computes
// (Mifflin–St Jeor × activity), the member's daily target, and the standard
// approximation that about 7,700 kcal is one kilogram of body weight, and say
// what that gap works out to — with the assumption written next to it.
//
// It is only shown for an adult with age, height and weight: without them the
// maintenance figure is a population reference (ICMR-NIN), not theirs.
// ============================================================================

import { goalsAllowed, suggestTargets } from "@/lib/planner/goals";

/** kcal per kg of body weight, the standard energy-balance approximation. */
export const KCAL_PER_KG = 7700;
/** Beyond two years the line means nothing; say so instead of drawing it. */
const MAX_WEEKS = 104;

export const PROJECTION_ASSUMPTION =
  "Arithmetic, not a prediction: about 7,700 kcal is taken as 1 kg of body weight. Real change is rarely a straight line — water, how closely the plan is followed, and the body adapting all move it.";

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

function inputsOf(form) {
  return {
    ageBand: form.age_band,
    sex: form.sex || null,
    activity: form.activity_level || null,
    ageYears: isNum(form.age_years) ? Number(form.age_years) : null,
    weightKg: isNum(form.weight_kg) ? Number(form.weight_kg) : null,
    heightCm: isNum(form.height_cm) ? Number(form.height_cm) : null,
  };
}

/**
 * The daily figures for a member: maintenance, the target (stated, else
 * suggested), and the suggestion's basis. null when KOI has nothing to go on.
 * @param {object} form a profile form (lib/household/profile.js)
 */
export function dailyFigures(form = {}) {
  const inputs = inputsOf(form);
  const suggested = suggestTargets({ ...inputs, energyGoal: form.energy_goal || "maintain", eatingPattern: form.eating_pattern || "balanced" });
  const maintenance = goalsAllowed(form.age_band)
    ? suggestTargets({ ...inputs, energyGoal: "maintain", eatingPattern: form.eating_pattern || "balanced" })
    : suggested;
  if (!suggested) return null;
  const kcal = isNum(form.target_kcal) ? Number(form.target_kcal) : suggested.kcal;
  const protein = isNum(form.target_protein_g) ? Number(form.target_protein_g) : suggested.protein;
  // "Stated" is the shopper's own figure; a stored suggestion (mifflin_st_jeor,
  // icmr_nin_2020) is still KOI's, even though it has a value.
  const stated = form.target_source === "stated";
  // Carbs and fat exist only as the person's own numbers: KOI suggests neither.
  const carbs = stated && isNum(form.target_carbs_g) ? Number(form.target_carbs_g) : null;
  const fat = stated && isNum(form.target_fat_g) ? Number(form.target_fat_g) : null;
  return {
    maintenance: maintenance?.kcal ?? null,
    maintenanceSource: maintenance?.source ?? null,
    kcal,
    protein,
    carbs,
    fat,
    kcalStated: stated && isNum(form.target_kcal),
    proteinStated: stated && isNum(form.target_protein_g),
    macrosStated: carbs !== null && fat !== null,
    suggested,
    gap: isNum(maintenance?.kcal) && isNum(kcal) ? Math.round(maintenance.kcal - kcal) : null,
  };
}

/**
 * Do four stated numbers add up? Energy from macros is protein × 4 + carbs × 4
 * + fat × 9 (Atwater); within 1% or 25 kcal of the calories they typed counts.
 * @param {{ kcal: number, protein: number, carbs: number, fat: number }} t
 * @returns {{ fromMacros: number, diff: number, adds: boolean, fitCarbs: number }}
 *   fitCarbs is the carbs that would make it add up, holding protein and fat.
 */
export function macroCheck({ kcal, protein, carbs, fat }) {
  const fromMacros = Math.round(protein * 4 + carbs * 4 + fat * 9);
  const diff = fromMacros - Math.round(kcal);
  return {
    fromMacros,
    diff,
    adds: Math.abs(diff) <= Math.max(25, kcal * 0.01),
    fitCarbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)),
  };
}

/**
 * Carb cycling: training days get more carbs, rest days fewer, the week's total
 * unchanged. The swing is 20% of the day's carbs on training days, rounded to 5 g.
 * @param {{ kcal: number, carbs: number }} t
 * @param {number} trainingDays 1–6 of 7
 * @returns {{ training: {kcal, carbs}, rest: {kcal, carbs} }|null}
 */
export function carbCycle({ kcal, carbs }, trainingDays) {
  const n = Math.round(Number(trainingDays));
  if (!(n >= 1 && n <= 6) || !(carbs > 0)) return null;
  const up = Math.round((carbs * 0.2) / 5) * 5;
  const down = Math.round((up * n) / (7 - n));
  if (down >= carbs) return null;
  return {
    training: { kcal: Math.round(kcal + up * 4), carbs: carbs + up },
    rest: { kcal: Math.round(kcal - down * 4), carbs: carbs - down },
  };
}

/**
 * @param {object} form a profile form
 * @param {{ today?: Date }} [options]
 * @returns {null | {
 *   maintenance, target, gap, kgPerWeek, weight, goalWeight, weeks, reachDate,
 *   direction: "down"|"up"|"hold", points: {week, kg}[], note: string|null, assumption: string
 * }}
 */
export function projection(form = {}, { today = new Date() } = {}) {
  if (!goalsAllowed(form.age_band)) return null;
  const inputs = inputsOf(form);
  if (!inputs.weightKg || !inputs.heightCm || !inputs.ageYears) return null;
  const figures = dailyFigures(form);
  // Only the person's own maintenance figure makes this their line.
  if (!figures || figures.maintenanceSource !== "mifflin_st_jeor" || !isNum(figures.kcal)) return null;

  const gap = figures.gap; // positive: eating under maintenance
  const kgPerWeek = round2((gap * 7) / KCAL_PER_KG);
  const weight = inputs.weightKg;
  const goalWeight = isNum(form.target_weight_kg) ? Number(form.target_weight_kg) : null;
  const direction = kgPerWeek > 0.01 ? "down" : kgPerWeek < -0.01 ? "up" : "hold";

  let weeks = null;
  let note = null;
  if (goalWeight !== null) {
    const toGo = weight - goalWeight; // positive: to lose
    if (Math.abs(toGo) < 0.1) note = "You're at your target weight.";
    else if (direction === "hold") note = "At maintenance calories the arithmetic doesn't move your weight.";
    else if ((toGo > 0) !== (direction === "down")) note = direction === "down"
      ? "Your target is above your weight, but this target eats under maintenance."
      : "Your target is below your weight, but this target eats over maintenance.";
    else {
      const w = Math.ceil(Math.abs(toGo) / Math.abs(kgPerWeek));
      if (w > MAX_WEEKS) note = "More than two years at this rate.";
      else weeks = w;
    }
  }

  // Seven points along the line, to the target if there is one, else 12 weeks.
  const span = weeks ?? 12;
  const points = Array.from({ length: 7 }, (_, i) => {
    const week = Math.round((span * i) / 6);
    const kg = weeks !== null && i === 6 ? goalWeight : round1(weight - kgPerWeek * week);
    return { week, kg };
  });

  const reachDate = weeks !== null ? new Date(today.getTime() + weeks * 7 * 86400000).toISOString().slice(0, 10) : null;
  return {
    maintenance: figures.maintenance,
    target: figures.kcal,
    gap,
    kgPerWeek,
    weight,
    goalWeight,
    weeks,
    reachDate,
    direction,
    points,
    note,
    assumption: PROJECTION_ASSUMPTION,
  };
}
