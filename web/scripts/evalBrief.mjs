// ============================================================================
// Evaluate household drafting: rules alone, and with the model (Phase 4.2)
//
//   node --experimental-websocket --conditions=react-server \
//     --import ./scripts/testAlias.mjs --env-file=.env.local scripts/evalBrief.mjs
//
// Each case lists what the draft must say. The model draft is scored after
// groundModelDraft, which is what the shopper sees.
// ============================================================================

import { readBrief, draftFrom } from "@/lib/planner/brief";
import { draftHousehold } from "@/lib/planner/briefModel";

const people = (d) => d.members.map((m) => `${m.label}[${m.age_band || "?"}|${m.diet_type || "?"}|${m.target_protein_g || "-"}g|${m.target_kcal || "-"}kcal|${m.avoidKeys.join("+") || "-"}]`).join(" ");

const CASES = [
  ["We're four, two adults and two kids, 120 g protein each for the adults",
    (d) => d.members.length === 4 && d.members.filter((m) => m.target_protein_g === 120).length === 2],
  ["Me, my husband and our daughter who is 6. We're all vegetarian. I need 70g protein, he needs 90g. Budget 3500 for the week",
    (d) => d.members.length === 3 && d.members.every((m) => m.diet_type === "vegetarian") && d.budget === 3500 && d.days === 7 && d.members.some((m) => m.age_band === "child_4_6")],
  ["Jain family of 5 - grandparents, us two and a 14 year old son. No peanuts for the son",
    (d) => d.members.length === 5 && d.members.every((m) => m.diet_type === "jain" && m.avoidKeys.includes("peanuts"))],
  ["just me, 2200 calories and 110 g protein a day, non veg, 10 days",
    (d) => d.members.length === 1 && d.members[0].target_kcal === 2200 && d.members[0].target_protein_g === 110 && d.members[0].diet_type === "non_vegetarian" && d.days === 10],
  ["3 adults, eggetarian, one of them is diabetic, around 1800 kcal each",
    (d) => d.members.length === 3 && d.members.every((m) => m.target_kcal === 1800 && m.diet_type === "eggetarian") && d.unresolved.some((w) => /diabet/.test(w))],
  ["hum do hamare do, sab veg, bacchon ko nuts se allergy hai",
    (d) => d.members.length === 4 && d.members.every((m) => m.avoidKeys.includes("tree_nuts") || m.avoidKeys.includes("peanuts"))],
];

let rules = 0;
let withModel = 0;
for (const [text, check] of CASES) {
  const local = draftFrom(readBrief(text));
  const started = Date.now();
  const model = await draftHousehold(text);
  const ms = Date.now() - started;
  rules += Boolean(check(local));
  withModel += Boolean(check(model));
  console.log(`\n${check(local) ? "✓" : "✗"} rules  ${people(local)} days=${local.days} budget=${local.budget}`);
  console.log(`${check(model) ? "✓" : "✗"} ${model.source.padEnd(6)} ${people(model)} days=${model.days} budget=${model.budget} (${ms} ms)`);
  console.log(`  "${text}"`);
}
console.log(`\nrules ${rules}/${CASES.length}, with model ${withModel}/${CASES.length}`);
