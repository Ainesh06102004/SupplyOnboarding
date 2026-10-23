import { test } from "node:test";
import assert from "node:assert/strict";
import { datesOf, occurrences, weekFromCalendar, toICS, eventProblems, eventTitle, repeatWords } from "./events";
import { GENERIC_MEALS } from "@/lib/food/estimate";

const ME = "m1";
const tuesdayLunch = { id: "e1", kind: "out", member_id: ME, slot: "lunch", starts_on: "2026-10-01", repeat_days: [2] };
const gym = { id: "e2", kind: "training", member_id: ME, starts_on: "2026-10-01", repeat_days: [1, 3, 5] };
const trip = { id: "e3", kind: "travel", member_id: "m2", starts_on: "2026-10-29", ends_on: "2026-10-30" };
const sundayCook = { id: "e4", kind: "prep", starts_on: "2026-10-04", repeat_days: [0] };

test("an event falls on its days: weekly from its start until its end, or once, or a range", () => {
  assert.deepEqual(datesOf(tuesdayLunch, "2026-10-26", "2026-11-08"), ["2026-10-27", "2026-11-03"]);
  assert.deepEqual(datesOf({ ...tuesdayLunch, until: "2026-10-31" }, "2026-10-26", "2026-11-08"), ["2026-10-27"]);
  assert.deepEqual(datesOf(trip, "2026-10-26", "2026-11-01"), ["2026-10-29", "2026-10-30"]);
  assert.deepEqual(datesOf({ kind: "shop", starts_on: "2026-10-28" }, "2026-10-26", "2026-11-01"), ["2026-10-28"]);
  assert.deepEqual(datesOf(gym, "2026-09-01", "2026-09-30"), [], "nothing before it starts");
  const by = occurrences([tuesdayLunch, gym], "2026-10-26", "2026-10-28");
  assert.deepEqual(Object.keys(by).sort(), ["2026-10-26", "2026-10-27", "2026-10-28"]);
});

test("the week takes who is out, who is away, who trains, and the prep days", () => {
  const w = weekFromCalendar([tuesdayLunch, gym, trip, sundayCook], { from: "2026-10-26", to: "2026-11-01" });
  assert.deepEqual(w.away["2026-10-27:lunch"], [ME]);
  assert.deepEqual(w.away["2026-10-29:dinner"], ["m2"], "travel empties every meal");
  assert.deepEqual(Object.keys(w.outs[ME]), ["2026-10-27:lunch"]);
  assert.equal(w.outs[ME]["2026-10-27:lunch"].nutrition.kcal, GENERIC_MEALS.lunch.kcal, "a typical lunch out, until the person says");
  assert.deepEqual([...w.training[ME]].sort(), ["2026-10-26", "2026-10-28", "2026-10-30"]);
  assert.deepEqual(w.prepDays, [0], "Sunday's cook, the day before the week, counts");
  // A meal out the person sized themselves ("about 900 kcal") is held at that.
  const sized = weekFromCalendar([{ ...tuesdayLunch, plan_effect: { kcal: 900 } }], { from: "2026-10-26", to: "2026-11-01" });
  assert.equal(sized.outs[ME]["2026-10-27:lunch"].nutrition.kcal, 900);
  assert.deepEqual(weekFromCalendar([], { from: "2026-10-26", to: "2026-11-01" }).prepDays, null);
});

test("an event is checked before it is saved, in words", () => {
  assert.deepEqual(eventProblems(tuesdayLunch), []);
  assert.ok(eventProblems({ kind: "out", starts_on: "2026-10-27" }).includes("Pick who it is for."));
  assert.ok(eventProblems({ kind: "out", member_id: ME, starts_on: "2026-10-27" }).includes("Pick which meal is out."));
  assert.ok(eventProblems({ ...trip, ends_on: "2026-10-01" }).includes("The end is before the start."));
  assert.equal(eventTitle(tuesdayLunch, "Me"), "Me: lunch out");
  assert.equal(repeatWords(tuesdayLunch), "every Tuesday");
  assert.equal(repeatWords({ repeat_days: [1, 2, 3, 4, 5] }), "weekdays");
});

test("the iCalendar file is what a calendar app expects", () => {
  const ics = toICS([{ ...tuesdayLunch, member_label: "Me" }, trip, { id: "e5", kind: "remind", title: "Order atta, rice; dal", starts_on: "2026-10-28", at_time: "19:30:00" }], { now: new Date("2026-10-23T10:00:00Z") });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /UID:e1@koinorth\.com/);
  // A Tuesday lunch out starting on a Thursday: the first instance is the next Tuesday.
  assert.match(ics, /DTSTART;TZID=Asia\/Kolkata:20261006T130000\r\nDURATION:PT1H\r\nRRULE:FREQ=WEEKLY;BYDAY=TU/);
  assert.match(ics, /SUMMARY:Me: lunch out/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261029\r\nDTEND;VALUE=DATE:20261031/, "a range ends the day after its last day");
  assert.match(ics, /SUMMARY:Order atta\\, rice\\; dal/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});
