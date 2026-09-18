// ============================================================================
// KOI PLANNER — Follow-ups: a sentence that changes a plan
//
// Phase 4.3. Pure. "cheaper", "no paneer on Tuesday", "swap the oats",
// "60 g protein for Kid 1" become changes to a plan's constraints, and the
// plan is solved again (plan.js planFollowUp). What a follow-up can do:
//
//   budget      set to a number the shopper wrote; "cheaper", which is 10%
//               under the current basket and says so; or removed, when the
//               shopper says the budget does not matter
//   days        a number of days, a week or a fortnight
//   leave out   products whose name carries a word the shopper wrote
//   avoid       one of KOI's avoid keys, for the people named or everyone
//   targets     a daily protein or energy target, only at a number written
//
// Everything else is reported, not guessed. KOI plans the whole period as
// one, so "on Tuesday" is said to apply to every day, and "more protein"
// without a number is asked back rather than given a number KOI chose.
//
// Readings are made the same two ways as briefs: rules always, a model
// (followUpModel.js) optionally, held to the sentence by groundFollowUp. The
// model is given the sentence alone, not the household: a person it names is
// copied from the sentence and matched to the plan's labels here.
// ============================================================================

import { z } from "zod";
import { FOODS_AVOID } from "@/lib/recommendation/config";
import { AVOID_KEYS } from "@/lib/ai/intent/schema";
import { interpret } from "@/lib/ai/intent";
import { normalise } from "@/lib/ai/intent/deterministic";
import { numbersIn } from "@/lib/ai/intent/merge";
import { nullableNumber, strictObject } from "@/lib/ai/providers/openaiFormat";
import { budgetIn, MAX_DAYS } from "./brief";
import { avoidKeysNamed } from "./avoidWords";

export const MAX_FOLLOWUP_CHARS = 200;

/** "Cheaper" with no number: this share of the current basket's cost. */
export const CHEAPER_SHARE = 0.9;

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const NUTRIENT_UNITS = Object.freeze({ protein: "g protein", kcal: "kcal" });

const CHEAPER = /\b(cheaper|less expensive|too expensive|too costly|costs? less|lower (the )?(cost|budget|price)|reduce (the )?(cost|budget|price)|save (some )?money|sasta)\b/;
const NO_BUDGET = /\b(no budget|any budget|forget (the )?budget|remove (the )?budget|budget (does not|doesn t|dont) matter|(money|cost|price) (is )?(no|not an?) (issue|problem|concern)|don t worry about (the )?(money|cost|price|budget))\b/;
const MONEY_WORDS = /\b(budget|cost|money|price|spend|expensive|cheap|paisa|kharcha|rs)\b/;
const DAY_NAMES = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekends?|weekdays?|today|tomorrow)\b/;
const LEAVE_OUT = /\b(?:no|without|skip|remove|drop|swap|replace|swap out|instead of|don t want|do not want|dont want|not|less|stop|minus)\s+(?:the|any|all|more|those|these|that|this|my)?\s*([a-z]+(?:\s+[a-z]+){0,2})/g;
/** "add oats", "include besan", "with some atta", "more paneer please". */
const ADD = /\b(?:add|include|buy|get|put in|throw in|more of|also)\s+(?:some|the|a|an|any|more|extra)?\s*([a-z]+(?:\s+[a-z]+){0,2})/g;
/** "swap the rice for atta", "replace oats with poha", "atta instead of rice". */
const SWAP_FOR = /\b(?:swap|replace|change|switch)\s+(?:out\s+)?(?:the|my|some|any)?\s*([a-z]+(?:\s+[a-z]+){0,2}?)\s+(?:for|with|to|by)\s+(?:the|some|any)?\s*([a-z]+(?:\s+[a-z]+){0,2})/g;
const SWAP_INSTEAD = /\b([a-z]+(?:\s+[a-z]+){0,2}?)\s+instead\s+of\s+(?:the|my|some|any)?\s*([a-z]+(?:\s+[a-z]+){0,2})/g;
/** The cue words that make a product word a removal, and the ones that make it an ask. */
const REMOVE_CUE = /\b(no|without|skip|remove|drop|swap|replace|switch|instead|don t want|do not want|dont want|less|stop|minus|out)\b/;
const ADD_CUE = /\b(add|include|buy|get|put in|throw in|also|more|with|want|extra)\b/;
const STOP = new Set([
  "to", "the", "my", "our", "your", "instead", "also", "add", "put", "some",
  "on", "for", "in", "at", "please", "and", "but", "it", "them", "anymore", "any", "more", "with", "from", "this", "week",
  "plan", "basket", "one", "ones", "budget", "money", "cost", "price", "protein", "kcal", "calories", "day", "days",
  "too", "so", "very", "much", "sure", "expensive", "costly", "cheap", "that", "so", "a", "an",
]);

