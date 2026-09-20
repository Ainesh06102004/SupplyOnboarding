// ============================================================================
// Trying to break the consensus protocol
//
// This decides whether KOI states an allergen is absent, so the interesting
// question is not "does it work" but "what can make it say yes when it should
// not". Everything below is an attempt at that, plus fuzzing for the
// properties that must hold whatever it is given.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { consensusOf, canonical, worthReadingAgain, LABEL_PARTS, CONSENSUS } from "@/lib/engine/consensus.js";

// A tiny deterministic generator, so a failure can be reproduced exactly.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── The properties that must hold, whatever it is handed ────────────────────

test("fuzz: the answer is always one a reader actually gave", () => {
  const random = rng(20260920);
  for (let i = 0; i < 2000; i += 1) {
    const readings = Array.from({ length: 1 + Math.floor(random() * 6) }, () => ["a", "b", "c"][Math.floor(random() * 3)]);
    const out = consensusOf(readings);
    if (out.agreed) {
      assert.ok(readings.includes(out.answer), `invented ${out.answer} from ${readings}`);
      assert.equal(out.agreement, readings.filter((r) => r === out.answer).length);
    }
  }
});

test("fuzz: agreement never exceeds the number of readings, and never lies", () => {
  const random = rng(7);
  for (let i = 0; i < 2000; i += 1) {
    const readings = Array.from({ length: Math.floor(random() * 7) }, () => Math.floor(random() * 4));
    const out = consensusOf(readings);
    assert.equal(out.readings, readings.length);
    assert.ok(out.agreement <= readings.length);
    assert.ok(out.agreement >= 0);
    if (out.agreed) assert.ok(out.agreement >= CONSENSUS.need, "agreed below the bar");
  }
});

test("fuzz: the order readers answered in cannot change the outcome", () => {
  const random = rng(99);
  for (let i = 0; i < 1500; i += 1) {
    const readings = Array.from({ length: 2 + Math.floor(random() * 5) }, () => ["x", "y", "z"][Math.floor(random() * 3)]);
    const shuffled = [...readings].sort(() => random() - 0.5);
    const a = consensusOf(readings);
    const b = consensusOf(shuffled);
    assert.equal(a.agreed, b.agreed, `${readings} vs ${shuffled}`);
    assert.equal(canonical(a.answer), canonical(b.answer));
    assert.equal(a.agreement, b.agreement);
  }
});

test("fuzz: a strict majority always wins, a tie never does", () => {
  const random = rng(4242);
  for (let i = 0; i < 1500; i += 1) {
    const a = 1 + Math.floor(random() * 4);
    const b = 1 + Math.floor(random() * 4);
    const readings = [...Array(a).fill("A"), ...Array(b).fill("B")];
    const out = consensusOf(readings);
    if (a === b) assert.equal(out.agreed, false, `${a} vs ${b} is a tie`);
    else {
      const top = a > b ? "A" : "B";
      const n = Math.max(a, b);
      assert.equal(out.agreed, n >= CONSENSUS.need);
      if (out.agreed) assert.equal(out.answer, top);
    }
  }
});

// ── Trying to manufacture a yes ─────────────────────────────────────────────

test("ATTACK: the same reading twice must not agree with itself", () => {
  // The protocol is given values, not readers, so nothing in the numbers can
  // tell one model asked twice from two models asked once. A caller that
  // retries a failed call and pushes both results would manufacture consensus
  // out of a single opinion. `by` is how a reader identifies itself.
  const reading = { allergens: { contains: ["dairy"], may_contain: [] } };

  const faked = consensusOf([
    { by: "gpt-a", value: reading },
    { by: "gpt-a", value: reading },
  ], { of: (r) => r.value, by: (r) => r.by });
  assert.equal(faked.agreed, false, "one reader is one opinion, however many times it is asked");
  assert.match(faked.why, /same reader/i);

  const real = consensusOf([
    { by: "gpt-a", value: reading },
    { by: "gpt-b", value: reading },
  ], { of: (r) => r.value, by: (r) => r.by });
  assert.equal(real.agreed, true);
  assert.equal(real.agreement, 2);
});

test("ATTACK: a reader cannot outvote the others by answering repeatedly", () => {
  const readings = [
    { by: "loud", value: "wrong" },
    { by: "loud", value: "wrong" },
    { by: "loud", value: "wrong" },
    { by: "quiet-1", value: "right" },
    { by: "quiet-2", value: "right" },
  ];
  const out = consensusOf(readings, { of: (r) => r.value, by: (r) => r.by });
  assert.equal(out.agreed, true);
  assert.equal(out.answer, "right", "three shouts from one reader are one opinion");
  assert.equal(out.agreement, 2);
});

test("ATTACK: numbers that are the same number must agree", () => {
  // Two readers of the same panel, one writing 5 and one 5.0, agree about the
  // world. Treating them as different answers would send a settled fact to a
  // human, and worse, a 0 against a "0" would look like disagreement forever.
  assert.equal(canonical(5), canonical(5.0));
  assert.equal(canonical(5), canonical("5"));
  assert.equal(canonical(5.0), canonical("5.0"));
  assert.equal(canonical(0.1 + 0.2), canonical(0.3), "and floating point is not disagreement");
  assert.notEqual(canonical(5), canonical(50));
  assert.equal(consensusOf([{ protein_g: 9.1 }, { protein_g: "9.10" }]).agreed, true);
});

