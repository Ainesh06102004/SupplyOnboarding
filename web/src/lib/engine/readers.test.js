// Who reads a label, and where the question goes (providers/readers.js).

import test from "node:test";
import assert from "node:assert/strict";

import { EngineConfigError, chatBody, readerFor, replyJson } from "@/lib/engine/providers/readers.js";
import { costOf } from "@/lib/engine/readPlan.js";

const env = { OPENAI_API_KEY: "sk-test", OPENROUTER_API_KEY: "or-test", KOI_LOCAL_VISION_URL: "http://127.0.0.1:11434/v1/" };

test("a name with no provider is an OpenAI model, as every setting before this was", () => {
  const r = readerFor("gpt-5.4-mini", env);
  assert.equal(r.provider, "openai");
  assert.equal(r.model, "gpt-5.4-mini");
  assert.equal(r.name, "gpt-5.4-mini");
  assert.equal(r.endpoint, "https://api.openai.com/v1/chat/completions");
  // OpenAI's fine-tuned ids carry colons of their own, and "ft" is no provider.
  assert.equal(readerFor("ft:gpt-4.1-mini:koi::abc123", env).model, "ft:gpt-4.1-mini:koi::abc123");
  assert.equal(readerFor("openai:gpt-4.1-mini", env).name, "gpt-4.1-mini");
});

test("an open reader keeps its provider in its name, and only the first colon splits", () => {
  const hosted = readerFor("openrouter:qwen/qwen3-vl-30b-a3b-instruct", env);
  assert.equal(hosted.provider, "openrouter");
  assert.equal(hosted.model, "qwen/qwen3-vl-30b-a3b-instruct");
  assert.equal(hosted.name, "openrouter:qwen/qwen3-vl-30b-a3b-instruct");
  assert.equal(hosted.key, "or-test");

  // An Ollama tag has a colon in it.
  const local = readerFor("local:qwen3-vl:4b", env);
  assert.equal(local.model, "qwen3-vl:4b");
  assert.equal(local.endpoint, "http://127.0.0.1:11434/v1/chat/completions", "a trailing slash is not doubled");
  assert.equal(local.key, null);

  // The same weights, hosted and on KOI's GPU, are two readers, not one.
  assert.notEqual(readerFor("openrouter:qwen/qwen3-vl-8b-instruct", env).name, readerFor("local:qwen/qwen3-vl-8b-instruct", env).name);
});

test("a missing setting fails loudly and names the setting", () => {
  assert.throws(() => readerFor("openrouter:qwen/qwen3-vl-30b-a3b-instruct", { OPENAI_API_KEY: "sk" }), (e) =>
    e instanceof EngineConfigError && /OPENROUTER_API_KEY/.test(e.message));
  assert.throws(() => readerFor("gpt-5.4-mini", {}), /OPENAI_API_KEY/);
  // No guessed localhost: a label goes nowhere until someone says where.
  assert.throws(() => readerFor("local:qwen3-vl:4b", {}), /KOI_LOCAL_VISION_URL/);
  assert.throws(() => readerFor("", env), /KOI_LABEL_MODEL/);
  assert.throws(() => readerFor("openrouter:", env), /no model/);
});

const question = { system: "S", prompt: "P", imageBase64: "AAAA", mimeType: "image/jpeg", detail: "high", schemaName: "label_reading", schema: { type: "object" } };

test("each provider is asked in its own dialect, with the same question", () => {
  const openai = chatBody(readerFor("gpt-5.4-mini", env), question);
  assert.equal(openai.store, false);
  assert.equal(openai.messages[1].content[1].image_url.detail, "high");

  const hosted = chatBody(readerFor("openrouter:google/gemma-4-26b-a4b-it", env), question);
  assert.equal(hosted.model, "google/gemma-4-26b-a4b-it", "the provider prefix is KOI's, not the host's");
  assert.equal(hosted.store, undefined);
  assert.equal(hosted.messages[1].content[1].image_url.detail, undefined);
  // A host that would ignore the schema may not answer, and none may keep the request.
  assert.deepEqual(hosted.provider, { require_parameters: true, data_collection: "deny" });
  assert.deepEqual(hosted.usage, { include: true });

  const local = chatBody(readerFor("local:qwen3-vl:4b", env), question);
  assert.equal(local.provider, undefined);
  assert.equal(local.store, undefined);

  for (const body of [openai, hosted, local]) {
    assert.equal(body.messages[0].content, "S");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.name, "label_reading");
  }
});

test("a correct reading in a code fence or behind its thinking is still a reading", () => {
  assert.deepEqual(replyJson('{"a":1}'), { a: 1 });
  assert.deepEqual(replyJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(replyJson("<think>the panel is per 100 g</think>\n{\"a\":1}"), { a: 1 });
  assert.throws(() => replyJson("The label says protein 20 g."));
});

test("a reply that says what it cost is believed over the price list", () => {
  assert.equal(costOf({ prompt_tokens: 3000, completion_tokens: 420, cost: 0.00071 }, "openrouter:qwen/qwen3-vl-30b-a3b-instruct"), 0.00071);
  assert.equal(costOf({ prompt_tokens: 3000, completion_tokens: 420, cost: 0 }, "local:qwen3-vl:4b"), 0, "free is a price");
  // Without a charge, an unknown open model has no price rather than a guessed one.
  assert.equal(costOf({ prompt_tokens: 3000, completion_tokens: 420 }, "openrouter:qwen/qwen3-vl-30b-a3b-instruct"), null);
  // OpenAI is unchanged.
  assert.ok(Math.abs(costOf({ prompt_tokens: 3000, completion_tokens: 420 }, "gpt-5.4-mini-2026-03-17") - 0.00414) < 1e-9);
});