/** Who a clause is for: "for Kid 1", "for the kids", "for me". */
const WHO = /\bfor\s+(?:the\s+)?([a-z]+(?:\s+\d+)?)\b/;

/**
 * Days asked for in a follow-up. Stricter than a brief: "no paneer this week"
 * mentions a week without asking for one.
 */
function followUpDays(text) {
  const n = text.match(/\b(\d+)\s*days?\b/);
  if (n) return Math.min(MAX_DAYS, Math.max(1, Number(n[1])));
  if (/\bfortnight\b|\b(two|2)\s*weeks\b/.test(text)) return 14;
  if (/\b(for|make it|plan for|just|only)\s+(a|one)\s+week\b/.test(text)) return 7;
  return null;
}

/** A product phrase, trimmed of the words that are not food. */
function foodPhrase(words) {
  const kept = [];
  for (const w of String(words ?? "").split(" ")) {
    if (STOP.has(w) || DAY_NAMES.test(w)) break;
    kept.push(w);
  }
  return kept.join(" ").trim() || null;
}

/** Product words matched by a pattern, in order, without repeats. */
function phrasesMatching(text, pattern, group = 1) {
  const words = [];
  for (const m of text.matchAll(pattern)) {
    const phrase = foodPhrase(m[group]);
    if (phrase) words.push(phrase);
  }
  return [...new Set(words)];
}

/**
 * "Swap the rice for atta": what goes out and what comes in, as one change.
 *
 * A swap is read as a pair on purpose. Read as two separate words it becomes
 * "leave out rice" plus an unusable word, and a live follow-up did exactly
 * that: "swap the rice for aata" took every rice out of the basket and then
 * said it had never heard of aata.
 */
export function swapsIn(text) {
  const swaps = [];
  for (const m of text.matchAll(SWAP_FOR)) {
    const from = foodPhrase(m[1]);
    const to = foodPhrase(m[2]);
    if (from && to) swaps.push({ from, to });
  }
  for (const m of text.matchAll(SWAP_INSTEAD)) {
    const to = foodPhrase(m[1]);
    const from = foodPhrase(m[2]);
    if (from && to) swaps.push({ from, to });
  }
  return swaps;
}

/**
 * The product words the sentence asks to leave out, and the ones it asks for.
 * A word inside a swap belongs to the swap, not to either list.
 */
function productWords(text) {
  const swaps = swapsIn(text);
  const inSwap = new Set(swaps.flatMap((s) => [s.from, s.to]));
  // An asked-for word is a product even when it names an allergen family:
  // "add wheat" wants the atta, and reading it as "avoid gluten" is how a
  // request for a food became a restriction on the household.
  const include = phrasesMatching(text, ADD).filter((w) => !inSwap.has(w));
  // Where a sentence both refuses and asks for the same food ("no oats,
  // actually add oats"), the ask is what the shopper settled on. A word that
  // names an allergen is left to the avoid reading below.
  const leaveOut = phrasesMatching(text, LEAVE_OUT)
    .filter((w) => !inSwap.has(w) && !include.includes(w) && !avoidKeysNamed(w).length);
  return { swaps, leaveOut, include };
}

/** Daily targets written as numbers, and who they are for, if anyone is named in the clause. */
function targetsIn(text) {
  const targets = [];
  for (const clause of text.split(/,|\band\b|;/)) {
    const protein = clause.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\s*(?:of\s+)?protein/);
    const kcal = clause.match(/(\d{3,4})\s*(?:kcal|calories|cals?)\b/);
    const who = clause.match(WHO)?.[1] ?? null;
    if (protein) targets.push({ who, nutrient: "protein", perDay: Number(protein[1]) });
    if (kcal) targets.push({ who, nutrient: "kcal", perDay: Number(kcal[1]) });
  }
  return targets;
}

