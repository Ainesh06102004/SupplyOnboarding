import { test } from "node:test";
import assert from "node:assert/strict";

import { AGENT_CASES } from "./cases";
import { scoreReading } from "./score";
import { AGENT_TOOLS } from "../router";

test("every case is well formed: unique id, known tools", () => {
  const ids = new Set();
  for (const c of AGENT_CASES) {
    assert.ok(!ids.has(c.id), c.id);
    ids.add(c.id);
    assert.ok(c.expect.tools.every((t) => AGENT_TOOLS.includes(t)), c.id);
  }
  assert.ok(AGENT_CASES.length >= 20);
});

test("scoring passes a right reading and says what is wrong with a wrong one", () => {
  const kase = AGENT_CASES.find((c) => c.id === "cheaper");
  assert.equal(scoreReading(kase, { source: "model", steps: [{ tool: "change", text: "make it cheaper", args: {} }] }).ok, true);
  const bad = scoreReading(kase, { source: "model", steps: [{ tool: "change", text: "budget 2000", args: {} }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.why.some((w) => /didn't/.test(w)), "an invented number is caught");
  assert.ok(scoreReading(kase, { source: "rules", steps: [{ tool: "change", text: "make it cheaper" }] }).why.some((w) => /rules/.test(w)));
});
