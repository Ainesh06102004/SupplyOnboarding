// ============================================================================
// Round two: everything else that could make consensus say yes when it should
// not, and everything that could make it say no for ever.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { consensusOf, canonical, CONSENSUS, LABEL_PARTS } from "@/lib/engine/consensus.js";

const allergens = (statement, may = null) => ({ allergen_statement: statement, may_contain_statement: may });

test("ATTACK: unnamed readers cannot be assumed independent", () => {
  // `by` is how a caller proves its readers are different. If it is supplied and
  // yields nothing, KOI cannot tell one model asked twice from two models asked
  // once — and the safe reading of "cannot tell" is "do not count it twice".
  const twice = consensusOf(
    [{ v: "dairy" }, { v: "dairy" }],
    { of: (r) => r.v, by: () => null },
  );
  assert.equal(twice.agreed, false, "two anonymous answers are one unverified opinion");

  // Naming one of them is still not two readers.
  const half = consensusOf(
    [{ by: "gpt-a", v: "dairy" }, { v: "dairy" }],
    { of: (r) => r.v, by: (r) => r.by ?? null },
  );
  assert.equal(half.agreed, false);
});

test("ATTACK: one reader cannot be counted as a crowd by renaming itself", () => {
  // Nothing can stop a caller inventing ids, but the protocol must at least not
  // help: identical ids collapse, and that is the guarantee it can give.
  const out = consensusOf(
    [{ by: "a", v: "x" }, { by: "a", v: "x" }, { by: "a", v: "x" }, { by: "b", v: "y" }, { by: "c", v: "y" }],
    { of: (r) => r.v, by: (r) => r.by },
  );
  assert.equal(out.answer, "y");
  assert.equal(out.agreement, 2);
});

test("ATTACK: a reader that contradicts itself has no vote at all", () => {
  const out = consensusOf(
    [{ by: "flaky", v: "dairy" }, { by: "flaky", v: "gluten" }, { by: "steady", v: "dairy" }],
    { of: (r) => r.v, by: (r) => r.by },
  );
  assert.equal(out.agreed, false, "one steady reader is not consensus");
  assert.equal(out.agreement, 1);

  const none = consensusOf(
    [{ by: "a", v: "1" }, { by: "a", v: "2" }],
    { of: (r) => r.v, by: (r) => r.by },
  );
  assert.equal(none.agreed, false);
  assert.match(none.why, /contradicted itself/);
});

test("ATTACK: lookalike words are not agreement", () => {
  // Cyrillic а in "dаiry". Two readers seeing different scripts have not agreed.
  assert.notEqual(canonical("dairy"), canonical("dаiry"));
  assert.notEqual(canonical("peanut"), canonical("pea nut"));
  assert.notEqual(canonical(["dairy"]), canonical(["dairy", "dairy"]), "a repeat is a different list");
});

test("ATTACK: an allergen list cannot agree by losing an entry", () => {
  const of = LABEL_PARTS.allergens;
  assert.equal(consensusOf([allergens("Contains Milk and Wheat"), allergens("Contains Milk")], { of }).agreed, false);
  assert.equal(consensusOf([allergens("Contains Milk"), allergens("Contains Milk", "May contain Wheat")], { of }).agreed, false);
  // The order the pack names them in is not disagreement; which ones are.
  assert.equal(consensusOf([allergens("Contains Milk and Wheat"), allergens("Contains Wheat and Milk")], { of }).agreed, true);
});

test("ATTACK: consensus of one is refused outright", () => {
  // need: 1 is not a weaker bar, it is no bar — one reader deciding alone is
  // exactly what this protocol replaced.
  assert.throws(() => consensusOf(["a"], { need: 1 }), /at least two/i);
  assert.throws(() => consensusOf(["a", "a"], { need: 0 }), /at least two/i);
  assert.throws(() => consensusOf(["a"], { need: -3 }), /at least two/i);
  assert.equal(CONSENSUS.need >= 2, true);
});

test("numbers: the panel's figures, however each reader wrote them", () => {
  assert.equal(canonical(0), canonical("0"), "zero is not nothing");
  assert.notEqual(canonical(0), canonical(null));
  assert.notEqual(canonical(0), canonical(""));
  assert.equal(canonical(1e3), canonical("1000"));
  assert.equal(canonical(-0), canonical(0));
  assert.equal(canonical(9.10), canonical("9.1"));
  // Not numbers, so not compared as numbers.
  assert.equal(canonical("15g"), "15g");
  assert.notEqual(canonical("15g"), canonical(15));
  assert.equal(canonical(NaN), "NaN");
  assert.equal(canonical(Infinity), "Infinity");
  assert.notEqual(canonical(NaN), canonical(0));
});

test("truncation cannot quietly make two different labels agree", () => {
  // Past the depth cap two structures compare equal. Real label data is three
  // levels deep, so this is a guard against a crash rather than a live path —
  // but it must be true only past the cap, and the test pins where.
  const deep = (n, leaf) => {
    let out = leaf;
    for (let i = 0; i < n; i += 1) out = { d: out };
    return out;
  };
  assert.notEqual(canonical(deep(10, "a")), canonical(deep(10, "b")), "well inside the cap, still compared");
  assert.notEqual(canonical(deep(40, "a")), canonical(deep(40, "b")));
  assert.equal(canonical(deep(60, "a")), canonical(deep(60, "b")), "past it, and this is the known limit");
});

test("a big crowd stays fast and stays right", () => {
  const readings = Array.from({ length: 5000 }, (_, i) => ({ by: `r-${i}`, v: i % 3 === 0 ? "yes" : "no" }));
  const started = Date.now();
  const out = consensusOf(readings, { of: (r) => r.v, by: (r) => r.by });
  assert.ok(Date.now() - started < 1000, "5,000 readers in under a second");
  assert.equal(out.answer, "no");
  assert.equal(out.agreement, readings.filter((r) => r.v === "no").length);
});

test("the report always adds up", () => {
  const out = consensusOf(
    [{ by: "a", v: "x" }, { by: "b", v: "x" }, { by: "c", v: "y" }],
    { of: (r) => r.v, by: (r) => r.by },
  );
  assert.equal(out.readings, 3);
  assert.equal(out.agreement, 2);
  assert.equal(out.agreed, true);
  assert.match(out.why, /2 of 3/);
});
