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

/** An age typed as a number ("8", "she's 8") → its age group. */
export function bandForAge(text) {
  const n = numbersOf(text).find((x) => x >= 1 && x <= 120);
  if (!n) return null;
  return AGE_BANDS.find((b) => n >= b.min && n <= b.max)?.key ?? null;
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
