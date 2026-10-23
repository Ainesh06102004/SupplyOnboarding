import { test } from "node:test";
import assert from "node:assert/strict";
import { readMealSentence, slotAt, dateFor } from "./mealWords";

test("a meal said in English or Hinglish is read: dishes, counts, meal, day and place", () => {
  const a = readMealSentence("Had 2 samosas at the canteen for snack");
  assert.equal(a.isMeal, true);
  assert.deepEqual(a.items.map((i) => [i.dishKey, i.count]), [["samosa", 2]]);
  assert.equal(a.slot, "snack");
  assert.equal(a.setting, "canteen");

  const b = readMealSentence("kal raat bahar chole bhature khaya, full plate");
  assert.equal(b.isMeal, true);
  assert.equal(b.day, "yesterday");
  assert.equal(b.slot, "dinner");
  assert.equal(b.setting, "restaurant");
  assert.deepEqual(b.items.map((i) => [i.dishKey, i.portion]), [["chole_bhature", "big"]]);

  const c = readMealSentence("ordered a chicken pizza on swiggy for dinner");
  assert.deepEqual(c.items.map((i) => i.dishKey), ["chicken_pizza"]);
  assert.equal(c.setting, "restaurant");
});

test("a word that fits several dishes is left for the person to choose", () => {
  const r = readMealSentence("I had biryani for lunch at office");
  assert.equal(r.isMeal, true);
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.ambiguous[0].options.map((o) => o.key).sort(), ["chicken_biryani", "mutton_biryani", "veg_biryani"]);
  // The answer, said after the question, settles it.
  const settled = readMealSentence("I had biryani for lunch at office. Chicken biryani");
  assert.deepEqual(settled.items.map((i) => i.dishKey), ["chicken_biryani"]);
  assert.equal(settled.ambiguous.length, 0);
});

test("skipped and half-eaten meals are meals too; a question with 'had' is not", () => {
  assert.equal(readMealSentence("I skipped lunch today").status, "skipped");
  assert.equal(readMealSentence("I skipped lunch today").isMeal, true);
  assert.equal(readMealSentence("only had half my dinner").status, "partial");
  assert.equal(readMealSentence("I had a question about my order").isMeal, false);
  assert.equal(readMealSentence("make the plan cheaper").isMeal, false);
  // A big dinner KOI can't name is still a meal (it is estimated as a typical one).
  const party = readMealSentence("had a huge dinner at a wedding");
  assert.equal(party.isMeal, true);
  assert.equal(party.items.length, 0);
  assert.equal(party.portion, "big");
});

test("the time of day picks a meal, and today or yesterday is India's date", () => {
  assert.equal(slotAt(8), "breakfast");
  assert.equal(slotAt(13), "lunch");
  assert.equal(slotAt(17), "snack");
  assert.equal(slotAt(21), "dinner");
  const at = new Date("2026-10-23T20:00:00Z"); // 1:30 am on the 24th in India
  assert.equal(dateFor("today", { now: at }), "2026-10-24");
  assert.equal(dateFor("yesterday", { now: at }), "2026-10-23");
});
