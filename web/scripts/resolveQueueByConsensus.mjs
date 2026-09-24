// ============================================================================
// Work the review queue by agreement (consensus.js), not by authority
//
//   node --experimental-websocket --conditions=react-server \
//        --import ./scripts/testAlias.mjs --env-file=.env.local \
//        scripts/resolveQueueByConsensus.mjs [--apply]
//
// Without --apply it says what it would do and changes nothing.
//
// The pipeline already read every one of these labels twice and queued them
// because the two readings differed. This adds a THIRD reader — KOI's agent,
// which opened each photograph and transcribed it — and publishes only what two
// of the three agree about, as machine_read with the agreement count. Where no
// two agree, the item stays for a person and says why.
//
// The transcriptions below are that third reading. They are quoted from the
// photographs in tmp/queue and are deliberately literal: where a panel could
// not be read with confidence (the Laddubar photo is double-exposed), the
// reader ABSTAINS rather than guessing, and an abstention is not a vote.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { consensusOf, LABEL_PARTS, CONSENSUS } from "@/lib/engine/consensus.js";
import { publish } from "@/lib/engine/review.js";

const AGENT = "claude-opus-5 (KOI agent)";
const apply = process.argv.includes("--apply");
// Writes an already-published label again. Needed when what was published is
// wrong rather than merely absent — a published mistake does not correct itself
// by being left alone.
const republish = process.argv.includes("--republish");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const engine = db.schema("engine");

// KOI's own reading of each photograph. `undefined` is an abstention.
const MY_READING = {
  "Premium Pampore Saffron": {
    product_name: "Pampore Saffron",
    ingredients_text: "Saffron",
    allergen_statement: null,
    may_contain_statement: null,
    nutrition: {
      measurement_basis: "per_100g",
      energy_kcal: 378.05, carbs_g: 70.83, protein_g: 11.06, total_fat_g: 5.61,
      fibre_g: 3.2, sodium_mg: 5, sugars_g: null,
    },
  },
  "Gorakhpur Kalanamak Rice": {
    // An Equinox Labs test report, not a printed panel: figures per 100 g.
    product_name: "Kalanamak Rice",
    ingredients_text: null,
    allergen_statement: null,
    may_contain_statement: null,
    nutrition: {
      measurement_basis: "per_100g",
      energy_kcal: 371.27, carbs_g: 57.65, protein_g: 16.73, total_fat_g: 3.75,
      fibre_g: 1.2, sugars_g: null, sodium_mg: null,
    },
  },
  "Ragi Hot Chocolate Milk Mix": {
    product_name: "Ragi Hot Chocolate Milk Mix",
    ingredients_text: "Finger Millet(37%), Brown Sugar, Milk Solids & Cocoa Solids(16%)",
    allergen_statement: "Contains Milk Solids.",
    may_contain_statement: "May Contains Wheat & Nuts",
    nutrition: undefined, // the panel is on the other photograph
  },
  "Madras Mixture": {
    product_name: "Madras Mixture",
    ingredients_text: "Gram Flour, Edible Vegetable Oil (Rice Bran), Rice Flour, Puffed Rice Flakes, Peanuts, Cashews, Bengal Gram, Curry Leaves, Edible Common Salt, Spices and Condiments (Chilli Powder & Asafoetida)",
    allergen_statement: "ALLERGEN INFORMATION: CONTAINS WHEAT AND NUTS.",
    may_contain_statement: "MAY CONTAIN MILK.",
    nutrition: {
      measurement_basis: "per_100g",
      energy_kcal: 560, protein_g: 10.4, carbs_g: 50, sugars_g: 0,
      fibre_g: 4, total_fat_g: 35, saturated_fat_g: 8.6, trans_fat_g: 0, sodium_mg: 453.7,
    },
  },
  "Chocolate Biscuits": {
    product_name: "UN-JUNKED CHOCOLATE BISCUITS",
    ingredients_text: "Oat Flour, Whole Wheat Flour, White Butter, Fructooligosaccharides, Coco Powder, Corn flour, Jowar flour, Jaggery Powder, Rice flour, maltodextrin, Skimmed Milk Powder, Ragi flour, Bajra flour, Edible Salt, Uddi flour, Rising Agent (INS503(ii), INS500(ii), INS 450(i), INS575), Antioxidant E322",
    allergen_statement: "ALLERGEN DECLARATION: This product contains Oats, Wheat, Milk and Soy.",
    may_contain_statement: "Manufactured in a facility that processes Peanuts and Treenuts (Cashews and Almonds).",
    nutrition: {
      measurement_basis: "per_serving",
      serving_size: "15g",
      energy_kcal: 79.5, total_fat_g: 4.4, saturated_fat_g: 3.0, trans_fat_g: 0.0,
      cholesterol_mg: 5.3, sodium_mg: 57.0, carbs_g: 8.6, fibre_g: 0.3,
      sugars_g: 4.2, added_sugar_g: 1.4, protein_g: 1.4,
    },
  },
  "Dryfruit Instant Energy Laddubar": {
    product_name: "Dryfruit Instant Energy Laddubar",
    ingredients_text: "Almonds, Pistachios, Cashews, Walnuts, Pumpkin, Sesame, Muskmelon seeds, Dates 64%, Jaggery, Wholegrain Flour, Good Fat (Cow Ghee)",
    allergen_statement: null,
    may_contain_statement: null,
    // The photograph is double-exposed and the figures cannot be read with
    // confidence. Abstaining is the honest vote.
    nutrition: undefined,
  },
  "Healthy Snack Combo - Pack of 6": {
    // Six different snacks, each with its own panel. There is no single
    // ingredient list or nutrition panel for this product, so KOI's reader has
    // nothing to agree with — this is a multipack, not a misfiled photo.
    product_name: undefined,
    ingredients_text: undefined,
    allergen_statement: undefined,
    may_contain_statement: undefined,
    nutrition: undefined,
  },
};

