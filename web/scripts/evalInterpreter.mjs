// ============================================================================
// Evaluate query interpretation: deterministic alone, and with a model folded in
//
//   node --experimental-websocket --conditions=react-server \
//     --import ./scripts/testAlias.mjs --env-file=.env.local scripts/evalInterpreter.mjs
//
// Needs OPENAI_API_KEY and KOI_OPENAI_INTERPRETER_MODEL. Each case is a
// sentence a shopper might type and the checks its reading must pass. The model
// path is scored AFTER adoptRefinement, because that is what a shopper sees.
// Two checks run on every case: no number the shopper did not write, and
// nothing the deterministic reading kept out is let back in.
//
// Plan §7.8: every change to the model or prompt is scored here first.
// ============================================================================

import { interpret, adoptRefinement } from "@/lib/ai/intent";
import { OpenAIAdapter } from "@/lib/ai/intent/adapters/openai";
import { numbersIn } from "@/lib/ai/intent/merge";
import { THRESHOLDS } from "@/lib/recommendation/config";

const has = (list, key) => (list ?? []).includes(key);
const anyWord = (list, word) => (list ?? []).some((w) => String(w).toLowerCase().includes(word));

const CASES = [
  ["high protein snacks under ₹200", (i) => i.view.minProtein === THRESHOLDS.proteinHigh && i.view.maxPrice === 200],
  ["no nuts, no dairy for breakfast", (i) => has(i.profile.foodsAvoid, "tree_nuts") && has(i.profile.foodsAvoid, "milk") && has(i.profile.mealPrefs, "breakfast")],
  ["jain friendly namkeen", (i) => i.profile.dietType === "jain"],
  ["diabetic friendly biscuits", (i) => anyWord(i.unresolved, "diabet") && i.view.maxSugar === null && !i.profile.goal],
  ["vegan protein under 150 kcal", (i) => i.profile.dietType === "vegan" && i.view.maxKcal === 150],
  ["gluten free atta", (i) => has(i.profile.foodsAvoid, "gluten")],
  ["no palm oil and no preservatives", (i) => has(i.profile.foodsAvoid, "palm_oil") && has(i.profile.foodsAvoid, "preservatives")],
  ["i am allergic to sesame", (i) => anyWord(i.unresolved, "sesame")],
  ["kuch meetha bina cheeni ke", (i) => has(i.profile.foodsAvoid, "refined_sugar")],
  ["post workout snack with at least 20g protein", (i) => i.view.minProtein === 20 && i.view.proteinClaim === false],
  ["best rated muesli", (i) => i.view.sort === "Highest KOI Score"],
  ["egg free cake, my son is allergic to eggs", (i) => has(i.profile.foodsAvoid, "eggs")],
  ["low sugar drinks", (i) => i.view.maxSugar === THRESHOLDS.sugarLow && i.view.sugarClaim === true],
  ["snacks for weight loss", (i) => i.profile.goal === "fatloss"],
  ["bp patient ke liye kam namak wala khana", (i) => i.view.maxPrice === null && i.view.maxKcal === null],
  ["anything under 2k", (i) => i.view.maxPrice === 2000],
  ["no onion no garlic", (i) => i.profile.dietType === "jain" || (anyWord(i.unresolved, "onion") && anyWord(i.unresolved, "garlic"))],
  ["healthy snacks for kids", (i) => i.view.maxKcal === null && i.view.maxSugar === null && i.view.maxPrice === null],
  ["caffeine free drinks without artificial sweeteners", (i) => has(i.profile.foodsAvoid, "caffeine") && has(i.profile.foodsAvoid, "artificial_sweeteners")],
  ["something like kombucha", (i) => i.view.maxPrice === null],
];

/** Numbers the shopper did not write, other than KOI's own claim thresholds. */
function inventedNumbers(intent, text) {
  const stated = numbersIn(text);
  const invented = [];
  for (const [field, value] of Object.entries(intent.view)) {
    if (typeof value !== "number") continue;
    if (field === "minProtein" && intent.view.proteinClaim && value === THRESHOLDS.proteinHigh) continue;
    if (field === "maxSugar" && intent.view.sugarClaim && value === THRESHOLDS.sugarLow) continue;
    if (!stated.has(value)) invented.push(`${field}=${value}`);
  }
  return invented;
}

/** Everything the local reading kept out that the final one lets in. */
function loosened(local, final) {
  const lost = (local.profile.foodsAvoid ?? []).filter((k) => !has(final.profile.foodsAvoid, k));
  if (local.profile.dietType && final.profile.dietType !== local.profile.dietType) lost.push(`diet ${local.profile.dietType}→${final.profile.dietType}`);
  return lost;
}

let localPass = 0;
let modelPass = 0;
let failures = 0;
const times = [];
for (const [text, check] of CASES) {
  const local = interpret(text);
  let final = local;
  let note = "";
  try {
    const started = Date.now();
    const raw = await OpenAIAdapter.interpret(text);
    times.push(Date.now() - started);
    final = adoptRefinement(local, raw, text);
  } catch (err) {
    failures++;
    note = ` [model failed: ${String(err?.message ?? err).slice(0, 80)}]`;
  }
  const l = Boolean(check(local));
  const m = Boolean(check(final));
  localPass += l;
  modelPass += m;
  const invented = inventedNumbers(final, text);
  const lost = loosened(local, final);
  const flags = [invented.length ? `INVENTED ${invented.join(",")}` : "", lost.length ? `LOOSENED ${lost.join(",")}` : ""].filter(Boolean).join(" ");
  console.log(`${l ? "✓" : "✗"} ${m ? "✓" : "✗"}  ${text}${flags ? `  !! ${flags}` : ""}${note}`);
}
times.sort((a, b) => a - b);
console.log(`\ndeterministic ${localPass}/${CASES.length}, with ${process.env.KOI_OPENAI_INTERPRETER_MODEL} ${modelPass}/${CASES.length}, model failures ${failures}`);
if (times.length) console.log(`model latency: median ${times[Math.floor(times.length / 2)]} ms, slowest ${times[times.length - 1]} ms`);
