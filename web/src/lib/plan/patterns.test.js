import { test } from "node:test";
import assert from "node:assert/strict";
import { eatOutPatterns } from "./patterns";

const out = (eaten_on, slot = "lunch", setting = "canteen") => ({ eaten_on, slot, status: "other", other: { setting, items: [{ dish_key: "veg_thali" }] } });

test("lunch out three Tuesdays of the last four is a habit; twice is not", () => {
  // Tuesdays: 6, 13, 20 Oct 2026; today is Friday 23 Oct.
  const rows = [out("2026-10-06"), out("2026-10-13"), out("2026-10-20"), out("2026-10-14", "dinner", "restaurant"), out("2026-10-21", "dinner", "restaurant")];
  const p = eatOutPatterns(rows, { today: "2026-10-23" });
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].weekdayName, p[0].slot, p[0].weeks, p[0].setting, p[0].dish], ["Tuesday", "lunch", 3, "canteen", "veg_thali"]);
});

test("meals at home, meals as planned and old weeks don't count; a habit said no to stays quiet", () => {
  const rows = [out("2026-10-06", "lunch", "home"), out("2026-10-13", "lunch", "home"), out("2026-10-20", "lunch", "home"), { eaten_on: "2026-10-20", slot: "dinner", status: "ate" }];
  assert.deepEqual(eatOutPatterns(rows, { today: "2026-10-23" }), []);
  const old = [out("2026-08-04"), out("2026-08-11"), out("2026-08-18")];
  assert.deepEqual(eatOutPatterns(old, { today: "2026-10-23" }), []);
  const habit = [out("2026-10-06"), out("2026-10-13"), out("2026-10-20")];
  assert.deepEqual(eatOutPatterns(habit, { today: "2026-10-23", dismissed: ["2:lunch"] }), []);
});
