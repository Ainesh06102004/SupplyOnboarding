// Print the agent router's raw model reading and its grounded steps for a message.
//   node --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/probeAgentRouter.mjs "message" [--plan]
import { callStructured } from "@/lib/ai/providers/openai";
import { groundSteps, routerContext, routeMessage, ROUTER_INSTRUCTIONS, ROUTER_JSON_SCHEMA, ROUTER_SCHEMA_NAME } from "@/lib/agent/router";

const text = process.argv[2] ?? "";
const context = {
  hasPlan: process.argv.includes("--plan"),
  people: ["Me", "Wife", "Son"],
  products: ["Gorakhpur Kalanamak Rice", "Split Moong Dal", "Kabuli Chana", "Dates", "Natural Peanut Butter Crunch"],
};
const { output } = await callStructured({
  modelEnv: "KOI_OPENAI_INTERPRETER_MODEL",
  instructions: `${ROUTER_INSTRUCTIONS}\n${routerContext(context)}`,
  text,
  schemaName: ROUTER_SCHEMA_NAME,
  schema: ROUTER_JSON_SCHEMA,
  maxOutputTokens: 700,
});
console.log("model:", JSON.stringify(output.steps));
console.log("grounded:", JSON.stringify(groundSteps(output, text, context)));
console.log("rules:", JSON.stringify(routeMessage(text, { hasPlan: context.hasPlan }).map((s) => [s.tool, s.text])));
