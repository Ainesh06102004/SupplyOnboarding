// ============================================================================
// KOI's agent: one message, a few steps. Pure.
//
// Phase 3 of the Plan page. The model (when there is one) only ROUTES: it
// says which of KOI's tools to use, in what order, and hands each tool the
// words of the message that belong to it. It never writes a number, a product,
// a claim or a basket — the tools do the work, the planner decides, and every
// line the page shows is a template (lib/plan/runSteps.js).
//
// The tools are the functions KOI already has:
//
//   plan      a fresh plan (planForHousehold), reading days, budget, who and
//             any stated target from its words
//   change    a change to the plan on screen (planFollowUp) — cheaper, leave
//             out, add, swap, avoid, targets, days, people
//   without   "what if I can't get X" (planWithout)
//   cart      put the plan in the cart (done by the page, which holds the cart)
//   show      open a step of the page
//   explain   what the plan gave up and why (the explanation, as templates)
//
// The model reads the message for what the shopper MEANS — no splitting at
// "then" or "and" — and writes each step as a short instruction in its own
// words ("i want something lighter on the wallet" → change: "make it
// cheaper"). groundSteps then holds every instruction to the message: it may
// rephrase, but every food, person and number in it must be one the shopper
// wrote (or a person or product already on the page). The rules below are the
// fallback when there is no model or its answer can't be used.
// ============================================================================

import { allergensIn } from "@/lib/food/allergens";
import { readFollowUp } from "@/lib/planner/followup";

