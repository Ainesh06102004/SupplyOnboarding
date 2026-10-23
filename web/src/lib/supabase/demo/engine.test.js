import { test } from "node:test";
import assert from "node:assert/strict";
import { execute, parseSelect } from "./engine";

const UID = "u1";
const tables = () => ({
  household: [{ id: "h1", label: "Home", owner_id: UID, created_at: "2026-09-01" }],
  household_member: [
    { id: "m1", household_id: "h1", label: "Me", created_at: "2026-09-01", account_profile_id: UID },
    { id: "m2", household_id: "h1", label: "Wife", created_at: "2026-09-02", account_profile_id: null },
  ],
  household_member_avoid: [{ id: "a1", member_id: "m2", avoid_key: "peanuts", severity: "allergy" }],
  plan: [
    { id: "p1", household_id: "h1", status: "solved", created_at: "2026-10-20", constraints: { follows: null, members: [{ id: "m1" }] }, achieved: { cost: 1450, basket: [1, 2] } },
    { id: "p2", household_id: "h1", status: "draft", created_at: "2026-10-22", constraints: { starts_on: "2026-10-26" }, achieved: { cost: 900 } },
  ],
});
const run = (t, q) => execute(t, q, { uid: UID, now: "2026-10-23T00:00:00Z" });

test("a select reads like PostgREST: embeds, aliases, JSON paths, filters, order and one row", () => {
  const t = tables();
  const h = run(t, { table: "household", op: "select", select: "*, household_member(*, household_member_avoid(avoid_key, severity))", orders: [["created_at", false]], limit: 1, single: "maybe" });
  assert.equal(h.error, null);
  assert.deepEqual(h.data.household_member.map((m) => m.label), ["Me", "Wife"]);
  assert.deepEqual(h.data.household_member[1].household_member_avoid, [{ avoid_key: "peanuts", severity: "allergy" }]);
  const plans = run(t, {
    table: "plan", op: "select", filters: [["eq", "household_id", "h1"], ["neq", "status", "draft"]], orders: [["created_at", false]],
    select: "id, follows:constraints->>follows, members:constraints->members, cost:achieved->cost, starts_on:constraints->>starts_on",
  });
  assert.deepEqual(plans.data, [{ id: "p1", follows: null, members: [{ id: "m1" }], cost: 1450, starts_on: null }]);
  const owner = run(t, { table: "household_member", op: "select", select: "label, household:household_id(id, owner_id)", filters: [["eq", "id", "m2"]], single: "one" });
  assert.deepEqual(owner.data, { label: "Wife", household: { id: "h1", owner_id: UID } });
  assert.equal(run(t, { table: "plan", op: "select", single: "one" }).error.code, "PGRST116");
  assert.deepEqual(parseSelect("brands (brand_name)")[0].name, "brands");
});

test("writes fill in defaults, upsert on the conflict columns, and return rows only when asked", () => {
  const t = tables();
  const added = run(t, { table: "household_member", op: "insert", values: { household_id: "h1", label: "Kid" }, returning: true, select: "id, version", single: "one" });
  assert.match(added.data.id, /^[0-9a-f-]{36}$/);
  assert.equal(added.data.version, 1);
  const log = (slot, status) => ({ table: "member_meal_log", op: "upsert", values: { member_id: "m1", eaten_on: "2026-10-23", slot, status }, onConflict: "member_id,eaten_on,slot" });
  run(t, log("lunch", "ate"));
  run(t, log("lunch", "other"));
  run(t, log("dinner", "ate"));
  assert.deepEqual(t.member_meal_log.map((r) => [r.slot, r.status]), [["lunch", "other"], ["dinner", "ate"]]);
  run(t, { table: "plan_week", op: "upsert", values: { plan_id: "p1", picks: { "0:lunch": { dishes: ["rajma"] } } } });
  run(t, { table: "plan_week", op: "upsert", values: { plan_id: "p1", adjustments: [{ id: "x" }] } });
  assert.equal(t.plan_week.length, 1, "plan_week's key is plan_id");
  assert.deepEqual(t.plan_week[0].picks, { "0:lunch": { dishes: ["rajma"] } }, "an upsert keeps the columns it doesn't name");
  const upd = run(t, { table: "plan", op: "update", values: { status: "solved" }, filters: [["eq", "id", "p2"]] });
  assert.equal(upd.data, null);
  assert.equal(t.plan.find((p) => p.id === "p2").status, "solved");
  run(t, { table: "household_member_avoid", op: "delete", filters: [["in", "member_id", ["m2"]]] });
  assert.equal(t.household_member_avoid.length, 0);
  const n = { table: "notification", op: "insert", values: { id: "n1", recipient_id: UID, ref: "r1", kind: "reminder", title: "t", body: "b" } };
  run(t, n);
  assert.equal(run(t, n).error.code, "23505", "the same id twice is a duplicate");
  assert.equal(run(t, { table: "plan", op: "select", count: "exact", head: true }).count, 2);
});