/**
 * A follow-up read with rules.
 * @param {string} input
 * @returns {{ budget: {change, rupees}, days, leaveOut, avoid, targets, dayNames, unresolved }}
 */
export function readFollowUp(input) {
  const text = normalise(input);
  const rupees = budgetIn(input);
  const budget = rupees !== null ? { change: "set", rupees }
    : NO_BUDGET.test(text) ? { change: "remove", rupees: null }
    : CHEAPER.test(text) ? { change: "cheaper", rupees: null }
    : { change: "none", rupees: null };
  // Avoids are read with the product words taken out, so "no paneer" leaves out paneer and nothing else.
  const { swaps, leaveOut, include } = productWords(text);
  const avoidText = [...leaveOut, ...include, ...swaps.flatMap((s) => [s.from, s.to])]
    .reduce((t, phrase) => ` ${t} `.replace(` ${phrase} `, " "), text);
  const reading = interpret(avoidText);
  const who = text.match(WHO)?.[1] ?? null;
  return {
    budget,
    days: followUpDays(text),
    leaveOut,
    include,
    swaps,
    avoid: reading.profile.foodsAvoid.map((key) => ({ key, who })),
    targets: targetsIn(text),
    dayNames: DAY_NAMES.test(text),
    unresolved: reading.unresolved,
    message: input,
  };
}

// ── The model's reading ──────────────────────────────────────────────────────

export const FOLLOWUP_SCHEMA_NAME = "koi_plan_followup";

export const FOLLOWUP_JSON_SCHEMA = Object.freeze(strictObject({
  budget: strictObject({
    change: { type: "string", enum: ["none", "set", "cheaper", "remove"] },
    rupees: nullableNumber(),
  }),
  days: { type: ["integer", "null"] },
  leaveOut: { type: "array", items: { type: "string" } },
  include: { type: "array", items: { type: "string" } },
  swaps: { type: "array", items: strictObject({ from: { type: "string" }, to: { type: "string" } }) },
  avoid: { type: "array", items: strictObject({ key: { type: "string", enum: [...AVOID_KEYS] }, who: { type: ["string", "null"] } }) },
  targets: { type: "array", items: strictObject({ who: { type: ["string", "null"] }, nutrient: { type: "string", enum: Object.keys(NUTRIENT_UNITS) }, perDay: { type: "number" } }) },
  unresolved: { type: "array", items: { type: "string" } },
}));

export const FOLLOWUP_INSTRUCTIONS = [
  "A shopper is looking at a weekly grocery plan for their household and types one message asking for a change. Return the change using only the fields below.",
  "",
  "Rules:",
  "- budget.change: \"set\" with rupees only if the message writes a number for the budget; \"cheaper\" if they want it to cost less without a number; \"remove\" if they say the budget does not matter; otherwise \"none\".",
  "- days: the number of days to plan for, only if the message says so (a week is 7, a fortnight 14). Otherwise null.",
  "- leaveOut: products the message asks to take OUT, as the product words copied exactly from it (\"no oats\" → \"oats\"). Never a product the message asks for. Not allergens: those go in avoid.",
  "- include: products the message asks to put IN, copied exactly (\"add oats\" → \"oats\", \"can you add wheat\" → \"wheat\").",
  "- swaps: a product to take out paired with the one to put in its place (\"swap the rice for atta\" → from \"rice\", to \"atta\"). Both words copied exactly. A swap goes here, not in leaveOut or include.",
  `- avoid: what someone must not eat, using these keys only: ${AVOID_KEYS.join(", ")}. who is the person's words copied exactly from the message (\"Kid 1\", \"the kids\", \"me\"), or null for everyone.`,
  "- targets: a daily protein (grams) or energy (kcal) target, only at a number written in the message. who as above.",
  "- Never invent a number. Anything you cannot express goes in unresolved, copied word for word.",
].join("\n");