export const AGENT_TOOLS = Object.freeze(["plan", "change", "without", "cart", "show", "explain"]);
export const MAX_STEPS = 5;
const STEP_KEYS = Object.freeze(["define", "you", "plan", "pantry", "shop", "track"]);

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const norm = (s) => clean(s).toLowerCase().replace(/[’']/g, "'");

/**
 * The message, split where it says to do one thing after another: "then",
 * "after that", "and also", a full stop or a semicolon. A plain "and" stays
 * inside a step — "no biscuits and add oats" is one change.
 */
export function splitClauses(text) {
  return clean(text)
    .split(/(?:\s*[.;!?]\s+|\s*;\s*|,?\s+(?:and\s+)?then\s+|,?\s+after that,?\s+|,?\s+and also\s+|,?\s+also,?\s+)/i)
    // "…. then make it cheaper": the joining word belongs to neither step.
    .map((c) => clean(c).replace(/^(?:and then|then|and also|also|after that|and|so)\b,?\s*/i, ""))
    .filter((c) => c.length > 1);
}

const SHOW = /\b(?:show|open|go to|take me to|see)\b.*?\b(define|you|plan|pantry|shop|track|cart|groceries|basket)\b/;
const CART = /\b(?:(?:add|put)\s+(?:it|them|this|that|everything|all(?: of it)?|the (?:plan|basket|week|lot))?\s*(?:in|into|to)\s+(?:my |the )?cart|order it|check ?out|buy (?:it|them|everything|it all))\b/;
const WITHOUT = /\b(?:can'?t|cannot|couldn'?t|could not|unable to)\s+(?:get|find|buy)\s+(?:the\s+|any\s+)?(.+)|(.+?)\s+(?:is|are)\s+(?:out of stock|unavailable|not available)/;
const EXPLAIN = /^(?:why|how come|what did (?:you|it) give up|explain|what(?:'s| is) (?:short|missing))\b/;
const PLAN = /\b(?:plan|replan|re-plan|start (?:over|again)|new plan|make (?:me )?a plan)\b/;
/** Words that change a plan, as opposed to asking for a new one. */
const CHANGE_CUES = /\b(?:cheaper|no\s|without|remove|drop|add|more|less|swap|replace|instead|budget|protein|kcal|calories|days?|for\s+\w+\s+too|skip)\b/;

/** A step's tool, from its words alone. `hasPlan` says whether a plan is on screen. */
export function routeClause(clause, { hasPlan = false } = {}) {
  const t = norm(clause);
  const show = SHOW.exec(t);
  if (show && !CART.test(t)) {
    const step = show[1] === "cart" || show[1] === "basket" ? "shop" : show[1] === "groceries" ? "pantry" : show[1];
    return { tool: "show", text: clean(clause), args: { step: STEP_KEYS.includes(step) ? step : "plan" } };
  }
  if (CART.test(t)) return { tool: "cart", text: clean(clause), args: {} };
  const without = WITHOUT.exec(t);
  if (without) {
    const words = clean(without[1] ?? without[2]).replace(/[?.!]+$/, "");
    return { tool: "without", text: clean(clause), args: { product: words.slice(0, 60) } };
  }
  if (EXPLAIN.test(t)) return { tool: "explain", text: clean(clause), args: {} };
  if (PLAN.test(t) && !(hasPlan && /\b(?:the|this) plan\b/.test(t) && CHANGE_CUES.test(t))) {
    return { tool: "plan", text: clean(clause), args: {} };
  }
  return { tool: "change", text: clean(clause), args: {} };
}

/**
 * The steps for a whole message, in order, at most MAX_STEPS.
 *
 * Without a plan on screen the first step has to make one: a message that
 * starts "add oats" plans first and then adds them. A plan step whose words
 * also change products ("plan the week, no biscuits") is followed by a change
 * with the same words — the planner reads days and budget, the follow-up
 * reads the products (as the old copilot did).
 */
export function routeMessage(text, { hasPlan = false, productWords = () => false } = {}) {
  const steps = [];
  let planned = hasPlan;
  for (const clause of splitClauses(text)) {
    let step = routeClause(clause, { hasPlan: planned });
    // No plan yet: the first change is read as the plan ("for me and my wife
    // on 4000"), and runs again as a change only if it names products.
    if (!planned && step.tool === "change") step = { ...step, tool: "plan" };
    if (!planned && !["plan", "show", "explain"].includes(step.tool)) {
      steps.push({ tool: "plan", text: clause, args: {} });
      planned = true;
    }
    steps.push(step);
    if (step.tool === "plan") {
      planned = true;
      if (productWords(clause)) steps.push({ tool: "change", text: clause, args: {} });
    }
  }
  // "plan … plan" twice in a row is one plan.
  return steps.filter((s, i) => !(s.tool === "plan" && steps[i - 1]?.tool === "plan")).slice(0, MAX_STEPS);
}

/** What a step is, in words, for the run's "KOI will…" line. Templates only. */
export function stepLabel(step) {
  switch (step.tool) {
    case "plan": return "Plan the week";
    case "change": {
      // The model's summary when there is one (inShoppersWords); the words run are the shopper's.
      const t = clean(step.label ?? step.text);
      return `Change it: ${t.length > 70 ? `${t.slice(0, 70).replace(/\s+\S*$/, "")}…` : t}`;
    }
    case "without": return `Check without ${step.args?.product ?? "it"}`;
    case "cart": return "Put it in your cart";
    case "show": return `Show you ${step.args?.step === "shop" ? "the shop" : step.args?.step ?? "the plan"}`;
    case "explain": return "Say what it gave up";
    default: return "Do it";
  }
}

// ── The model's reading ──────────────────────────────────────────────────────

export const ROUTER_SCHEMA_NAME = "koi_agent_steps";
export const ROUTER_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      maxItems: MAX_STEPS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tool", "instruction", "step", "product"],
        properties: {
          tool: { type: "string", enum: [...AGENT_TOOLS] },
          instruction: { type: "string" },
          step: { type: ["string", "null"], enum: [...STEP_KEYS, null] },
          product: { type: ["string", "null"] },
        },
      },
    },
  },
});

