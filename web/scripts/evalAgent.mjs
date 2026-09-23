// ============================================================================
// Evaluate how KOI's agent reads messages (lib/agent/eval/cases.js).
//
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/evalAgent.mjs [--only id,id]
//
// Every case goes through the same path the Plan page uses (lib/agent/steps.js:
// the model, then groundSteps). Prints each miss with why, the pass rate and
// the model; exits 1 below AGENT_EVAL_PASS. Needs KOI_AI_INTERPRETER=openai.
// ============================================================================

import { stepsFor } from "@/lib/agent/steps";
import { AGENT_CASES, AGENT_EVAL_PASS, AGENT_EVAL_VERSION, EVAL_CONTEXT } from "@/lib/agent/eval/cases";
import { scoreReading } from "@/lib/agent/eval/score";

if (process.env.KOI_AI_INTERPRETER !== "openai") {
  console.error("KOI_AI_INTERPRETER is not 'openai': there is no model reading to evaluate.");
  process.exit(1);
}

const only = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(",")) : null;
const cases = AGENT_CASES.filter((c) => !only || only.has(c.id));
const started = Date.now();
const results = [];
// A few at a time: the model's latency, not the order, dominates.
for (let i = 0; i < cases.length; i += 4) {
  const batch = cases.slice(i, i + 4);
  results.push(...await Promise.all(batch.map(async (c) => {
    const t0 = Date.now();
    const reading = await stepsFor(c.text, { ...EVAL_CONTEXT, hasPlan: c.hasPlan });
    return { c, reading, score: scoreReading(c, reading), ms: Date.now() - t0 };
  })));
}

let passed = 0;
for (const { c, reading, score, ms } of results) {
  if (score.ok) passed += 1;
  const steps = reading.steps.map((s) => `${s.tool}${s.args?.step ? `:${s.args.step}` : ""}${s.args?.product ? `(${s.args.product})` : ""} "${s.text}"`).join(" → ");
  console.log(`${score.ok ? "✓" : "✗"} ${c.id.padEnd(16)} ${String(ms).padStart(5)} ms  ${steps || "(no steps)"}`);
  for (const w of score.why) console.log(`      ${w}`);
  if (!score.ok && reading.source === "rules" && reading.raw) console.log(`      model said: ${JSON.stringify(reading.raw.steps)}`);
}
const rate = passed / Math.max(1, results.length);
console.log(`\n${AGENT_EVAL_VERSION} · ${process.env.KOI_OPENAI_INTERPRETER_MODEL} · ${passed}/${results.length} (${Math.round(rate * 100)}%) · bar ${Math.round(AGENT_EVAL_PASS * 100)}% · ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(rate >= AGENT_EVAL_PASS ? 0 : 1);
