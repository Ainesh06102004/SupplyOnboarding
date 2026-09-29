// ============================================================================
// Agent Mode: when KOI must stop and ask, and the question it asks. Pure.
//
// Enforced inside the tools, not left to the model's judgement: save_people
// and make_plan refuse while any of these is open, and the loop raises the
// card itself.
//
//   R1 who     nobody drafted or saved: "Who's eating?"
//   R2 age     a person with no age group. Never defaulted: every "kid" is
//              asked, because the age group decides what is safe for them.
//   R3 diet    a person with no diet. Never assumed.
//   R4 avoid   an avoid said about no one in particular, in a household of
//              more than one: who is it for?
//
// The question and its options are KOI's (from AGE_BANDS, DIET_TYPES, the
// household's labels), never the model's words.
// ============================================================================

import { AGE_BANDS, dietsNamed } from "@/lib/planner/brief";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { numbersOf } from "./evidence";

export const MAX_QUESTIONS = 4;
const PROFILE_DIETS = DIET_TYPES.filter((d) => !d.forOnePlanOnly);
const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
/** Youngest first: how a parent thinks of a child's age. */
const BANDS_BY_AGE = [...AGE_BANDS].sort((a, b) => a.min - b.min);

const hasBand = (m) => AGE_BANDS.some((b) => b.key === m.age_band);
const hasDiet = (m) => PROFILE_DIETS.some((d) => d.key === m.diet_type);

/**
 * @param {{ members: Array, avoidEveryone?: string[] }|null} draft people drafted and not yet saved
 * @param {{ savedCount: number }} household
 * @returns {Array<{ kind: "who"|"age"|"diet"|"avoid_who", person?: string, about?: string }>}
 */
export function gapsFor(draft, { savedCount = 0 } = {}) {
  const members = draft?.members ?? [];
  if (!members.length) return savedCount ? [] : [{ kind: "who" }];
  const gaps = [];
  for (const m of members) {
    if (!hasBand(m)) gaps.push({ kind: "age", person: m.label });
    if (!hasDiet(m)) gaps.push({ kind: "diet", person: m.label });
  }
  for (const key of draft.avoidEveryone ?? []) if (members.length > 1) gaps.push({ kind: "avoid_who", about: key });
  return gaps;
}

/** A gap that stops a save or a plan: all of them do. */
export const blocking = (gaps) => gaps.length > 0;

/** What the model is told about the gaps: kinds and labels, never values. */
export function gapWords(gaps) {
  if (!gaps.length) return "nothing missing";
  return gaps.map((g) => (g.kind === "who" ? "who is eating" : g.kind === "avoid_who" ? `who a food to avoid is for` : `${g.kind === "age" ? "age group" : "diet"} for ${g.person}`)).join("; ");
}

const option = (key, label, extra = {}) => ({ key, label, ...extra });

/**
 * The ask card for these gaps: at most four questions, the rest asked next time.
 * @param {Array} gaps
 * @param {{ draft?: object }} [context]
 */
export function askCardFor(gaps, { draft = null } = {}) {
  const labels = (draft?.members ?? []).map((m) => m.label);
  // A diet most of the household already has is the likely answer.
  const diets = (draft?.members ?? []).map((m) => m.diet_type).filter((d) => PROFILE_DIETS.some((x) => x.key === d));
  const common = diets.length && diets.every((d) => d === diets[0]) ? diets[0] : null;
  const questions = gaps.slice(0, MAX_QUESTIONS).map((g) => {
    if (g.kind === "who") {
      return { id: "who", kind: "text", header: "Who's eating", question: "Who is KOI planning for?", placeholder: "e.g. me, my wife and our two kids", options: [] };
    }
    if (g.kind === "age") {
      return { id: `age:${g.person}`, kind: "single", header: "Age group", person: g.person, question: `How old is ${g.person}?`, allowOther: true, otherHint: "Or type their age", options: BANDS_BY_AGE.map((b) => option(b.key, b.label)) };
    }
    if (g.kind === "diet") {
      return { id: `diet:${g.person}`, kind: "single", header: "Diet", person: g.person, question: `What does ${g.person} eat?`, allowOther: false, options: PROFILE_DIETS.map((d) => option(d.key, d.label, d.key === common ? { recommended: true } : {})) };
    }
    const avoid = AVOID_BY_KEY[g.about];
    const allergen = avoid?.kind === "allergen";
    return {
      id: `avoid_who:${g.about}`,
      kind: "multi",
      header: "Who avoids it",
      about: g.about,
      question: `Who should ${avoid?.label ?? g.about} be kept away from?`,
      options: [option("everyone", "Everyone", allergen ? { recommended: true } : {}), ...labels.map((l) => option(`person:${l}`, l))],
    };
  });
  return { kind: "ask", title: questions.length > 1 ? "A couple of quick things" : "One quick thing", questions };
}

