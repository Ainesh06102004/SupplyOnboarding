import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRunAt, startsOnFor, jobWords, rulesOf, dueJobs } from "./autoplan";

const SUNDAY_SIX = { weekday: 0, local_time: "18:00" };

test("a job runs next on its weekday at its time in India, never now or in the past", () => {
  // Friday 23 Oct, 3:30 pm IST.
  assert.equal(nextRunAt(SUNDAY_SIX, new Date("2026-10-23T10:00:00Z")).toISOString(), "2026-10-25T12:30:00.000Z");
  // Exactly at the run: the next one is a week on.
  assert.equal(nextRunAt(SUNDAY_SIX, new Date("2026-10-25T12:30:00Z")).toISOString(), "2026-11-01T12:30:00.000Z");
  // Sunday 11:50 pm IST is still Sunday in India (Sunday 6:20 pm UTC): next Sunday.
  assert.equal(nextRunAt({ weekday: 0, local_time: "07:00" }, new Date("2026-10-25T18:20:00Z")).toISOString(), "2026-11-01T01:30:00.000Z");
  // 1 am Monday in India is still Sunday in UTC: a Monday 7 am job runs that morning.
  assert.equal(nextRunAt({ weekday: 1, local_time: "07:00" }, new Date("2026-10-25T19:30:00Z")).toISOString(), "2026-10-26T01:30:00.000Z");
});

test("the draft starts the day after the run, or the Monday after", () => {
  const sunday = new Date("2026-10-25T12:30:00Z");
  assert.equal(startsOnFor(sunday), "2026-10-26");
  assert.equal(startsOnFor(sunday, { start: "next_monday" }), "2026-10-26");
  const wednesday = new Date("2026-10-28T12:30:00Z");
  assert.equal(startsOnFor(wednesday, { start: "next_monday" }), "2026-11-02");
  assert.equal(startsOnFor(wednesday), "2026-10-29");
});

test("rules are read safely, words are plain, and only due unpaused jobs run", () => {
  assert.deepEqual(rulesOf({ rules: { days: "5", budget: "2500", member_ids: [1] } }), { days: 5, budget: 2500, memberIds: ["1"], start: "next_day" });
  assert.deepEqual(rulesOf({}), { days: 7, budget: null, memberIds: null, start: "next_day" });
  assert.equal(jobWords(SUNDAY_SIX), "Every Sunday at 6 pm");
  assert.equal(jobWords({ weekday: 6, local_time: "09:30:00" }), "Every Saturday at 9:30 am");
  const now = new Date("2026-10-25T13:00:00Z");
  const jobs = [
    { household_id: "a", next_run_at: "2026-10-25T12:30:00Z" },
    { household_id: "b", next_run_at: "2026-10-25T12:30:00Z", paused: true },
    { household_id: "c", next_run_at: "2026-10-26T12:30:00Z" },
    { household_id: "d", next_run_at: null },
  ];
  assert.deepEqual(dueJobs(jobs, now).map((j) => j.household_id), ["a"]);
});
