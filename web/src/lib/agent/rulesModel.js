// ============================================================================
// Agent Mode without a model: KOI's rules pick the next tool. Pure.
//
// The same loop, the same tools, the same gates: only the choosing differs.
// The rules read the latest message with routeMessage (router.js, the Phase 3
// agent's fallback) and walk its steps, setting people up first when there is
// nobody saved. Used when KOI_AI_INTERPRETER is not openai, and when the model
// fails mid-run.
// ============================================================================

import { routeMessage, asksForChange } from "./router";
import { readFollowUp } from "@/lib/planner/followup";
import { norm } from "./evidence";

const productWords = (text) => {
  const r = readFollowUp(text);
  return r.leaveOut.length + r.include.length + r.swaps.length > 0;
};

const ASKS_ABOUT_THIS = /\b(ok|okay|safe|fine|good|suitable|allowed)\b.*\b(this|it)\b|\b(this|it)\b.*\b(ok|okay|safe|fine|good|suitable|allowed)\b|\b(can|could|should)\s+(my|the|i|we|he|she)\b.*\b(eat|have)\b.*\b(this|it)\b/;
const ADD_THIS = /\badd (this|it)\b.*\b(plan|week)\b/;
const FIND = /^\s*(?:please\s+)?(?:find|search|look for|looking for|show me some|any)\b/;

let seq = 0;
const call = (name, args) => ({ callId: `rules_${Date.now().toString(36)}_${(seq++).toString(36)}`, name, args: { say: null, ...args } });

/**
 * @param {{ memory: object, state: { savedCount: number, hasPlan: boolean, page: object } }} input
 * @returns {{ call: object, carry: Array, text: string, model: string }}
 */
export function rulesModel({ memory, state }) {
  const text = memory.said.at(-1) ?? "";
  const tried = new Map();
  for (const c of memory.turnCalls ?? []) tried.set(c.name, (tried.get(c.name) ?? 0) + 1);
  const ok = new Set((memory.turnCalls ?? []).filter((c) => c.ok).map((c) => c.name));
  const pick = (name, args) => ({ call: call(name, args), carry: [], text: "", model: "rules" });

  if (!state.savedCount && !memory.draft && !tried.has("draft_people")) return pick("draft_people", { quote: null });
  if (memory.draft && !tried.has("save_people")) return pick("save_people", { source: "draft", changes: [], this_is_me: null });
  if (!state.savedCount && !ok.has("save_people")) return pick("finish", { outcome: "cannot_do" });

  const lower = norm(text);
  const done = (outcome = "done") => pick("finish", { outcome });
  if (state.page?.productId && ADD_THIS.test(lower) && (state.hasPlan || ok.has("make_plan"))) {
    return tried.has("change_plan") ? done() : pick("change_plan", { quote: null, add_this_product: true });
  }
  if (state.page?.productId && ASKS_ABOUT_THIS.test(lower)) return tried.has("check_product") ? done() : pick("check_product", { product: "this", people: [] });
  if (FIND.test(lower)) return tried.has("explore") ? done() : pick("explore", { kind: "products", product: null });

  const steps = routeMessage(text, { hasPlan: state.hasPlan, productWords });
  for (const step of steps) {
    const name = { plan: "make_plan", change: "change_plan", without: "explore", cart: "add_to_cart", show: "show", explain: "look" }[step.tool];
    if (!name || tried.has(name)) continue;
    // The rules' last resort is "a change"; a message that asks for none ("hello") is not one.
    if (name === "change_plan" && !asksForChange(step.text || text, (state.saved ?? []).map((p) => p.label)) && !productWords(text)) continue;
    if (name === "make_plan") return pick(name, { quote: null, days: null, budget: null });
    if (name === "change_plan") return pick(name, { quote: step.text && step.text !== text ? step.text : null, add_this_product: false });
    if (name === "explore") return pick(name, { kind: "without", product: step.args?.product ?? null });
    if (name === "add_to_cart") return pick(name, {});
    if (name === "look") return pick(name, { what: "explanation" });
    if (name === "show") {
      const s = step.args?.step;
      return pick(name, s === "cart" ? { target: "cart", step: null, product: null } : { target: "plan_step", step: ["define", "you", "plan", "pantry", "shop", "track"].includes(s) ? s : "plan", product: null });
    }
  }
  return pick("finish", { outcome: (memory.turnCalls ?? []).some((c) => c.ok) ? "done" : "nothing_to_do" });
}