export const ROUTER_INSTRUCTIONS = [
  "A shopper is on KOI's weekly grocery planner for their household and types one message, in any words or mix of languages. Work out what they want done and turn it into a few steps, in the order they want them, each using one tool.",
  "Tools:",
  "- plan: make a new plan. instruction says the days, budget, people and any stated targets they asked for (\"plan 7 days on 4000 for me and Wife\"). Asking to plan, sort out, do or start the week (again) from scratch is a new plan even when one is on screen. Changing the days, budget or people of the plan on screen (\"make it 5 days\") is a change, not a plan.",
  "- change: change the plan already made. instruction is a short plain request KOI's planner can read: make it cheaper, no <product>, no <product> for <person> (when only one person doesn't want it — keep who it is for), add <product>, swap <product> for <product>, more/less of <product>, <person> avoids <food>, <number> g protein for <person>, <number> days, plan for <person> too, not for <person>. Put changes that belong together in one change step.",
  "- without: they ask what happens if they can't get a product. product is that product, in their words.",
  "- cart: they want the plan put in their cart or ordered.",
  "- show: they want to see a part of the page; step is one of define, you, plan, pantry, shop, track.",
  "- explain: they ask why, or what the plan gave up.",
  "Understand what they mean, not the literal words: \"something lighter on the wallet\" is a change \"make it cheaper\"; \"can we see what I'm buying\" is show shop.",
  "Every change they ask for (days, budget, people, products, targets) goes in the change or plan step, all of it. cart, show and explain only act on the plan as it then is: their instruction never carries a change. \"add paneer and make it 5 days, then order it\" is change \"add paneer, 5 days\" then cart. Adding foods to the plan on screen is a change, not a new plan. Add a show step only when they ask to see or go to part of the page.",
  "Never add a food, person or number the message and the lists below do not contain. A number is only one the shopper wrote. If there is no plan yet, start with a plan step. At most five steps. Nothing to do → an empty list.",
].join("\n");

