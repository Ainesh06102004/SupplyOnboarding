import { test } from "node:test";
import assert from "node:assert/strict";
import { readScheduleSentence } from "./words";
import { readMealSentence } from "@/lib/food/mealWords";

const today = "2026-10-23"; // a Friday
const read = (s, labels = ["Me", "Wife", "Kid 1"]) => readScheduleSentence(s, { labels, today });

test("a habit becomes a weekly event: meal out, training, prep", () => {
  const out = read("I have lunch out every Tuesday at the office");
  assert.deepEqual([out.isSchedule, out.kind, out.slot, out.repeatDays, out.startsOn], [true, "out", "lunch", [2], today]);
  const gym = read("gym on mon wed fri at 7am");
  assert.deepEqual([gym.kind, gym.repeatDays, gym.atTime], ["training", [1, 3, 5], "07:00"]);
  const prep = read("batch cooking on sundays");
  assert.deepEqual([prep.kind, prep.repeatDays], ["prep", [0]]);
  const wife = read("my Wife eats lunch out on weekdays");
  assert.deepEqual([wife.member, wife.kind, wife.repeatDays], ["Wife", "out", [1, 2, 3, 4, 5]]);
});

test("a date or a range becomes a one-off event, next year if it has passed", () => {
  const trip = read("travelling to Pune 3 to 5 Nov");
  assert.deepEqual([trip.kind, trip.startsOn, trip.endsOn, trip.repeatDays], ["travel", "2026-11-03", "2026-11-05", null]);
  const away = read("Kid 1 is away on a school trip from 28 dec to 2 jan");
  assert.deepEqual([away.member, away.startsOn, away.endsOn], ["Kid 1", "2026-12-28", "2027-01-02"]);
  const remind = read("remind me to order atta tomorrow evening");
  assert.deepEqual([remind.kind, remind.title, remind.startsOn, remind.atTime], ["remind", "order atta", "2026-10-24", "18:00"]);
  const plan = read("plan next week on sunday");
  assert.deepEqual([plan.kind, plan.startsOn], ["plan", "2026-10-25"]);
  assert.equal(read("shopping on 2 jan").startsOn, "2027-01-02", "January has passed this year");
  assert.equal(read("dinner out on 12 oct").isSchedule, true, "12 Oct is next year's, not a past date");
});

test("not a plan: no kind, nothing said about when, or a meal already eaten", () => {
  assert.equal(read("make the plan cheaper").isSchedule, false);
  assert.equal(read("I love cricket").isSchedule, false);
  // A habit is the Calendar's, not a meal eaten; a meal eaten is Track's.
  assert.equal(readMealSentence("I eat out every Tuesday for lunch").isMeal, false);
  assert.equal(readMealSentence("had lunch out today at the office canteen").isMeal, true);
});
