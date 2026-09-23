// ============================================================================
// The Plan page's live run: planner progress events as the lines KOI shows
// while it works. Pure.
//
// Events carry facts (counts, statuses, milliseconds) and nothing else; every
// word here is a template. A line is never written by a model: the timeline
// says what the planner did, not what something imagined it did.
// ============================================================================

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const seconds = (ms) => (Number(ms) >= 1000 ? `${(Number(ms) / 1000).toFixed(1)} s` : `${Math.max(1, Math.round(Number(ms) || 0))} ms`);
const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

const RUNG_TITLES = Object.freeze({
  as_asked: "Solving it as you asked",
  budget_raised: "The budget can't carry it — solving without the ceiling",
  variety_relaxed: "Trying bigger portions of fewer products",
});

const EXCLUSION_WORDS = Object.freeze({
  refused: "no one here can eat",
  kept_out_of_house: "kept out of the house",
  already_in_your_kitchen: "already in your kitchen",
  not_confirmed_available: "not confirmed in stock near you",
  brand_refused: "from a brand you refuse",
  too_processed: "more processed than you allow",
  needs_cold_storage: "need a fridge",
  pack_outlasts_the_plan: "too big to finish",
  priced_beyond_its_nutrition: "priced far beyond their nutrition",
  removed_by_shopper: "you left out",
});

/**
 * One event as a timeline line.
 * @param {object} event from /api/plan/run
 * @returns {{ id: string, title: string, detail: string|null, state: "running"|"done"|"warn" }|null}
 */
export function lineFor(event) {
  switch (event?.stage) {
    case "household":
      return {
        id: "household",
        title: "Read your household",
        detail: [plural(event.members, "person", "people"), event.avoids ? plural(event.avoids, "thing to avoid", "things to avoid") : null, event.days ? plural(event.days, "day") : null, event.budget ? rupees(event.budget) : "no budget"].filter(Boolean).join(" · "),
        state: "done",
      };
    case "catalogue":
      return event.status === "running"
        ? { id: "catalogue", title: "Checking the shelf", detail: null, state: "running" }
        : {
          id: "catalogue",
          title: "Checked the shelf",
          detail: [`${plural(event.plannable, "product")} KOI can plan with`, event.notPlannable ? `${event.notPlannable} it can't measure yet` : null].filter(Boolean).join(" · "),
          state: "done",
        };
    case "rung": {
      const id = `rung:${event.step}`;
      const title = RUNG_TITLES[event.step] ?? "Solving";
      if (event.status === "running") return { id, title, detail: null, state: "running" };
      if (event.status === "built") {
        const out = Object.entries(event.excluded ?? {})
          .filter(([reason, n]) => n > 0 && EXCLUSION_WORDS[reason])
          .map(([reason, n]) => `${n} ${EXCLUSION_WORDS[reason]}`);
        return { id, title, detail: [`${plural(event.candidates, "product")} in play`, ...out].join(" · "), state: "running" };
      }
      return event.usable
        ? { id, title, detail: `Found a basket in ${seconds(event.ms)}`, state: "done" }
        : { id, title, detail: `No basket at this step (${seconds(event.ms)})`, state: "warn" };
    }
    case "draft":
      return {
        id: "draft",
        title: "First basket on the board",
        // Whether anyone is short is said per person on the plates, once the
        // plan is explained: the draft only says what is on the board.
        detail: `${plural(event.basket?.length ?? 0, "product")} · ${rupees(event.cost)}`,
        state: "done",
      };
    case "priority":
      return {
        id: "priority",
        title: event.status === "running" ? "Holding your first priority" : "Held your first priority",
        detail: String(event.priority ?? "").replace(/_/g, " ") || null,
        state: event.status === "running" ? "running" : "done",
      };
    case "targets_budget":
      return event.status === "running"
        ? { id: "targets_budget", title: "Pricing what the targets take", detail: `${rupees(event.extra)} more would meet them`, state: "running" }
        : {
          id: "targets_budget",
          title: event.raised ? "Spent more to meet the targets" : "Kept to the budget",
          detail: event.raised ? `${rupees(event.raised.extra)} over, because you ranked targets first` : null,
          state: event.raised ? "warn" : "done",
        };
    case "conflicts":
      return event.status === "running"
        ? { id: "conflicts", title: "Someone's short — checking what would fix it", detail: null, state: "running" }
        : { id: "conflicts", title: "Checked what would fix it", detail: event.fixes ? plural(event.fixes, "fix", "fixes") : "Nothing you asked for is in the way", state: "done" };
    case "explain":
      return { id: "explain", title: "Writing up what it did", detail: null, state: "running" };
    case "reading":
      return event.status === "running"
        ? { id: "reading", title: "Reading your change", detail: null, state: "running" }
        : event.applied?.length
          ? { id: "reading", title: "Understood", detail: event.applied.slice(0, 3).join(" · "), state: "done" }
          : { id: "reading", title: "Couldn't apply that", detail: (event.notApplied ?? []).slice(0, 2).join(" · ") || null, state: "warn" };
    case "stored":
      return { id: "stored", title: event.planStatus === "infeasible" ? "Saved — no basket could be made" : "Saved", detail: null, state: event.planStatus === "infeasible" ? "warn" : "done" };
    default:
      return null;
  }
}

