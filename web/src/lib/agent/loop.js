// ============================================================================
// Agent Mode: the loop. Pure — the model, the tools and the page's state are
// injected, so it runs the same against OpenAI, KOI's rules, or a scripted
// test model.
//
// One request is one segment of a run:
//   message    the shopper typed something (a new run, or a turn in one)
//   answer     they answered a question card
//   decision   they chose Allow or Not now on an approval card
//   continue   the last segment paused for time; carry on
//
// Each turn: the model picks ONE tool, sees its result, picks the next. The
// loop stops to wait for the shopper — a question it (or a gate) raised, or an
// approval before anything is saved to the household or put in the cart —
// and ends on finish, on the shopper's stop, or at a cap. Nothing waits on the
// server: the paused run goes back to the browser sealed (sign.js), and the
// next request carries it.
// ============================================================================

import { checkSay } from "./narration";
import { applyAnswers, askCardFor, gapsFor, gapWords } from "./readiness";
import { evidenceFrom } from "./evidence";
import { fingerprint } from "./sign";
import { answerWords } from "./answers";
import { routeMessage } from "./router";

export const CAPS = Object.freeze({ turns: 10, tools: 16, ms: 40_000, segments: 4, refusalsBeforeRules: 2, items: 80 });

/** A fresh conversation. */
export function newMemory() {
  return { v: 1, runKey: null, segment: 0, items: [], said: [], produced: [], draft: null, planId: null, created: [], pending: null, turnCalls: [], intent: null, source: null };
}

const TASKS = Object.freeze({
  setup: "Set up your household",
  make_plan: "Build the week's plan",
  change_plan: "Change the plan",
  explore: "Look into it",
  check_product: "Check the product",
  add_to_cart: "Add to cart",
  show: "Open the page",
  look: "Look at the plan",
});
const TASK_OF = { draft_people: "setup", save_people: "setup" };

/** The run's checklist: what the message asked for, then anything else KOI did. KOI's words, derived, never the model's. */
export function tasksFor(memory, { running = null } = {}) {
  const keys = [...(memory.intent?.keys ?? [])];
  for (const c of memory.turnCalls ?? []) {
    const k = TASK_OF[c.name] ?? c.name;
    if (TASKS[k] && !keys.includes(k)) keys.push(k);
  }
  const pendingKey = memory.pending ? (memory.pending.kind === "approval" ? (TASK_OF[memory.pending.tool] ?? memory.pending.tool) : "setup") : null;
  return keys.map((k) => {
    const calls = (memory.turnCalls ?? []).filter((c) => (TASK_OF[c.name] ?? c.name) === k);
    const done = k === "setup" ? calls.some((c) => c.name === "save_people" && c.ok) : calls.some((c) => c.ok);
    const state = done ? "done"
      : pendingKey === k ? "needs_you"
        : running && (TASK_OF[running] ?? running) === k ? "running"
          : calls.some((c) => !c.ok && c.declined) ? "skipped"
            : "pending";
    return { key: k, label: TASKS[k], state };
  });
}

function intentFor(text, { savedCount, hasPlan }) {
  const kinds = routeMessage(text, { hasPlan }).map((s) => s.tool);
  const keys = [];
  if (!savedCount) keys.push("setup");
  for (const k of kinds) {
    const key = { plan: "make_plan", change: "change_plan", cart: "add_to_cart", show: "show", without: "explore", explain: "look" }[k];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return { keys };
}

/** Keep the conversation small: drop whole old turns (from a user message), never half a tool call. */
function trimItems(items, max) {
  if (items.length <= max) return items;
  let cut = items.length - max;
  while (cut < items.length && items[cut]?.role !== "user") cut += 1;
  return cut < items.length ? items.slice(cut) : items.slice(-max);
}

const functionCall = (call) => call.item ?? { type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.args ?? {}) };
const output = (callId, text) => ({ type: "function_call_output", call_id: callId, output: String(text) });

