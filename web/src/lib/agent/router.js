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
    case "change": return `Change it: ${clean(step.text).slice(0, 60)}`;
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
  "- plan: make a new plan. instruction says the days, budget, people and any stated targets they asked for (\"plan 7 days on 4000 for me and Wife\").",
  "- change: change the plan already made. instruction is a short plain request KOI's planner can read: make it cheaper, no <product>, add <product>, swap <product> for <product>, more/less of <product>, <person> avoids <food>, <number> g protein for <person>, <number> days, plan for <person> too, not for <person>. Put changes that belong together in one change step.",
  "- without: they ask what happens if they can't get a product. product is that product, in their words.",
  "- cart: they want the plan put in their cart or ordered.",
  "- show: they want to see a part of the page; step is one of define, you, plan, pantry, shop, track.",
  "- explain: they ask why, or what the plan gave up.",
  "Understand what they mean, not the literal words: \"something lighter on the wallet\" is a change \"make it cheaper\"; \"can we see what I'm buying\" is show shop.",
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

/**
 * Words an instruction may use without the shopper having written them: the
 * verbs and joints of a request, and KOI's own words for its tools. A food, a
 * person or a number is never here — those have to come from the message (or
 * the people and products on the page).
 */
const FREE_WORDS = new Set(`a an the and or but to of for on in at with by from as is are be it its this that these those my me i we our us you your they them their
  plan planned planning week weeks day days make made keep same new again replan
  cheaper cheap cheapest less more lower higher reduce increase cut bigger smaller extra fewer
  add added adding include put remove drop leave out without no not none skip avoid avoids avoiding stop instead swap replace switch change changed changes
  budget rupees rs money cost spend price protein calories calorie kcal carbs fat fibre sugar grams gram g target targets goal per daily each
  everyone everybody all household family person people too also only just both
  cart order checkout buy show open see view page step define pantry shop track groceries basket list
  why what explain gave give up short missing happen happens if cant can't cannot get find
  please would like want need some any other another something lighter`.split(/\s+/).filter(Boolean));

const wordsOf = (s) => norm(s).replace(/[^a-z0-9₹' ]/g, " ").split(/\s+/).filter(Boolean);
const numbersOf = (s) => (norm(s).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const stem = (w) => w.replace(/(?:es|s)$/, "");

/**
 * A model's steps, held to the message. It may rephrase — that is the point —
 * but every number must be one the shopper wrote, and every other word must be
 * a request word (FREE_WORDS), a word of the message, or a person or product
 * already on the page. null when a step breaks that, or the answer is unusable.
 */
export function groundSteps(raw, text, { hasPlan = false, people = [], products = [] } = {}) {
  const steps = Array.isArray(raw?.steps) ? raw.steps : null;
  if (!steps) return null;
  const known = new Set([...wordsOf(text), ...people.flatMap(wordsOf), ...products.flatMap(wordsOf)].map(stem));
  const stated = new Set(numbersOf(text));
  const allowed = (instruction) => {
    if (!numbersOf(instruction).every((n) => stated.has(n))) return false;
    return wordsOf(instruction).every((w) => /^\d/.test(w) || FREE_WORDS.has(w) || known.has(stem(w)) || w.length < 3);
  };
  const out = [];
  let dropped = 0;
  for (const s of steps.slice(0, MAX_STEPS)) {
    if (!AGENT_TOOLS.includes(s?.tool)) return null;
    const instruction = clean(s.instruction);
    // A step that adds something the shopper didn't say is dropped on its own;
    // the steps that hold still run.
    if (!instruction || !allowed(instruction) || (s.tool === "without" && (!s.product || !allowed(s.product)))) {
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
  // A change, a without or a cart needs a plan before it.
  if (!hasPlan && out.length && !["plan", "show", "explain"].includes(out[0].tool)) out.unshift({ tool: "plan", text: clean(text).slice(0, 200), args: {} });
  return out.slice(0, MAX_STEPS);
}

