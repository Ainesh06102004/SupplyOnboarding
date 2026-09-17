// ============================================================================
// KOI PLANNER — A household, drafted from what the shopper wrote
//
// Phase 4.2. Pure. "We're four, two adults and two kids, 120 g protein each for
// the adults" becomes a DRAFT of the /store/plan form: people, their targets,
// what they avoid, the days and the budget. Nothing is solved from a draft.
// The shopper checks it, edits it, and presses "Plan it" — that is the
// confirmation, and it is the only thing that saves or plans.
//
// Two readers, one rule. draftFromBrief reads the sentence with rules and
// always answers. A model may read it too (briefModel.js), and its reading is
// used only after groundModelDraft has held it to the sentence:
//
//   - every number (how many people, grams of protein, kcal, rupees, days)
//     must be one the shopper wrote. A model never supplies a nutrition value.
//   - an age group is kept only if the words or an age written say so. "Two
//     kids" has no age, so the draft asks rather than guesses.
//   - a diet is kept only if the sentence names it. An unnamed diet is left for
//     the shopper to choose, never defaulted: a blank diet excludes nothing.
//   - anything to avoid is put on EVERYONE, whoever it was said about. The
//     planner already removes a product any member cannot eat for the whole
//     household (model.js), so this costs the plan nothing, and a restriction
//     attributed to the wrong person can never be lost.
//
// Labels are roles and numbers ("Adult 1", "Kid 2"), never names: KOI stores
// no names (migration 00044), so it does not copy one out of a sentence either.
// ============================================================================

import { z } from "zod";
import { DIET_TYPES } from "@/lib/recommendation/config";
import { DIET_KEYS, AVOID_KEYS } from "@/lib/ai/intent/schema";
import { interpret } from "@/lib/ai/intent";
import { normalise } from "@/lib/ai/intent/deterministic";
import { numbersIn } from "@/lib/ai/intent/merge";
import { nullableEnum, nullableNumber, enumArray, strictObject } from "@/lib/ai/providers/openaiFormat";

export const AGE_BANDS = Object.freeze([
  { key: "adult_19_59", label: "Adult (19–59)", min: 19, max: 59 },
  { key: "senior_60_plus", label: "60 or over", min: 60, max: 120 },
  { key: "teen_16_18", label: "Teen (16–18)", min: 16, max: 18 },
  { key: "teen_13_15", label: "Teen (13–15)", min: 13, max: 15 },
  { key: "child_10_12", label: "Child (10–12)", min: 10, max: 12 },
  { key: "child_7_9", label: "Child (7–9)", min: 7, max: 9 },
  { key: "child_4_6", label: "Child (4–6)", min: 4, max: 6 },
  { key: "child_1_3", label: "Child (1–3)", min: 1, max: 3 },
]);
export const AGE_BAND_KEYS = Object.freeze(AGE_BANDS.map((b) => b.key));

export const MAX_BRIEF_CHARS = 600;
export const MAX_MEMBERS = 12;
export const MAX_DAYS = 14;

/** What each kind of person is called in a draft, the words that name them, and the age group those words alone establish. */
export const ROLES = Object.freeze({
  adult: { label: "Adult", plural: "adults?|grown ups?|grownups?", singular: "wife|husband|partner|spouse", ageBand: "adult_19_59" },
  senior: { label: "Senior", plural: "seniors?|grandparents?|grandmothers?|grandfathers?|grandmas?|grandpas?|elderly", singular: "grandmother|grandfather|grandma|grandpa|nani|dadi|nana|dada", ageBand: "senior_60_plus" },
  teen: { label: "Teen", plural: "teens?|teenagers?", singular: "teen|teenager", ageBand: null },
  child: { label: "Kid", plural: "kids?|children|child|sons?|daughters?|toddlers?|babies|baby", singular: "kid|child|son|daughter|toddler|baby", ageBand: null },
  person: { label: "Person", plural: "", singular: "", ageBand: null },
});
const ROLE_KEYS = Object.freeze(Object.keys(ROLES));

