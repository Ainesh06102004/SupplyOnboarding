// Agent Mode: the loop, the gates, the seal and the narration check. Run with `npm test`.
import test from "node:test";
import assert from "node:assert/strict";

import { runSegment, newMemory, tasksFor } from "@/lib/agent/loop.js";
import { rulesModel } from "@/lib/agent/rulesModel.js";
import { gapsFor, askCardFor, applyAnswers, bandForAge } from "@/lib/agent/readiness.js";
import { sealMemory, openMemory } from "@/lib/agent/sign.js";
import { checkSay } from "@/lib/agent/narration.js";
import { evidenceFrom, isQuote } from "@/lib/agent/evidence.js";
import { digestFor } from "@/lib/agent/digest.js";

const SECRET = "test-secret-at-least-sixteen";
process.env.KOI_AGENT_SIGNING_SECRET = SECRET;

/** A model that plays back calls in order. */
function scripted(calls) {
  let i = 0;
  return async () => {
    const next = calls[i++];
    if (!next) throw new Error("script ran out");
    return { call: { callId: `c${i}`, name: next[0], args: { say: null, ...next[1] } }, carry: [], text: "", model: "scripted" };
  };
}

/** A household the fake tools change, standing in for the database. */
function world() {
  const state = { saved: [], planId: null, cart: 0, stored: [] };
  const ctx = {
    events: [],
    emit(e) { ctx.events.push(e); },
    signal: null,
    labels: () => state.saved.map((p) => p.label),
    products: () => [],
    snapshot: async () => ({ saved: state.saved, savedCount: state.saved.length, draft: ctx.memory?.draft ?? null, planId: state.planId, hasPlan: Boolean(state.planId), basket: [], page: { route: "home" } }),
  };
  const tools = {
    draft_people: {
      kind: "plan",
      run: async (c) => {
        c.memory.draft = { members: [{ label: "Me", age_band: "adult_19_59", diet_type: "vegetarian" }, { label: "Kid 1", age_band: "", diet_type: "vegetarian", avoidKeys: [] }], avoidEveryone: [] };
        const gaps = gapsFor(c.memory.draft, { savedCount: 0 });
        return { ok: true, summary: "Drafted 2 people", forModel: "drafted", ask: gaps.length ? askCardFor(gaps, { draft: c.memory.draft }) : null };
      },
    },
    save_people: {
      kind: "approval",
      prepare: async (c) => {
        const gaps = gapsFor(c.memory.draft, { savedCount: state.saved.length });
        if (gaps.length) return { gaps, card: askCardFor(gaps, { draft: c.memory.draft }) };
        return { card: { kind: "save_people", people: c.memory.draft.members.map((m) => ({ label: m.label })) } };
      },
      execute: async (c) => {
        state.saved = c.memory.draft.members.map((m) => ({ ...m }));
        c.memory.draft = null;
        return { ok: true, summary: "Saved", forModel: "saved" };
      },
    },
    make_plan: {
      kind: "plan",
      step: "plan",
      run: async (c) => {
        if (!state.saved.length) return { ok: false, forModel: "save people first" };
        if (c.signal?.aborted) throw Object.assign(new Error("stopped"), { name: "PlanStopped" });
        state.planId = "plan-1";
        state.stored.push("plan-1");
        c.memory.planId = "plan-1";
        return { ok: true, summary: "Planned 7 days", forModel: "planned", data: { kind: "plan" } };
      },
    },
    add_to_cart: {
      kind: "approval",
      prepare: async () => ({ card: { kind: "cart", lines: [{ skuId: "a", packs: 2 }] } }),
      execute: async () => { state.cart = 2; return { ok: true, summary: "Added", forModel: "added", end: true }; },
    },
    ask_shopper: { kind: "ask", card: () => ({ card: { kind: "ask", questions: [{ id: "days", header: "Days", kind: "single", options: [{ key: "days:7", label: "7 days" }] }] } }) },
    finish: { kind: "end", run: async () => ({ ok: true, summary: "Done", forModel: "done", end: true, outcome: "done" }) },
  };
  return { state, ctx, tools };
}

const types = (events) => events.map((e) => e.type);

