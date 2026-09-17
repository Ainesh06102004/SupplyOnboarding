// ============================================================================
// KOI PLANNER — tests for the age-band safety rules (plan §9.10.4, C1)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { ageRefusal, ageReason, AGE_RULES } from "@/lib/planner/ageSafety.js";
import { refusalReason } from "@/lib/planner/report.js";

const product = (categoryKey, contains = []) => ({ categoryKey, contains });

test("whole nuts are refused under 5, and only where the nuts are whole", () => {
  for (const band of ["child_1_3", "child_4_6"]) {
    assert.deepEqual(ageRefusal(product("nuts_seeds.nuts", ["tree_nut"]), band), { flag: "whole_nuts", rule: "age" }, band);
    assert.deepEqual(ageRefusal(product("nuts_seeds.mixes", ["tree_nut", "peanut"]), band), { flag: "whole_nuts", rule: "age" });
    assert.deepEqual(ageRefusal(product("snacks.namkeen", ["peanut", "spicy"]), band), { flag: "whole_nuts", rule: "age" }, "Madras Mixture's peanuts are whole");
  }
  assert.equal(ageRefusal(product("snacks.namkeen", ["spicy"]), "child_1_3"), null, "a namkeen with no nuts is fine");
  assert.equal(ageRefusal(product("nuts_seeds.nut_butters", ["peanut"]), "child_1_3"), null, "peanut butter is not whole nuts");
  assert.equal(ageRefusal(product("staples.breakfast_cereals", ["tree_nut"]), "child_1_3"), null);
  assert.equal(ageRefusal(product("snacks.bars", ["tree_nut"]), "child_4_6"), null);
  assert.deepEqual(ageRefusal(product(null, ["peanut"]), "child_1_3"), { flag: "whole_nuts", rule: "age" }, "with no category, KOI cannot show the nuts are not whole");
  assert.equal(ageRefusal(product("nuts_seeds.nuts", ["tree_nut"]), "child_7_9"), null, "7 and over may have them");
  assert.equal(ageRefusal(product("nuts_seeds.nuts", ["tree_nut"]), "adult_19_59"), null);
});

test("caffeine is refused for children up to 12, not for teens or adults", () => {
  const coffee = product("beverages.drink_mixes", ["caffeine"]);
  for (const band of ["child_1_3", "child_4_6", "child_7_9", "child_10_12"]) {
    assert.deepEqual(ageRefusal(coffee, band), { flag: "caffeine", rule: "age" }, band);
  }
  for (const band of ["teen_13_15", "teen_16_18", "adult_19_59", "senior_60_plus"]) {
    assert.equal(ageRefusal(coffee, band), null, band);
  }
});

test("no age band, no age rule", () => {
  assert.equal(ageRefusal(product("nuts_seeds.nuts", ["tree_nut"]), null), null);
});

test("the reason is said in words", () => {
  assert.equal(ageReason("whole_nuts"), "not for their age: whole nuts can choke a child under 5");
  assert.equal(refusalReason({ flag: "caffeine", rule: "age" }), "not for their age: caffeine is not for children");
  assert.deepEqual(AGE_RULES.map((r) => r.key), ["whole_nuts", "caffeine"]);
});
