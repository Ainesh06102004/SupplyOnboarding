import { test } from "node:test";
import assert from "node:assert/strict";

import { fromHinglish } from "./hinglish";
import { readBrief, draftFrom } from "./brief";

test("the Hinglish a household description uses, as the rules' English", () => {
  assert.equal(fromHinglish("hum do hamare do, sab veg, bacchon ko nuts se allergy hai"), "us 2, 2 kids, all veg, kids allergic to nuts");
  assert.equal(fromHinglish("hum paanch log hain"), "we are 5");
  assert.equal(fromHinglish("main aur meri biwi, do bacche, 7 din, budget 4 hazaar"), "me and my wife, 2 kids, 7 days, budget 4000");
  assert.equal(fromHinglish("beta paneer nahi khata"), "son no paneer");
});

test("English passes through: 'do' is a Hindi number only before a person word", () => {
  for (const english of ["what do the kids need", "plan 7 days for two kids", "me and my wife on 4000"]) {
    assert.equal(fromHinglish(english), english);
  }
});

test("'hum do hamare do' drafts four people, the kids kept from nuts", () => {
  const d = draftFrom(readBrief("hum do hamare do, sab veg, bacchon ko nuts se allergy hai"));
  assert.equal(d.members.length, 4);
  assert.ok(d.members.every((m) => m.diet_type === "vegetarian"), JSON.stringify(d.members));
  assert.ok(d.members.some((m) => m.avoidKeys.includes("tree_nuts") || m.avoidKeys.includes("peanuts")), JSON.stringify(d.members));
});

test("a Hinglish brief's days and budget are read", () => {
  const r = readBrief("main aur meri biwi, do bacche, 7 din, budget 4 hazaar");
  assert.equal(r.days, 7);
  assert.equal(r.budget, 4000);
  assert.equal(r.groups.reduce((n, g) => n + g.count, 0), 4);
});