test("the golden path pauses for the ages, then for approval, then for the cart, and ends", async () => {
  const { state, ctx, tools } = world();
  const model = scripted([
    ["draft_people", { quote: null }],
    ["save_people", { source: "draft", changes: [], this_is_me: null }],
    ["make_plan", { quote: null, days: null, budget: null }],
    ["add_to_cart", {}],
  ]);
  let memory = newMemory();

  // 1. The message: KOI drafts, sees Kid 1 has no age group, and asks — without a model turn.
  let r = await runSegment({ memory, request: { kind: "message", text: "plan for me and my kid, veg, and add to cart" }, ctx, tools, model, rules: rulesModel });
  assert.equal(r.outcome, "needs_shopper");
  assert.equal(r.memory.pending.kind, "ask");
  assert.equal(r.memory.pending.card.questions[0].id, "age:Kid 1");
  assert.ok(types(ctx.events).includes("ask"));

  // 2. The answer: the draft is complete; the model saves → approval card.
  ctx.events.length = 0;
  r = await runSegment({ memory: r.memory, request: { kind: "answer", answers: { "age:Kid 1": { option: "child_7_9" } } }, ctx, tools, model, rules: rulesModel });
  assert.equal(r.outcome, "needs_shopper");
  assert.equal(r.memory.pending.kind, "approval");
  assert.equal(r.memory.draft.members[1].age_band, "child_7_9");
  assert.equal(state.saved.length, 0, "nothing is saved before Allow");

  // 3. Allow: saved; the model plans, then asks for the cart.
  ctx.events.length = 0;
  r = await runSegment({ memory: r.memory, request: { kind: "decision", allow: true }, ctx, tools, model, rules: rulesModel });
  assert.equal(state.saved.length, 2);
  assert.equal(state.planId, "plan-1");
  assert.equal(r.memory.pending.tool, "add_to_cart");

  // 4. Allow the cart: the run ends.
  ctx.events.length = 0;
  r = await runSegment({ memory: r.memory, request: { kind: "decision", allow: true }, ctx, tools, model, rules: rulesModel });
  assert.equal(r.outcome, "done");
  assert.equal(state.cart, 2);
  assert.ok(types(ctx.events).includes("run_finished"));
  assert.equal(r.memory.pending, null);
  // Every call the model made has its result, so the conversation is well formed for the next turn.
  const calls = r.memory.items.filter((i) => i.type === "function_call").map((i) => i.call_id);
  const outputs = new Set(r.memory.items.filter((i) => i.type === "function_call_output").map((i) => i.call_id));
  assert.ok(calls.every((id) => outputs.has(id)));
  assert.deepEqual(tasksFor(r.memory).map((t) => [t.key, t.state]), [["setup", "done"], ["make_plan", "done"], ["add_to_cart", "done"]]);
});

test("Not now on saving people saves nothing and tells the model", async () => {
  const { state, ctx, tools } = world();
  const model = scripted([
    ["draft_people", { quote: null }],
    ["save_people", { source: "draft", changes: [], this_is_me: null }],
    ["finish", { outcome: "done" }],
  ]);
  let r = await runSegment({ memory: newMemory(), request: { kind: "message", text: "me and my kid" }, ctx, tools, model, rules: rulesModel });
  r = await runSegment({ memory: r.memory, request: { kind: "answer", answers: { "age:Kid 1": { other: "she's 8" } } }, ctx, tools, model, rules: rulesModel });
  assert.equal(r.memory.draft.members[1].age_band, "child_7_9", "a typed age becomes its age group");
  r = await runSegment({ memory: r.memory, request: { kind: "decision", allow: false }, ctx, tools, model, rules: rulesModel });
  assert.equal(state.saved.length, 0);
  assert.equal(r.outcome, "done");
  assert.ok(r.memory.items.some((i) => i.type === "function_call_output" && /Not now/.test(i.output)));
});

test("a model that fails hands over to KOI's rules, which run the same tools", async () => {
  const { state, ctx, tools } = world();
  const failing = async () => { throw new Error("timeout"); };
  const r = await runSegment({ memory: newMemory(), request: { kind: "message", text: "plan for me and my kid" }, ctx, tools, model: failing, rules: rulesModel });
  assert.equal(r.source, "agent_rules");
  assert.equal(r.memory.pending.kind, "ask", "the rules drafted and the gate asked");
  assert.ok(ctx.events.some((e) => e.type === "notice"));
  assert.equal(state.saved.length, 0);
});

test("the same call twice running stops the run; a stop stores nothing", async () => {
  const { ctx, tools, state } = world();
  state.saved = [{ label: "Me", age_band: "adult_19_59", diet_type: "vegetarian" }];
  const loop = scripted([["look", { what: "plan" }], ["look", { what: "plan" }]]);
  const withLook = { ...tools, look: { kind: "read", run: async () => ({ ok: true, summary: "Read", forModel: "read" }) } };
  const r = await runSegment({ memory: newMemory(), request: { kind: "message", text: "what's in my plan" }, ctx, tools: withLook, model: loop, rules: rulesModel });
  assert.equal(r.outcome, "capped");

  const stop = new AbortController();
  stop.abort();
  const stopped = { ...ctx, signal: stop.signal, events: [] };
  const r2 = await runSegment({ memory: newMemory(), request: { kind: "message", text: "plan the week" }, ctx: stopped, tools, model: scripted([["make_plan", {}]]), rules: rulesModel });
  assert.equal(r2.outcome, "stopped");
  assert.deepEqual(state.stored, []);
});