/** Age groups said in words: "middle teens", "late teens", "a toddler", "over sixty". */
const BAND_WORDS = Object.freeze([
  ["teen_16_18", /\blate[- ]?teens?\b|\b(sixteen|seventeen|eighteen)\b/],
  ["teen_13_15", /\b(early|mid|middle)[- ]?teens?\b|\b(thirteen|fourteen|fifteen)\b/],
  ["child_10_12", /\bpre[- ]?teens?\b|\btweens?\b/],
  ["child_1_3", /\btoddlers?\b/],
  ["senior_60_plus", /\b(senior|elderly|retired|over sixty|sixty plus|60\s*\+|over 60)\b/],
  ["adult_19_59", /\b(an adult|grown[- ]?up|adult now)\b/],
]);

/**
 * Every age group a message states, for a message about several people ("son
 * is 10, my mother 67"): each number that could be an age, and age words.
 */
export function bandsNamed(text) {
  const bands = new Set();
  for (const n of numbersOf(text)) {
    const band = n >= 1 && n <= 120 ? AGE_BANDS.find((b) => n >= b.min && n <= b.max)?.key : null;
    if (band) bands.add(band);
  }
  const said = String(text ?? "").toLowerCase();
  for (const [band, re] of BAND_WORDS) if (re.test(said)) bands.add(band);
  return bands;
}

/** An age typed as a number ("8", "she's 8") or an age group in words → its age group. */
export function bandForAge(text) {
  const n = numbersOf(text).find((x) => x >= 1 && x <= 120);
  if (n) return AGE_BANDS.find((b) => n >= b.min && n <= b.max)?.key ?? null;
  const said = String(text ?? "").toLowerCase();
  return BAND_WORDS.find(([, re]) => re.test(said))?.[0] ?? null;
}

// ── The You step's details, asked of adults ────────────────────────────────
// Not needed to plan (KOI falls back to ICMR-NIN's tables), so never blocking
// and always skippable, but asked once for each adult: they are what make a
// person's targets theirs (Mifflin–St Jeor needs age, sex, height, weight).
const ADULT = new Set(["adult_19_59", "senior_60_plus"]);
const SEX_OPTIONS = [{ key: "female", label: "Female" }, { key: "male", label: "Male" }, { key: "unspecified", label: "Prefer not to say" }];
const ACTIVITY_OPTIONS = [
  { key: "sedentary", label: "Mostly sitting" },
  { key: "light", label: "Light exercise, a few days a week" },
  { key: "moderate", label: "On their feet, or exercises most days" },
  { key: "heavy", label: "Physical work, or trains hard" },
];
const GOAL_OPTIONS = [{ key: "maintain", label: "Stay as they are" }, { key: "lose", label: "Lose weight" }, { key: "gain", label: "Gain / build muscle" }];
const NUMBER_FIELDS = Object.freeze({
  age_years: { header: "Age", question: "Age in years", unit: "years", min: 19, max: 120 },
  height_cm: { header: "Height", question: "Height", unit: "cm", min: 100, max: 250 },
  weight_kg: { header: "Weight", question: "Weight", unit: "kg", min: 25, max: 300, step: 0.1 },
});
const blank = (v) => v === null || v === undefined || v === "";

/** What an adult hasn't said yet, of the You step's details. */
export function missingDetails(person) {
  if (!ADULT.has(person?.age_band)) return [];
  const out = [];
  if (blank(person.sex)) out.push("sex");
  for (const f of Object.keys(NUMBER_FIELDS)) if (blank(person[f])) out.push(f);
  if (blank(person.activity_level)) out.push("activity_level");
  if (blank(person.energy_goal) || (person.energy_goal === "maintain" && !person.goalAsked)) out.push("energy_goal");
  return out;
}

/**
 * The card that asks one adult for their details. Optional: "Skip" answers nothing.
 * @param {{ label, age_band, ... }} person
 * @param {{ saved?: boolean }} [opts] saved: the answers become a save (with approval), not a draft
 */
