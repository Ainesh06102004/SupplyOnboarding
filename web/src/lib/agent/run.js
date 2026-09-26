// ============================================================================
// KOI's agent, run. SERVER ONLY.
//
// One message → steps (router.js: the model reads the intent, grounded to the
// message; the rules when there is no usable model reading) → each step done by
// the tool that does it, in order, streaming as it goes. The planner's own
// progress events pass straight through, so the page shows the work of every
// step, not only its result.
//
// Tools that belong to the page — the cart, which step is on screen, and the
// explanation of the plan it is showing — come back as actions for the page
// to do. Nothing here writes a number, a product or a claim.
// ============================================================================

import "server-only";

import { getServerSupabase } from "@/lib/supabase/server";
import { planForHousehold, planFollowUp, planWithout } from "@/lib/planner/plan";
import { productsNamed, MAX_FOLLOWUP_CHARS } from "@/lib/planner/followup";
import { stepLabel } from "./router";
import { stepsFor } from "./steps";
import { planArgs } from "./planArgs";

/**
 * @param {object} input
 * @param {string} input.householdId
 * @param {string|null} input.planId the plan on screen, if any
 * @param {string} input.text the shopper's message
 * @param {object} input.defaults { days, budget, memberIds, thisWeek, zoneId, availability } from the page
 * @param {(message: object) => void} input.emit
 */
export async function runAgent({ householdId, planId = null, text, defaults, emit }) {
  const db = await getServerSupabase();
  const { data: household, error } = await db
    .from("household")
    .select("id, household_member(id, label, relation)")
    .eq("id", householdId)
    .maybeSingle();
  if (error) throw error;
  if (!household) throw new Error("No such household for this shopper.");
  const members = household.household_member ?? [];

  let current = null; // the latest plan this run made, in full
  let basket = [];
  if (planId) {
    const { data: row } = await db.from("plan").select("id, achieved").eq("id", planId).maybeSingle();
    basket = (row?.achieved?.basket ?? []).map((l) => ({ skuId: String(l.skuId), name: l.name ?? "" }));
  }
  let currentPlanId = planId;

  const context = { hasPlan: Boolean(planId), people: members.map((m) => m.label), products: basket.map((b) => b.name).filter(Boolean) };
  emit({ type: "step", stage: "agent", status: "running" });
  const { steps, source } = await stepsFor(text, context);
  emit({ type: "agent", source, steps: steps.map((s) => ({ tool: s.tool, text: s.text, args: s.args, label: stepLabel(s) })) });

  const record = [];
  for (const [index, step] of steps.entries()) {
    const tool = (status, extra = {}) => emit({ type: "step", stage: "tool", index, tool: step.tool, label: stepLabel(step), status, ...extra });
    tool("running");
    try {
      if (step.tool === "plan") {
        const args = planArgs(step.text, members, defaults);
        current = await planForHousehold({ householdId, zoneId: defaults.zoneId ?? null, availability: defaults.availability ?? "allow_unknown", ...args, onStep: emit });
        currentPlanId = current.planId;
        basket = (current.report?.basket ?? []).map((l) => ({ skuId: String(l.skuId), name: l.name ?? "" }));
        emit({ type: "plan_result", index, kind: "plan", text: step.text, payload: current });
        tool("done");
      } else if (step.tool === "change") {
        if (!currentPlanId) { tool("skipped", { note: "there is no plan to change yet" }); continue; }
        const body = await planFollowUp({ planId: currentPlanId, text: step.text.slice(0, MAX_FOLLOWUP_CHARS), onStep: emit });
        if (body.changed) {
          current = body;
          currentPlanId = body.planId;
          basket = (body.report?.basket ?? []).map((l) => ({ skuId: String(l.skuId), name: l.name ?? "" }));
        }
        emit({ type: "plan_result", index, kind: "change", text: step.text, payload: body });
        tool(body.changed ? "done" : "skipped", body.changed ? {} : { note: (body.notApplied ?? []).join(" · ") || "nothing in that could be applied" });
      } else if (step.tool === "without") {
        const hit = currentPlanId ? productsNamed(step.args.product ?? step.text, basket)[0] : null;
        if (!hit) { tool("skipped", { note: `nothing in this plan is called "${step.args.product ?? step.text}"` }); continue; }
        const body = await planWithout({ planId: currentPlanId, skuId: hit.skuId });
        emit({ type: "without_result", index, skuId: hit.skuId, name: hit.name, payload: body });
        tool("done");
      } else {
        // The page's own tools: the cart, what's on screen, the explanation.
        emit({ type: "action", index, action: step.tool, args: step.args });
        tool("done");
      }
      record.push({ tool: step.tool, ok: true });
    } catch (err) {
      console.error("[plan/agent]", step.tool, err?.message ?? "failed");
      tool("failed", { note: "this step could not be done" });
      record.push({ tool: step.tool, ok: false });
    }
  }

  // What the run did, without the shopper's words (00069): tools, not text.
  await db.from("plan_run").insert({
    household_id: householdId,
    source,
    steps: record,
    plan_id: currentPlanId,
  }).then(({ error: logError }) => { if (logError) console.error("[plan/agent] log", logError.message); });

  emit({ type: "done", planId: currentPlanId, steps: steps.length, source });
}
