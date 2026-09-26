// Probe Agent Mode's model: which tool does it pick first for a message, given a state digest?
// No database; nothing is run. From web/:
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/probeAgentLoop.mjs "message" [--saved "Me,Wife"] [--plan]
import { callTools } from "@/lib/ai/providers/openai";
import { AGENT_INSTRUCTIONS, TOOL_SCHEMAS } from "@/lib/agent/tools/schemas";
import { digestFor } from "@/lib/agent/digest";

const args = process.argv.slice(2);
const text = args.find((a) => !a.startsWith("--")) ?? "plan this week's groceries for me, my wife and our two kids, we're vegetarian, the younger one is allergic to peanuts, budget 3500, and put it in my cart";
const savedArg = args.includes("--saved") ? args[args.indexOf("--saved") + 1] : "";
const saved = savedArg ? savedArg.split(",").map((label) => ({ label })) : [];
const digest = digestFor({ saved, draft: null, planId: args.includes("--plan") ? "p" : null, basket: args.includes("--plan") ? ["Atta", "Toor Dal", "Dates"] : [], page: { route: "home" } });

const started = Date.now();
const out = await callTools({
  modelEnv: "KOI_OPENAI_AGENT_MODEL",
  effortEnv: "KOI_OPENAI_AGENT_EFFORT",
  instructions: AGENT_INSTRUCTIONS,
  input: [{ role: "user", content: text }, { role: "developer", content: digest }],
  tools: TOOL_SCHEMAS,
});
console.log(JSON.stringify({ model: out.model, ms: Date.now() - started, tool: out.call?.name, args: out.call?.args, carried: out.carry.map((i) => i.type), usage: out.usage }, null, 2));