const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
});
const COUNT = `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})`;
const toCount = (s) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s] ?? null);

// Diet words, most specific first: "non veg" must not read as "veg".
const DIET_WORDS = Object.freeze([
  ["non_vegetarian", /\bnon ?veg(etarian)?\b/],
  ["eggetarian", /\beggetarian\b/],
  ["pescatarian", /\bpescatarian\b/],
  ["vegan", /\bvegan\b/],
  ["jain", /\bjain\b/],
  ["vegetarian", /(?<!non )\bveg(etarian)?\b/],
]);

/** An age written about someone: "aged 8", "8 years", "14 year old", "who is 6". Capture 1 or 2. */
const AGE = String.raw`\b(?:aged?|age|who is|who s|is)\s*(\d{1,2})\b(?!\s*(?:g\b|gm|grams?|kcal|cal|days?|people))|\b(\d{1,2})\s*(?:years?|yrs?|y o|yo)\b`;

/** The age band an age falls in, or null. */
const bandForAge = (age) => AGE_BANDS.find((b) => age >= b.min && age <= b.max) ?? null;

const rolesIn = (clause) =>
  ROLE_KEYS.filter((r) => ROLES[r].plural && new RegExp(`\\b(${ROLES[r].plural}|${ROLES[r].singular})\\b`).test(clause));

/** Diet keys the sentence names. */
export function dietsNamed(text) {
  let rest = ` ${normalise(text)} `;
  const found = [];
  for (const [key, pattern] of DIET_WORDS) {
    if (pattern.test(rest)) {
      found.push(key);
      rest = rest.replace(new RegExp(pattern.source, "g"), " ");
    }
  }
  return found;
}

/** Numbers the shopper wrote, including counting words ("two kids"). */
function statedNumbers(text) {
  const stated = numbersIn(text);
  for (const word of normalise(text).split(" ")) if (NUMBER_WORDS[word]) stated.add(NUMBER_WORDS[word]);
  return stated;
}

/** Days the sentence asks for, if any. */
export function daysIn(text) {
  const t = normalise(text);
  const n = t.match(/\b(\d+)\s*days?\b/);
  if (n) return Math.min(MAX_DAYS, Math.max(1, Number(n[1])));
  if (/\bfortnight\b|\b(two|2)\s*weeks?\b/.test(t)) return 14;
  if (/\bweek(ly)?\b/.test(t)) return 7;
  return null;
}

/** Rupees the sentence sets as a budget, if any. */
export function budgetIn(text) {
  const t = normalise(text).replace(/(\d),(?=\d{2,3}\b)/g, "$1");
  const unit = String.raw`(?!\s*(?:kcal|cal|calories|g\b|gm|grams?|kg|days?|weeks?|months?|years?|yrs?|people|kids|adults))`;
  const patterns = [
    new RegExp(String.raw`\b(?:budget|spend|spending|within|under|upto|up to|max|maximum)\s*(?:of|is|around|about)?\s*(?:rs|inr)?\s*(\d+(?:\.\d+)?)\s*(k\b)?${unit}`),
    new RegExp(String.raw`\brs\s*(\d+(?:\.\d+)?)\s*(k\b)?`),
  ];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) return Number(m[1]) * (m[2] ? 1000 : 1);
  }
  return null;
}

/**
 * Split into clauses: sentences, dashes, brackets and commas (before cleaning
 * the text, which would erase a dash and run "of 5 - grandparents" together),
 * then "and" before a new count or person.
 */
