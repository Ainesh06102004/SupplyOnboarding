import { test } from "node:test";
import assert from "node:assert/strict";

import { splitClauses, routeClause, routeMessage, groundSteps, stepLabel, withChangeFloor, withPeopleKept, pageStepsLast, inShoppersWords, asksForChange, MAX_STEPS } from "./router";

const tools = (steps) => steps.map((s) => s.tool);

test("a message splits where it says one thing after another, not at every 'and'", () => {
  assert.deepEqual(splitClauses("plan 7 days on 4000, then make it cheaper and add oats. Put it in my cart"), [
    "plan 7 days on 4000",
    "make it cheaper and add oats",
    "Put it in my cart",
  ]);
  assert.deepEqual(splitClauses("no biscuits and add oats"), ["no biscuits and add oats"]);
});

test("each tool from its words", () => {
  assert.equal(routeClause("show me the shop").tool, "show");
  assert.equal(routeClause("show me the shop").args.step, "shop");
  assert.equal(routeClause("add everything to my cart").tool, "cart");
  assert.equal(routeClause("put it in the cart").tool, "cart");
  const w = routeClause("what if I can't get the kabuli chana?");
  assert.equal(w.tool, "without");
  assert.equal(w.args.product, "kabuli chana");
  assert.equal(routeClause("dates are out of stock").args.product, "dates");
  assert.equal(routeClause("why is my wife short on protein").tool, "explain");
  assert.equal(routeClause("plan 7 days for everyone").tool, "plan");
  assert.equal(routeClause("make it cheaper", { hasPlan: true }).tool, "change");
});

test("the whole founder ask becomes steps in order", () => {
  const steps = routeMessage("plan 7 days on 4000, then make it cheaper, then add it to my cart and show me the shop", { hasPlan: false });
  assert.deepEqual(tools(steps), ["plan", "change", "cart"]);
  const withShow = routeMessage("plan 7 days on 4000. make it cheaper. add it to my cart. show me the shop", { hasPlan: false });
  assert.deepEqual(tools(withShow), ["plan", "change", "cart", "show"]);
});

test("with no plan on screen, a change plans first", () => {
  assert.deepEqual(tools(routeMessage("add oats", { hasPlan: false, productWords: () => true })), ["plan", "change"]);
  assert.deepEqual(tools(routeMessage("for me and my wife on 4000", { hasPlan: false })), ["plan"]);
  assert.deepEqual(tools(routeMessage("add oats", { hasPlan: true })), ["change"]);
});

test("a plan whose words also change products is followed by a change with those words", () => {
  const steps = routeMessage("plan the week without biscuits", { hasPlan: false, productWords: (t) => /without/.test(t) });
  assert.deepEqual(tools(steps), ["plan", "change"]);
  assert.equal(steps[1].text, "plan the week without biscuits");
});

test("never more than five steps", () => {
  const long = Array.from({ length: 9 }, (_, i) => `add item${i}`).join(". ");
  assert.ok(routeMessage(long, { hasPlan: true }).length <= MAX_STEPS);
});

const s = (tool, instruction, extra = {}) => ({ tool, instruction, step: null, product: null, ...extra });

test("the model may rephrase what the shopper meant", () => {
  const text = "i want something lighter on the wallet, and can we see what i'm buying";
  const ok = groundSteps({ steps: [s("change", "make it cheaper"), s("show", "show the shop", { step: "shop" })] }, text, { hasPlan: true });
  assert.deepEqual(tools(ok), ["change", "show"]);
  assert.equal(ok[0].text, "make it cheaper");
  assert.equal(ok[1].args.step, "shop");
});

test("but never a food, person or number the shopper didn't write", () => {
  const text = "make it a bit cheaper and more protein for my wife";
  const people = ["Me", "Wife", "Son"];
  assert.equal(groundSteps({ steps: [s("change", "add 200 g paneer")] }, text, { hasPlan: true, people }), null, "paneer and 200 were never said");
  assert.equal(groundSteps({ steps: [s("change", "150 g protein for Wife")] }, text, { hasPlan: true, people }), null, "a number the shopper didn't write");
  const partial = groundSteps({ steps: [s("change", "add paneer"), s("change", "make it cheaper")] }, text, { hasPlan: true, people });
  assert.deepEqual(partial.map((x) => x.text), ["make it cheaper"], "the invented step is dropped, the rest still runs");
  const ok = groundSteps({ steps: [s("change", "make it cheaper, more protein for Wife")] }, text, { hasPlan: true, people });
  assert.deepEqual(tools(ok), ["change"]);
  assert.equal(groundSteps({ steps: [s("delete_everything", "make it cheaper")] }, text, { hasPlan: true }), null);
});

test("changes one after another become one change", () => {
  const out = groundSteps({ steps: [s("change", "70g protein for Wife."), s("change", "no biscuits for Son"), s("show", "show the shop", { step: "shop" })] }, "wife wants 70g protein and no biscuits for son, then show the shop", { hasPlan: true, people: ["Me", "Wife", "Son"] });
  assert.deepEqual(tools(out), ["change", "show"]);
  assert.equal(out[0].text, "70g protein for Wife; no biscuits for Son");
});