/**
 * Run one segment.
 *
 * @param {object} input
 * @param {object} input.memory      the opened memory (or newMemory())
 * @param {{ kind: "message"|"answer"|"decision"|"continue", text?, answers?, allow? }} input.request
 * @param {object} input.ctx         { emit, signal, snapshot(): Promise<state>, labels(): string[], ...what tools need }
 * @param {Record<string, object>} input.tools
 * @param {(args) => Promise<{ call, carry, text, model }>} input.model
 * @param {(args) => { call, carry, text, model }} input.rules the fallback model
 * @param {() => number} [input.now]
 * @param {object} [input.caps]
 * @returns {Promise<{ memory, outcome, steps: Array<{tool, ok, ms}>, turns, asks, approvals, model: string|null, source }>}
 */
export async function runSegment({ memory, request, ctx, tools, model, rules, now = Date.now, caps = CAPS, newRunKey = () => `run_${now().toString(36)}` }) {
  const t0 = now();
  const emit = ctx.emit;
  const steps = [];
  const approvals = [];
  let turns = 0;
  let asks = 0;
  let refusals = 0;
  let useRules = !model;
  let modelName = null;
  let outcome = null;
  let lastFp = null;

  const evidence = () => evidenceFrom({ said: memory.said, produced: memory.produced, labels: ctx.labels(), products: ctx.products?.() ?? [] });
  ctx.evidence = evidence;
  ctx.memory = memory;

  const sayIt = (text) => {
    const checked = checkSay(text, evidence());
    if (checked.ok) emit({ type: "say", text: checked.text });
  };
  const emitTasks = (running = null) => emit({ type: "tasks", items: tasksFor(memory, { running }) });
  const pause = (reason) => { outcome = "needs_shopper"; emit({ type: "run_paused", reason }); };

  /** Raise a question card and wait. */
  const askNow = (card, pending) => {
    memory.pending = { kind: "ask", card, ...pending };
    asks += 1;
    emit({ type: "ask", card, origin: pending.origin });
    emitTasks();
    pause("ask");
  };

  /** Run a tool now, with its lines streaming. */
  const runTool = async (call, tool) => {
    const started = now();
    emit({ type: "tool_started", callId: call.callId, tool: call.name, step: tool.step ?? null });
    emitTasks(call.name);
    let result;
    try {
      result = await tool.run(ctx, call.args, call.callId);
    } catch (err) {
      if (err?.name === "PlanStopped" || ctx.signal?.aborted) throw Object.assign(new Error("stopped"), { stopped: true });
      console.error("[agent] tool", call.name, err?.message ?? "failed");
      result = { ok: false, forModel: `${call.name} failed. Try something else or finish with cannot_do.`, summary: "That step could not be done", failed: true };
    }
    const ms = now() - started;
    steps.push({ tool: call.name, ok: Boolean(result.ok), ms });
    memory.turnCalls.push({ name: call.name, ok: Boolean(result.ok) });
    if (result.summary) memory.produced.push(result.summary);
    emit({ type: "tool_result", callId: call.callId, tool: call.name, ok: Boolean(result.ok), summary: result.summary ?? null, data: result.data ?? null, failed: Boolean(result.failed) });
    if (result.notice) emit({ type: "notice", text: result.notice, tone: "warn" });
    if (result.ui) emit({ type: "ui", ...result.ui });
    emitTasks();
    return result;
  };

  // ── What this request brings ──────────────────────────────────────────────
  const state0 = await ctx.snapshot();
  if (request.kind === "message") {
    const text = String(request.text ?? "").trim();
    // A card left unanswered: the shopper moved on. Close the model's open call so the conversation stays well formed.
    if (memory.pending?.callId) memory.items.push(output(memory.pending.callId, "The shopper didn't answer that; they wrote something else instead."));
    memory.pending = null;
    if (!memory.runKey || request.newRun !== false) memory.runKey = newRunKey();
    memory.segment = 0;
    memory.turnCalls = [];
    memory.items.push({ role: "user", content: text });
    memory.said.push(text);
    memory.intent = intentFor(text, { savedCount: state0.saved.length, hasPlan: Boolean(state0.planId) });
  } else if (request.kind === "answer") {
    const pending = memory.pending;
    if (pending?.kind !== "ask") return { memory, outcome: "nothing_to_do", steps, turns, asks, approvals, model: null, source: memory.source };
    memory.pending = null;
    if (pending.origin === "gate") {
      const applied = applyAnswers(memory.draft, pending.card, request.answers);
      memory.draft = applied.draft;
      memory.said.push(...applied.typed);
      if (applied.who) {
        memory.said.push(applied.who);
        memory.items.push({ role: "user", content: applied.who });
      }
      const gaps = gapsFor(memory.draft, { savedCount: state0.saved.length });
      memory.items.push({ role: "developer", content: `The shopper answered KOI's questions. Missing now: ${gapWords(gaps)}.${!gaps.length && memory.draft ? " Next: save_people source=draft." : ""}` });
      if (gaps.length && memory.draft) {
        askNow(askCardFor(gaps, { draft: memory.draft }), { origin: "gate" });
        return { memory, outcome, steps, turns, asks, approvals, model: null, source: memory.source };
      }
    } else {
      const words = answerWords(pending.card, request.answers);
      memory.said.push(...words.typed);
      memory.items.push(output(pending.callId, words.forModel));
    }
  } else if (request.kind === "decision") {
    const pending = memory.pending;
    if (pending?.kind !== "approval") return { memory, outcome: "nothing_to_do", steps, turns, asks, approvals, model: null, source: memory.source };
    memory.pending = null;
    const tool = tools[pending.tool];
    approvals.push({ tool: pending.tool, decision: request.allow ? "allow" : "decline" });
    if (request.allow) {
      emit({ type: "tool_started", callId: pending.callId, tool: pending.tool, step: tool.step ?? null });
      const started = now();
      let result;
      try {
        result = await tool.execute(ctx, pending.args, pending.prepared, request);
      } catch (err) {
        console.error("[agent] execute", pending.tool, err?.message ?? "failed");
        result = { ok: false, forModel: `${pending.tool} failed after approval. Nothing more was saved.`, summary: "That could not be saved", failed: true };
      }
      steps.push({ tool: pending.tool, ok: Boolean(result.ok), ms: now() - started });
      memory.turnCalls.push({ name: pending.tool, ok: Boolean(result.ok) });
      if (result.summary) memory.produced.push(result.summary);
      memory.items.push(output(pending.callId, result.forModel));
      emit({ type: "tool_result", callId: pending.callId, tool: pending.tool, ok: Boolean(result.ok), summary: result.summary ?? null, data: result.data ?? null });
      if (result.ui) emit({ type: "ui", ...result.ui });
      emitTasks();
      if (result.end) {
        outcome = "done";
        emit({ type: "run_finished", outcome, planId: memory.planId, created: memory.created });
        return { memory: settle(memory, caps), outcome, steps, turns, asks, approvals, model: null, source: memory.source };
      }
    } else {
      memory.turnCalls.push({ name: pending.tool, ok: false, declined: true });
      memory.items.push(output(pending.callId, pending.tool === "save_people"
        ? "The shopper chose Not now: nothing was saved to the household. Carry on for this week only if you can, or finish."
        : "The shopper chose Not now. Nothing was added. Finish."));
      emit({ type: "tool_result", callId: pending.callId, tool: pending.tool, ok: false, summary: "Not now: nothing was saved", data: null, declined: true });
      emitTasks();
    }
  }
  memory.segment += 1;
  if (memory.segment > caps.segments) {
    outcome = "capped";
    emit({ type: "run_finished", outcome, planId: memory.planId, created: memory.created });
    return { memory: settle(memory, caps), outcome, steps, turns, asks, approvals, model: null, source: memory.source };
  }
  emit({ type: "run_started", runKey: memory.runKey, segment: memory.segment });
  emitTasks();

  // ── The loop ──────────────────────────────────────────────────────────────
  try {
    while (!outcome) {
      if (ctx.signal?.aborted) { outcome = "stopped"; break; }
      if (turns >= caps.turns || steps.length >= caps.tools || now() - t0 > caps.ms) {
        outcome = "paused";
        emit({ type: "run_paused", reason: "time" });
        break;
      }
      const state = await ctx.snapshot();
      let picked;
      if (!useRules) {
        try {
          picked = await model({ memory, state, signal: ctx.signal });
          modelName = picked.model ?? modelName;
        } catch (err) {
          if (ctx.signal?.aborted) { outcome = "stopped"; break; }
          console.error("[agent] model", err?.message ?? "failed");
          useRules = true;
          emit({ type: "notice", text: "KOI's AI didn't answer, so KOI's rules are finishing this.", tone: "info" });
        }
      }
      if (useRules) picked = rules({ memory, state });
      memory.source = useRules ? "agent_rules" : "agent";
      turns += 1;
      const call = picked.call;
      if (!call) { outcome = "done"; break; }
      memory.items.push(...(picked.carry ?? []).filter((i) => i.type === "reasoning"));
      memory.items.push(functionCall(call));
      const tool = tools[call.name];
      if (!tool) {
        memory.items.push(output(call.callId, `There is no tool called ${call.name}.`));
        refusals += 1;
        continue;
      }
      // The same call twice running goes nowhere.
      const fp = fingerprint({ n: call.name, a: { ...call.args, say: null } });
      if (fp === lastFp) {
        memory.items.push(output(call.callId, "Same call as before; stopping."));
        outcome = "capped";
        break;
      }
      lastFp = fp;
      if (call.args?.say) sayIt(call.args.say);

      if (tool.kind === "ask") {
        const built = tool.card(ctx, call.args);
        if (built.refused) {
          memory.items.push(output(call.callId, built.refused));
          refusals += 1;
        } else {
          askNow(built.card, { origin: "model", callId: call.callId, tool: call.name });
        }
      } else if (tool.kind === "approval") {
        const prepared = await tool.prepare(ctx, call.args);
        if (prepared.gaps) {
          memory.items.push(output(call.callId, `Can't save yet: ${gapWords(prepared.gaps)} is missing. KOI is asking the shopper now.`));
          askNow(prepared.card, { origin: "gate" });
        } else if (prepared.refused) {
          memory.items.push(output(call.callId, prepared.refused));
          memory.turnCalls.push({ name: call.name, ok: false });
          steps.push({ tool: call.name, ok: false, ms: 0 });
          refusals += 1;
        } else {
          memory.pending = { kind: "approval", callId: call.callId, tool: call.name, args: call.args, prepared };
          emit({ type: "approval", card: prepared.card, tool: call.name });
          emitTasks();
          pause("approval");
        }
      } else {
        const result = await runTool(call, tool);
        memory.items.push(output(call.callId, result.forModel));
        // A whole call and its result: a safe point to hand the browser, should the shopper stop next.
        ctx.checkpoint?.(memory);
        if (!result.ok) refusals += 1; else refusals = 0;
        if (result.ask) askNow(result.ask, { origin: "gate" });
        else if (result.end) {
          outcome = result.outcome === "cannot_do" ? "cannot_do" : result.outcome === "nothing_to_do" ? "nothing_to_do" : "done";
        }
      }
      if (!outcome && refusals >= caps.refusalsBeforeRules && !useRules) {
        useRules = true;
        refusals = 0;
      } else if (!outcome && refusals >= caps.refusalsBeforeRules + 2) {
        outcome = "cannot_do";
      }
    }
  } catch (err) {
    if (!err?.stopped) throw err;
    outcome = "stopped";
  }

  if (outcome === "stopped") emit({ type: "notice", text: "Stopped. What KOI finished is kept.", tone: "info" });
  if (outcome !== "needs_shopper" && outcome !== "paused") {
    emit({ type: "run_finished", outcome, planId: memory.planId, created: memory.created });
  }
  return { memory: outcome === "needs_shopper" || outcome === "paused" ? memory : settle(memory, caps), outcome, steps, turns, asks, approvals, model: modelName, source: memory.source };
}

/** A finished run keeps its words and results, not the model's encrypted reasoning, and not more than it needs. */
function settle(memory, caps) {
  // With the reasoning gone, a call must not point at it by the server's item id.
  const items = memory.items
    .filter((i) => i.type !== "reasoning")
    .map((i) => (i.type === "function_call" ? { type: "function_call", call_id: i.call_id, name: i.name, arguments: i.arguments } : i));
  return { ...memory, pending: null, items: trimItems(items, caps.items), produced: memory.produced.slice(-30), said: memory.said.slice(-30) };
}
