// Agreement instead of authority: what several readers agree on, and when they
// have not agreed at all.

import test from "node:test";
import assert from "node:assert/strict";

import { consensusOf, canonical, worthReadingAgain, LABEL_PARTS, CONSENSUS } from "@/lib/engine/consensus.js";

test("two readers who agree settle it; one reader never does", () => {
  assert.deepEqual(consensusOf(["dairy", "dairy"]), {
    agreed: true, answer: "dairy", agreement: 2, readings: 2, why: "2 of 2 readings agree",
  });
  const alone = consensusOf(["dairy"]);
  assert.equal(alone.agreed, false);
  assert.match(alone.why, /only 1 of 1 readings agree/);
  assert.equal(consensusOf([]).why, "nothing was read");
});

test("a tie is not a majority, however many readers there are", () => {
  // Two against two is the disagreement it started as, not a decision.
  const split = consensusOf(["a", "a", "b", "b"]);
  assert.equal(split.agreed, false);
  assert.match(split.why, /no majority/);

  // Three to one is.
  const most = consensusOf(["a", "a", "a", "b"]);
  assert.equal(most.agreed, true);
  assert.equal(most.answer, "a");
  assert.equal(most.agreement, 3);
});

test("an answer is compared by what it says, not how it was written", () => {
  assert.equal(canonical(["gluten", "dairy"]), canonical(["dairy", "gluten"]), "order is not disagreement");
  assert.equal(canonical(" Dairy "), canonical("dairy"), "nor is spacing or case");
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.notEqual(canonical(["dairy"]), canonical(["dairy", "gluten"]));
  assert.equal(canonical(null), "null");
});

test("the live tie that started this: two readings of one pack, broken by a third", () => {
  // Ragi Hot Chocolate Milk Mix. The pack says "Contains Milk Solids. May
  // Contains Wheat & Nuts", so the second reading was right and the first had
  // promoted a "may contain" into an ingredient.
  // The wording each reader returned, verbatim from the live run.
  const readingA = { allergen_statement: "Contains Milk Solids and Wheat", may_contain_statement: "May Contain Nuts." };
  const readingB = { allergen_statement: "Allergens Information: Contains Milk Solid", may_contain_statement: "May Contain Wheat & Nuts." };
  // KOI's own reading of the photograph: "Contains Milk Solids. May Contains
  // Wheat & Nuts" — the same facts as B, punctuated differently.
  const readingC = { allergen_statement: "Contains Milk Solids.", may_contain_statement: "May Contains Wheat & Nuts" };

  const two = consensusOf([readingA, readingB], { of: LABEL_PARTS.allergens });
  assert.equal(two.agreed, false, "as it stood, this went to a human");
  assert.equal(worthReadingAgain([readingA, readingB], { of: LABEL_PARTS.allergens }), true);

  const three = consensusOf([readingA, readingB, readingC], { of: LABEL_PARTS.allergens });
  assert.equal(three.agreed, true);
  assert.deepEqual(three.answer.contains, ["dairy"]);
  assert.deepEqual([...three.answer.may_contain].sort(), ["gluten", "tree_nut"]);
  assert.equal(three.agreement, 2);
  assert.equal(worthReadingAgain([readingA, readingB, readingC], { of: LABEL_PARTS.allergens }), false, "settled, so stop reading");
});

test("each part of a label is agreed separately", () => {
  // One reader saw the panel and misread the list underneath it. The nutrition
  // is settled; holding it hostage to the ingredients is how a queue fills up.
  const a = { nutrition: { protein_g: 9.1 }, ingredients_text: "Finger Millet, Brown Sugar" };
  const b = { nutrition: { protein_g: 9.1 }, ingredients_text: "Sprouted Ragi, Jaggery" };
  assert.equal(consensusOf([a, b], { of: LABEL_PARTS.nutrition }).agreed, true);
  assert.equal(consensusOf([a, b], { of: LABEL_PARTS.ingredients }).agreed, false);
});

test("KOI stops asking once it has learnt what it is going to", () => {
  const differ = ["a", "b", "c", "d"];
  assert.equal(worthReadingAgain(differ), false, "four readings that all differ is itself the answer");
  assert.equal(CONSENSUS.mostReadings, 4);
  assert.equal(worthReadingAgain(["a", "a"]), false, "and so is agreement");
});
