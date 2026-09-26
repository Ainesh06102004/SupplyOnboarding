// ============================================================================
// Agent Mode, in the browser: the dock's state, from /api/agent's events. Pure.
//
// The transcript is what the shopper sees: their messages, KOI's lines, each
// tool as a card with its streaming lines (the planner's own, via
// lib/plan/runSteps.js lineFor), questions, approvals and results. The sealed
// memory rides along for the next request; it is the conversation the server
// does not keep.
// ============================================================================

import { lineFor } from "@/lib/plan/runSteps";

export const TOOL_LABELS = Object.freeze({
  look: "Looking at your plan",
  draft_people: "Reading who's eating",
  save_people: "Saving to your household",
  make_plan: "Building the week's plan",
  change_plan: "Changing the plan",
  explore: "Looking into it",
  check_product: "Checking the product",
  show: "Opening the page",
  add_to_cart: "Adding to your cart",
  finish: "Wrapping up",
});

export const initialAgentState = Object.freeze({
  open: false,
  entries: [],
  status: "idle",
  statusLine: null,
  tasks: [],
  pending: null,
  memory: null,
  queue: [],
  follow: true,
  continues: 0,
  runStartedAt: null,
  lastRunMs: null,
});

let seq = 0;
const id = (p) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;
const updateEntry = (entries, match, patch) => entries.map((e) => (match(e) ? { ...e, ...(typeof patch === "function" ? patch(e) : patch) } : e));

/** Result kinds worth a card of their own in the transcript. */
const RESULT_KINDS = new Set(["plan", "change", "without", "check", "swaps", "products"]);

export function agentReducer(state, action) {
  switch (action.type) {
    case "open": return { ...state, open: true };
    case "close": return { ...state, open: false };
    case "toggle": return { ...state, open: !state.open };
    case "follow": return { ...state, follow: Boolean(action.value) };
    case "reset": return { ...initialAgentState, open: state.open };
    case "hydrate": return { ...initialAgentState, ...action.state, status: action.state?.status === "running" ? "stopped" : action.state?.status ?? "idle", queue: [] };
    case "user":
      return { ...state, open: true, entries: [...state.entries, { id: id("u"), kind: "user", text: action.text }], status: "running", statusLine: "KOI is reading that", pending: null, continues: 0, runStartedAt: Date.now() };
    case "queue": return { ...state, queue: [...state.queue, action.text] };
    case "dequeue": return { ...state, queue: state.queue.slice(1) };
    case "answered":
      return { ...state, status: "running", statusLine: "Carrying on", pending: null, entries: updateEntry(state.entries, (e) => e.id === state.pending?.entryId, { answered: action.summary ?? "Answered" }) };
    case "decided":
      return { ...state, status: "running", statusLine: action.allow ? "Carrying on" : "Carrying on without it", pending: null, entries: updateEntry(state.entries, (e) => e.id === state.pending?.entryId, { decided: action.allow ? "allow" : "decline" }) };
    case "stopped":
      return { ...state, status: "stopped", statusLine: "Stopped · what's done is kept", entries: state.entries.map((e) => (e.kind === "tool" && e.state === "running" ? { ...e, state: "stopped" } : e)) };
    case "continued": return { ...state, continues: state.continues + 1 };
    case "error":
      return { ...state, status: "error", statusLine: "KOI couldn't finish", entries: [...state.entries, { id: id("e"), kind: "error", text: action.text }] };
    case "local":
      return { ...state, entries: [...state.entries, { id: id("l"), ...action.entry }] };
    case "event": return reduceEvent(state, action.event);
    default: return state;
  }
}

