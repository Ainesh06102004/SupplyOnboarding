// Scoring one agent reading against its case. Pure.

/**
 * @param {object} kase from cases.js
 * @param {{ steps: object[], source: string }} reading from stepsFor
 * @returns {{ ok: boolean, why: string[] }}
 */
export function scoreReading(kase, reading) {
  const why = [];
  const steps = reading?.steps ?? [];
  const tools = steps.map((s) => s.tool);
  const e = kase.expect;
  if (reading?.source !== "model") why.push(`read by ${reading?.source ?? "nothing"}, not the model`);
  const allowed = e.toolsAny ?? [e.tools];
  if (!allowed.some((t) => JSON.stringify(t) === JSON.stringify(tools))) why.push(`tools ${JSON.stringify(tools)}, expected ${allowed.map((t) => JSON.stringify(t)).join(" or ")}`);
  (e.says ?? []).forEach((re, i) => {
    if (re && steps[i] && !re.test(steps[i].text)) why.push(`step ${i + 1} ("${steps[i].text}") should match ${re}`);
  });
  if (e.allSay && !steps.some((s) => e.allSay.test(s.text))) why.push(`no step mentions ${e.allSay}`);
  if (e.never && steps.some((s) => ["plan", "change", "without"].includes(s.tool) && e.never.test(s.text))) {
    why.push(`a step says something the shopper didn't: ${steps.map((s) => s.text).join(" | ")}`);
  }
  if (e.product && !steps.some((s) => s.tool === "without" && e.product.test(s.args?.product ?? ""))) why.push(`without should be about ${e.product}`);
  if (e.step && !steps.some((s) => s.tool === "show" && s.args?.step === e.step)) why.push(`should show ${e.step}`);
  return { ok: why.length === 0, why };
}
