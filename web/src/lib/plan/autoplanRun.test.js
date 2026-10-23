import { test } from "node:test";
import assert from "node:assert/strict";
import { runAutoplan, runReminders, plainReason } from "./autoplanRun";

/**
 * A Supabase client stand-in: tables in memory, and the query-builder calls
 * the run makes (select/eq/lte/in/order/limit/single, update, delete), each
 * recorded so a test can see what was written and how it was scoped.
 */
function fakeDb(tables) {
  const writes = [];
  const from = (name) => {
    const filters = [];
    let op = { kind: "select" };
    const rows = () => (tables[name] ?? []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select() { return q; },
      eq(col, v) { filters.push((r) => String(r[col]) === String(v)); return q; },
      lte(col, v) { filters.push((r) => r[col] !== null && r[col] !== undefined && String(r[col]) <= String(v)); return q; },
      in(col, vs) { filters.push((r) => vs.includes(r[col])); return q; },
      order() { return q; },
      limit() { return q; },
      update(patch) { op = { kind: "update", patch }; return q; },
      delete() { op = { kind: "delete" }; return q; },
      single() { op = { ...op, single: true }; return q; },
      then(resolve) {
        const hit = rows();
        if (op.kind === "update") { hit.forEach((r) => Object.assign(r, op.patch)); writes.push({ table: name, ...op, count: hit.length }); return resolve({ data: hit, error: null }); }
        if (op.kind === "delete") { tables[name] = (tables[name] ?? []).filter((r) => !hit.includes(r)); writes.push({ table: name, kind: "delete", count: hit.length }); return resolve({ data: null, error: null }); }
        return resolve({ data: op.single ? hit[0] ?? null : hit, error: null });
      },
    };
    return q;
  };
  return { from, writes, tables };
}

const NOW = new Date("2026-10-25T13:05:00Z"); // Sunday 6:35 pm IST
const jobOf = (household, extra = {}) => ({ household_id: household, weekday: 0, local_time: "18:00", rules: { days: 7 }, channels: ["in_app"], paused: false, next_run_at: "2026-10-25T12:30:00Z", household: { id: household, owner_id: `owner-${household}` }, ...extra });

test("a due job is drafted for its own household, starts the next day, and the owner is told", async () => {
  const db = fakeDb({
    autoplan_job: [jobOf("h1"), jobOf("h2", { paused: true }), jobOf("h3", { next_run_at: "2026-11-01T12:30:00Z" })],
    plan: [{ id: "p1", household_id: "h1", status: "solved", constraints: { members: [] } }, { id: "other", household_id: "h9", status: "solved", constraints: {} }],
  });
  const asked = [];
  const sent = [];
  const results = await runAutoplan({
    db, now: NOW,
    planFor: async (input) => { asked.push(input); return { planId: "p1", status: "solved", days: 7, report: { basket: [1, 2, 3], cost: 1450 } }; },
    notify: async (_db, n) => { sent.push(n); return { id: "n1" }; },
  });
  assert.deepEqual(results, [{ householdId: "h1", planId: "p1", startsOn: "2026-10-26" }]);
  assert.equal(asked.length, 1, "only the due, unpaused job runs");
  assert.equal(asked[0].householdId, "h1");
  assert.equal(asked[0].db, db, "the planner gets the job's client");
  const plan = db.tables.plan.find((p) => p.id === "p1");
  assert.equal(plan.status, "draft");
  assert.deepEqual(plan.constraints, { members: [], starts_on: "2026-10-26", auto: true });
  assert.equal(db.tables.plan.find((p) => p.id === "other").status, "solved", "nobody else's plan is touched");
  assert.equal(sent[0].kind, "autoplan_ready");
  assert.equal(sent[0].recipientId, "owner-h1");
  assert.equal(sent[0].params.planId, "p1");
  assert.equal(sent[0].ref, "autoplan:h1:2026-10-25T12:30:00Z", "once per run");
  const job = db.tables.autoplan_job.find((j) => j.household_id === "h1");
  assert.equal(job.next_run_at, "2026-11-01T12:30:00.000Z");
  assert.equal(job.last_plan_id, "p1");
  assert.equal(job.last_error, null);
});

test("a plan that can't fit is discarded, the owner is told why in plain words, and the job moves on", async () => {
  const db = fakeDb({ autoplan_job: [jobOf("h1")], plan: [{ id: "p2", household_id: "h1", status: "infeasible", constraints: {} }] });
  const sent = [];
  const results = await runAutoplan({
    db, now: NOW,
    planFor: async () => ({ planId: "p2", status: "infeasible", days: 7, report: {} }),
    notify: async (_db, n) => { sent.push(n); return {}; },
  });
  assert.equal(results[0].error, "Nothing fitted the budget and rules you set.");
  assert.equal(db.tables.plan.length, 0, "the infeasible plan is gone");
  assert.equal(sent[0].kind, "autoplan_failed");
  assert.equal(db.tables.autoplan_job[0].next_run_at, "2026-11-01T12:30:00.000Z", "it tries again next week");
  assert.equal(plainReason(new Error("This household has no members yet.")), "Your household has nobody in it yet.");
  assert.equal(plainReason(new Error("TypeError: x is undefined")), "Something went wrong while planning.");
});

test("reminders go out in the hour they're due, once, for today's occurrences only", async () => {
  const household = { id: "h1", owner_id: "owner-h1" };
  const db = fakeDb({
    calendar_event: [
      { id: "e1", kind: "plan", title: null, starts_on: "2026-10-01", repeat_days: [0], at_time: "18:30:00", household },
      { id: "e2", kind: "remind", title: "Order atta", starts_on: "2026-10-25", at_time: "19:30:00", household },
      { id: "e3", kind: "shop", title: null, starts_on: "2026-10-01", repeat_days: [6], at_time: "18:15:00", household },
      { id: "e4", kind: "remind", title: "Soak rajma", starts_on: "2026-10-25", at_time: null, household },
    ],
  });
  const sent = [];
  const n = await runReminders({ db, now: NOW, notify: async (_db, x) => { sent.push(x); return {}; } });
  assert.equal(n, 1);
  assert.deepEqual(sent.map((x) => [x.kind, x.ref]), [["plan_day", "event:e1:2026-10-25"]], "6:30 pm today, inside the hour; 7:30 pm later; Saturday's shop isn't today; 9 am was earlier");
});