const ModelFollowUpSchema = z.object({
  budget: z.object({ change: z.enum(["none", "set", "cheaper", "remove"]), rupees: z.number().positive().max(1000000).nullable() }),
  days: z.number().int().min(1).max(MAX_DAYS).nullable(),
  leaveOut: z.array(z.string().max(40)).max(8),
  include: z.array(z.string().max(40)).max(8).default([]),
  swaps: z.array(z.object({ from: z.string().max(40), to: z.string().max(40) })).max(4).default([]),
  avoid: z.array(z.object({ key: z.enum([...AVOID_KEYS]), who: z.string().max(40).nullable() })).max(8),
  targets: z.array(z.object({ who: z.string().max(40).nullable(), nutrient: z.enum(["protein", "kcal"]), perDay: z.number().positive() })).max(8),
  unresolved: z.array(z.string().max(60)).max(8),
});

/**
 * A model's reading of a follow-up, held to the sentence. null when unusable.
 * @param {unknown} raw
 * @param {string} input
 */
export function groundFollowUp(raw, input) {
  const parsed = ModelFollowUpSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const text = ` ${normalise(input)} `;
  const stated = numbersIn(input);
  const said = (words) => Boolean(words) && text.includes(` ${normalise(words)} `);
  const who = (w) => (w && said(w) ? w : null);
  const weekDays = followUpDays(text);

  let budget = r.budget;
  if (budget.change === "set" && !(budget.rupees !== null && stated.has(budget.rupees))) budget = { change: "none", rupees: null };
  // Removing a budget loosens the plan: only when the message talks about money at all.
  if (budget.change === "remove" && !MONEY_WORDS.test(text)) budget = { change: "none", rupees: null };
  if (budget.change !== "set") budget = { ...budget, rupees: null };

  // What the sentence does with a product word, not just whether it said it. A
  // model once read "can you add oats?" as leaveOut: ["oats"], and the plan
  // took the oats out — grounded on the word alone, the verb went unchecked.
  const clauseAround = (words) => {
    const at = text.indexOf(` ${normalise(words)} `);
    return at === -1 ? "" : text.slice(Math.max(0, at - 40), at + normalise(words).length + 2);
  };
  const asksToRemove = (words) => said(words) && REMOVE_CUE.test(clauseAround(words)) && !ADD_CUE.test(clauseAround(words).replace(REMOVE_CUE, " "));
  const asksFor = (words) => said(words) && ADD_CUE.test(clauseAround(words)) && !REMOVE_CUE.test(clauseAround(words));
  const swapsSaid = swapsIn(text);
  const swapPair = (from, to) => swapsSaid.some((s) => s.from === normalise(from) && s.to === normalise(to));

  return {
    budget,
    days: r.days !== null && r.days === weekDays ? r.days : null,
    leaveOut: r.leaveOut.map((w) => normalise(w)).filter((w) => asksToRemove(w) && !avoidKeysNamed(w).length),
    include: (r.include ?? []).map((w) => normalise(w)).filter((w) => asksFor(w)),
    // A swap is kept only when the sentence itself pairs those two words.
    swaps: (r.swaps ?? [])
      .map((s) => ({ from: normalise(s.from), to: normalise(s.to) }))
      .filter((s) => swapPair(s.from, s.to)),
    // An avoid only where the message names it: a model reading "no paneer" as "avoid milk" is not kept.
    avoid: r.avoid.filter((a) => avoidKeysNamed(input).includes(a.key)).map((a) => ({ key: a.key, who: who(a.who) })),
    targets: r.targets.filter((t) => stated.has(t.perDay)).map((t) => ({ ...t, who: who(t.who) })),
    dayNames: DAY_NAMES.test(text),
    unresolved: r.unresolved.filter((w) => said(w)),
  };
}

/** Rules and model together: the model's reading where it has one, and every restriction either found. */
export function mergeFollowUps(local, model) {
  if (!model) return local;
  const byKey = (list) => [...new Map(list.map((x) => [JSON.stringify(x), x])).values()];
  // Where the model says who an avoid is for and the rules could not, its reading replaces
  // the rules' "everyone" (the plan leaves the product out for the household either way).
  const namedByModel = new Set(model.avoid.filter((a) => a.who).map((a) => a.key));
  return {
    budget: model.budget.change !== "none" ? model.budget : local.budget,
    days: model.days ?? local.days,
    leaveOut: [...new Set([...local.leaveOut, ...model.leaveOut])],
    include: [...new Set([...(local.include ?? []), ...(model.include ?? [])])],
    swaps: [...new Map([...(local.swaps ?? []), ...(model.swaps ?? [])].map((s) => [`${s.from}>${s.to}`, s])).values()],
    avoid: byKey([...local.avoid.filter((a) => a.who || !namedByModel.has(a.key)), ...model.avoid]),
    targets: model.targets.length ? model.targets : local.targets,
    dayNames: local.dayNames || model.dayNames,
    unresolved: [...new Set([...local.unresolved, ...model.unresolved])],
    message: local.message,
  };
}

