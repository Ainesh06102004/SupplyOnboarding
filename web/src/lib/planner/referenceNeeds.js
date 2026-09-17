// ============================================================================
// KOI PLANNER — What a person of this age needs, by India's reference figures
//
// Plan §9.10.1. Pure. ICMR-NIN, "Nutrient Requirements for Indians" (2020):
// energy from Table 1a, protein RDA from Table 2a, both read from the NIN's
// brief note (nin.res.in/rdabook/brief_note.pdf).
//
//   * Children's and adolescents' energy assumes moderate daily activity
//     (the table's note c), so their activity is not asked.
//   * Adults are the reference man (65 kg) and woman (55 kg) at sedentary,
//     moderate or heavy work.
//   * ICMR gives no separate energy figure for 60 and over; seniors get the
//     adult figure for their activity (plan §15 item 17).
//   * The note's two tables disagree for 1–3 years: 1,070 kcal in Table 1a,
//     1,110 in Table 1b. 1,070 is used; it is Table 1b's own 83 kcal/kg ×
//     12.9 kg.
//   * With no sex given where the figures differ, the midpoint is used and
//     `note` says so.
//
// These are reference needs for a typical person, and KOI offers them as a
// suggestion the shopper confirms or changes, never as advice for a person.
// ============================================================================

export const REFERENCE_SOURCE = "icmr_nin_2020";

/** kcal/day and protein RDA g/day. Where boys and girls differ: { male, female }. */
const CHILDREN = Object.freeze({
  child_1_3: { kcal: 1070, protein: 12.5 },
  child_4_6: { kcal: 1360, protein: 15.9 },
  child_7_9: { kcal: 1700, protein: 23.3 },
  child_10_12: { kcal: { male: 2220, female: 2060 }, protein: { male: 31.8, female: 32.8 } },
  teen_13_15: { kcal: { male: 2860, female: 2400 }, protein: { male: 44.9, female: 43.2 } },
  teen_16_18: { kcal: { male: 3320, female: 2500 }, protein: { male: 55.4, female: 46.2 } },
});

const ADULT = Object.freeze({
  kcal: {
    sedentary: { male: 2110, female: 1660 },
    moderate: { male: 2710, female: 2130 },
    heavy: { male: 3470, female: 2720 },
  },
  protein: { male: 54.0, female: 45.7 },
});

/**
 * Activity against ICMR's three levels of work: a household member's own
 * activity_level is already one of them (00044); goal setup's keys map across.
 */
const WORK_FOR_ACTIVITY = Object.freeze({ sedentary: "sedentary", light: "sedentary", moderate: "moderate", heavy: "heavy", active: "heavy" });

const ADULT_BANDS = Object.freeze(["adult_19_59", "senior_60_plus"]);

const pick = (value, sex) => {
  if (typeof value === "number") return { value, midpoint: false };
  if (sex === "male" || sex === "female") return { value: value[sex], midpoint: false };
  return { value: (value.male + value.female) / 2, midpoint: true };
};

/**
 * Reference daily energy and protein for an age band.
 *
 * @param {object} input
 * @param {string} input.ageBand a household_member age band
 * @param {"male"|"female"|null} [input.sex]
 * @param {"sedentary"|"moderate"|"heavy"|"light"|"active"|null} [input.activity] adults only; sedentary when absent
 * @returns {{ kcal: number, protein: number, source: string, note: string|null }|null}
 */
export function referenceNeeds({ ageBand, sex = null, activity = null }) {
  let kcal;
  let protein;
  if (CHILDREN[ageBand]) {
    kcal = pick(CHILDREN[ageBand].kcal, sex);
    protein = pick(CHILDREN[ageBand].protein, sex);
  } else if (ADULT_BANDS.includes(ageBand)) {
    const work = WORK_FOR_ACTIVITY[activity] ?? "sedentary";
    kcal = pick(ADULT.kcal[work], sex);
    protein = pick(ADULT.protein, sex);
  } else {
    return null;
  }
  const midpoint = kcal.midpoint || protein.midpoint;
  return {
    kcal: Math.round(kcal.value / 10) * 10,
    protein: Math.round(protein.value * 10) / 10,
    source: REFERENCE_SOURCE,
    note: midpoint ? "Midway between the figures for boys and girls, or men and women: sex was not given." : null,
  };
}