test("'the week' states 7 days, and 'all of us' lets everyone be named", () => {
  const people = ["Me", "Wife", "Son"];
  const ok = groundSteps({ steps: [s("plan", "Plan 7 days on 4000 for all of us (Me, Wife, Son).")] }, "sort out the week for all of us on 4000", { hasPlan: true, people });
  assert.deepEqual(tools(ok), ["plan"]);
  assert.equal(groundSteps({ steps: [s("plan", "Plan 7 days on 4000 for Wife")] }, "sort out things on 4000", { hasPlan: true, people }), null, "no week said, no person said");
});

test("products on the page may be named even if the shopper said 'the rice'", () => {
  const ok = groundSteps({ steps: [s("without", "without the rice", { product: "Gorakhpur Kalanamak Rice" })] }, "what if i can't get the rice", { hasPlan: true, products: ["Gorakhpur Kalanamak Rice"] });
  assert.equal(ok[0].args.product, "Gorakhpur Kalanamak Rice");
});

test("a change needs a plan before it", () => {
  const planFirst = groundSteps({ steps: [s("change", "make it cheaper")] }, "make it cheaper", { hasPlan: false });
  assert.deepEqual(tools(planFirst), ["plan", "change"]);
  assert.deepEqual(groundSteps({ steps: [] }, "hello", { hasPlan: true }), []);
});

test("a change the model folded into a cart step is not lost", () => {
  const text = "add some paneer and make it 5 days, then order it";
  const cartOnly = [{ tool: "cart", text: "order the 5-day plan with paneer", args: {} }];
  const out = withChangeFloor(cartOnly, text, { hasPlan: true, people: ["Me", "Wife", "Son"] });
  assert.deepEqual(tools(out), ["change", "cart"]);
  assert.equal(out[0].text, text);
  // Only the page's own tools, and nothing to change: left alone.
  for (const page of ["put it all in my cart", "take me to my pantry list", "can i see what i'm buying", "why is son short on protein"]) {
    assert.equal(asksForChange(page, ["Me", "Wife", "Son"]), false, page);
  }
  const shop = [{ tool: "show", text: "show", args: { step: "shop" } }];
  assert.deepEqual(tools(withChangeFloor(shop, "take me to the shop", { hasPlan: true })), ["show"]);
  // A change step already there: nothing added.
  const both = [{ tool: "change", text: "add paneer", args: {} }, ...cartOnly];
  assert.equal(withChangeFloor(both, text, { hasPlan: true }), both);
});

test("who a leave-out is for survives the model's rewording", () => {
  const text = "my wife doesn't want the dates";
  const out = withPeopleKept([{ tool: "change", text: "Remove Dates (keep the rest of the plan the same).", args: {} }], text);
  assert.match(out[0].text, /no dates for wife$/);
  const kept = [{ tool: "change", text: "No Dates for Wife", args: {} }];
  assert.equal(withPeopleKept(kept, text), kept, "already says who: left alone");
});

test("the page's own steps come after the changes they show", () => {
  const out = pageStepsLast([
    { tool: "show", text: "show the shop", args: { step: "shop" } },
    { tool: "change", text: "trim it", args: {} },
    { tool: "cart", text: "cart", args: {} },
  ]);
  assert.deepEqual(tools(out), ["change", "show", "cart"]);
});

test("the planner reads the shopper's words; the model only picks the tools", () => {
  // 25 Sep, live: the model's paraphrases lost the wife, the protein, the
  // allergy and the paneer, and it added a cart step nobody asked for.
  const text = "sort out 5 days for all of us on 3500, wife needs 70g protein and no dates for her, son is allergic to peanuts, add paneer, thoda sasta karo, then show me the shop";
  const model = [
    { tool: "plan", text: "Plan 5 days for Me, Wife, and Son on a budget of 3500.", args: {} },
    { tool: "change", text: "Make it cheaper while keeping the same constraints", args: {} },
    { tool: "change", text: "Ensure Son is allergic to peanuts", args: {} },
    { tool: "cart", text: "Order the current shopping list", args: {} },
    { tool: "show", text: "Show the shop", args: { step: "shop" } },
  ];
  const out = inShoppersWords(model, text, { hasPlan: true, people: ["Me", "Wife", "Son"] });
  assert.deepEqual(tools(out), ["plan", "change", "show"], "one change; no cart it wasn't asked for");
  assert.equal(out[0].text, text);
  assert.equal(out[1].text, text);
  assert.equal(stepLabel(out[1]), "Change it: Make it cheaper while keeping the same constraints", "the label is the model's summary");
  // Asked for the cart: kept.
  assert.ok(tools(inShoppersWords(model, "plan 5 days and put it in my cart")).includes("cart"));
  // Planned, with per-person asks the plan can't carry: a change reads them.
  const planOnly = inShoppersWords([model[0]], "plan 5 days on 3500, no dates for my wife", { people: ["Me", "Wife", "Son"] });
  assert.deepEqual(tools(planOnly), ["plan", "change"]);
});

test("step labels are templates", () => {
  assert.equal(stepLabel({ tool: "cart" }), "Put it in your cart");
  assert.equal(stepLabel({ tool: "without", args: { product: "dates" } }), "Check without dates");
});
