// Run with `npm test`.
import test from "node:test";
import assert from "node:assert/strict";

import { buildToolsRequest, readToolCall, strictObject } from "@/lib/ai/providers/openaiFormat.js";

const tool = { name: "look", description: "Look at the household.", parameters: strictObject({ what: { type: "string", enum: ["household", "plan"] } }) };

test("a tools request keeps nothing at OpenAI and asks for one strict call per turn", () => {
  const body = buildToolsRequest({ model: "m", instructions: "i", input: [{ role: "user", content: "hi" }], tools: [tool], reasoningEffort: "low" });
  assert.equal(body.store, false);
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.deepEqual(body.tools[0], { type: "function", name: "look", description: "Look at the household.", parameters: tool.parameters, strict: true });
});

test("readToolCall returns the call, its parsed arguments, and the items to carry forward", () => {
  const reasoning = { type: "reasoning", id: "rs_1", encrypted_content: "xyz", summary: [] };
  const call = { type: "function_call", id: "fc_1", call_id: "call_1", name: "look", arguments: "{\"what\":\"plan\"}" };
  const read = readToolCall({ status: "completed", output: [reasoning, call], usage: { input_tokens: 10 } });
  assert.equal(read.call.callId, "call_1");
  assert.equal(read.call.name, "look");
  assert.deepEqual(read.call.args, { what: "plan" });
  assert.deepEqual(read.carry, [reasoning, call]);
  assert.equal(read.text, "");
});

test("readToolCall throws on anything that is not a complete answer", () => {
  assert.throws(() => readToolCall({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }), /incomplete: max_output_tokens/);
  assert.throws(() => readToolCall({ error: { code: "rate_limit" } }), /rate_limit/);
  assert.throws(() => readToolCall({ status: "completed", output: [{ type: "function_call", call_id: "c", name: "look", arguments: "{oops" }] }), /not JSON/);
  assert.throws(() => readToolCall({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }), /refused/);
  assert.equal(readToolCall({ status: "completed", output: [] }).call, null);
});