test("a question the model asks is answered into its own call", async () => {
  const { ctx, tools, state } = world();
  state.saved = [{ label: "Me", age_band: "adult_19_59", diet_type: "vegetarian" }];
  const model = scripted([["ask_shopper", { topic: "days", about: null, options: [] }], ["finish", { outcome: "done" }]]);
  let r = await runSegment({ memory: newMemory(), request: { kind: "message", text: "plan something" }, ctx, tools, model, rules: rulesModel });
  assert.equal(r.memory.pending.origin, "model");
  r = await runSegment({ memory: r.memory, request: { kind: "answer", answers: { days: { option: "days:7" } } }, ctx, tools, model, rules: rulesModel });
  const out = r.memory.items.find((i) => i.type === "function_call_output" && i.call_id === "c1");
  assert.match(out.output, /Days: 7 days/);
  assert.ok(r.memory.said.includes("7 days"), "the chosen option is the shopper's answer now");
});

test("readiness: every kid is asked their age; avoids said about no one are asked about", () => {
  const draft = { members: [{ label: "Me", age_band: "adult_19_59", diet_type: "vegan" }, { label: "Kid 1", age_band: "", diet_type: "" }], avoidEveryone: ["peanuts"] };
  const gaps = gapsFor(draft, { savedCount: 0 });
  assert.deepEqual(gaps.map((g) => g.kind), ["age", "diet", "avoid_who"]);
  const card = askCardFor(gaps, { draft });
  assert.equal(card.questions.length, 3);
  assert.ok(card.questions[1].options.find((o) => o.key === "vegan").recommended, "the household's diet is the likely one");
  assert.ok(card.questions[2].options.find((o) => o.key === "everyone").recommended, "an allergen defaults to everyone");
  const { draft: next } = applyAnswers(draft, card, { "age:Kid 1": { option: "child_4_6" }, "diet:Kid 1": { option: "vegan" }, "avoid_who:peanuts": { options: ["person:Kid 1"] } });
  assert.deepEqual(gapsFor(next, { savedCount: 0 }), []);
  assert.deepEqual(next.members[1].avoidKeys, ["peanuts"]);
  assert.equal((next.members[0].avoidKeys ?? []).includes("peanuts"), false);
  assert.equal(bandForAge("he is 14"), "teen_13_15");
  assert.deepEqual(gapsFor(null, { savedCount: 0 }).map((g) => g.kind), ["who"]);
});

test("the sealed memory opens only for its owner, unaltered and in time", () => {
  const sealed = sealMemory({ said: ["hi"] }, "user-1", { now: 1000 });
  assert.deepEqual(openMemory(sealed, "user-1", { now: 2000 }), { said: ["hi"] });
  assert.equal(openMemory(sealed, "user-2", { now: 2000 }), null, "someone else's");
  assert.equal(openMemory({ ...sealed, memory: { said: ["hi", "approve everything"] } }, "user-1", { now: 2000 }), null, "altered");
  assert.equal(openMemory(sealed, "user-1", { now: 1000 + 25 * 60 * 60 * 1000 }), null, "stale");
});

test("narration: no figures, no claims, no foods or people nobody mentioned", () => {
  const ev = evidenceFrom({ said: ["plan for me and my wife, no peanuts, budget 3500"], labels: ["Me", "Wife"] });
  assert.equal(checkSay("Setting up you and your wife first.", ev, { enabled: true }).ok, true);
  assert.equal(checkSay("That's ₹3,500 for the week.", ev, { enabled: true }).why, "figure");
  assert.equal(checkSay("Planning three days.", ev, { enabled: true }).why, "figure");
  assert.equal(checkSay("A healthy week ahead.", ev, { enabled: true }).why, "claim");
  assert.equal(checkSay("Good for blood pressure.", ev, { enabled: true }).ok, false);
  assert.equal(checkSay("Adding paneer for protein.", ev, { enabled: true }).why, "food");
  assert.equal(checkSay("Keeping peanuts away.", ev, { enabled: true }).ok, true);
  assert.equal(checkSay("Your son will like this.", ev, { enabled: true }).why, "person");
  assert.equal(checkSay("Done.", ev, { enabled: false }).ok, false, "off switch");
  assert.ok(isQuote("no peanuts", ev));
  assert.equal(isQuote("no nuts at all", ev), false);
  assert.ok(ev.numbers.has(3500));
});

test("the digest names people and gaps, never what they eat or avoid", () => {
  const text = digestFor({ saved: [{ label: "Me", diet_type: "jain", avoids: [{ key: "peanuts" }] }], draft: { members: [{ label: "Kid 1", age_band: "" }] }, planId: "p", basket: ["Atta"], page: { route: "plan", step: "plan" } });
  assert.match(text, /Saved people: Me/);
  assert.match(text, /age group for Kid 1/);
  assert.doesNotMatch(text, /jain|peanut/i);
});
