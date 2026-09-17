// ============================================================================
// KOI — tests for the model path of query interpretation (Phase 4.1)
// Run with `npm test`. No network: the provider call itself is server-only and
// measured by scripts/evalInterpreter.mjs.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { interpret, adoptRefinement, parseIntent } from "@/lib/ai/intent";
import { numbersIn, groundLimits } from "@/lib/ai/intent/merge";
import { INTENT_JSON_SCHEMA, INTENT_INSTRUCTIONS, intentFromModel } from "@/lib/ai/intent/modelSchema";
import { AVOID_KEYS, DIET_KEYS, GOAL_KEYS } from "@/lib/ai/intent/schema";
import { buildStructuredRequest, readStructuredOutput } from "@/lib/ai/providers/openaiFormat";
import { THRESHOLDS } from "@/lib/recommendation/config";

const blankModelAnswer = () => ({
  profile: { goal: null, dietType: null, mealPrefs: [], foodsAvoid: [], foodsLove: [], budget: null },
  view: { sort: null, minScore: null, maxKcal: null, minProtein: null, maxSugar: null, maxPrice: null, proteinClaim: false, sugarClaim: false },
  text: "",
  unresolved: [],
});

test("the numbers a shopper wrote are read the way they wrote them", () => {
  assert.deepEqual([...numbersIn("under ₹1,500")], [1500]);
  assert.deepEqual([...numbersIn("anything under 2k")], [2000]);
  assert.deepEqual([...numbersIn("200kcal and 2 kg")], [200, 2]);
  assert.equal(numbersIn("healthy snacks").size, 0);
});

test("a limit the shopper did not write is dropped", () => {
  const model = { ...blankModelAnswer(), view: { ...blankModelAnswer().view, maxKcal: 150, maxSugar: 5 } };
  const grounded = groundLimits(model, "healthy snacks for kids");
  assert.equal(grounded.view.maxKcal, null, "150 kcal is the model's idea of healthy, not the shopper's");
  assert.equal(grounded.view.maxSugar, null);

  const stated = groundLimits({ ...model, view: { ...model.view, maxSugar: null } }, "snacks under 150 kcal");
  assert.equal(stated.view.maxKcal, 150);
});

test("KOI's own claim words keep their threshold, but only with their flag", () => {
  const claim = { ...blankModelAnswer(), view: { ...blankModelAnswer().view, minProtein: THRESHOLDS.proteinHigh, proteinClaim: true } };
  assert.equal(groundLimits(claim, "high protein snacks").view.minProtein, THRESHOLDS.proteinHigh);

  const unflagged = { ...claim, view: { ...claim.view, proteinClaim: false } };
  assert.equal(groundLimits(unflagged, "protein snacks").view.minProtein, null, "a bare 12 is a made-up number");
});

test("a refinement cannot bring in a number, and cannot let back in what was kept out", () => {
  const text = "no dairy snacks";
  const local = interpret(text);
  const hostile = intentFromModel({ ...blankModelAnswer(), view: { ...blankModelAnswer().view, maxPrice: 99 } });
  const merged = adoptRefinement(local, hostile, text);
  assert.equal(merged.view.maxPrice, null);
  for (const key of local.profile.foodsAvoid) assert.ok(merged.profile.foodsAvoid.includes(key));
});

test("the model's schema is strict and generated from KOI's own keys", () => {
  const strict = (node) => {
    if (node.type !== "object") return;
    assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
    assert.equal(node.additionalProperties, false);
    Object.values(node.properties).forEach(strict);
  };
  strict(INTENT_JSON_SCHEMA);
  assert.deepEqual(INTENT_JSON_SCHEMA.properties.profile.properties.foodsAvoid.items.enum, [...AVOID_KEYS]);
  assert.deepEqual(INTENT_JSON_SCHEMA.properties.profile.properties.dietType.enum, [...DIET_KEYS, null]);
  assert.deepEqual(INTENT_JSON_SCHEMA.properties.profile.properties.goal.enum, [...GOAL_KEYS, null]);
  // An answer in that shape is an intent KOI can validate.
  assert.equal(parseIntent(intentFromModel(blankModelAnswer())).ok, true);
  for (const key of AVOID_KEYS) assert.ok(INTENT_INSTRUCTIONS.includes(key), `instructions name ${key}`);
});

test("a request carries the sentence alone, asks OpenAI not to keep it, and demands the schema", () => {
  const body = buildStructuredRequest({ model: "m", instructions: "i", text: "no dairy", schemaName: "s", schema: { type: "object" } });
  assert.equal(body.input, "no dairy");
  assert.equal(body.store, false);
  assert.deepEqual(body.text.format, { type: "json_schema", name: "s", schema: { type: "object" }, strict: true });
  assert.equal("reasoning" in body, false);
  assert.deepEqual(buildStructuredRequest({ model: "m", instructions: "i", text: "x", schemaName: "s", schema: {}, reasoningEffort: "none" }).reasoning, { effort: "none" });
});

test("only a complete answer is read; anything else throws so the caller falls back", () => {
  const message = (content) => ({ status: "completed", output: [{ type: "message", content }] });
  assert.deepEqual(readStructuredOutput(message([{ type: "output_text", text: '{"a":1}' }])), { a: 1 });
  assert.throws(() => readStructuredOutput(message([{ type: "refusal", refusal: "no" }])), /refused/);
  assert.throws(() => readStructuredOutput({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }), /incomplete/);
  assert.throws(() => readStructuredOutput(message([{ type: "output_text", text: "not json" }])), /not JSON/);
  assert.throws(() => readStructuredOutput({ error: { code: "rate_limit_exceeded" } }), /rate_limit_exceeded/);
});