export function detailsCardFor(person, { saved = false, fields = null } = {}) {
  const want = fields ?? missingDetails(person);
  const questions = want.map((f) => {
    if (NUMBER_FIELDS[f]) return { id: `${f}:${person.label}`, kind: "number", person: person.label, field: f, ...NUMBER_FIELDS[f], options: [] };
    if (f === "sex") return { id: `sex:${person.label}`, kind: "single", person: person.label, field: f, header: "Sex", question: "Sex (for the energy estimate)", options: SEX_OPTIONS };
    if (f === "activity_level") return { id: `activity_level:${person.label}`, kind: "single", person: person.label, field: f, header: "Activity", question: "How active are they?", options: ACTIVITY_OPTIONS };
    return { id: `energy_goal:${person.label}`, kind: "single", person: person.label, field: "energy_goal", header: "Goal", question: "What are they working towards?", options: GOAL_OPTIONS.map((o) => (o.key === "maintain" ? { ...o, recommended: true } : o)) };
  });
  return { kind: "details", person: person.label, saved, optional: true, title: `About ${person.label}`, note: "Optional. It makes their daily targets theirs rather than a table's. Skip anything.", questions };
}

/** The details the shopper gave on a details card, as profile fields. Only in range; nothing guessed. */
export function detailsFrom(card, answers = {}) {
  const out = {};
  const typed = [];
  for (const q of card?.questions ?? []) {
    const a = answers?.[q.id];
    if (!a) continue;
    if (q.kind === "number") {
      const n = Number(a.value ?? a.other);
      if (Number.isFinite(n) && n >= q.min && n <= q.max) {
        out[q.field] = q.step ? Math.round(n * 10) / 10 : Math.round(n);
        typed.push(`${q.header} ${out[q.field]} ${q.unit}`);
      }
    } else if (q.options.some((o) => o.key === a.option)) {
      out[q.field] = a.option;
      typed.push(`${q.header}: ${q.options.find((o) => o.key === a.option).label}`);
    }
  }
  return { fields: out, typed };
}

/** The next thing to ask while setting people up: blocking gaps first, then each adult's details, once. */
export function nextAskFor(draft, { savedCount = 0, asked = {} } = {}) {
  const gaps = gapsFor(draft, { savedCount });
  if (gaps.length) return { card: askCardFor(gaps, { draft }), gaps };
  for (const m of draft?.members ?? []) {
    if (asked[m.label]) continue;
    if (missingDetails(m).length) return { card: detailsCardFor(m), details: m.label };
  }
  return null;
}

/**
 * Apply the shopper's answers to the draft.
 * @param {object} draft
 * @param {{ questions: Array }} card
 * @param {Record<string, { option?: string, options?: string[], other?: string }>} answers
 * @returns {{ draft: object, typed: string[], who: string|null }} typed: the shopper's own words from "Other", for the evidence
 */
export function applyAnswers(draft, card, answers = {}) {
  let next = draft ? { ...draft, members: (draft.members ?? []).map((m) => ({ ...m })), avoidEveryone: [...(draft.avoidEveryone ?? [])] } : null;
  const typed = [];
  let who = null;
  for (const q of card?.questions ?? []) {
    const a = answers?.[q.id];
    if (!a) continue;
    const other = typeof a.other === "string" ? a.other.trim().slice(0, 200) : "";
    if (other) typed.push(other);
    if (q.kind === "text") { who = other || null; continue; }
    if (!next) continue;
    const person = next.members.find((m) => m.label === q.person);
    if (q.id.startsWith("age:") && person) {
      const band = q.options.some((o) => o.key === a.option) ? a.option : bandForAge(other);
      if (band) person.age_band = band;
    } else if (q.id.startsWith("diet:") && person) {
      const diet = q.options.some((o) => o.key === a.option) ? a.option : dietsNamed(other).find((d) => PROFILE_DIETS.some((x) => x.key === d));
      if (diet) person.diet_type = diet;
    } else if (q.id.startsWith("avoid_who:")) {
      const chosen = (a.options ?? (a.option ? [a.option] : [])).filter((k) => q.options.some((o) => o.key === k));
      if (!chosen.length) continue;
      const everyone = chosen.includes("everyone");
      const forLabels = new Set(chosen.filter((k) => k.startsWith("person:")).map((k) => k.slice(7)));
      for (const m of next.members) {
        const keys = new Set(m.avoidKeys ?? []);
        if (everyone || forLabels.has(m.label)) keys.add(q.about);
        else keys.delete(q.about);
        m.avoidKeys = [...keys];
      }
      next.avoidEveryone = next.avoidEveryone.filter((k) => k !== q.about);
    }
  }
  return { draft: next, typed, who };
}