function reduceEvent(state, e) {
  switch (e?.type) {
    case "run_started": return { ...state, status: "running", statusLine: state.statusLine ?? "KOI is working" };
    case "tasks": return { ...state, tasks: e.items ?? [] };
    case "say": return { ...state, entries: [...state.entries, { id: id("s"), kind: "say", text: e.text }] };
    case "tool_started": {
      const label = TOOL_LABELS[e.tool] ?? "Working";
      if (e.tool === "finish") return { ...state, statusLine: label };
      const exists = state.entries.some((x) => x.kind === "tool" && x.callId === e.callId);
      const entries = exists
        ? updateEntry(state.entries, (x) => x.kind === "tool" && x.callId === e.callId, { state: "running" })
        : [...state.entries, { id: id("t"), kind: "tool", callId: e.callId, tool: e.tool, label, lines: [], state: "running", summary: null }];
      return { ...state, statusLine: label, entries };
    }
    case "tool_progress": {
      const line = lineFor(e.event);
      if (!line) return state;
      return {
        ...state,
        entries: updateEntry(state.entries, (x) => x.kind === "tool" && x.callId === e.callId, (x) => {
          const i = x.lines.findIndex((l) => l.id === line.id);
          const lines = i >= 0 ? x.lines.map((l, j) => (j === i ? line : l)) : [...x.lines, line];
          return { lines };
        }),
      };
    }
    case "tool_result": {
      if (e.tool === "finish") return state;
      const toolState = e.declined ? "skipped" : e.ok ? "done" : e.failed ? "failed" : "skipped";
      let entries = updateEntry(state.entries, (x) => x.kind === "tool" && x.callId === e.callId, { state: toolState, summary: e.summary });
      if (!entries.some((x) => x.kind === "tool" && x.callId === e.callId) && e.summary) {
        entries = [...entries, { id: id("t"), kind: "tool", callId: e.callId, tool: e.tool, label: TOOL_LABELS[e.tool] ?? "Done", lines: [], state: toolState, summary: e.summary }];
      }
      if (e.ok && RESULT_KINDS.has(e.data?.kind)) entries = [...entries, { id: id("r"), kind: "result", data: e.data }];
      return { ...state, entries };
    }
    case "notice": return { ...state, entries: [...state.entries, { id: id("n"), kind: "notice", text: e.text, tone: e.tone ?? "info" }] };
    case "ask": {
      const entryId = id("a");
      return { ...state, status: "waiting", statusLine: "KOI needs you", pending: { kind: "ask", card: e.card, entryId }, entries: [...state.entries, { id: entryId, kind: "ask", card: e.card }] };
    }
    case "approval": {
      const entryId = id("p");
      return { ...state, status: "waiting", statusLine: "KOI needs your OK", pending: { kind: "approval", card: e.card, tool: e.tool, entryId }, entries: [...state.entries, { id: entryId, kind: "approval", card: e.card, tool: e.tool }] };
    }
    case "run_paused":
      return e.reason === "time" ? { ...state, statusLine: "Still working" } : state;
    case "run_finished": {
      const ms = state.runStartedAt ? Date.now() - state.runStartedAt : null;
      const status = e.outcome === "stopped" ? "stopped" : e.outcome === "cannot_do" ? "done" : "done";
      return { ...state, status, statusLine: e.outcome === "stopped" ? "Stopped · what's done is kept" : e.outcome === "cannot_do" ? "KOI couldn't do all of that" : "Done", pending: null, lastRunMs: ms, entries: state.entries.map((x) => (x.kind === "tool" && x.state === "running" ? { ...x, state: "done" } : x)) };
    }
    case "memory": return { ...state, memory: e.sealed ?? state.memory };
    case "error": return { ...state, status: "error", statusLine: "KOI couldn't finish", entries: [...state.entries, { id: id("e"), kind: "error", text: e.error ?? "Something went wrong." }] };
    default: return state;
  }
}

/** What survives a reload of the tab: the conversation, not a run in flight. */
export function persistable(state) {
  return {
    open: state.open,
    entries: state.entries.slice(-80),
    status: state.status,
    statusLine: state.statusLine,
    tasks: state.tasks,
    pending: state.pending,
    memory: state.memory,
    follow: state.follow,
  };
}
