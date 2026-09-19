// ============================================================================
// Does the reader still understand the things people actually say?
//
//   node --conditions=react-server --import ./scripts/testAlias.mjs \
//        scripts/evalFollowUps.mjs [--model]
//
// Runs every phrasing in lib/planner/eval/followUpCorpus.js through the reader
// and reports what each one did. Without --model it is the rules alone, pure
// and offline. With --model, and KOI_AI_INTERPRETER=openai set, it asks the
// model too and reports the difference the model made — which is the only
// honest way to answer "did that prompt change help?".
//
// Exits non-zero on any failure, so it can gate a change to the reader.
// ============================================================================

import { readFollowUp, applyFollowUp } from "@/lib/planner/followup.js";
import { FOLLOW_UP_CORPUS, CORPUS_SHOP, CORPUS_MEMBERS, CORPUS_ABSENT } from "@/lib/planner/eval/followUpCorpus.js";

const withModel = process.argv.includes("--model");

const everyone = [...CORPUS_MEMBERS, ...CORPUS_ABSENT];
const plan = (starts) => ({
  members: everyone.filter((m) => (starts ? starts.includes(m.id) : CORPUS_MEMBERS.some((c) => c.id === m.id)))
    .map((m) => ({ ...m, targets: { ...m.targets } })),
  days: 7,
  budget: 4000,
  excludedSkus: [],
  includedSkus: [],
  cost: 2560,
  // Everyone this household shops for, including whoever is sitting this week out.
  roster: everyone.map((m) => ({ ...m, targets: { ...m.targets } })),
});

/** Every way one case can be wrong, in the words a reader of the report needs. */
function check(c, change) {
  const wrong = [];
  const applied = change.applied.join(" | ");
  for (const sku of c.excludes ?? []) {
    if (!change.excludedSkus.map(String).includes(sku)) wrong.push(`did not leave out ${sku}`);
  }
  for (const sku of c.includes ?? []) {
    if (!change.includedSkus.map(String).includes(sku)) wrong.push(`did not ask for ${sku}`);
  }
  if (c.includesAny && !c.includesAny.some((sku) => change.includedSkus.map(String).includes(sku))) {
    wrong.push(`asked for none of ${c.includesAny.join(", ")}`);
  }
  for (const line of c.applied ?? []) {
    if (!change.applied.some((a) => a.includes(line))) wrong.push(`never said "${line}"`);
  }
  for (const word of c.absent ?? []) {
    if (applied.includes(word)) wrong.push(`said "${word}" and should not have`);
  }
  if (c.members && change.members.map((m) => String(m.id)).join(",") !== c.members.join(",")) {
    wrong.push(`left ${change.members.map((m) => m.label).join(", ")} in the plan`);
  }
  if (c.days !== undefined && change.days !== c.days) wrong.push(`planned ${change.days} days, not ${c.days}`);
  if (c.budget !== undefined && change.budget !== c.budget) wrong.push(`budget ${change.budget}, not ${c.budget}`);
  if (!wrong.length && !change.applied.length) wrong.push("applied nothing at all");
  return wrong;
}

async function readingFor(said) {
  if (!withModel) return readFollowUp(said);
  const { readFollowUpWithModel } = await import("@/lib/planner/followUpModel.js");
  return readFollowUpWithModel(said, {
    members: CORPUS_MEMBERS.map((m) => ({ id: m.id, label: m.label })),
    absent: CORPUS_ABSENT.map((m) => ({ id: m.id, label: m.label })),
    categories: [...new Set(CORPUS_SHOP.map((p) => p.categoryKey))].map((key) => ({ key, label: key.split(".").pop().replace(/_/g, " ") })),
  });
}

console.log(`Reading ${FOLLOW_UP_CORPUS.length} things people actually typed, ${withModel ? "rules and model" : "rules only"}…\n`);

let failed = 0;
for (const c of FOLLOW_UP_CORPUS) {
  let wrong;
  try {
    wrong = check(c, applyFollowUp(plan(c.starts), await readingFor(c.said), CORPUS_SHOP));
  } catch (err) {
    wrong = [`threw: ${err?.message ?? err}`];
  }
  if (wrong.length) failed += 1;
  console.log(`${wrong.length ? "FAIL" : "ok  "}  ${c.said}`);
  if (wrong.length) {
    console.log(`        pins: ${c.pins}`);
    for (const line of wrong) console.log(`        ${line}`);
  }
}

const passed = FOLLOW_UP_CORPUS.length - failed;
console.log(`\n${passed}/${FOLLOW_UP_CORPUS.length} understood.`);
if (failed) {
  console.log("A phrasing that used to work and now does not is a regression, not a flake.");
  process.exit(1);
}
