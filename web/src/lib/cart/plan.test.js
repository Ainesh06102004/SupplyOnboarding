import { test } from "node:test";
import assert from "node:assert/strict";

import { packsToBuy, basketSnapshot, basketSignature, diffBaskets } from "./plan";

const basket = [
  { skuId: 11, name: "Chivda Mix", packs: 5, cost: 750 },
  { skuId: 12, name: "Oats", packs: 1, cost: 199 },
  { skuId: 13, name: "Refined Sunflower Oil", packs: 1, cost: 145 },
];

test("what's at home is not bought", () => {
  assert.deepEqual(packsToBuy(basket, { atHome: ["13"] }), [{ skuId: "11", packs: 5 }, { skuId: "12", packs: 1 }]);
  assert.deepEqual(packsToBuy(basket), [{ skuId: "11", packs: 5 }, { skuId: "12", packs: 1 }, { skuId: "13", packs: 1 }]);
});

test("the snapshot keeps SKUs and packs only, and ignores order", () => {
  assert.deepEqual(basketSnapshot([basket[1], basket[0]]), [{ skuId: "11", packs: 5 }, { skuId: "12", packs: 1 }]);
  assert.equal(basketSignature([basket[1], basket[0]]), basketSignature([basket[0], basket[1]]));
  assert.notEqual(basketSignature(basket), basketSignature([basket[0]]));
});

test("a changed plan reads as added, removed and changed lines", () => {
  const after = [{ skuId: 11, packs: 4 }, { skuId: 12, packs: 1 }, { skuId: 20, packs: 2 }];
  const d = diffBaskets(basket, after);
  assert.deepEqual(d.added, [{ skuId: "20", packs: 2 }]);
  assert.deepEqual(d.removed, [{ skuId: "13", packs: 1 }]);
  assert.deepEqual(d.changed, [{ skuId: "11", from: 5, to: 4 }]);
  assert.equal(d.any, true);
  assert.equal(diffBaskets(basket, [...basket].reverse()).any, false);
});