// ── Applying it ──────────────────────────────────────────────────────────────

/** The members a person's words refer to: a label, a kind ("the kids"), "me", or everyone. */
export function membersNamed(words, members) {
  if (!words) return members;
  const w = normalise(words).replace(/^the\s+/, "");
  if (/^(everyone|everybody|all|all of us|us|the family|family)$/.test(w)) return members;
  const exact = members.filter((m) => normalise(m.label) === w);
  if (exact.length) return exact;
  const singular = w.replace(/(ren|s)$/, "");
  const kinds = { kid: ["kid", "child", "children"], adult: ["adult"], senior: ["senior", "grandparent"], teen: ["teen"], person: ["person", "people"] };
  const kind = Object.entries(kinds).find(([, names]) => names.some((n) => singular === n || w === n))?.[0];
  if (kind) return members.filter((m) => normalise(m.label).startsWith(kind));
  return members.filter((m) => normalise(m.label).includes(w));
}

/**
 * How Indian shoppers spell the same food. A live follow-up asked to swap the
 * rice "for aata" and KOI answered that it had never heard of aata, while
 * Superior MP Atta sat in the catalogue.
 */
const SPELLINGS = Object.freeze({
  atta: ["aata", "ata", "aatta", "wheat", "wheat flour", "whole wheat", "chakki"],
  besan: ["gram flour", "chickpea flour"],
  maida: ["refined flour", "plain flour", "all purpose flour"],
  dal: ["daal", "dhal", "lentil", "lentils", "pulse", "pulses"],
  chana: ["channa", "chickpea", "chickpeas", "chole"],
  moong: ["mung", "green gram"],
  toor: ["tur", "arhar", "pigeon pea"],
  poha: ["flaked rice", "beaten rice", "chivda"],
  rice: ["chawal", "chaval"],
  oats: ["oat", "oatmeal"],
  peanut: ["groundnut", "moongphali", "mungfali"],
  namkeen: ["mixture", "bhujia", "sev", "farsan"],
  chikki: ["gachak", "gajak"],
  muesli: ["granola"],
  ghee: ["clarified butter"],
  jaggery: ["gud", "gur"],
  haldi: ["turmeric"],
  jeera: ["cumin"],
  masala: ["spice mix", "spice"],
});

/** Every word that could mean the same food as this one. */
function spellings(word) {
  const w = normalise(word);
  const forms = new Set([w, w.replace(/e?s$/, ""), `${w}s`]);
  for (const [head, others] of Object.entries(SPELLINGS)) {
    const family = [head, ...others];
    if (family.some((f) => f === w || w === `${f}s` || f === `${w}s`)) family.forEach((f) => forms.add(f));
  }
  return [...forms].filter((f) => f.length >= 3);
}

/** One letter out: "aatta" for "atta", "bisuits" for "biscuits". */
function almost(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++slips > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return slips + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Catalogue rows a shopper's word means: by name first (its spellings, its
 * singular and plural, and one letter out), and only if nothing is named, by
 * the category it belongs to — so "rice" finds the rices when no product is
 * called rice.
 */
export function productsNamed(word, catalogue) {
  const w = normalise(word);
  if (w.length < 3) return [];
  const forms = spellings(w);
  const named = catalogue.filter((item) => {
    const tokens = normalise(item.name).split(/[^a-z0-9]+/).filter(Boolean);
    const name = ` ${tokens.join(" ")} `;
    return forms.some((f) => name.includes(` ${f} `) || (f.includes(" ") && name.includes(f)) || tokens.some((t) => almost(t, f)));
  });
  if (named.length) return named;
  return catalogue.filter((item) => {
    const key = normalise(String(item.categoryKey ?? "")).replace(/[._]/g, " ");
    return forms.some((f) => ` ${key} `.includes(` ${f} `));
  });
}