/** A fresh run. */
export const newRun = (kind) => ({ kind, lines: [], draft: null, result: null, error: null, done: false, startedAt: Date.now() });

/**
 * The run after one streamed message. Lines are keyed by id, so a running line
 * becomes its finished one in place; a finished run marks every open line done.
 * @param {object} run from newRun()
 * @param {object} message one NDJSON line from /api/plan/run
 */
export function reduceRun(run, message) {
  if (!message || message.type === "hello") return run;
  // ── The agent (/api/plan/agent): steps, each done by a tool ──────────────
  if (message.type === "agent") {
    const steps = message.steps ?? [];
    const line = steps.length
      ? { id: "agent", title: steps.length === 1 ? "KOI will do one thing" : `KOI will do ${steps.length} things`, detail: steps.map((s) => s.label).join(" → "), state: "done" }
      : { id: "agent", title: "Nothing in that for KOI to do", detail: "Try: “make it cheaper”, “no biscuits”, “plan 7 days on ₹4,000”", state: "warn" };
    return { ...run, steps, source: message.source ?? null, lines: upsert(run.lines, line) };
  }
  if (message.type === "step" && message.stage === "agent") {
    return { ...run, lines: upsert(run.lines, { id: "agent", title: "Reading what you mean", detail: null, state: "running" }) };
  }
  if (message.type === "step" && message.stage === "tool") {
    const state = message.status === "running" ? "running" : message.status === "done" ? "done" : "warn";
    return {
      ...run,
      toolIndex: message.index,
      lines: upsert(run.lines, { id: `tool:${message.index}`, title: message.label, detail: message.note ?? null, state, tool: true }),
    };
  }
  if (message.type === "plan_result" || message.type === "without_result" || message.type === "action") {
    return { ...run, events: [...(run.events ?? []), message] };
  }
  if (message.type === "done") {
    return { ...run, done: true, finishedAt: Date.now(), lines: run.lines.map((l) => (l.state === "running" ? { ...l, state: "done" } : l)) };
  }
  if (message.type === "result") {
    return { ...run, result: message.payload, done: true, finishedAt: Date.now(), lines: run.lines.map((l) => (l.state === "running" ? { ...l, state: "done" } : l)) };
  }
  if (message.type === "error") {
    return { ...run, error: message.error ?? "Something went wrong.", done: true, finishedAt: Date.now(), lines: run.lines.map((l) => (l.state === "running" ? { ...l, state: "warn" } : l)) };
  }
  const found = lineFor(message);
  const next = { ...run };
  if (message.type === "draft") next.draft = { basket: message.basket ?? [], cost: message.cost ?? null };
  if (!found) return next;
  // Inside an agent run, each step's planner lines are its own.
  const line = run.toolIndex !== undefined ? { ...found, id: `${run.toolIndex}:${found.id}`, nested: true } : found;
  next.lines = upsert(run.lines, line);
  return next;
}

/** Replace the line with this id in place, or add it at the end. */
function upsert(lines, line) {
  const index = lines.findIndex((l) => l.id === line.id);
  return index === -1 ? [...lines, line] : lines.map((l, i) => (i === index ? line : l));
}
