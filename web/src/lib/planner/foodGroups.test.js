// What a basket covers of ICMR-NIN's plate, and what KOI cannot sell (C6).

import test from "node:test";
import assert from "node:assert/strict";

import { coverageOf, coverageWords, groupOf, FOOD_GROUPS } from "@/lib/planner/foodGroups.js";

const catalogue = [
  { skuId: "rice", categoryKey: "staples.rice" },
  { skuId: "dal", categoryKey: "staples.pulses" },
  { skuId: "almonds", categoryKey: "nuts_seeds.nuts" },
  { skuId: "ghee", categoryKey: "fats_oils.ghee" },
  { skuId: "raisins", categoryKey: "nuts_seeds.dried_fruit" },
  { skuId: "chips", categoryKey: "snacks.chips_crisps" },
];

test("a category answers for its food group, and a snack for none", () => {
  assert.equal(groupOf("staples.rice"), "cereals");
  assert.equal(groupOf("staples.pulses"), "pulses");
  assert.equal(groupOf("nuts_seeds.nut_butters"), "nuts_oilseeds");
  assert.equal(groupOf("snacks.chips_crisps"), null, "crisps are not a food group");
  assert.equal(groupOf("staples"), null, "'staples' alone says nothing: cereal or pulse?");
  assert.equal(groupOf(null), null);
});

test("a basket of packets covers what it covers, and no more", () => {
  const coverage = coverageOf([{ skuId: "rice" }, { skuId: "chips" }], catalogue);
  assert.deepEqual(coverage.covered.map((g) => g.key), ["cereals"]);
  assert.deepEqual(coverage.missing.map((g) => g.key), ["pulses", "nuts_oilseeds", "fats_oils", "fruits"]);
  assert.equal(coverage.of, 8);
});

test("what KOI cannot sell is never counted as the shopper's gap", () => {
  const coverage = coverageOf(catalogue.map((i) => ({ skuId: i.skuId })), catalogue);
  assert.deepEqual(coverage.covered.map((g) => g.key), ["cereals", "pulses", "nuts_oilseeds", "fats_oils", "fruits"]);
  assert.deepEqual(coverage.missing, [], "everything KOI stocks is in this basket");
  // The three it has no aisle for stay separate, however full the basket is.
  assert.deepEqual(coverage.cannotSupply.map((g) => g.key), ["vegetables", "milk", "flesh_eggs"]);
  assert.equal(FOOD_GROUPS.filter((g) => !g.koiSells).length, 3);
});

test("the sentence sends a shopper to the right shop", () => {
  const words = coverageWords(coverageOf([{ skuId: "rice" }], catalogue));
  assert.match(words, /Covers 1 of the 8 food groups/);
  assert.match(words, /ask for them and the next plan will have them/, "a gap KOI can fill is an ask");
  assert.match(words, /not things KOI sells: buy them fresh/, "a gap it cannot fill is not");
  assert.ok(!/add vegetables/i.test(words), "never sent round a shop with no vegetable aisle");
});

test("fruit from a packet is marked as dried", () => {
  const coverage = coverageOf([{ skuId: "raisins" }], catalogue);
  assert.equal(coverage.covered.find((g) => g.key === "fruits").onlyAs, "dried");
});