/** Words in a product name that say what kind of pack it is, not what the food is. */
const NAME_DESCRIPTORS = new Set([
  "the", "and", "with", "crunch", "crunchy", "creamy", "smooth", "thick", "thin", "natural", "classic", "original",
  "plus", "mix", "combo", "pack", "pure", "organic", "premium", "super", "unpolished", "split", "superior", "roasted",
  "instant", "rozana", "healthy", "daily", "added", "sugar", "free",
]);
/** A food word that reads better with the word before it: "moong dal", "peanut butter". */
const PAIRED_HEADS = new Set(["dal", "butter", "rice", "flour", "chana", "oil", "seeds", "chips", "cookies", "biscuits", "milk", "pak"]);

/**
 * The word a shopper would use to leave this product out ("Split Moong Dal" →
 * "moong dal", "Natural Peanut Butter Crunch" → "peanut butter"). Used to give
 * "Change this plan" examples drawn from the plan on screen; productsNamed
 * finds the product again from it.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function productWordFor(name) {
  const tokens = normalise(String(name ?? "").replace(/\(.*?\)|\s-\s.*$/g, " "))
    .replace(/[^a-z ]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !NAME_DESCRIPTORS.has(t));
  if (!tokens.length) return null;
  const last = tokens[tokens.length - 1];
  return PAIRED_HEADS.has(last) && tokens.length >= 2 ? `${tokens[tokens.length - 2]} ${last}` : last;
}

/**
 * Examples for "Change this plan", from the plan on screen: two of its own
 * products (never an allergen word, which would read as an avoid), "cheaper",
 * and a change of days. Nothing is suggested at a number KOI would be choosing
 * for the shopper's nutrition.
 *
 * @param {{ basket: Array<{name}>, days: number }} plan
 * @returns {string[]}
 */
export function followUpExamples({ basket = [], days = 7 } = {}) {
  const words = [...new Set(basket.map((line) => productWordFor(line.name)).filter((w) => w && !avoidKeysNamed(w).length))];
  const examples = [];
  if (words[0]) examples.push(`swap the ${words[0]}`);
  if (words[1]) examples.push(`no ${words[1]}`);
  examples.push("cheaper");
  examples.push(`${Number(days) === 7 ? 10 : 7} days`);
  return examples;
}

const rupees = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Apply a follow-up to a plan's constraints.
 *
 * @param {object} plan { members, days, budget, excludedSkus, cost }
 * @param {object} reading from readFollowUp / mergeFollowUps
 * @param {Array} catalogue plannable rows (for leave-out words)
 * @returns {{ members, days, budget, excludedSkus, applied: string[], notApplied: string[], householdChanges: Array }}
 *   `householdChanges` are the parts that describe a person rather than this
 *   plan — a target, an avoid — keyed by the stored member id. They change the
 *   plan only; the shopper is asked before any is saved (Phase 4.4).
 */