test("ATTACK: nothing is agreed out of missing data", () => {
  assert.equal(consensusOf([null, null]).agreed, true, "two readers both finding nothing IS agreement");
  assert.equal(consensusOf([undefined, undefined]).agreed, false, "but a reader that did not answer is not a reader");
  assert.equal(consensusOf([null, undefined]).agreed, false);
  assert.equal(consensusOf([{}, {}]).agreed, true);
  assert.equal(consensusOf([[], []]).agreed, true);
  assert.notEqual(canonical([]), canonical(null), "no allergens is not the same as never looked");
  assert.notEqual(canonical(""), canonical(null));
});

test("ATTACK: a cycle in a reading cannot hang the protocol", () => {
  const loop = { contains: ["dairy"] };
  loop.self = loop;
  assert.doesNotThrow(() => canonical(loop));
  assert.doesNotThrow(() => consensusOf([loop, loop]));
});

test("ATTACK: depth and size cannot hang it either", () => {
  let deep = { end: true };
  for (let i = 0; i < 5000; i += 1) deep = { deep };
  assert.doesNotThrow(() => canonical(deep));
  const wide = Array.from({ length: 20000 }, (_, i) => `ingredient ${i}`);
  assert.doesNotThrow(() => canonical(wide));
});

// ── The label's own parts ───────────────────────────────────────────────────

test("allergen agreement is about both lists, not just what is in it", () => {
  const contains = { allergen_statement: "Contains Milk", may_contain_statement: "May contain Wheat" };
  const mayContain = { allergen_statement: "Contains Milk", may_contain_statement: null };
  // Same "contains", different "may contain" — NOT agreement. Promoting a
  // trace warning into an ingredient, or losing one, both matter to somebody.
  assert.equal(consensusOf([contains, mayContain], { of: LABEL_PARTS.allergens }).agreed, false);
  assert.equal(consensusOf([contains, contains], { of: LABEL_PARTS.allergens }).agreed, true);
});

test("looked and found none is a vote; did not look is not", () => {
  // null: the reader read the pack and there was no statement on it. That is a
  // fact about the pack and two readers can agree on it.
  const lookedAndFoundNone = { allergen_statement: null, may_contain_statement: null, ingredients_text: null };
  assert.deepEqual(LABEL_PARTS.allergens(lookedAndFoundNone), { contains: [], may_contain: [] });
  assert.equal(consensusOf([lookedAndFoundNone, lookedAndFoundNone], { of: LABEL_PARTS.allergens }).agreed, true);

  // undefined: the reader did not answer for this part at all. That is an
  // ABSTENTION, and it must never become a vote for "no allergens" — otherwise
  // a blurred photograph would end up certifying a product allergen-free.
  assert.equal(LABEL_PARTS.allergens({}), undefined);
  assert.equal(LABEL_PARTS.ingredients({}), undefined);
  assert.equal(LABEL_PARTS.nutrition({}), undefined);
  assert.equal(LABEL_PARTS.identity({}), undefined);
  const both = consensusOf([{}, {}], { of: LABEL_PARTS.allergens });
  assert.equal(both.agreed, false);
  assert.match(both.why, /abstained/);

  // One abstention beside two real readings does not block them, and is counted.
  const settled = consensusOf([lookedAndFoundNone, lookedAndFoundNone, {}], { of: LABEL_PARTS.allergens });
  assert.equal(settled.agreed, true);
  assert.equal(settled.agreement, 2);
  assert.match(settled.why, /1 abstained/);
});

test("ingredient text agrees across spacing and case, not across words", () => {
  const a = { ingredients_text: "Finger Millet (37%),  Brown Sugar" };
  const b = { ingredients_text: "finger millet (37%), brown sugar" };
  const c = { ingredients_text: "Finger Millet (37%), Jaggery" };
  assert.equal(consensusOf([a, b], { of: LABEL_PARTS.ingredients }).agreed, true);
  assert.equal(consensusOf([a, c], { of: LABEL_PARTS.ingredients }).agreed, false);
});

// ── Asking again ────────────────────────────────────────────────────────────

test("it asks again only while asking could still settle it", () => {
  assert.equal(worthReadingAgain([]), true);
  assert.equal(worthReadingAgain(["a"]), true);
  assert.equal(worthReadingAgain(["a", "b"]), true, "a disagreement is worth one more");
  assert.equal(worthReadingAgain(["a", "a"]), false, "agreement is not");
  assert.equal(worthReadingAgain(["a", "b", "c", "d"]), false, "and four ways of disagreeing is an answer");
  // A higher bar keeps it reading for longer, but never past the ceiling.
  assert.equal(worthReadingAgain(["a", "a"], { need: 3 }), true);
  assert.equal(worthReadingAgain(["a", "a", "a", "a"], { need: 5 }), false);
});

test("a stricter bar can be demanded, and is honoured", () => {
  assert.equal(consensusOf(["a", "a"], { need: 3 }).agreed, false);
  assert.equal(consensusOf(["a", "a", "a"], { need: 3 }).agreed, true);
  assert.equal(consensusOf(["a", "a", "a"], { need: 3 }).agreement, 3);
});
