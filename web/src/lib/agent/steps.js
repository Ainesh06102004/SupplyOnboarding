// ============================================================================
// A message → the agent's steps. SERVER ONLY (it calls the model).
//
// The model's reading when there is one that holds (router.js groundSteps),
// else the rules'. Kept apart from run.js, which touches the database, so the
// evaluation (scripts/evalAgent.mjs) can read messages without a session.
// ============================================================================

import "server-only";

import { callStructured } from "@/lib/ai/providers/openai";
import { readFollowUp } from "@/lib/planner/followup";
import { routeMessage, groundSteps, withChangeFloor, withPeopleKept, pageStepsLast, inShoppersWords, routerContext, ROUTER_INSTRUCTIONS, ROUTER_JSON_SCHEMA, ROUTER_SCHEMA_NAME } from "./router";

const productWordsIn = (text) => {
  const r = readFollowUp(text);
  return r.leaveOut.length + r.include.length + r.swaps.length > 0;
};


/**
 * @param {string} text the shopper's message
 * @param {{ hasPlan: boolean, people: string[], products: string[] }} context
 * @returns {Promise<{ steps: object[], source: "model"|"rules", raw?: object }>}
 */
export async function stepsFor(text, context) {
  let raw = null;
  if (process.env.KOI_AI_INTERPRETER === "openai") {
    try {
      const { output } = await callStructured({
        modelEnv: "KOI_OPENAI_INTERPRETER_MODEL",
        instructions: `${ROUTER_INSTRUCTIONS}\n${routerContext(context)}`,
        text,
        schemaName: ROUTER_SCHEMA_NAME,
        schema: ROUTER_JSON_SCHEMA,
        maxOutputTokens: 700,
      });
      raw = output;
      const grounded = groundSteps(output, text, context);
      if (grounded) {
        const steps = inShoppersWords(pageStepsLast(withPeopleKept(withChangeFloor(grounded, text, context), text)), text, context);
        return { steps, source: "model", raw: output };
      }
    } catch (err) {
      console.error("[plan/agent] router", err?.message ?? "failed");
    }
  }
  // raw: what the model said when its reading didn't hold (for the evaluation).
  return { steps: routeMessage(text, { hasPlan: context.hasPlan, productWords: productWordsIn }), source: "rules", raw };
}