export function applyFollowUp(plan, reading, catalogue) {
  const applied = [];
  const notApplied = [];
  const changesByMember = new Map();
  const noteChange = (m, patch) => {
    const change = changesByMember.get(m.id) ?? { memberId: m.id, label: m.label, targets: {}, addAvoidKeys: [] };
    if (patch.targets) Object.assign(change.targets, patch.targets);
    if (patch.avoidKey && !change.addAvoidKeys.includes(patch.avoidKey)) change.addAvoidKeys.push(patch.avoidKey);
    changesByMember.set(m.id, change);
  };
  const members = plan.members.map((m) => ({ ...m, targets: { ...m.targets }, avoidFlags: [...(m.avoidFlags ?? [])], softAvoidFlags: [...(m.softAvoidFlags ?? [])] }));
  let { budget, days } = plan;
  const excluded = new Set(plan.excludedSkus ?? []);
  const included = new Set(plan.includedSkus ?? []);

  if (reading.budget.change === "set") {
    budget = reading.budget.rupees;
    applied.push(`Budget ${rupees(budget)}`);
  } else if (reading.budget.change === "cheaper") {
    if (!(plan.cost > 0)) notApplied.push("Cheaper than what? This plan has no cost yet.");
    else {
      budget = Math.floor((plan.cost * CHEAPER_SHARE) / 10) * 10;
      applied.push(`Budget ${rupees(budget)}, 10% under this plan's ${rupees(plan.cost)}`);
    }
  } else if (reading.budget.change === "remove") {
    budget = null;
    applied.push("No budget");
  }

  if (reading.days && reading.days !== days) {
    days = Math.min(MAX_DAYS, Math.max(1, reading.days));
    applied.push(`${days} ${days === 1 ? "day" : "days"}`);
  }

  // A swap is one change: nothing goes out unless something can come in.
  for (const swap of reading.swaps ?? []) {
    const out = productsNamed(swap.from, catalogue);
    const inTo = productsNamed(swap.to, catalogue).filter((item) => !out.some((o) => o.skuId === item.skuId));
    if (!out.length) {
      notApplied.push(`Nothing in this plan is called "${swap.from}"`);
      continue;
    }
    if (!inTo.length) {
      notApplied.push(`KOI has nothing called "${swap.to}" to swap in, so the ${swap.from} stays`);
      continue;
    }
    out.forEach((h) => excluded.add(h.skuId));
    inTo.slice(0, 1).forEach((h) => included.add(h.skuId));
    applied.push(`${inTo[0].name} instead of ${out.map((h) => h.name).join(", ")}`);
  }

  for (const word of reading.leaveOut) {
    const hits = productsNamed(word, catalogue);
    if (!hits.length) {
      notApplied.push(`Nothing KOI can plan with is called "${word}"`);
      continue;
    }
    hits.forEach((h) => excluded.add(h.skuId));
    applied.push(`Left out ${hits.map((h) => h.name).join(", ")}`);
  }

  for (const word of reading.include ?? []) {
    const hits = productsNamed(word, catalogue).filter((item) => !excluded.has(item.skuId));
    if (!hits.length) {
      notApplied.push(`KOI has nothing called "${word}" to add`);
      continue;
    }
    // One product, not every match: "add oats" is a pack of oats, not the shelf.
    included.add(hits[0].skuId);
    applied.push(`Added ${hits[0].name}`);
  }

  for (const { key, who } of reading.avoid) {
    const entry = AVOID_BY_KEY[key];
    const named = membersNamed(who, members);
    if (!entry || !named.length) {
      notApplied.push(`No one called "${who}" is in this plan`);
      continue;
    }
    for (const m of named) {
      const list = entry.mode === "hard" ? m.avoidFlags : m.softAvoidFlags;
      if (!list.includes(entry.flag)) list.push(entry.flag);
      noteChange(m, { avoidKey: key });
    }
    applied.push(`${entry.label} avoided for ${named.length === members.length ? "everyone" : named.map((m) => m.label).join(", ")}${entry.mode === "hard" ? "" : " (noted as a preference)"}`);
  }

  for (const t of reading.targets) {
    const named = membersNamed(t.who, members);
    if (!named.length) {
      notApplied.push(`No one called "${t.who}" is in this plan`);
      continue;
    }
    named.forEach((m) => {
      m.targets[t.nutrient] = t.perDay;
      noteChange(m, { targets: { [t.nutrient === "protein" ? "target_protein_g" : "target_kcal"]: t.perDay } });
    });
    applied.push(`${named.length === members.length ? "Everyone" : named.map((m) => m.label).join(", ")}: ${t.perDay} ${NUTRIENT_UNITS[t.nutrient]} a day`);
  }

  if (reading.dayNames && applied.length) {
    notApplied.push("KOI plans the whole period as one basket, not day by day, so this applies to every day.");
  }
  // A leftover that is simply the whole message says nothing once something was applied.
  const whole = normalise(reading.message ?? "");
  for (const words of reading.unresolved) {
    if (applied.length && normalise(words) === whole) continue;
    notApplied.push(`Not applied: "${words}"`);
  }
  if (!applied.length && !notApplied.length) {
    notApplied.push("KOI could not find a change in that. Try \"cheaper\", \"no oats\", \"10 days\" or \"60 g protein for Kid 1\".");
  }

  // What is asked for cannot also be left out: the later word wins, and the
  // plan never carries an instruction that contradicts itself.
  for (const skuId of included) excluded.delete(skuId);

  return {
    members,
    days,
    budget,
    excludedSkus: [...excluded],
    includedSkus: [...included],
    applied,
    notApplied,
    householdChanges: [...changesByMember.values()],
  };
}
