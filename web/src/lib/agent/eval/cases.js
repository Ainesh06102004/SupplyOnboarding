// ============================================================================
// How KOI's agent should read real messages: the evaluation set. Pure data.
//
// Each case is a message as a shopper would type it — loose, run-on, mixed
// Hindi and English — and what a right reading does: which tools, in what
// order, and what each step must (and must not) say. scripts/evalAgent.mjs
// runs every case through the model and its grounding (lib/agent/steps.js).
//
// `expect.tools` is exact and in order. `says[i]` is a pattern step i's words
// must match; `never` a pattern no step's words may match (an invented number
// or food). `product` checks a without step's product. Bump EVAL_VERSION when
// cases change.
// ============================================================================

export const AGENT_EVAL_VERSION = "agent-eval-v3";

/** The household and basket every case is read against, as the page would send them. */
export const EVAL_CONTEXT = Object.freeze({
  people: ["Me", "Wife", "Son"],
  products: ["Gorakhpur Kalanamak Rice", "Split Moong Dal", "Kabuli Chana", "Dates", "Natural Peanut Butter Crunch", "Rozana Super Basmati Rice"],
});

export const AGENT_CASES = Object.freeze([
  // A fresh plan
  { id: "plan-basic", text: "plan 7 days for everyone on 4000", hasPlan: false, expect: { tools: ["plan"], says: [/4000|4,000/] } },
  { id: "plan-loose", text: "sort out the week for all of us on 4000", hasPlan: true, expect: { tools: ["plan"], says: [/4000|4,000/] } },
  { id: "plan-few-days", text: "plan for just me for 3 days", hasPlan: false, expect: { tools: ["plan"], says: [/3/] } },
  { id: "plan-then-more", text: "plan 5 days on 3000, then make it cheaper and put it in my cart", hasPlan: false, expect: { tools: ["plan", "change", "cart"], says: [/5|3000/, /cheap|less|lower|budget/i] } },

  // Changes, loosely worded
  { id: "cheaper", text: "make it cheaper", hasPlan: true, expect: { tools: ["change"], says: [/cheap|less|lower|budget/i], never: /\d/ } },
  { id: "cheaper-loose", text: "honestly this is a bit much money, trim it down", hasPlan: true, expect: { tools: ["change"], says: [/cheap|less|lower|budget|trim|reduce/i], never: /\d/ } },
  { id: "one-person", text: "my wife doesn't want the dates", hasPlan: true, expect: { tools: ["change"], says: [/dates/i], allSay: /wife/i } },
  { id: "two-people", text: "wife wants more protein, like 70g a day, and no biscuits for son", hasPlan: true, expect: { tools: ["change"], says: [/70/], allSay: /son/i } },
  { id: "days-and-add", text: "add some paneer and make it 5 days, then order it", hasPlan: true, expect: { tools: ["change", "cart"], says: [/5/] } },
  { id: "hinglish", text: "thoda sasta karo aur dates mat daalo", hasPlan: true, expect: { tools: ["change"], says: [/dates/i] } },
  { id: "swap", text: "swap the basmati for the kalanamak one", hasPlan: true, expect: { tools: ["change"], says: [/basmati|kalanamak/i] } },
  { id: "no-invented-food", text: "can you make it healthier for my son", hasPlan: true, expect: { tools: ["change"], never: /paneer|egg|milk|oats|chicken|\d/i } },
  // 24 Sep, live: read once as plan → change → show, re-planning the week and
  // leaving the page for the shop. Adding foods is one change to this plan.
  { id: "add-several", text: "add paneer, eggs and milk", hasPlan: true, expect: { tools: ["change"], says: [/paneer/i], allSay: /milk/i } },

  // What if
  { id: "without", text: "we're out of chana, what now?", hasPlan: true, expect: { tools: ["without"], product: /chana/i } },
  // Two rices in the basket: one check or one for each are both right readings.
  { id: "without-2", text: "what if i can't get the rice", hasPlan: true, expect: { tools: ["without"], toolsAny: [["without"], ["without", "without"]], product: /rice/i } },

  // The page's own tools
  { id: "cart", text: "put it all in my cart", hasPlan: true, expect: { tools: ["cart"] } },
  { id: "order", text: "ok order it", hasPlan: true, expect: { tools: ["cart"] } },
  { id: "show-shop", text: "show me the shop", hasPlan: true, expect: { tools: ["show"], step: "shop" } },
  { id: "show-loose", text: "can i see what i'm buying", hasPlan: true, expect: { tools: ["show"], step: "shop" } },
  { id: "show-pantry", text: "take me to my pantry list", hasPlan: true, expect: { tools: ["show"], step: "pantry" } },
  { id: "explain", text: "why is son short on protein", hasPlan: true, expect: { tools: ["explain"] } },
  { id: "explain-2", text: "what did you give up?", hasPlan: true, expect: { tools: ["explain"] } },

  // Several at once
  // 25 Sep, live: a cart step nobody asked for, and the per-person asks lost in
  // the model's paraphrase. The planner now reads the message itself.
  { id: "complex-1", text: "sort out 5 days for all of us on 3500, wife needs 70g protein and no dates for her, son is allergic to peanuts, add paneer, thoda sasta karo, then show me the shop", hasPlan: true, expect: { tools: ["change", "show"], toolsAny: [["change", "show"], ["plan", "change", "show"]], step: "shop", allSay: /son is allergic to peanuts/ } },
  { id: "run-on", text: "honestly this is a bit much money, trim it down, and my wife doesn't want the dates. can i see what i'm buying", hasPlan: true, expect: { tools: ["change", "show"], step: "shop" } },
]);

/** The pass bar: the share of cases that must read right. */
export const AGENT_EVAL_PASS = 0.9;
