// ============================================================================
// KOI PLANNER — tests for the LP translation
// Run with `npm test`. Pure: no solver is loaded here.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { toLp, toLpText, readSolution, isUsable, isLpSafe, aliasesFor } from "@/lib/planner/lp.js";
import { buildPlanModel, nameOf } from "@/lib/planner/model.js";

const rice = {
  skuId: "rice", price: 299, contains: [], perPack: { protein: 95, kcal: 3500 },
  packAmount: 1000, packUnit: "g", role: "meal_base", portion: { amount: 45, unit: "g", max: 90 },
};
const adult = { id: "me", targets: { protein: 60 }, avoidFlags: [], dietExcludes: [] };

// A real SKU id, which is what broke the first version of this module.
const UUID = "9a80563e-22ac-42d2-b9a3-7b7186c974f3";
const dates = {
  skuId: UUID, price: 299, contains: [], perPack: { protein: 13, kcal: 2820 },
  packAmount: 250, packUnit: "g", role: "snack", portion: { amount: 40, unit: "g", max: 80 },
};

test("every name the solver reads is safe for LP format, whatever a SKU id looks like", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [dates], days: 7, budget: 1500 });
  const { text, nameOfAlias } = toLp(model);
  // A uuid in a column name would read as subtraction and HiGHS refuses the file.
  assert.ok(!text.includes(UUID), "no uuid reaches the solver");
  for (const [alias, name] of nameOfAlias) {
    assert.ok(isLpSafe(alias), `${alias} is LP-safe`);
    assert.ok(name.length > 0);
  }
  assert.ok(nameOfAlias.size >= 3, "packs, eats and the deviations");
  assert.ok([...nameOfAlias.values()].includes(nameOf.packs(UUID)), "and KOI keeps its own names");
});

test("the model becomes an LP with the packs declared integer", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [rice], days: 7, budget: 1500 });
  const { text, nameOfAlias } = toLp(model);
  const aliasOf = new Map([...nameOfAlias].map(([alias, name]) => [name, alias]));
  const packs = aliasOf.get(nameOf.packs("rice"));
  const eats = aliasOf.get(nameOf.eats("rice", "me"));
  const short = aliasOf.get(nameOf.short("me", "protein"));
  const over = aliasOf.get(nameOf.over("me", "protein"));

  assert.match(text, /^Minimize/);
  assert.match(text, /Subject To/);
  assert.match(text, new RegExp(`General\\n ${packs}`), "packs are integer, shares are not");
  assert.ok(!new RegExp(`General[\\s\\S]*${eats}`).test(text));
  assert.match(text, new RegExp(`\\+ 95 ${eats} \\+ 1 ${short} - 1 ${over} = 420`), "60 g a day for 7 days");
  assert.match(text, new RegExp(`\\+ 299 ${packs} <= 1500`), "the budget row");
  assert.match(text, new RegExp(` 0 <= ${short} <= \\+inf`));
  assert.match(text, /End\n$/);
  assert.equal(toLpText(model), text, "the text-only helper is the same text");
});

test("a solution comes back in the plan's own terms, and packs are whole", () => {
  // As HiGHS returns it: aliases, and a MIP's near-integers.
  const model = buildPlanModel({ members: [adult, { ...adult, id: "kid" }], catalogue: [dates], days: 7 });
  const { nameOfAlias } = toLp(model);
  const aliasOf = new Map([...nameOfAlias].map(([alias, name]) => [name, alias]));
  const columns = {
    [aliasOf.get(nameOf.packs(UUID))]: { Primal: 2.9999999996 },
    [aliasOf.get(nameOf.eats(UUID, "me"))]: { Primal: 1.4995 },
    [aliasOf.get(nameOf.eats(UUID, "kid"))]: { Primal: 0 },
    [aliasOf.get(nameOf.short("me", "protein"))]: { Primal: 12.345 },
    [aliasOf.get(nameOf.over("kid", "protein"))]: { Primal: 100 },
  };
  const read = readSolution(columns, nameOfAlias);
  assert.deepEqual(read.packs, { [UUID]: 3 }, "the real SKU id, and a whole pack");
  assert.deepEqual(read.eats, { [UUID]: { me: 1.5 } }, "a uuid keeps its hyphens");
  assert.deepEqual(read.shortfall, { me: { protein: 12.35 } });
  assert.deepEqual(read.excess, { kid: { protein: 100 } });
});

test("without an alias map the model's own names are read directly", () => {
  const read = readSolution({ packs_rice: { Primal: 2 }, eats_rice_me: { Primal: 2 } });
  assert.deepEqual(read.packs, { rice: 2 });
  assert.deepEqual(read.eats, { rice: { me: 2 } });
});

test("a basket is usable when the solver stopped early but found one", () => {
  assert.equal(isUsable("Optimal", { rice: 1 }), true);
  assert.equal(isUsable("Time limit reached", { rice: 1 }), true, "the incumbent still feeds people");
  assert.equal(isUsable("Time limit reached", {}), false, "nothing found is nothing to show");
  assert.equal(isUsable("Infeasible", { rice: 1 }), false);
  assert.equal(isUsable("Unbounded", { rice: 1 }), false);
});

test("aliases are one per column and one per row", () => {
  const model = buildPlanModel({ members: [adult], catalogue: [rice, dates], days: 7, budget: 900 });
  const { columnAlias, rowAlias } = aliasesFor(model);
  assert.equal(columnAlias.size, model.columns.length);
  assert.equal(rowAlias.size, model.rows.length);
  assert.equal(new Set(columnAlias.values()).size, model.columns.length, "no two columns share an alias");
});

test("the names the solver sees are the names the plan reads back", () => {
  assert.equal(nameOf.packs("rice"), "packs_rice");
  assert.equal(nameOf.eats("rice", "me"), "eats_rice_me");
  assert.equal(nameOf.short("me", "protein"), "short_me_protein");
  assert.equal(nameOf.over("me", "protein"), "over_me_protein");
});
