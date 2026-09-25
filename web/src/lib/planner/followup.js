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
import { nodeInfo } from "@/lib/food/taxonomy";
import { WORD_FAMILIES, CATEGORY_WORDS } from "@/lib/food/foodWords";
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
// A phrase may carry a count and a pack word ("one 250 g pack of dates"), so
// the captures take digits and up to five words; foodPhrase strips the rest.
const PHRASE = String.raw`([a-z0-9]+(?:\s+[a-z0-9]+){0,4})`;
// The article is a whole word: without the boundary, "a" ate the first letter
// of "add" and KOI went looking for a product called "dd".
const ARTICLE = String.raw`(?:(?:the|any|all|some|a|an|my|our|those|these|that|this|more|extra|also|just|another|other|different)\s+)*`;
const LEAVE_OUT = new RegExp(String.raw`\b(?:no|without|skip|remove|drop|swap|replace|take|leave|get rid of|cut|instead of|don t want|do not want|dont want|don t need|dont need|not|less|stop|minus)\s+(?:out\s+)?${ARTICLE}${PHRASE}`, "g");
/**
 * "add oats", "include besan", "buy some atta", "put in a jar of honey".
 * "also" is filler, not a trigger: as a trigger it matched before the "add"
 * in "can you also add some peanut butter" and swallowed the verb.
 */
// "plan for" and "cook for" bring a person in rather than a food: "can you
// plan for my wife too" is the way somebody actually asks, and without the cue
// it read as nothing at all.
const ADD = new RegExp(String.raw`\b(?:add|include|buy|put in|put|throw in|more of|use|plan for|cook for)\s+${ARTICLE}${PHRASE}`, "g");
/** "swap the rice for atta", "replace oats with poha", "atta instead of rice". */
// The thing being replaced may not be said at all: "take out chikki and
// replace with almonds". The from side is optional, and when it is missing
// (or a pronoun) it means the food the sentence has just named.
const SWAP_FOR = new RegExp(String.raw`\b(?:swap|replace|change|switch)\s+(?:out\s+)?(?:${ARTICLE}([a-z0-9]+(?:\s+[a-z0-9]+){0,4}?)\s+)?(?:for|with|to|by)\s+${ARTICLE}${PHRASE}`, "g");
const SWAP_INSTEAD = new RegExp(String.raw`\b([a-z0-9]+(?:\s+[a-z0-9]+){0,4}?)\s+instead\s+of\s+${ARTICLE}${PHRASE}`, "g");

/** How much of it: a count, a weight, a pack. None of it is the food's name. */
const QUANTITY = /^(?:\d+(?:\.\d+)?(?:g|gm|gms|kg|ml|l|ltr|pcs)?|one|two|three|four|five|six|seven|eight|nine|ten|half|couple|few)$/;
const PACK_WORDS = new Set([
  "pack", "packs", "packet", "packets", "box", "boxes", "bottle", "bottles", "jar", "jars",
  "tin", "tins", "bag", "bags", "piece", "pieces", "unit", "units", "kg", "gm", "gms", "ml", "of",
]);
/** "swap IT with honey": the thing just named, not a product called "it". */
const PRONOUNS = new Set(["it", "that", "this", "them", "those", "these", "one", "ones"]);
/** A verb that leaked into a phrase: "use honey instead of dates" is honey. */
const VERBS = new Set([
  "use", "add", "put", "buy", "include", "swap", "replace", "switch", "change", "take", "remove", "drop",
  "get", "want", "need", "give", "make", "keep", "leave", "skip", "cut", "rid", "out",
]);
/** The cue words that make a product word a removal, and the ones that make it an ask. */
const REMOVE_CUE = /\b(no|without|skip|remove|drop|swap|replace|switch|instead|don t want|do not want|dont want|less|stop|minus|out)\b/;
const ADD_CUE = /\b(add|include|buy|get|put in|throw in|also|more|with|want|extra|plan for|cook for|too|as well)\b/;
const STOP = new Set([
  "to", "the", "my", "our", "your", "instead", "also", "add", "put", "some",
  "on", "for", "in", "at", "please", "and", "but", "it", "them", "anymore", "any", "more", "with", "from", "this", "week",
  "plan", "basket", "one", "ones", "budget", "money", "cost", "price", "protein", "kcal", "calories", "day", "days",
  "too", "so", "very", "much", "sure", "expensive", "costly", "cheap", "that", "so", "a", "an",
]);

