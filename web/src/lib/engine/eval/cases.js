// ============================================================================
// KOI ENGINE — The evaluation set: labels whose contents are known
//
// Phase 1.7. The plan called for 50 hand-typed packs. Nobody at KOI types
// packs, so the truth comes from the other direction: each case states what a
// label says, ./render.js draws that label, and the reader is scored on what it
// would publish from the picture (../evaluation.js, scripts/runEval.mjs).
//
// The cases are chosen for how real Indian labels go wrong, not for how they
// usually look:
//   - allergens named only in the ingredients, under other names: groundnut
//     oil, milk solids, sodium caseinate, suji, malted barley, egg powder,
//     fish sauce, dried prawns;
//   - Hindi names, bracketed and bare ("Moongphali", "Kaju");
//   - shared-facility and "may contain" statements, which are warnings, not
//     contents;
//   - a statement that leaves out an allergen the list names, which the engine
//     must block rather than publish;
//   - tables in one or two columns, per serving only, with kJ, or with salt
//     printed instead of sodium;
//   - low contrast, dense small print, rotation, blur and JPEG loss.
//
// `truth` is what the food contains, in the storefront's allergen flags
// (lib/engine/checks.js#ALLERGEN_FLAGS). Figures need no truth of their own:
// render.js#printedTable is both what is drawn and what is compared.
//
// Bump EVAL_SET_VERSION whenever a case is added, removed or changed: a pass on
// an older set does not open the gate (lib/engine/evalGate.js).
//
// Pure.
// ============================================================================

export const EVAL_SET_VERSION = "eval-v1";

const FSSAI = "10019022000123";
const pack = (name, brand, net, over = {}) => ({ name, brand, net, fssai: FSSAI, veg: true, ...over });
const table = (per100, over = {}) => ({ columns: ["per_100g", "per_serving"], serving: "30 g", per100, ...over });