/** What the model is told about the page: who is eating, what is in the basket, whether a plan exists. */
export function routerContext({ hasPlan = false, people = [], products = [] } = {}) {
  return [
    `A plan is ${hasPlan ? "on screen" : "not made yet"}.`,
    people.length ? `People in the household: ${people.join(", ")}.` : "",
    products.length ? `Products in the plan: ${products.slice(0, 40).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

const wordsOf = (s) => norm(s).replace(/[^a-z0-9₹' ]/g, " ").split(/\s+/).filter(Boolean);
const numbersOf = (s) => (norm(s).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
/** The foods a piece of text names, through the ingredient graph ("paneer" → Milk, "chana" → Chickpea). */
const foodsIn = (s) => new Set(allergensIn(String(s ?? "")).ingredients ?? []);

/**
 * A model's steps, held to the message. It may rephrase freely — that is the
 * point — but it may not bring in anything the shopper didn't:
 *   * a number must be one the message contains;
 *   * a food (anything the ingredient graph recognises) must be one the message
 *     names, or one of the products already in the plan;
 *   * a person must be one the message names ("my wife" → Wife; "I" → Me).
 * A step that breaks this is dropped on its own; the others still run. For
 * cart, show and explain only the tool matters, never the wording.
 * null when the answer is unusable, or every step was dropped.
 */
export function groundSteps(raw, text, { hasPlan = false, people = [], products = [] } = {}) {
  const steps = Array.isArray(raw?.steps) ? raw.steps : null;
  if (!steps) return null;
  const said = new Set(wordsOf(text));
  // A week is 7 days and a fortnight 14: saying the word states the number.
  const stated = new Set([...numbersOf(text), ...(said.has("week") ? [7] : []), ...(said.has("fortnight") ? [14] : [])]);
  // "All of us", "everyone", "the family": every person may be named.
  const everyoneSaid = /\b(?:all of us|everyone|everybody|whole family|the family|our family|household|all of them)\b/.test(norm(text));
  const foodsSaid = new Set([...foodsIn(text), ...products.flatMap((p) => [...foodsIn(p)])]);
  const productWords = new Set(products.flatMap(wordsOf));
  const selfWords = ["i", "me", "my", "myself", "i'm", "i'd"];
  const personSaid = (label) => {
    const w = wordsOf(label);
    if (!w.length || everyoneSaid) return true;
    if (label.toLowerCase() === "me") return selfWords.some((x) => said.has(x));
    return w.every((x) => said.has(x));
  };
  const allowed = (instruction) => {
    if (!numbersOf(instruction).every((n) => stated.has(n))) return false;
    if (![...foodsIn(instruction)].every((f) => foodsSaid.has(f))) return false;
    const words = new Set(wordsOf(instruction));
    // A person named in the instruction, by their label, who the message never mentions.
    const named = people.filter((label) => label.toLowerCase() !== "me" && wordsOf(label).every((x) => words.has(x)) && !wordsOf(label).every((x) => productWords.has(x)));
    return named.every(personSaid);
  };
  const out = [];
  let dropped = 0;
  for (const s of steps.slice(0, MAX_STEPS)) {
    if (!AGENT_TOOLS.includes(s?.tool)) return null;
    const instruction = clean(s.instruction);
    const checked = ["plan", "change", "without"].includes(s.tool);
    if (!instruction || (checked && !allowed(instruction)) || (s.tool === "without" && (!s.product || !allowed(s.product)))) {
      dropped += 1;
      continue;
    }
    out.push({
      tool: s.tool,
      text: instruction,
      args: s.tool === "show" ? { step: STEP_KEYS.includes(s.step) ? s.step : "plan" }
        : s.tool === "without" ? { product: clean(s.product).slice(0, 60) }
          : {},
    });
  }
  if (dropped && !out.length) return null;
  // Changes one after another are one change: one solve, one line to undo
  // ("70 g protein for Wife" + "no biscuits for Son").
  for (let i = out.length - 1; i > 0; i -= 1) {
    if (out[i].tool === "change" && out[i - 1].tool === "change") {
      out[i - 1] = { ...out[i - 1], text: `${out[i - 1].text.replace(/[.;\s]+$/, "")}; ${out[i].text}` };
      out.splice(i, 1);
    }
  }
  // A change, a without or a cart needs a plan before it.
  if (!hasPlan && out.length && !["plan", "show", "explain"].includes(out[0].tool)) out.unshift({ tool: "plan", text: clean(text).slice(0, 200), args: {} });
  return out.slice(0, MAX_STEPS);
}

// "take ME to my pantry" is not leaving anything out.
const NOT_FOOD = new Set(["me", "us", "him", "her", "them", "you", "myself", "everyone", "everybody", "all", "it", "this", "that", "my", "our"]);

/**
 * Whether the rules can see this message change the plan: a budget, days, a
 * product in or out, an avoid, a target. Phrases that are only people or
 * pronouns don't count.
 */
export function asksForChange(text, people = []) {
  const r = readFollowUp(String(text ?? ""));
  const person = new Set(people.map((p) => String(p).toLowerCase()));
  const food = (phrase) => String(phrase ?? "").split(/\s+/).filter(Boolean).some((w) => !NOT_FOOD.has(w) && !person.has(w));
  return r.budget.change !== "none" || Boolean(r.days) || r.avoid.length > 0 || r.targets.length > 0
    || r.leaveOut.some(food) || r.include.some(food) || r.leaveOutFor.some((f) => food(f.product))
    || r.swaps.some((s) => food(s.from) || food(s.to));
}

/**
 * The model's steps, with nothing the shopper asked to change left out. The
 * model sometimes folds a change into the step after it ("add paneer and make
 * it 5 days, then order it" read as one cart step), and a cart or show step
 * changes nothing. When the rules see a change and the model's steps make
 * none, the whole message goes in as a change, before the page's own steps.
 */
export function withChangeFloor(steps, text, context = {}) {
  if (!context.hasPlan || steps.some((s) => s.tool === "plan" || s.tool === "change")) return steps;
  if (!asksForChange(text, context.people ?? [])) return steps;
  return [{ tool: "change", text: clean(text).slice(0, 200), args: {} }, ...steps].slice(0, MAX_STEPS);
}

/**
 * "my wife doesn't want the dates" is the wife's, not the household's. When
 * the model's change drops who it was for ("Remove Dates"), the shopper's own
 * "no dates for wife" is added to it, so the dates stay for everyone else.
 */
export function withPeopleKept(steps, text) {
  const forOne = readFollowUp(String(text ?? "")).leaveOutFor ?? [];
  const i = steps.findIndex((s) => s.tool === "change");
  if (!forOne.length || i < 0) return steps;
  const said = norm(steps.filter((s) => s.tool === "change").map((s) => s.text).join(" "));
  const missing = forOne.filter((f) => !said.includes(String(f.who).toLowerCase()));
  if (!missing.length) return steps;
  const out = [...steps];
  out[i] = { ...out[i], text: [out[i].text.replace(/[.\s]+$/, ""), ...missing.map((f) => `no ${f.product} for ${f.who}`)].join("; ") };
  return out;
}

/**
 * What a plan can't carry but a change can: a product in or out, a leave-out
 * for one person, an avoid, a person's target. Days, budget and people are the
 * plan's own (planArgs), so "plan 7 days on 4000" asks for nothing beyond it.
 */
export function asksBeyondPlan(text, people = []) {
  const r = readFollowUp(String(text ?? ""));
  const person = new Set(people.map((p) => String(p).toLowerCase()));
  const food = (phrase) => String(phrase ?? "").split(/\s+/).filter(Boolean).some((w) => !NOT_FOOD.has(w) && !person.has(w));
  return r.avoid.length > 0 || r.targets.some((t) => t.who)
    || r.leaveOut.some(food) || r.include.some(food) || r.leaveOutFor.some((f) => food(f.product))
    || r.swaps.some((s) => food(s.from) || food(s.to));
}

/** A cart step only when the shopper asked for one: "show me the shop" is not "order it". */
const ASKS_CART = /\b(cart|order|checkout|check out|buy|kharid\w*|mangwa\w*|mangao)\b/;

/**
 * The model decides WHICH tools run; the planner reads the SHOPPER's words.
 *
 * Asked "sort out 5 days for all of us on 3500, wife needs 70g protein and no
 * dates for her, son is allergic to peanuts, add paneer, thoda sasta karo, then
 * show me the shop", the model split it into long paraphrases ("Exclude dates
 * for Wife. Add paneer (for the household except where exclusions apply)") and
 * the planner's reader lost the wife, the protein, the allergy and the paneer in
 * them — and it added a cart step nobody asked for. The follow-up reader was
 * built and evaluated on shoppers' sentences, so that is what it gets:
 *   * the plan and change steps run on the message itself; the model's own
 *     words stay only as the step's label on the timeline;
 *   * one change step at most (the reader takes the whole sentence at once),
 *     after the plan when there is one, and added when the model planned but
 *     left the rest of the message unread;
 *   * a cart step only when the message asks for the cart.
 * @param {Array} steps grounded, settled steps
 * @param {string} text the shopper's message
 * @param {{ hasPlan?: boolean, people?: string[] }} [context]
 */
export function inShoppersWords(steps, text, context = {}) {
  const message = clean(text).slice(0, 200);
  const wantsCart = ASKS_CART.test(norm(text));
  const out = [];
  let change = null;
  for (const step of steps) {
    if (step.tool === "cart" && !wantsCart) continue;
    // One message is one plan: a second plan step would plan the week again.
    if (step.tool === "plan" && !out.some((s) => s.tool === "plan")) out.push({ ...step, label: step.text, text: message });
    else if (step.tool === "plan") continue;
    else if (step.tool === "change") {
      if (!change) { change = { ...step, label: step.text, text: message }; out.push(change); }
    } else out.push(step);
  }
  // Planned, and the message also changes something the plan can't say (a
  // person's target, a leave-out, an allergy, a product): read it as a change.
  const planned = out.findIndex((s) => s.tool === "plan");
  if (planned >= 0 && !change && asksBeyondPlan(text, context.people ?? [])) {
    out.splice(planned + 1, 0, { tool: "change", text: message, label: "the rest of what you asked", args: {} });
  }
  return out.slice(0, MAX_STEPS);
}

/**
 * The page's own steps (cart, show, explain) run when the run is over, on the
 * plan it ended with, so that is where they are listed: "show me the shop and
 * trim it" changes the plan first and then shows it.
 */
export function pageStepsLast(steps) {
  const page = (s) => ["cart", "show", "explain"].includes(s.tool);
  return [...steps.filter((s) => !page(s)), ...steps.filter(page)];
}

