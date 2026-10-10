import { test } from "node:test";
import assert from "node:assert/strict";

import { lineKey, ownPacks, addPacks, setPacks, applyPlanShare, removeKeys, toRef, resolveRefs, migrateCart, totals } from "./lines";

const almonds = { id: "p-alm", skuId: "s-alm", name: "California Almonds", price: 450 };
const chivda = { id: "p-chv", skuId: "s-chv", name: "Chivda Mix", price: 150 };
const oats = { id: "p-oat", skuId: "s-oat", name: "Oats", price: 199 };
const NOW = 1_700_000_000_000;

test("a line is keyed by its SKU, a legacy line by its product", () => {
  assert.equal(lineKey({ skuId: 12, productId: "p" }), "12");
  assert.equal(lineKey({ skuId: null, productId: "p-1" }), "p:p-1");
  assert.equal(lineKey({ id: "p-2" }), "p:p-2");
  assert.equal(lineKey(null), null);
});

test("added packs are the shopper's own, and adding again grows the line", () => {
  let items = addPacks([], almonds, 1, NOW);
  items = addPacks(items, almonds, 2, NOW + 5);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].fromPlan, 0);
  assert.equal(items[0].addedAt, NOW);
  assert.equal(addPacks(items, almonds, 0, NOW), items);
});

test("putting the plan in twice replaces its share — never doubles", () => {
  const plan = [{ skuId: "s-chv", packs: 5, product: chivda }, { skuId: "s-oat", packs: 1, product: oats }];
  const once = applyPlanShare([], plan, NOW);
  const twice = applyPlanShare(once, plan, NOW);
  assert.deepEqual(twice.map((l) => [l.skuId, l.quantity, l.fromPlan]), [["s-chv", 5, 5], ["s-oat", 1, 1]]);
});

test("the shopper's own packs survive a plan update", () => {
  let items = addPacks([], almonds, 1, NOW);
  items = applyPlanShare(items, [{ skuId: "s-chv", packs: 5, product: chivda }], NOW);
  // The shopper raises chivda above the plan: 2 extra are theirs.
  items = setPacks(items, "s-chv", 7);
  assert.equal(ownPacks(items.find((l) => l.skuId === "s-chv")), 2);
  // The plan changes: 4 chivda now, and almonds join the plan.
  items = applyPlanShare(items, [{ skuId: "s-chv", packs: 4, product: chivda }, { skuId: "s-alm", packs: 2, product: almonds }], NOW);
  const chv = items.find((l) => l.skuId === "s-chv");
  const alm = items.find((l) => l.skuId === "s-alm");
  assert.deepEqual([chv.quantity, chv.fromPlan], [6, 4]);
  assert.deepEqual([alm.quantity, alm.fromPlan], [3, 2]);
});

test("a SKU the plan drops keeps only the shopper's own packs, or leaves", () => {
  let items = applyPlanShare([], [{ skuId: "s-chv", packs: 5, product: chivda }, { skuId: "s-oat", packs: 1, product: oats }], NOW);
  items = setPacks(items, "s-oat", 3);
  items = applyPlanShare(items, [{ skuId: "s-chv", packs: 5, product: chivda }], NOW);
  assert.deepEqual(items.map((l) => [l.skuId, l.quantity, l.fromPlan]), [["s-chv", 5, 5], ["s-oat", 2, 0]]);
  items = applyPlanShare(items, [], NOW);
  assert.deepEqual(items.map((l) => [l.skuId, l.quantity, l.fromPlan]), [["s-oat", 2, 0]]);
});

test("lowering a plan line below the plan lowers the plan's share; 0 removes", () => {
  let items = applyPlanShare([], [{ skuId: "s-chv", packs: 5, product: chivda }], NOW);
  items = setPacks(items, "s-chv", 3);
  assert.deepEqual([items[0].quantity, items[0].fromPlan], [3, 3]);
  assert.deepEqual(setPacks(items, "s-chv", 0), []);
});

test("after a hand-off only the accepted lines leave", () => {
  const items = applyPlanShare(addPacks([], almonds, 1, NOW), [{ skuId: "s-chv", packs: 5, product: chivda }], NOW);
  assert.deepEqual(removeKeys(items, ["s-chv"]).map((l) => l.skuId), ["s-alm"]);
});

test("the stored form is references only — no price, no name", () => {
  const ref = toRef({ ...almonds, productId: "p-alm", quantity: 2, fromPlan: 5 }, NOW);
  assert.deepEqual(ref, { skuId: "s-alm", productId: "p-alm", quantity: 2, fromPlan: 2, addedAt: NOW });
});

test("refs re-attach by SKU, then by product, and merge onto one SKU", () => {
  const refs = [
    { skuId: "s-alm", productId: "p-alm", quantity: 1, fromPlan: 0 },
    { skuId: null, productId: "p-alm", quantity: 2, fromPlan: 0 },
    { skuId: null, productId: "p-chv", quantity: 1, fromPlan: 0 },
  ];
  const out = resolveRefs(refs, [almonds, chivda]);
  assert.deepEqual(out.map((l) => [l.skuId, l.quantity, l.price]), [["s-alm", 3, 450], ["s-chv", 1, 150]]);
});

test("an unmatched ref waits for a seed, and goes against an authoritative catalogue", () => {
  const refs = [{ skuId: "gone", productId: "p-gone", quantity: 1, fromPlan: 0 }];
  assert.equal(resolveRefs(refs, [almonds]).length, 1);
  assert.equal(resolveRefs(refs, [almonds], { authoritative: true }).length, 0);
});

test("a v1 cart (product ids) migrates to v2 without losing a line", () => {
  const v1 = { items: [{ id: "p-alm", quantity: 2, addedAt: 5 }, { id: "p-chv", quantity: 1 }, null, { quantity: 4 }] };
  const v2 = migrateCart(v1, 1);
  assert.deepEqual(v2, {
    items: [
      { skuId: null, productId: "p-alm", quantity: 2, fromPlan: 0, addedAt: 5 },
      { skuId: null, productId: "p-chv", quantity: 1, fromPlan: 0, addedAt: null },
    ],
    plan: null,
  });
  assert.deepEqual(resolveRefs(v2.items, [almonds, chivda], { authoritative: true }).map((l) => [l.skuId, l.quantity]), [["s-alm", 2], ["s-chv", 1]]);
  assert.deepEqual(migrateCart("garbage", 1), { items: [], plan: null });
});

test("totals count packs and money; a line without a price is flagged, not ₹0", () => {
  const t = totals([{ ...almonds, quantity: 2 }, { ...chivda, quantity: 3 }, { skuId: "x", price: null, quantity: 1 }]);
  assert.deepEqual(t, { products: 3, packs: 6, total: 1350, unpriced: 1 });
});