export const CASES = Object.freeze([
  {
    id: "peanut-statement",
    about: "Peanuts and ghee, both declared.",
    style: "clean",
    pack: pack("Masala Peanut Chikki Bites", "Testwind Foods", "100 g"),
    ingredients: "Roasted Peanuts (55%), Jaggery (35%), Liquid Glucose, Ghee, Cardamom",
    allergenStatement: "Contains Peanut and Milk.",
    nutrition: table({ protein_g: 14.2, carbs_g: 48.5, sugars_g: 36.1, fibre_g: 4.8, total_fat_g: 27.3, saturated_fat_g: 6.9, trans_fat_g: 0, sodium_mg: 38 }, { serving: "25 g" }),
    truth: { contains: ["peanut", "dairy"], mayContain: [] },
  },
  {
    id: "groundnut-oil-no-statement",
    about: "Peanut only as groundnut oil, and no allergen statement at all.",
    style: "clean",
    pack: pack("Poha Chivda", "Testwind Foods", "150 g"),
    ingredients: "Flattened Rice (Poha) (62%), Groundnut Oil, Roasted Chana Dal, Curry Leaves, Salt, Turmeric, Green Chilli, Sugar",
    nutrition: table({ protein_g: 9.4, carbs_g: 58.2, sugars_g: 3.1, fibre_g: 3.9, total_fat_g: 24.6, saturated_fat_g: 4.4, trans_fat_g: 0, sodium_mg: 612 }),
    truth: { contains: ["peanut"], mayContain: [] },
  },
  {
    id: "milk-solids-biscuits",
    about: "Maida and milk solids among raising agents and INS codes.",
    style: "clean",
    pack: pack("Butter Cookies", "Testwind Bakes", "200 g"),
    ingredients: "Refined Wheat Flour (Maida), Sugar, Butter (14%), Milk Solids, Invert Syrup, Raising Agents (INS 500(ii), INS 503(ii)), Iodised Salt, Emulsifier (INS 471)",
    allergenStatement: "Contains Wheat (Gluten) and Milk.",
    nutrition: table({ protein_g: 7.2, carbs_g: 66.4, sugars_g: 24.8, fibre_g: 1.6, total_fat_g: 22.1, saturated_fat_g: 12.3, trans_fat_g: 0.1, sodium_mg: 305 }),
    truth: { contains: ["gluten", "dairy"], mayContain: [] },
  },
  {
    id: "nested-soy-lecithin",
    about: "Milk and soy inside a bracketed compound ingredient, gluten only in the statement.",
    style: "clean",
    pack: pack("Chocolate Oat Bar", "Testwind Foods", "40 g"),
    ingredients: "Rolled Oats (32%), Chocolate Compound (Sugar, Hydrogenated Vegetable Fat, Cocoa Solids, Milk Solids, Emulsifier (Soya Lecithin (INS 322))), Honey, Brown Rice Crisps, Almonds (4%)",
    allergenStatement: "Contains Oats (Gluten), Milk, Soy and Almond.",
    nutrition: table({ protein_g: 8.1, carbs_g: 61.7, sugars_g: 27.4, fibre_g: 6.2, total_fat_g: 17.8, saturated_fat_g: 8.9, trans_fat_g: 0.2, sodium_mg: 96 }, { serving: "40 g" }),
    truth: { contains: ["gluten", "dairy", "soy", "tree_nut"], mayContain: [] },
  },
  {
    id: "facility-statement",
    about: "A shared-facility line naming peanut, milk and soy the food does not contain.",
    style: "clean",
    pack: pack("Daily Nut Mix", "Testwind Nuts", "150 g"),
    ingredients: "Roasted Almonds (45%), Roasted Cashews (35%), Black Raisins (20%)",
    allergenStatement: "Contains Almond and Cashew (tree nuts). Manufactured in a facility that also processes peanut, milk and soy products.",
    nutrition: table({ protein_g: 17.9, carbs_g: 33.6, sugars_g: 18.2, fibre_g: 8.1, total_fat_g: 41.5, saturated_fat_g: 5.9, trans_fat_g: 0, sodium_mg: 12 }),
    truth: { contains: ["tree_nut"], mayContain: ["peanut", "dairy", "soy"] },
  },
  {
    id: "may-contain-line",
    about: "Fox nuts that are not tree nuts, and a separate may-contain line.",
    style: "clean",
    pack: pack("Roasted Makhana Himalayan Salt", "Testwind Snacks", "70 g"),
    ingredients: "Makhana (Fox Nuts) (88%), Ghee (8%), Himalayan Pink Salt, Black Pepper",
    allergenStatement: "Contains Milk.",
    mayContain: "May contain traces of tree nuts and peanuts.",
    nutrition: table({ protein_g: 9.7, carbs_g: 64.3, sugars_g: 0.8, fibre_g: 11.9, total_fat_g: 10.2, saturated_fat_g: 6.1, trans_fat_g: 0, sodium_mg: 540 }, { serving: "20 g" }),
    truth: { contains: ["dairy"], mayContain: ["tree_nut", "peanut"] },
  },
  {
    id: "hindi-names-bracketed",
    about: "Hindi ingredient names with English in brackets.",
    style: "clean",
    pack: pack("Namkeen Mixture", "Testwind Foods", "200 g"),
    ingredients: "Besan (Gram Flour), Moongphali (Peanut), Kaju (Cashew), Til (Sesame Seeds), Refined Palmolein, Namak (Salt), Hing",
    allergenStatement: "Contains Peanut and Cashew.",
    nutrition: table({ protein_g: 16.4, carbs_g: 38.9, sugars_g: 2.7, fibre_g: 6.6, total_fat_g: 35.2, saturated_fat_g: 13.8, trans_fat_g: 0.1, sodium_mg: 710 }),
    truth: { contains: ["peanut", "tree_nut"], mayContain: [] },
  },
  {
    id: "hindi-only",
    about: "Hindi names only, no English and no statement.",
    style: "clean",
    pack: pack("Chivda Mix", "Testwind Foods", "150 g"),
    ingredients: "Poha, Moongphali, Kaju, Kishmish, Kadi Patta, Namak, Haldi",
    nutrition: table({ protein_g: 10.8, carbs_g: 55.1, sugars_g: 8.3, fibre_g: 4.2, total_fat_g: 25.9, saturated_fat_g: 4.7, trans_fat_g: 0, sodium_mg: 480 }, { columns: ["per_100g"] }),
    truth: { contains: ["peanut", "tree_nut"], mayContain: [] },
  },
  {
    id: "egg-powder",
    about: "Egg as egg powder in a cake.",
    style: "clean",
    pack: pack("Vanilla Sponge Cake", "Testwind Bakes", "250 g", { veg: false }),
    ingredients: "Refined Wheat Flour, Sugar, Egg Powder (8%), Vegetable Oil, Milk Powder, Leavening Agent (INS 500(ii)), Vanilla Flavour",
    allergenStatement: "Contains Wheat, Egg and Milk.",
    nutrition: table({ protein_g: 6.9, carbs_g: 57.3, sugars_g: 31.2, fibre_g: 1.1, total_fat_g: 18.4, saturated_fat_g: 4.1, trans_fat_g: 0.1, sodium_mg: 260 }, { serving: "50 g" }),
    truth: { contains: ["gluten", "egg", "dairy"], mayContain: [] },
  },
  {
    id: "shellfish",
    about: "Dried prawns, declared as crustaceans.",
    style: "clean",
    pack: pack("Dried Prawn Chutney", "Testwind Coastal", "100 g", { veg: false }),
    ingredients: "Dried Prawns (62%), Red Chilli, Garlic, Coconut Oil, Tamarind, Salt",
    allergenStatement: "Contains Crustaceans (Prawn).",
    nutrition: table({ protein_g: 38.5, carbs_g: 21.4, sugars_g: 3.9, fibre_g: 5.2, total_fat_g: 14.6, saturated_fat_g: 9.8, trans_fat_g: 0, sodium_mg: 1850 }, { serving: "10 g" }),
    truth: { contains: ["shellfish"], mayContain: [] },
  },
  {
    id: "fish-sauce",
    about: "Fish inside a seasoning sub-list, no statement.",
    style: "clean",
    pack: pack("Thai Style Noodle Kit", "Testwind Pantry", "180 g", { veg: false }),
    ingredients: "Rice Noodles (80%), Seasoning (Fish Sauce (Anchovy Extract, Salt), Sugar, Chilli, Lemongrass), Sunflower Oil",
    nutrition: table({ protein_g: 6.1, carbs_g: 76.8, sugars_g: 6.4, fibre_g: 1.9, total_fat_g: 3.2, saturated_fat_g: 0.4, trans_fat_g: 0, sodium_mg: 980 }, { serving: "90 g" }),
    truth: { contains: ["fish"], mayContain: [] },
  },
  {
    id: "no-allergens",
    about: "Millets only, with a statement saying so.",
    style: "clean",
    pack: pack("Millet Mix Atta", "Testwind Grains", "1 kg"),
    ingredients: "Jowar (35%), Ragi (30%), Bajra (25%), Rajgira (10%)",
    allergenStatement: "Contains no known allergens.",
    nutrition: table({ protein_g: 10.6, carbs_g: 71.2, sugars_g: 1.4, fibre_g: 9.8, total_fat_g: 3.9, saturated_fat_g: 0.7, trans_fat_g: 0, sodium_mg: 8 }, { columns: ["per_100g"] }),
    truth: { contains: [], mayContain: [] },
  },
  {
    id: "caseinate-creamer",
    about: "Milk as sodium caseinate in a coconut product.",
    style: "clean",
    pack: pack("Coconut Milk Powder", "Testwind Pantry", "300 g"),
    ingredients: "Coconut Milk Solids (60%), Maltodextrin, Sodium Caseinate, Anticaking Agent (INS 551)",
    allergenStatement: "Contains Milk (Caseinate).",
    nutrition: table({ protein_g: 7.8, carbs_g: 29.4, sugars_g: 6.9, fibre_g: 0, total_fat_g: 57.2, saturated_fat_g: 51.3, trans_fat_g: 0, sodium_mg: 190 }, { serving: "15 g" }),
    truth: { contains: ["dairy"], mayContain: [] },
  },
  {
    id: "per-serving-only",
    about: "A table printed per serving only.",
    style: "clean",
    pack: pack("Protein Peanut Butter", "Testwind Spreads", "340 g"),
    ingredients: "Roasted Peanuts (78%), Whey Protein Concentrate (15%), Jaggery Powder, Rock Salt",
    allergenStatement: "Contains Peanut and Milk.",
    nutrition: table({ protein_g: 30.2, carbs_g: 18.6, sugars_g: 7.9, fibre_g: 6.8, total_fat_g: 42.7, saturated_fat_g: 8.1, trans_fat_g: 0, sodium_mg: 290 }, { columns: ["per_serving"], serving: "32 g" }),
    truth: { contains: ["peanut", "dairy"], mayContain: [] },
  },
  {
    id: "kj-and-kcal",
    about: "Energy printed in kJ as well as kcal.",
    style: "clean",
    pack: pack("Multigrain Crackers", "Testwind Bakes", "120 g"),
    ingredients: "Whole Wheat Flour (48%), Oats, Ragi Flour, Rice Bran Oil, Flax Seeds, Salt, Raising Agent (INS 500(ii))",
    allergenStatement: "Contains Wheat (Gluten) and Oats.",
    nutrition: table({ protein_g: 11.4, carbs_g: 63.9, sugars_g: 2.2, fibre_g: 8.7, total_fat_g: 16.8, saturated_fat_g: 3.1, trans_fat_g: 0, sodium_mg: 520 }, { energyKj: true }),
    truth: { contains: ["gluten"], mayContain: [] },
  },
  {
    id: "salt-not-sodium",
    about: "Salt in grams instead of sodium in milligrams; sodium must not be invented.",
    style: "clean",
    pack: pack("Salted Cashews", "Testwind Nuts", "100 g"),
    ingredients: "Cashew Kernels (97%), Sunflower Oil, Salt",
    allergenStatement: "Contains Cashew (tree nut).",
    nutrition: table({ protein_g: 18.4, carbs_g: 27.9, sugars_g: 5.6, fibre_g: 3.3, total_fat_g: 46.1, saturated_fat_g: 8.2, trans_fat_g: 0, sodium_mg: 400 }, { columns: ["per_100g"], salt: true }),
    truth: { contains: ["tree_nut"], mayContain: [] },
  },
  {
    id: "low-contrast",
    about: "Grey print on a beige pack.",
    style: "low_contrast",
    pack: pack("Peanut Jaggery Laddoo", "Testwind Sweets", "250 g"),
    ingredients: "Peanuts (48%), Jaggery (40%), Desi Ghee (10%), Cardamom Powder",
    allergenStatement: "Contains Peanut and Milk.",
    nutrition: table({ protein_g: 13.1, carbs_g: 49.8, sugars_g: 39.5, fibre_g: 4.1, total_fat_g: 26.7, saturated_fat_g: 7.4, trans_fat_g: 0, sodium_mg: 22 }, { serving: "35 g" }),
    truth: { contains: ["peanut", "dairy"], mayContain: [] },
  },
  {
    id: "rotated-blurred",
    about: "A skewed, slightly blurred phone photo, compressed.",
    style: "clean",
    distort: { rotate: 4, blur: 1.2, quality: 55 },
    pack: pack("Atta Biscuits", "Testwind Bakes", "300 g"),
    ingredients: "Whole Wheat Flour (Atta) (55%), Sugar, Palm Oil, Milk Solids, Invert Syrup, Raising Agents (INS 503(ii), INS 500(ii)), Salt",
    allergenStatement: "Contains Wheat and Milk.",
    nutrition: table({ protein_g: 8.2, carbs_g: 68.1, sugars_g: 21.7, fibre_g: 4.4, total_fat_g: 19.6, saturated_fat_g: 9.1, trans_fat_g: 0.1, sodium_mg: 330 }),
    truth: { contains: ["gluten", "dairy"], mayContain: [] },
  },
  {
    id: "dense-small-print",
    about: "A long nested list in small type, scaled down.",
    style: "dense",
    distort: { scale: 0.8, quality: 70 },
    pack: pack("Premium Trail Mix", "Testwind Nuts", "200 g"),
    ingredients: "Roasted Almonds (18%), Pistachio Kernels (12%), Dried Cranberries (Cranberries, Sugar, Sunflower Oil) (15%), Pumpkin Seeds (12%), Hazelnut Paste Coated Crispies (Rice Flour, Hazelnut Paste (20%), Sugar, Cocoa Butter, Skimmed Milk Powder, Emulsifier (Soya Lecithin)) (15%), Sunflower Seeds (10%), Dark Chocolate Chips (Sugar, Cocoa Mass, Cocoa Butter, Emulsifier (INS 322)) (10%), Watermelon Seeds (8%)",
    allergenStatement: "Contains Almond, Pistachio, Hazelnut (tree nuts), Milk and Soy.",
    nutrition: table({ protein_g: 15.3, carbs_g: 36.2, sugars_g: 19.4, fibre_g: 7.6, total_fat_g: 38.9, saturated_fat_g: 6.8, trans_fat_g: 0, sodium_mg: 34 }, { serving: "25 g" }),
    truth: { contains: ["tree_nut", "dairy", "soy"], mayContain: [] },
  },
  {
    id: "nutrition-only",
    about: "A nutrition panel with no ingredient list in the photo.",
    style: "clean",
    pack: pack("Ragi Malt Drink Mix", "Testwind Pantry", "400 g"),
    nutrition: table({ protein_g: 7.9, carbs_g: 80.4, sugars_g: 32.8, fibre_g: 5.1, total_fat_g: 2.4, saturated_fat_g: 0.9, trans_fat_g: 0, sodium_mg: 140 }, { serving: "20 g" }),
    truth: { contains: [], mayContain: [] },
  },
  {
    id: "suji-hidden-gluten",
    about: "Gluten as suji, milk as ghee, cashews — no statement.",
    style: "clean",
    pack: pack("Instant Rava Upma Mix", "Testwind Pantry", "200 g"),
    ingredients: "Suji (Semolina) (72%), Ghee, Cashews, Mustard Seeds, Urad Dal, Curry Leaves, Salt, Green Chilli",
    nutrition: table({ protein_g: 10.2, carbs_g: 62.7, sugars_g: 1.8, fibre_g: 3.6, total_fat_g: 15.4, saturated_fat_g: 6.9, trans_fat_g: 0.1, sodium_mg: 590 }, { serving: "50 g" }),
    truth: { contains: ["gluten", "dairy", "tree_nut"], mayContain: [] },
  },
  {
    id: "statement-omits-allergen",
    about: "The statement leaves out the milk the list names; the engine must not publish it as it stands.",
    style: "clean",
    pack: pack("Masala Khakhra", "Testwind Foods", "180 g"),
    ingredients: "Whole Wheat Flour (74%), Edible Vegetable Oil, Milk Solids, Methi Leaves, Spices, Salt",
    allergenStatement: "Contains Wheat.",
    nutrition: table({ protein_g: 12.6, carbs_g: 61.8, sugars_g: 2.9, fibre_g: 9.4, total_fat_g: 14.9, saturated_fat_g: 4.3, trans_fat_g: 0, sodium_mg: 820 }),
    truth: { contains: ["gluten", "dairy"], mayContain: [] },
  },
  {
    id: "barley-malt",
    about: "Gluten as malted barley in a drink mix.",
    style: "clean",
    pack: pack("Chocolate Malt Drink", "Testwind Pantry", "500 g"),
    ingredients: "Malted Barley Extract (40%), Sugar, Cocoa Powder (12%), Milk Solids (10%), Wheat Flour, Minerals, Vitamins",
    allergenStatement: "Contains Barley, Wheat (Gluten) and Milk.",
    nutrition: table({ protein_g: 8.9, carbs_g: 78.5, sugars_g: 41.3, fibre_g: 3.2, total_fat_g: 3.8, saturated_fat_g: 2.1, trans_fat_g: 0, sodium_mg: 230 }, { serving: "20 g" }),
    truth: { contains: ["gluten", "dairy"], mayContain: [] },
  },
]);
