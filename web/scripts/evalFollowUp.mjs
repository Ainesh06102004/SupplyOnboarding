// ============================================================================
// Evaluate follow-up reading: rules alone, and with the model (Phase 4.3)
//
//   node --experimental-websocket --conditions=react-server \
//     --import ./scripts/testAlias.mjs --env-file=.env.local scripts/evalFollowUp.mjs
//
// Each message is applied to the same four-person plan and small catalogue,
// and the checks read what would actually change.
// ============================================================================

import { readFollowUp, applyFollowUp } from "@/lib/planner/followup";
import { readFollowUpWithModel } from "@/lib/planner/followUpModel";

const member = (label, protein) => ({ id: label, label, targets: { protein, kcal: 2000 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] });
const plan = { members: [member("Adult 1", 120), member("Adult 2", 120), member("Kid 1", 30), member("Kid 2", 30)], days: 7, budget: 4000, excludedSkus: [], cost: 3976 };
const catalogue = [
  { skuId: "oats", name: "Oats" }, { skuId: "muesli", name: "Super Muesli 0% Added Sugar" },
  { skuId: "basmati", name: "Rozana Super Basmati Rice" }, { skuId: "brown", name: "Brown Rice" },
  { skuId: "cookies", name: "The Healthy Butter Cookies" }, { skuId: "pb", name: "Natural Peanut Butter Crunch" },
];
const kid = (r, n) => r.members.find((m) => m.label === `Kid ${n}`);

const CASES = [
  ["cheaper", (r) => r.budget === 3570],
  ["no paneer on Tuesday", (r) => r.excludedSkus.length === 0 && r.members.every((m) => !m.avoidFlags.length) && r.notApplied.length > 0],
  ["swap the oats", (r) => r.excludedSkus.join() === "oats"],
  ["can we do this for under 3000", (r) => r.budget === 3000],
  ["the kids are allergic to peanuts", (r) => kid(r, 1).avoidFlags.includes("peanut") && kid(r, 2).avoidFlags.includes("peanut")],
  ["give Kid 1 45g protein a day", (r) => kid(r, 1).targets.protein === 45 && kid(r, 2).targets.protein === 30],
  ["make it for 10 days and drop the cookies", (r) => r.days === 10 && r.excludedSkus.join() === "cookies"],
  ["money is not an issue", (r) => r.budget === null],
  ["too much rice", (r) => r.budget === 4000 && r.members.every((m) => m.targets.protein >= 30)],
  ["thoda sasta karo", (r) => r.budget === 3570],
];

let rules = 0;
let withModel = 0;
for (const [text, check] of CASES) {
  const local = applyFollowUp(plan, readFollowUp(text), catalogue);
  const model = applyFollowUp(plan, await readFollowUpWithModel(text), catalogue);
  rules += Boolean(check(local));
  withModel += Boolean(check(model));
  console.log(`${check(local) ? "✓" : "✗"} ${check(model) ? "✓" : "✗"}  "${text}"  → model: ${[...model.applied, ...model.notApplied].join(" | ")}`);
}
console.log(`\nrules ${rules}/${CASES.length}, with model ${withModel}/${CASES.length}`);