// Accepted items come along, not only pending ones. An item is accepted the
// moment agreement settles it, but the label publishes only once every part it
// needs is settled — so a product whose last part was settled by an earlier run
// (or whose publish failed after the items were marked) would otherwise never
// be looked at again. Publishing is what this script is for; leaving a settled
// label unpublished because nothing about it changed today is the wrong memory.
const { data: rows, error } = await engine
  .from("review_queue")
  .select("id, output_id, sku_id, field_group, proposed, status, extraction_outputs!inner(extracted, second_read, model, second_model)")
  .in("status", ["pending", "accepted"]);
if (error) throw error;

// ...but a part is published once. The publish LOG is the wrong thing to ask:
// it records that an output published something, and an output that published
// its nutrition months ago would look finished forever while its ingredients
// sat settled and unwritten. What each published fact carries is the id of the
// output it came from, so that is the question — asked of the facts.
const [{ data: haveList }, { data: havePanel }] = await Promise.all([
  db.schema("food").from("sku_ingredients").select("source_ref"),
  db.from("sku_nutrition").select("source_ref"),
]);
const listPublished = new Set((haveList ?? []).map((r) => r.source_ref));
const panelPublished = new Set((havePanel ?? []).map((r) => r.source_ref));

const names = new Map();
const { data: skus } = await db.from("skus").select("id, products(product_name)").in("id", [...new Set(rows.map((r) => r.sku_id))]);
for (const s of skus ?? []) names.set(s.id, s.products?.product_name ?? s.id);

const byOutput = new Map();
for (const row of rows) {
  if (!byOutput.has(row.output_id)) byOutput.set(row.output_id, []);
  byOutput.get(row.output_id).push(row);
}

let published = 0;
let left = 0;
for (const [outputId, items] of byOutput) {
  const product = names.get(items[0].sku_id);
  const out = items[0].extraction_outputs;
  const mine = MY_READING[product];
  const readings = [
    { by: out.model, reading: out.extracted },
    { by: out.second_model ?? `${out.model}-again`, reading: out.second_read },
    ...(mine ? [{ by: AGENT, reading: mine }] : []),
  ].filter((r) => r.reading);

  console.log(`\n${product}`);
  const verdicts = {};
  for (const [part, of] of Object.entries(LABEL_PARTS)) {
    const result = consensusOf(readings, { need: CONSENSUS.need, of: (r) => of(r.reading), by: (r) => r.by });
    verdicts[part] = result;
    console.log(`  ${part.padEnd(12)} ${result.agreed ? "AGREED" : "open  "}  ${result.why}`);
  }

  let settledHere = 0;
  for (const item of items) {
    const v = verdicts[item.field_group];
    const already = item.status !== "pending";
    if (!already && !v?.agreed) { left += 1; continue; }
    if (!v?.agreed) { settledHere += 1; continue; }
    if (!already) published += 1;
    settledHere += 1;
    if (!apply) continue;

    // Allergens publish as the flags the readers AGREED on, not as the flags
    // one reader's proposal happened to carry. The proposals in this queue were
    // written by a proposer that filed a declared "CONTAINS WHEAT" as a trace,
    // and accepting them unchanged would publish that mistake under the word
    // "agreed". For every other part, agreement means the readings normalize to
    // the same answer, so what is already proposed IS that answer.
    const correction = item.field_group === "allergens" ? v.answer : null;
    const { error: e } = await engine.from("review_queue")
      .update({
        status: correction ? "corrected" : "accepted",
        decision: correction,
        reviewed_by: null,
        decided_by_agent: AGENT,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (e) throw e;
  }

  // Ingredients and allergens publish together, so both have to be settled
  // before there is anything to write.
  const listToWrite = verdicts.ingredients?.agreed && verdicts.allergens?.agreed && (republish || !listPublished.has(outputId));
  const panelToWrite = verdicts.nutrition?.agreed && (republish || !panelPublished.has(outputId));
  if (apply && settledHere && (listToWrite || panelToWrite)) {
    // A label is only as settled as its least settled part, so that is the
    // agreement it carries.
    const agreed = Object.values(verdicts).filter((v) => v.agreed).map((v) => v.agreement);
    const agreement = agreed.length ? Math.min(...agreed) : null;
    try {
      const out = await publish(outputId, null, { agent: AGENT, agreement });
      console.log(`  -> published ${JSON.stringify(out.published)}${out.stillOpen?.length ? `; still open: ${out.stillOpen.join(" ")}` : ""}`);
    } catch (err) {
      console.log(`  -> nothing published: ${err?.message ?? err}`);
    }
  }
}

console.log(`\n${published} item(s) settled by agreement, ${left} still open.`);
if (!apply) console.log("Nothing was changed. Run again with --apply.");