function clausesOf(text) {
  return String(text ?? "")
    .split(/[.;:()\n]|\s[-–—]\s|,(?!\d)/)
    .flatMap((part) => normalise(part).split(/\band\b(?=\s+(?:\d|one|two|three|four|five|six|a|an|my|our|the|he|she|i)\b)/))
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Read a household brief with rules. Always answers; may answer "nobody".
 *
 * @param {string} input
 * @returns {{ groups: Array, days: number|null, budget: number|null, avoidKeys: string[], unresolved: string[] }}
 */
export function readBrief(input) {
  const text = normalise(input);
  const clauses = clausesOf(input);
  const groups = [];

  // People, clause by clause, so what a clause says about age sticks to the people it names.
  const found = clauses.map((clause) => {
    const here = [];
    const couple = clause.match(new RegExp(`\\b(?:us|we)\\s+${COUNT}\\b|\\b(?:both|the two) of us\\b`));
    if (couple) here.push({ role: "adult", count: couple[1] ? toCount(couple[1]) : 2, us: true });
    for (const role of ROLE_KEYS.filter((r) => ROLES[r].plural)) {
      const { plural, singular } = ROLES[role];
      for (const m of clause.matchAll(new RegExp(`\\b${COUNT}\\s+(?:${plural})\\b`, "g"))) {
        const count = toCount(m[1]);
        if (count) here.push({ role, count });
      }
      const single = new RegExp(`\\b(?:a|an|my|our)\\s+(?:\\d{1,2}\\s*(?:years?|yrs?)\\s*old\\s+)?(?:${singular})\\b`, "g");
      for (let i = 0, n = [...clause.matchAll(single)].length; i < n; i++) here.push({ role, count: 1, singular: true });
    }
    const age = clause.match(new RegExp(AGE));
    const band = age ? bandForAge(Number(age[1] ?? age[2])) : null;
    if (band) here.forEach((g) => { g.ageBand = band.key; });
    groups.push(...here);
    return here;
  });
  // "Me and my husband": the speaker is a person too, unless "two adults" or "us two" already counted them.
  const me = /\bme\b|\bmyself\b/.test(text) && !groups.some((g) => g.role === "adult" && !g.singular)
    ? { role: "adult", count: 1, me: true }
    : null;
  if (me) groups.unshift(me);

  // "We're four" with fewer people named: the rest are people of unknown age,
  // or of the one kind the sentence names without counting ("grandparents").
  const total = text.match(new RegExp(`\\b(?:we re|we are|family of|household of|there are)\\s+${COUNT}\\b|\\b${COUNT}\\s+(?:people|of us|members|persons)\\b`));
  const said = total ? toCount(total[1] ?? total[2]) : null;
  const named = groups.reduce((sum, g) => sum + g.count, 0);
  if (said && said > named) {
    const uncounted = rolesIn(text).filter((r) => !groups.some((g) => g.role === r));
    const role = uncounted.length === 1 ? uncounted[0] : "person";
    groups.push({ role, count: said - named, ageBand: ROLES[role].ageBand });
  }

  // Targets and diets go to the people named in the same clause; else the
  // speaker, when the clause is in the first person ("I need 70 g"); else the
  // kinds of people it mentions ("for the adults"); else everyone.
  clauses.forEach((clause, i) => {
    const roles = rolesIn(clause);
    const firstPerson = me && /\b(i|i m|i am|my|for me)\b/.test(clause) && !roles.length;
    const targets = found[i].length ? found[i]
      : firstPerson ? [me]
      : groups.filter((g) => !roles.length || roles.includes(g.role));
    const applyTo = (patch) => targets.forEach((g) => Object.assign(g, patch));
    const protein = clause.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\s*(?:of\s+)?protein/) || clause.match(/protein\s*(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\b/);
    if (protein) applyTo({ proteinG: Number(protein[1]) });
    const kcal = clause.match(/(\d{3,4})\s*(?:kcal|calories|cals?)\b/);
    if (kcal) applyTo({ kcal: Number(kcal[1]) });
    const [diet] = dietsNamed(clause);
    if (diet) applyTo({ dietType: diet });
  });

  const reading = interpret(input);
  return {
    groups: groups.slice(0, MAX_MEMBERS),
    days: daysIn(input),
    budget: budgetIn(input),
    avoidKeys: reading.profile.foodsAvoid,
    unresolved: reading.unresolved,
  };
}

// ── The model's reading ──────────────────────────────────────────────────────

export const BRIEF_SCHEMA_NAME = "koi_household_brief";

export const BRIEF_JSON_SCHEMA = Object.freeze(strictObject({
  groups: {
    type: "array",
    items: strictObject({
      role: { type: "string", enum: [...ROLE_KEYS] },
      count: { type: "integer" },
      ageBand: nullableEnum(AGE_BAND_KEYS),
      dietType: nullableEnum(DIET_KEYS),
      avoidKeys: enumArray(AVOID_KEYS),
      proteinG: nullableNumber(),
      kcal: nullableNumber(),
    }),
  },
  days: { type: ["integer", "null"] },
  budget: nullableNumber(),
  unresolved: { type: "array", items: { type: "string" } },
}));

export const BRIEF_INSTRUCTIONS = [
  "You read one message in which a shopper describes who they are buying food for, and return the household as groups of people, using only the keys below.",
  "",
  "Rules:",
  "- One group per kind of person the message distinguishes (for example two adults, then two kids). count is how many people are in that group.",
  "- Never invent a number. count above 1, proteinG (grams of protein a day each), kcal (energy a day each), budget (rupees for the whole period) and days are set only to numbers the message contains. Otherwise null.",
  "- The person writing (\"me\", \"I\") and a husband, wife or partner are adults unless an age says otherwise.",
  "- ageBand only when the message says it: adults are adult_19_59, grandparents or seniors are senior_60_plus, and a child or teen gets the band containing an age written in the message. Otherwise null.",
  "- dietType only when the message names a diet. A diet said of the whole family or of \"all\" applies to every group. Otherwise null. Never assume vegetarian.",
  "- avoidKeys: what that group must not eat, from the list. Something to avoid with no key goes in unresolved, copied word for word.",
  "- A medical condition is never a diet or a target. Copy its words into unresolved.",
  "- days: 7 for a week, 14 for a fortnight, or the number of days written. Null if not said.",
  "",
  `role: ${ROLE_KEYS.join("; ")}`,
  `ageBand: ${AGE_BANDS.map((b) => `${b.key} (${b.label})`).join("; ")}`,
  `dietType: ${DIET_TYPES.map((d) => `${d.key} (${d.label})`).join("; ")}`,
  `avoidKeys: ${AVOID_KEYS.join("; ")}`,
].join("\n");

const ModelDraftSchema = z.object({
  groups: z.array(z.object({
    role: z.enum([...ROLE_KEYS]),
    count: z.number().int().min(1).max(MAX_MEMBERS),
    ageBand: z.enum([...AGE_BAND_KEYS]).nullable(),
    dietType: z.enum([...DIET_KEYS]).nullable(),
    avoidKeys: z.array(z.enum([...AVOID_KEYS])),
    proteinG: z.number().min(1).max(400).nullable(),
    kcal: z.number().min(200).max(6000).nullable(),
  })).max(MAX_MEMBERS),
  days: z.number().int().min(1).max(MAX_DAYS).nullable(),
  budget: z.number().positive().max(1000000).nullable(),
  unresolved: z.array(z.string().max(60)).max(8),
});

/**
 * A model's reading of a brief, held to the brief. null when it cannot be used.
 *
 * @param {unknown} raw
 * @param {string} input the shopper's message
 * @returns {{ groups, days, budget, avoidKeys, unresolved }|null}
 */
export function groundModelDraft(raw, input) {
  const parsed = ModelDraftSchema.safeParse(raw);
  if (!parsed.success) return null;
  const draft = parsed.data;
  const stated = statedNumbers(input);
  const text = ` ${normalise(input)} `;
  const diets = new Set(dietsNamed(input));

  // A head count the shopper did not write would add or lose a person: refuse the whole reading.
  if (draft.groups.some((g) => g.count > 1 && !stated.has(g.count))) return null;
  if (draft.groups.reduce((sum, g) => sum + g.count, 0) > MAX_MEMBERS) return null;

  // Ages written in the message, read the same way readBrief reads them.
  const ages = [...text.matchAll(new RegExp(AGE, "g"))].map((m) => Number(m[1] ?? m[2]));
  const bandAllowed = (band, role) => {
    if (!band) return false;
    if (band === ROLES[role]?.ageBand) return true;
    return ages.some((age) => bandForAge(age)?.key === band);
  };
  const weekWords = /\bfortnight\b|\b(two|2)\s*weeks?\b/.test(text) ? 14 : /\bweek(ly)?\b/.test(text) ? 7 : null;

  return {
    groups: draft.groups.map((g) => ({
      role: g.role,
      count: g.count,
      ageBand: bandAllowed(g.ageBand, g.role) ? g.ageBand : ROLES[g.role].ageBand,
      dietType: g.dietType && diets.has(g.dietType) ? g.dietType : null,
      proteinG: g.proteinG !== null && stated.has(g.proteinG) ? g.proteinG : null,
      kcal: g.kcal !== null && stated.has(g.kcal) ? g.kcal : null,
      avoidKeys: g.avoidKeys,
    })),
    days: draft.days !== null && (stated.has(draft.days) || draft.days === weekWords) ? draft.days : null,
    budget: draft.budget !== null && numbersIn(input).has(draft.budget) ? draft.budget : null,
    avoidKeys: [...new Set(draft.groups.flatMap((g) => g.avoidKeys))],
    unresolved: draft.unresolved.filter((w) => w.trim() && text.includes(` ${normalise(w)} `)),
  };
}

/**
 * The draft the form shows: people with labels, and everything a reading found.
 *
 * @param {object} local readBrief's reading
 * @param {object|null} model groundModelDraft's reading, or null
 * @returns {{ members: Array, days: number|null, budget: number|null, unresolved: string[], source: string, notes: string[] }}
 */
export function draftFrom(local, model = null) {
  const useModel = Boolean(model?.groups?.length);
  const reading = useModel ? model : local;
  // A diet the rules read for the whole household ("Jain family") fills a gap the model left.
  const localDiets = new Set((local.groups ?? []).map((g) => g.dietType ?? null));
  const householdDiet = localDiets.size === 1 ? [...localDiets][0] : null;
  // Everything anyone must avoid applies to everyone (see the banner).
  const avoidKeys = [...new Set([...(local.avoidKeys ?? []), ...(model?.avoidKeys ?? [])])];

  const counters = {};
  const members = [];
  for (const group of reading.groups) {
    for (let i = 0; i < group.count && members.length < MAX_MEMBERS; i++) {
      const role = ROLES[group.role] ? group.role : "person";
      const isMe = group.me && i === 0;
      if (!isMe) counters[role] = (counters[role] ?? 0) + 1;
      members.push({
        label: isMe ? "Me" : `${ROLES[role].label} ${counters[role]}`,
        age_band: group.ageBand ?? ROLES[role].ageBand ?? "",
        diet_type: group.dietType ?? householdDiet ?? "",
        target_protein_g: group.proteinG ?? "",
        target_kcal: group.kcal ?? "",
        avoidKeys: [...avoidKeys],
      });
    }
  }

  const notes = [];
  if (!members.length) notes.push("KOI could not tell who is eating. Add each person below.");
  if (members.some((m) => !m.age_band)) notes.push("Choose an age group where it says so: KOI does not guess ages.");
  if (members.some((m) => !m.diet_type)) notes.push("Choose a diet where it says so: KOI does not assume one.");
  if (members.some((m) => m.target_protein_g === "" && m.target_kcal === "")) notes.push("Give everyone at least one target a day. KOI does not set targets for you.");
  if (avoidKeys.length) notes.push("What to avoid is on everyone, because the plan leaves out anything one person cannot eat.");

  return {
    members,
    days: reading.days ?? local.days ?? null,
    budget: reading.budget ?? local.budget ?? null,
    unresolved: [...new Set([...(local.unresolved ?? []), ...(model?.unresolved ?? [])])],
    source: useModel ? "openai" : "rules",
    notes,
  };
}