/** Who a clause is for: "for Kid 1", "for the kids", "for my wife", "for me". */
const WHO = /\bfor\s+(?:(?:the|my|our|your)\s+)?([a-z]+(?:\s+\d+)?)\b/;

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

/**
 * A product phrase, trimmed of everything that is not the food: the clause
 * ends at a stop word, and counts, weights and pack words are dropped along
 * the way. "one 250 g pack of dates" is "dates"; "1 date pack" is "date".
 */
function foodPhrase(words) {
  const kept = [];
  for (const w of String(words ?? "").split(" ").filter(Boolean)) {
    // How much comes first: "one" is both a count and a stop word, and reading
    // it as the end of the clause lost "one 250 g pack of dates" entirely.
    if (QUANTITY.test(w) || PACK_WORDS.has(w)) continue;
    // A verb before the food is the asking, not the food: "use honey" is honey.
    if (!kept.length && VERBS.has(w)) continue;
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
  const pair = (from, to) => {
    if (!to) return;
    // "remove one pack of dates and swap IT with honey": the pronoun is the
    // food the sentence has just named, not a product called "it".
    const named = from && !PRONOUNS.has(from) ? from : lastFoodBefore(text, to);
    if (named) swaps.push({ from: named, to });
  };
  for (const m of text.matchAll(SWAP_FOR)) pair(foodPhrase(m[1]), foodPhrase(m[2]));
  for (const m of text.matchAll(SWAP_INSTEAD)) {
    const to = foodPhrase(m[1]);
    pair(foodPhrase(m[2]), to);
  }
  return swaps;
}

/** The last food word the sentence named before this one, for a pronoun to mean. */
function lastFoodBefore(text, to) {
  const before = text.slice(0, text.indexOf(to));
  const named = [];
  for (const m of before.matchAll(LEAVE_OUT)) {
    const phrase = foodPhrase(m[1]);
    if (phrase && !PRONOUNS.has(phrase)) named.push(phrase);
  }
  return named.length ? named[named.length - 1] : null;
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

/**
 * A product left out for one person, not the household: "no dates for Wife",
 * "my wife doesn't want the dates", "Son won't eat chana". The words are the
 * sentence's own (normalised); membersNamed and productsNamed resolve them.
 */
const END = String.raw`(?=\s*(?:$|,|\.|;|\band\b|\bbut\b|\bthen\b))`;
const FOR_ONE = [
  { re: new RegExp(String.raw`\b(?:no|without|skip|remove|drop|leave out)\s+(?:the\s+|any\s+)?([a-z][a-z ]{1,30}?)\s+for\s+(?:my\s+|the\s+|our\s+)?([a-z][a-z0-9 ]{0,20}?)${END}`, "g"), product: 1, who: 2 },
  { re: new RegExp(String.raw`\b(?:my\s+|the\s+|our\s+)?([a-z][a-z0-9]{1,20})\s+(?:doesn t|does not|doesnt|won t|will not|wont|don t|do not|dont|can t|cannot|never)\s+(?:want|like|eat|have|eats|wants|likes)\s+(?:the\s+|any\s+)?([a-z][a-z ]{1,30}?)${END}`, "g"), product: 2, who: 1 },
];
/** The words that name someone in a household, for "her", "him" and a clause's subject. */
const PERSON_WORDS = /\b(wife|husband|partner|son|daughter|kids?|child|children|mother|mom|mum|mummy|father|dad|papa|grandma|grandpa|grandmother|grandfather|nani|dadi|nana|dada|beta|beti|me)\b/g;
const PRONOUNS_FOR_SOMEONE = new Set(["her", "him", "them", "his"]);
/** "wife needs 70g and no dates for her": her is the wife — the nearest person named before. */
function personBefore(text, index) {
  let last = null;
  for (const m of text.matchAll(PERSON_WORDS)) if (m.index < index) last = m[1];
  return last;
}

/**
 * Who an avoid is for, read from the clause that names it: "son is allergic to
 * peanuts" is the son's, even in a message that began "for all of us". "For
 * all of us", "everyone", "us" — or no one named — is the household (null).
 */
function avoidWho(text, key) {
  const clauses = text.split(/[,.;]|\band\b|\bthen\b|\bbut\b/).map((c) => c.trim()).filter(Boolean);
  const clause = clauses.find((c) => avoidKeysNamed(c).includes(key));
  if (!clause) return null;
  const said = clause.match(WHO)?.[1] ?? clause.match(PERSON_WORDS)?.[0] ?? null;
  if (!said || ["all", "everyone", "everybody", "us", "all of us", "the family", "family", "the house", "house"].includes(said)) return null;
  return PRONOUNS_FOR_SOMEONE.has(said) ? personBefore(text, text.indexOf(clause)) : said;
}

export function leaveOutFor(text) {
  const found = [];
  for (const { re, product, who } of FOR_ONE) {
    for (const m of text.matchAll(re)) {
      let person = m[who].trim();
      if (PRONOUNS_FOR_SOMEONE.has(person)) person = personBefore(text, m.index) ?? person;
      const food = m[product].trim();
      if (!food || ["it", "that", "this", "them"].includes(food)) continue;
      // "No dairy for my wife" is an allergen: an avoid, held by the graph, not one product.
      if (avoidKeysNamed(food).length) continue;
      found.push({ product: food, who: ["i", "we"].includes(person) ? "me" : person });
    }
  }
  return found;
}

/** Daily targets written as numbers, and who they are for, if anyone is named in the clause. */
function targetsIn(text) {
  const targets = [];
  for (const clause of text.split(/,|\band\b|;/)) {
    const protein = clause.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\s*(?:of\s+)?protein/);
    const kcal = clause.match(/(\d{3,4})\s*(?:kcal|calories|cals?)\b/);
    // "70 g for my wife", or the person the clause is about: "wife needs 70g
    // protein" was read as everyone's 70 g. "For all of us" is everyone's.
    const said = clause.match(WHO)?.[1] ?? clause.match(PERSON_WORDS)?.[0] ?? null;
    const who = !said || ["all", "everyone", "everybody", "us"].includes(said) ? null
      : PRONOUNS_FOR_SOMEONE.has(said) ? personBefore(text, text.indexOf(clause)) : said;
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
  const words = productWords(text);
  const { swaps, include } = words;
  // A food left out for one person is theirs alone, not the household's.
  const forOne = leaveOutFor(text);
  const leaveOut = words.leaveOut.filter((w) => !forOne.some((f) => f.product === w || f.product.includes(w) || w.includes(f.product)));
  const avoidText = [...leaveOut, ...include, ...swaps.flatMap((s) => [s.from, s.to]), ...forOne.map((f) => f.product)]
    .reduce((t, phrase) => ` ${t} `.replace(` ${phrase} `, " "), text);
  const reading = interpret(avoidText);
  return {
    budget,
    days: followUpDays(text),
    leaveOut,
    leaveOutFor: forOne,
    include,
    swaps,
    avoid: reading.profile.foodsAvoid.map((key) => ({ key, who: avoidWho(text, key) })),
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
  // Answers in KOI's own words: ids from the lists the model was given, not
  // words copied out of the sentence. See WHY IDS below.
  dropMembers: { type: "array", items: { type: "string" } },
  addMembers: { type: "array", items: { type: "string" } },
  leaveOutCategories: { type: "array", items: { type: "string" } },
  includeCategories: { type: "array", items: { type: "string" } },
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
  "",
  "You are also given who is eating and the kinds of food this shop sells. Where the message means one of them, answer with its id rather than the shopper's words — those are checked against the lists and are the only way to reach something the shopper did not name exactly:",
  "- dropMembers: member ids for anyone the message takes out of the plan (\"replan without my wife\").",
  "- addMembers: member ids for anyone the message brings into it (\"can you plan for my wife too\", \"add wife\"). They may be someone the plan does not currently feed.",
  "- leaveOutCategories: category keys for a kind of food to take out (\"no dals this week\").",
  "- includeCategories: category keys for a kind of food to put in (\"put another dry fruit in\").",
  "Use a category only where the message means the kind and not one product. \"No almonds\" is a product; \"no nuts at all\" is a category.",
].join("\n");

/**
 * What the model is told about this shopper, so it can answer in ids.
 *
 * WHY IDS. The model used to be handed the message and nothing else, and its
 * reading was then held to words appearing verbatim in that message. It could
 * not know this household has a member labelled Wife, or that KOI shelves
 * "dried fruit" under nuts_seeds.dried_fruit, so it guessed names blind and
 * grounding threw away anything it got right in KOI's vocabulary rather than
 * the shopper's. Both halves were the same mistake.
 *
 * Given the lists, it answers with ids, and grounding becomes "is this a real
 * id?" — an exact check against what exists, which is a stronger guarantee than
 * "is this word in the sentence?" and stops discarding correct readings. It is
 * about 300 tokens.
 *
 * @param {{members?: Array, categories?: Array}} context
 * @returns {string} lines to append to FOLLOWUP_INSTRUCTIONS
 */
export function contextInstructions({ members = [], absent = [], categories = [] } = {}) {
  const lines = [];
  if (members.length) {
    lines.push("", "Who is eating this plan (id — label):");
    for (const m of members) lines.push(`- ${m.id} — ${m.label ?? "someone"}`);
  }
  if (absent.length) {
    lines.push("", "Also in this household, but not eating this plan (id — label):");
    for (const m of absent) lines.push(`- ${m.id} — ${m.label ?? "someone"}`);
  }
  if (categories.length) {
    lines.push("", "The kinds of food this shop sells (key — name):");
    for (const c of categories) lines.push(`- ${c.key} — ${c.label}`);
  }
  return lines.join("\n");
}

const ModelFollowUpSchema = z.object({
  budget: z.object({ change: z.enum(["none", "set", "cheaper", "remove"]), rupees: z.number().positive().max(1000000).nullable() }),
  days: z.number().int().min(1).max(MAX_DAYS).nullable(),
  leaveOut: z.array(z.string().max(40)).max(8),
  include: z.array(z.string().max(40)).max(8).default([]),
  swaps: z.array(z.object({ from: z.string().max(40), to: z.string().max(40) })).max(4).default([]),
  avoid: z.array(z.object({ key: z.enum([...AVOID_KEYS]), who: z.string().max(40).nullable() })).max(8),
  targets: z.array(z.object({ who: z.string().max(40).nullable(), nutrient: z.enum(["protein", "kcal"]), perDay: z.number().positive() })).max(8),
  unresolved: z.array(z.string().max(60)).max(8),
  dropMembers: z.array(z.string().max(64)).max(8).default([]),
  addMembers: z.array(z.string().max(64)).max(8).default([]),
  leaveOutCategories: z.array(z.string().max(64)).max(8).default([]),
  includeCategories: z.array(z.string().max(64)).max(8).default([]),
});

/**
 * A model's reading of a follow-up, held to the sentence. null when unusable.
 * @param {unknown} raw
 * @param {string} input
 */
export function groundFollowUp(raw, input, context = {}) {
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
    // Ids are held to what exists, not to what the sentence spells. This is
    // the whole point of giving the model the lists: "my wife" reaches a member
    // and "another dry fruit" a category, neither of which the shopper typed in
    // KOI's words, and neither of which a verbatim check could ever have let
    // through. An id that is not on the list is dropped exactly as firmly.
    dropMembers: onlyReal(r.dropMembers, (context.members ?? []).map((m) => String(m.id))),
    // Somebody joining is checked against everyone this household shops for,
    // not against who is already eating — the whole point is that they are not.
    addMembers: onlyReal(r.addMembers, [...(context.members ?? []), ...(context.absent ?? [])].map((m) => String(m.id))),
    leaveOutCategories: onlyReal(r.leaveOutCategories, (context.categories ?? []).map((c) => c.key)),
    includeCategories: onlyReal(r.includeCategories, (context.categories ?? []).map((c) => c.key)),
  };
}

/** The ids that are real, in the order given, without repeats. */
const onlyReal = (said, real) => {
  const known = new Set(real.map(String));
  return [...new Set((said ?? []).map(String).filter((id) => known.has(id)))];
};

/** Rules and model together: the model's reading where it has one, and every restriction either found. */
export function mergeFollowUps(local, model) {
  if (!model) return local;
  const byKey = (list) => [...new Map(list.map((x) => [JSON.stringify(x), x])).values()];
  // Where the model says who an avoid is for and the rules could not, its reading replaces
  // the rules' "everyone" (the plan leaves the product out for the household either way).
  const namedByModel = new Set(model.avoid.filter((a) => a.who).map((a) => a.key));
  // And the other way: "son is allergic to peanuts" read by the rules as the
  // son's is not undone by a model reading it as everyone's.
  const namedByRules = new Set(local.avoid.filter((a) => a.who).map((a) => a.key));
  return {
    budget: model.budget.change !== "none" ? model.budget : local.budget,
    days: model.days ?? local.days,
    // A food the rules read as one person's ("no dates for Wife") stays theirs:
    // the model's household-wide "dates" would take it from everyone.
    leaveOut: [...new Set([...local.leaveOut, ...model.leaveOut])]
      .filter((w) => !(local.leaveOutFor ?? []).some((f) => f.product === w || f.product.includes(w) || w.includes(f.product))),
    leaveOutFor: local.leaveOutFor ?? [],
    include: [...new Set([...(local.include ?? []), ...(model.include ?? [])])],
    swaps: [...new Map([...(local.swaps ?? []), ...(model.swaps ?? [])].map((s) => [`${s.from}>${s.to}`, s])).values()],
    avoid: byKey([...local.avoid.filter((a) => a.who || !namedByModel.has(a.key)), ...model.avoid.filter((a) => a.who || !namedByRules.has(a.key))]),
    targets: model.targets.length ? model.targets : local.targets,
    dayNames: local.dayNames || model.dayNames,
    unresolved: [...new Set([...local.unresolved, ...model.unresolved])],
    // Only the model answers in ids: the rules have never been shown the lists.
    dropMembers: model.dropMembers ?? [],
    addMembers: model.addMembers ?? [],
    leaveOutCategories: model.leaveOutCategories ?? [],
    includeCategories: model.includeCategories ?? [],
    message: local.message,
  };
}

// ── Applying it ──────────────────────────────────────────────────────────────

/** Is this product shelved under that category, or under something below it? */
const inThisCategory = (categoryKey, wanted) =>
  Boolean(categoryKey) && (String(categoryKey) === wanted || String(categoryKey).startsWith(`${wanted}.`));

/** A category in the words KOI shows for it, never its key. */
const categoryWords = (key) => nodeInfo(key)?.subcategory ?? nodeInfo(key)?.label ?? String(key).split(".").pop().replace(/_/g, " ");

/** The members a person's words refer to: a label, a kind ("the kids"), "me", or everyone. */
export function membersNamed(words, members) {
  if (!words) return members;
  // "for my wife" is Wife. The possessive is the shopper's, not a name.
  const w = normalise(words).replace(/^(?:the|my|our|your)\s+/, "");
  if (/^(everyone|everybody|all|all of us|us|the family|family)$/.test(w)) return members;
  const exact = members.filter((m) => normalise(m.label) === w);
  if (exact.length) return exact;
  const singular = w.replace(/(ren|s)$/, "");
  const kinds = { kid: ["kid", "child", "children"], adult: ["adult"], senior: ["senior", "grandparent"], teen: ["teen"], person: ["person", "people"] };
  const kind = Object.entries(kinds).find(([, names]) => names.some((n) => singular === n || w === n))?.[0];
  if (kind) return members.filter((m) => normalise(m.label).startsWith(kind));
  const contains = members.filter((m) => normalise(m.label).includes(w));
  if (contains.length) return contains;
  // Failing the whole phrase, any word of it: "my wife" against "Wife".
  const parts = w.split(" ").filter((p) => p.length > 1);
  return members.filter((m) => parts.some((p) => normalise(m.label).includes(p)));
}

/**
 * How Indian shoppers spell the same food, and what they call a shelf.
 *
 * This was a hardcoded table here. It is the graph's answer now
 * (food.ingredient_alias and food.category_alias, migration 00059, compiled by
 * scripts/buildFoodWords.mjs): the same knowledge the label engine already
 * read, in one place, where a new spelling is a row rather than a deploy.
 */

/** Every word that could mean the same food as this one. */
function spellings(word) {
  const w = normalise(word);
  const forms = new Set([w, w.replace(/e?s$/, ""), `${w}s`]);
  // The graph's families, by the word itself and by its singular and plural:
  // a shopper writes "dals" and the row says "dal".
  for (const form of [...forms]) {
    for (const other of WORD_FAMILIES[form] ?? []) forms.add(other);
  }
  return [...forms].filter((f) => f.length >= 3);
}

/** The shelf a word means, when it means a kind of food rather than a product. */
function categoryFor(word) {
  const w = normalise(word);
  return CATEGORY_WORDS[w] ?? CATEGORY_WORDS[w.replace(/e?s$/, "")] ?? CATEGORY_WORDS[`${w}s`] ?? null;
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
  // The word itself first, then everything the graph says means the same.
  // "Almonds" must reach California Almonds before Daily Dry Fruit Mix: the
  // graph groups every tree nut into one family because that is what an
  // allergen needs, and a shopper asking for almonds means almonds.
  const itself = [w, w.replace(/e?s$/, ""), `${w}s`].filter((f) => f.length >= 3);
  const matches = (item, words) => {
    const tokens = normalise(item.name).split(/[^a-z0-9]+/).filter(Boolean);
    const name = ` ${tokens.join(" ")} `;
    return words.some((f) => name.includes(` ${f} `) || (f.includes(" ") && name.includes(f)) || tokens.some((t) => almost(t, f)));
  };
  // Anything actually called that, and then nothing else: the family is how a
  // word FINDS a product, not a reason to sweep up its cousins. "Remove the
  // almonds" once took the Daily Dry Fruit Mix out with them, because the graph
  // files every tree nut together for the allergen reader, and the mix was then
  // gone before "put another dry fruit in" could ask for it.
  const byWord = catalogue.filter((item) => matches(item, itself));
  if (byWord.length) return byWord;
  const named = catalogue.filter((item) => matches(item, forms));
  if (named.length) return named;
  // Nothing is called that, so it is a kind of food. The graph is asked first:
  // "dry fruit" is a word for a shelf (food.category_alias), and no amount of
  // matching product names would ever have found it.
  const shelf = categoryFor(w);
  if (shelf) {
    const onIt = catalogue.filter((item) => inThisCategory(item.categoryKey, shelf));
    if (onIt.length) return onIt;
  }
  // Failing that, the category's own key and the words KOI shows for it.
  return catalogue.filter((item) => {
    const info = item.categoryKey ? nodeInfo(item.categoryKey) : null;
    // The product's own category, never its aisle: "Nuts, seeds & dried fruit"
    // would make a peanut butter answer to "dry fruit".
    const where = [
      String(item.categoryKey ?? "").replace(/[._]/g, " "),
      info?.subcategory ?? info?.label ?? "",
    ].map((v) => ` ${normalise(v)} `);
    return forms.some((f) => where.some((w) => w.includes(` ${f} `) || (f.includes(" ") && w.includes(f))));
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
 * @param {object} plan { members, days, budget, excludedSkus, cost, barred? }
 *   `barred`: Map skuId → why the plan can't use it, in words; nothing is swapped into one
 * @param {object} reading from readFollowUp / mergeFollowUps
 * @param {Array} catalogue plannable rows (for leave-out words)
 * @returns {{ members, days, budget, excludedSkus, includedSkus, wants, applied: string[], notApplied: string[], householdChanges: Array }}
 *   `householdChanges` are the parts that describe a person rather than this
 *   plan — a target, an avoid — keyed by the stored member id. They change the
 *   plan only; the shopper is asked before any is saved (Phase 4.4).
 */
export function applyFollowUp(plan, reading, catalogue) {
  const applied = [];
  const notApplied = [];
  // What a line of `applied` promised to put in the basket. The solver has the
  // last word: a promise it cannot keep is walked back, not left standing.
  const wants = [];
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

  // A swap is one change: nothing goes out unless something can come in. A swap
  // the page built from a card (an upgrade) names its products by id, so there
  // is no word to resolve; one read off a sentence names them by word.
  const bySku = (id) => catalogue.filter((item) => String(item.skuId) === String(id));
  // What the plan being changed could not use, and why, in words (planFollowUp
  // reads it off that plan's explanation): kept out of the house, no one here
  // can eat it, KOI cannot measure it, too big, priced out.
  const barred = plan.barred ?? new Map();
  const leftOut = (item) => [...excluded].some((id) => String(id) === String(item.skuId));
  for (const swap of reading.swaps ?? []) {
    const out = swap.fromSku ? bySku(swap.fromSku) : productsNamed(swap.from, catalogue);
    const named = (swap.toSku ? bySku(swap.toSku) : productsNamed(swap.to, catalogue))
      .filter((item) => !out.some((o) => o.skuId === item.skuId));
    // Only a product the plan can actually use: swapping into one it can't took
    // the old product out and put nothing in.
    const inTo = named.filter((item) => !barred.has(String(item.skuId)) && !leftOut(item));
    if (!out.length) {
      notApplied.push(`Nothing in this plan is called "${swap.from}"`);
      continue;
    }
    if (!named.length) {
      notApplied.push(`KOI has nothing called "${swap.to}" to swap in, so KOI kept the ${swap.from}`);
      continue;
    }
    if (!inTo.length) {
      const [first] = named;
      const why = barred.get(String(first.skuId)) ?? `${first.name} was left out of this plan`;
      notApplied.push(`${why}, so KOI kept the ${swap.from}`);
      continue;
    }
    out.forEach((h) => excluded.add(h.skuId));
    inTo.slice(0, 1).forEach((h) => included.add(h.skuId));
    const line = `${inTo[0].name} instead of ${out.map((h) => h.name).join(", ")}`;
    applied.push(line);
    wants.push({ skuId: inTo[0].skuId, name: inTo[0].name, line });
  }

  // What the model resolved against the lists it was given. These are ids, so
  // there is nothing left to guess: no spelling to match, no verb to read off
  // the sentence. They run before the word-matching below, and the words then
  // add whatever they find on top.
  for (const memberId of reading.dropMembers ?? []) {
    const gone = members.find((m) => String(m.id) === String(memberId));
    if (!gone) continue;
    if (members.length <= 1) {
      notApplied.push("A plan needs someone to eat it, so KOI cannot leave everyone out");
      continue;
    }
    members.splice(members.indexOf(gone), 1);
    applied.push(`Planned without ${gone.label}`);
  }

  // Who this change brought in, so the word loop below can tell "she is already
  // here because you just asked for her" from "she was always here".
  const joined = new Set();
  for (const memberId of reading.addMembers ?? []) {
    if (members.some((m) => String(m.id) === String(memberId))) continue;
    const joining = (plan.roster ?? []).find((m) => String(m.id) === String(memberId));
    if (!joining) continue;
    members.push({ ...joining, targets: { ...joining.targets }, avoidFlags: [...(joining.avoidFlags ?? [])], softAvoidFlags: [...(joining.softAvoidFlags ?? [])] });
    joined.add(String(joining.id));
    applied.push(`Planned for ${joining.label} as well`);
  }

  for (const key of reading.leaveOutCategories ?? []) {
    const hits = catalogue.filter((item) => inThisCategory(item.categoryKey, key));
    if (!hits.length) {
      notApplied.push(`KOI has nothing shelved under ${categoryWords(key)}`);
      continue;
    }
    hits.forEach((h) => excluded.add(h.skuId));
    applied.push(`Left out ${categoryWords(key)}`);
  }

  // Products the page names by id: the week's menu asking for what its dishes
  // need (Plan page, slice 2b). An id is exact, so there is no word to read.
  for (const id of reading.includeSkus ?? []) {
    const hit = bySku(id)[0];
    if (!hit) {
      notApplied.push("A product the menu asked for is not in the shop right now");
      continue;
    }
    if (excluded.has(hit.skuId)) {
      notApplied.push(`${hit.name} was left out of this plan, so it was not added back`);
      continue;
    }
    included.add(hit.skuId);
    const line = `Added ${hit.name} for your menu`;
    applied.push(line);
    wants.push({ skuId: hit.skuId, name: hit.name, line });
  }

  for (const key of reading.includeCategories ?? []) {
    const hits = catalogue.filter((item) => inThisCategory(item.categoryKey, key) && !excluded.has(item.skuId));
    if (!hits.length) {
      notApplied.push(`KOI has nothing shelved under ${categoryWords(key)} to add`);
      continue;
    }
    included.add(hits[0].skuId);
    const line = `Added ${hits[0].name}`;
    applied.push(line);
    wants.push({ skuId: hits[0].skuId, name: hits[0].name, line });
  }

  // A food left out for one person: refused for them this week, still bought for
  // anyone else who eats it (the member's skipSkus, model.js refusedBy).
  for (const { product, who } of reading.leaveOutFor ?? []) {
    const hits = productsNamed(product, catalogue);
    const forWhom = membersNamed(who, members);
    if (!hits.length) {
      notApplied.push(`Nothing in this plan is called "${product}"`);
      continue;
    }
    if (!forWhom.length) {
      notApplied.push(`KOI couldn't tell who "${who}" is, so the ${product} stays`);
      continue;
    }
    for (const m of forWhom) m.skipSkus = [...new Set([...(m.skipSkus ?? []), ...hits.map((h) => String(h.skuId))])];
    applied.push(`No ${hits[0].name} for ${forWhom.map((m) => m.label ?? "them").join(", ")}`);
  }

  for (const word of reading.leaveOut) {
    const hits = productsNamed(word, catalogue);
    if (!hits.length) {
      // Not a food. "Replan without my wife" is a person leaving the week, not
      // a product KOI could not find, and answering it with "nothing KOI can
      // plan with is called wife" was both useless and faintly rude.
      //
      // Products are tried first, so a household with someone labelled Honey
      // still gets honey when they ask for it: this only ever runs where the
      // old answer was that nothing matched at all.
      const who = normalise(word) ? membersNamed(word, members) : [];
      if (who.length && who.length < members.length) {
        const gone = new Set(who.map((m) => m.id));
        for (let i = members.length - 1; i >= 0; i -= 1) if (gone.has(members[i].id)) members.splice(i, 1);
        applied.push(`Planned without ${who.map((m) => m.label).join(", ")}`);
        continue;
      }
      if (who.length && who.length >= members.length) {
        notApplied.push("A plan needs someone to eat it, so KOI cannot leave everyone out");
        continue;
      }
      notApplied.push(`Nothing KOI can plan with is called "${word}"`);
      continue;
    }
    hits.forEach((h) => excluded.add(h.skuId));
    applied.push(`Left out ${hits.map((h) => h.name).join(", ")}`);
  }

  for (const word of reading.include ?? []) {
    const hits = productsNamed(word, catalogue).filter((item) => !excluded.has(item.skuId));
    if (!hits.length) {
      // Not a food, so the same question the removal side asks: is it a person?
      // "Can you plan for my wife too" is somebody joining the week, and the
      // roster is the only place they can be found — by definition they are not
      // among the members this plan already feeds.
      // Already here? Then the ask is answered. Saying "KOI has nothing called
      // wife to add" about somebody who was just added is worse than saying
      // nothing — live, the model resolved "my wife" to an id and added her,
      // and this loop then called her missing in the same breath. But somebody
      // who was already eating is worth a word: "nothing could be applied" told
      // a shopper who asked for his wife precisely nothing.
      const here = normalise(word) ? membersNamed(word, members) : [];
      if (here.length && here.length < members.length) {
        if (!here.every((m) => joined.has(String(m.id)))) {
          notApplied.push(`${here.map((m) => m.label).join(", ")} is already eating this plan`);
        }
        continue;
      }
      const joining = normalise(word)
        ? membersNamed(word, (plan.roster ?? []).filter((r) => !members.some((m) => String(m.id) === String(r.id))))
        : [];
      if (joining.length && joining.length < (plan.roster ?? []).length) {
        for (const m of joining) {
          members.push({ ...m, targets: { ...m.targets }, avoidFlags: [...(m.avoidFlags ?? [])], softAvoidFlags: [...(m.softAvoidFlags ?? [])] });
        }
        applied.push(`Planned for ${joining.map((m) => m.label).join(", ")} as well`);
        continue;
      }
      notApplied.push(`KOI has nothing called "${word}" to add`);
      continue;
    }
    // One product, not every match: "add oats" is a pack of oats, not the shelf.
    included.add(hits[0].skuId);
    const line = `Added ${hits[0].name}`;
    applied.push(line);
    wants.push({ skuId: hits[0].skuId, name: hits[0].name, line });
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
    wants,
    // "no dairy" is milk and lactose, and the rules and the model can each
    // find the same one: say each change once.
    applied: [...new Set(applied)],
    notApplied: [...new Set(notApplied)],
    householdChanges: [...changesByMember.values()],
  };
}
