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
const STOP = new Set([
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

/**
 * The words that name an avoid itself, per avoid key. "No nuts" is an avoid;
 * "no paneer" is a product. Search reads "no paneer" as "avoid milk", which is
 * the right tightening for a filter, but in a plan it would take every dairy
 * product out of the week when the shopper only said paneer.
 */
const AVOID_EXTRA_WORDS = Object.freeze({
  tree_nuts: ["nut", "nuts"], peanuts: ["peanut", "groundnut", "nuts"], milk: ["dairy"], lactose: ["dairy"],
  eggs: ["egg"], gluten: ["wheat"], soy: ["soya"], red_meat: ["meat"], refined_sugar: ["sugar"],
  high_sodium: ["salt", "sodium"], spicy_food: ["spicy"], artificial_sweeteners: ["sweetener", "sweeteners"],
  preservatives: ["preservative"], artificial_colours: ["colour", "colours", "color", "colors"],
  artificial_flavours: ["flavour", "flavours", "flavor", "flavors"], caffeine: ["coffee"], shellfish: ["prawn", "prawns", "seafood"],
});
const AVOID_WORDS = Object.freeze(Object.fromEntries(FOODS_AVOID.map((a) => [
  a.key,
  [...new Set([a.key.replace(/_/g, " "), normalise(a.label), ...(AVOID_EXTRA_WORDS[a.key] ?? [])])],
])));

/** Avoid keys a sentence names in so many words. */
const avoidKeysNamed = (text) => Object.entries(AVOID_WORDS)
  .filter(([, words]) => words.some((w) => ` ${normalise(text)} `.includes(` ${w} `)))
  .map(([key]) => key);

/** The product words after "no", "swap", "without"… in a sentence. */
function leaveOutWords(text) {
  const words = [];
  for (const m of text.matchAll(LEAVE_OUT)) {
    const kept = [];
    for (const w of m[1].split(" ")) {
      if (STOP.has(w) || DAY_NAMES.test(w)) break;
      kept.push(w);
    }
    const phrase = kept.join(" ");
    if (phrase && !avoidKeysNamed(phrase).length) words.push(phrase);
  }
  return [...new Set(words)];
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
  const leaveOut = leaveOutWords(text);
  const avoidText = leaveOut.reduce((t, phrase) => ` ${t} `.replace(` ${phrase} `, " "), text);
  const reading = interpret(avoidText);
  const who = text.match(WHO)?.[1] ?? null;
  return {
    budget,
    days: followUpDays(text),
    leaveOut,
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
  "- leaveOut: products to leave out or swap out, as the product words copied exactly from the message (\"oats\", \"paneer\"). Not allergens: those go in avoid.",
  `- avoid: what someone must not eat, using these keys only: ${AVOID_KEYS.join(", ")}. who is the person's words copied exactly from the message (\"Kid 1\", \"the kids\", \"me\"), or null for everyone.`,
  "- targets: a daily protein (grams) or energy (kcal) target, only at a number written in the message. who as above.",
  "- Never invent a number. Anything you cannot express goes in unresolved, copied word for word.",
].join("\n");

const ModelFollowUpSchema = z.object({
  budget: z.object({ change: z.enum(["none", "set", "cheaper", "remove"]), rupees: z.number().positive().max(1000000).nullable() }),
  days: z.number().int().min(1).max(MAX_DAYS).nullable(),
  leaveOut: z.array(z.string().max(40)).max(8),
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

  return {
    budget,
    days: r.days !== null && r.days === weekDays ? r.days : null,
    leaveOut: r.leaveOut.map((w) => normalise(w)).filter((w) => said(w) && !avoidKeysNamed(w).length),
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

/** Catalogue rows whose name carries the word (or its singular or plural). */
export function productsNamed(word, catalogue) {
  const w = normalise(word);
  if (w.length < 3) return [];
  const forms = new Set([w, w.replace(/e?s$/, ""), `${w}s`]);
  return catalogue.filter((item) => {
    const name = ` ${normalise(item.name)} `;
    return [...forms].some((f) => f.length >= 3 && name.includes(` ${f} `));
  });
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

  for (const word of reading.leaveOut) {
    const hits = productsNamed(word, catalogue);
    if (!hits.length) {
      notApplied.push(`Nothing KOI can plan with is called "${word}"`);
      continue;
    }
    hits.forEach((h) => excluded.add(h.skuId));
    applied.push(`Left out ${hits.map((h) => h.name).join(", ")}`);
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

  return { members, days, budget, excludedSkus: [...excluded], applied, notApplied, householdChanges: [...changesByMember.values()] };
}
