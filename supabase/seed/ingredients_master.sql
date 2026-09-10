-- ============================================================================
-- KOI — The ingredient knowledge base
--
-- `ingredients_master` has existed since migration 00003 and has held zero rows
-- ever since. That emptiness is the reason KOI cannot yet answer the questions
-- a diet copilot is actually asked. Nutrition numbers tell you a product has
-- 4.2 g of sugar; they cannot tell you the sugar is invert syrup, that "milk
-- solids" means a dairy allergen, that INS 621 is MSG, or that the fat is palm.
-- Those are ingredient questions, and until this table is populated nothing in
-- the system can reason about them.
--
-- WHAT THIS IS AND IS NOT:
-- This is the RULES library — the canonical names, the aliases a label might
-- use, and KOI's position on each. It is not per-product data. `sku_ingredients`
-- (also empty) is where a given SKU's declared ingredient list belongs, and
-- filling that needs real label text, which is a separate job. Seeding this
-- table changes no UI today. It is groundwork, deliberately.
--
-- HOW risk_level SHOULD BE READ — please read this before relying on it:
-- `risk_level` is an EDITORIAL POSITION, not a fact, and it is the one column
-- here a reasonable expert could disagree with. Each row's `notes` states the
-- basis for its level so a reviewer can check the reasoning rather than the
-- conclusion. The levels mean:
--
--   safe     — permitted, well characterised, no substantive live controversy
--   caution  — permitted, but there is a reason a health-first brand would
--              rather flag it: a declarable allergen, a refined ingredient, an
--              additive with a real and ongoing safety debate
--   risky    — permitted in India but carrying a specific documented concern
--              serious enough that another major regulator restricts or warns
--   blocked  — not permitted in India, or effectively ended by an FSSAI limit
--
-- SOMEONE QUALIFIED SHOULD REVIEW THESE BEFORE THEY DRIVE CUSTOMER-FACING
-- CLAIMS OR BLOCK A PRODUCT. A wrong 'risky' is a public accusation about a
-- brand; a wrong 'safe' is the failure this table exists to prevent. Regulatory
-- positions also move — the trans fat limit and the potassium bromate delisting
-- below are both recent — so treat this as a snapshot needing maintenance, not
-- a settled reference.
--
-- `aliases` carries what a LABEL actually prints, which is the whole point:
-- matching only on canonical names would miss "E621", "ajinomoto" and
-- "flavour enhancer (621)", all of which are the same substance.
--
-- Idempotent: re-running updates in place and never duplicates.
-- ============================================================================

INSERT INTO ingredients_master
  (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
VALUES

-- ── Colours ─────────────────────────────────────────────────────────────────
-- The six azo dyes marked 'risky' are the "Southampton six": the EU requires
-- packs containing them to carry a warning about effects on children's activity
-- and attention. India permits them with limits and no such warning.
('Tartrazine', '["INS 102","E102","FD&C Yellow 5","tartrazine","yellow 5"]', 'colour', 'risky', FALSE,
 'Azo dye. EU requires a childrens activity and attention warning; permitted in India with limits. Also a recognised trigger in aspirin-sensitive asthma.'),
('Quinoline Yellow', '["INS 104","E104","quinoline yellow"]', 'colour', 'risky', FALSE,
 'Southampton six azo dye. EU warning label required. Not permitted in the US.'),
('Sunset Yellow FCF', '["INS 110","E110","FD&C Yellow 6","sunset yellow","yellow 6"]', 'colour', 'risky', FALSE,
 'Southampton six azo dye. EU warning label required; permitted in India with limits.'),
('Carmoisine', '["INS 122","E122","azorubine","carmoisine"]', 'colour', 'risky', FALSE,
 'Southampton six azo dye. EU warning label required. Not permitted in the US.'),
('Ponceau 4R', '["INS 124","E124","ponceau 4r","cochineal red A"]', 'colour', 'risky', FALSE,
 'Southampton six azo dye. EU warning label required. Not permitted in the US.'),
('Allura Red AC', '["INS 129","E129","FD&C Red 40","allura red","red 40"]', 'colour', 'risky', FALSE,
 'Southampton six azo dye. EU warning label required; widely used in India.'),
('Erythrosine', '["INS 127","E127","FD&C Red 3","erythrosine","red 3"]', 'colour', 'risky', FALSE,
 'Iodine-based dye. US FDA revoked its authorisation for food use in Jan 2025; still permitted in India with limits.'),
('Brilliant Blue FCF', '["INS 133","E133","FD&C Blue 1","brilliant blue"]', 'colour', 'caution', FALSE,
 'Synthetic dye, permitted broadly. Flagged as synthetic rather than for a specific safety finding.'),
('Indigo Carmine', '["INS 132","E132","indigotine","indigo carmine"]', 'colour', 'caution', FALSE,
 'Synthetic dye, permitted broadly. Flagged as synthetic.'),
('Fast Green FCF', '["INS 143","E143","FD&C Green 3","fast green"]', 'colour', 'caution', FALSE,
 'Synthetic dye, permitted in India and the US; not permitted in the EU.'),
('Caramel Colour', '["INS 150a","INS 150b","INS 150c","INS 150d","E150","caramel colour","caramel color"]', 'colour', 'caution', FALSE,
 'Class III and IV variants can carry 4-MEI as a process contaminant, which California lists under Proposition 65. Class I is plain caramelised sugar.'),
('Curcumin', '["INS 100","E100","curcumin","turmeric colour"]', 'colour', 'safe', FALSE,
 'Turmeric-derived colour. Long history of dietary use.'),
('Beta-Carotene', '["INS 160a","E160a","beta carotene","carotene"]', 'colour', 'safe', FALSE,
 'Provitamin A carotenoid, also a nutrient.'),
('Paprika Extract', '["INS 160c","E160c","paprika oleoresin","paprika extract"]', 'colour', 'safe', FALSE,
 'Spice-derived colour.'),
('Beetroot Red', '["INS 162","E162","betanin","beetroot red"]', 'colour', 'safe', FALSE,
 'Vegetable-derived colour.'),
('Anthocyanins', '["INS 163","E163","anthocyanin","grape skin extract"]', 'colour', 'safe', FALSE,
 'Fruit and vegetable derived colour.'),
('Titanium Dioxide', '["INS 171","E171","titanium dioxide"]', 'colour', 'risky', FALSE,
 'EFSA concluded in 2021 that genotoxicity could not be ruled out; banned as a food additive in the EU since 2022. Still permitted in India.'),

-- ── Preservatives ───────────────────────────────────────────────────────────
('Sodium Benzoate', '["INS 211","E211","sodium benzoate","benzoate"]', 'preservative', 'caution', FALSE,
 'Can form benzene in the presence of ascorbic acid, particularly in soft drinks exposed to heat or light. Permitted with limits.'),
('Benzoic Acid', '["INS 210","E210","benzoic acid"]', 'preservative', 'caution', FALSE,
 'Same benzene-formation route as sodium benzoate when combined with ascorbic acid.'),
('Potassium Sorbate', '["INS 202","E202","potassium sorbate"]', 'preservative', 'safe', FALSE,
 'Well characterised mould and yeast inhibitor, low toxicity.'),
('Sorbic Acid', '["INS 200","E200","sorbic acid"]', 'preservative', 'safe', FALSE,
 'Well characterised, low toxicity.'),
('Sulphur Dioxide', '["INS 220","E220","sulphur dioxide","sulfur dioxide"]', 'preservative', 'risky', FALSE,
 'Sulphite. Triggers bronchoconstriction in sulphite-sensitive asthmatics. Declarable above 10 ppm.'),
('Sodium Metabisulphite', '["INS 223","E223","sodium metabisulphite","sodium metabisulfite","metabisulphite"]', 'preservative', 'risky', FALSE,
 'Sulphite, common in dried fruit and some flours. Asthma trigger in sensitive individuals; declarable above 10 ppm.'),
('Potassium Metabisulphite', '["INS 224","E224","potassium metabisulphite"]', 'preservative', 'risky', FALSE,
 'Sulphite. Same asthma concern and declaration threshold.'),
('Sodium Nitrite', '["INS 250","E250","sodium nitrite","nitrite"]', 'preservative', 'risky', FALSE,
 'Cured meat preservative. IARC classifies processed meat as Group 1; nitrite is the route by which nitrosamines form during curing and cooking.'),
('Sodium Nitrate', '["INS 251","E251","sodium nitrate","nitrate"]', 'preservative', 'risky', FALSE,
 'Converts to nitrite in curing. Same nitrosamine pathway as sodium nitrite.'),
('Calcium Propionate', '["INS 282","E282","calcium propionate"]', 'preservative', 'caution', FALSE,
 'Bread mould inhibitor. Permitted and widely used; flagged only as a marker of industrial baking.'),
('Natamycin', '["INS 235","E235","natamycin","pimaricin"]', 'preservative', 'caution', FALSE,
 'Antifungal used on cheese surfaces. Permitted with limits.'),
('Nisin', '["INS 234","E234","nisin"]', 'preservative', 'safe', FALSE,
 'Bacteriocin from a food-grade culture; long history of use in dairy.'),

-- ── Antioxidants ────────────────────────────────────────────────────────────
('Butylated Hydroxyanisole', '["INS 320","E320","BHA","butylated hydroxyanisole"]', 'antioxidant', 'risky', FALSE,
 'IARC Group 2B, possibly carcinogenic to humans. Permitted in India with limits; a health-first brand would avoid it.'),
('Butylated Hydroxytoluene', '["INS 321","E321","BHT","butylated hydroxytoluene"]', 'antioxidant', 'caution', FALSE,
 'Synthetic antioxidant. Less evidence of concern than BHA but the same class and use.'),
('Tertiary Butylhydroquinone', '["INS 319","E319","TBHQ","tertiary butylhydroquinone"]', 'antioxidant', 'caution', FALSE,
 'Synthetic antioxidant in frying oils and instant noodles. Permitted with a low ADI; intake adds up across fried products.'),
('Ascorbic Acid', '["INS 300","E300","ascorbic acid","vitamin C"]', 'antioxidant', 'safe', FALSE,
 'Vitamin C. Note the benzene interaction with benzoate preservatives is a property of the pair, not of this alone.'),
('Tocopherols', '["INS 307","INS 306","E307","E306","tocopherol","mixed tocopherols","vitamin E"]', 'antioxidant', 'safe', FALSE,
 'Vitamin E, commonly the natural alternative to BHA and BHT.'),
('Citric Acid', '["INS 330","E330","citric acid"]', 'acidity_regulator', 'safe', FALSE,
 'Ubiquitous acidulant, well characterised.'),

-- ── Emulsifiers, stabilisers and thickeners ─────────────────────────────────
('Soy Lecithin', '["INS 322","E322","soya lecithin","soy lecithin","lecithin"]', 'emulsifier', 'caution', FALSE,
 'Safe as an emulsifier, but soy-derived: relevant to a soya allergen declaration. Level reflects the allergen link, not toxicity.'),
('Mono- and Diglycerides', '["INS 471","E471","mono and diglycerides","monoglycerides","diglycerides"]', 'emulsifier', 'caution', FALSE,
 'Can be animal- or plant-derived, which matters for vegetarian and vegan claims and is rarely specified on Indian labels.'),
('Polysorbate 80', '["INS 433","E433","polysorbate 80","tween 80"]', 'emulsifier', 'caution', FALSE,
 'Emerging animal evidence on gut microbiota and intestinal inflammation; permitted and widely used.'),
('Carboxymethyl Cellulose', '["INS 466","E466","CMC","carboxymethyl cellulose","cellulose gum"]', 'stabiliser', 'caution', FALSE,
 'Same emerging emulsifier and microbiota literature as polysorbate 80. Permitted.'),
('Carrageenan', '["INS 407","E407","carrageenan"]', 'thickener', 'caution', FALSE,
 'Seaweed extract. JECFA found no concern at food-use levels but advised against use in infant formula; degraded carrageenan is a separate and more concerning substance.'),
('Guar Gum', '["INS 412","E412","guar gum"]', 'thickener', 'safe', FALSE,
 'Legume-derived soluble fibre, well characterised.'),
('Xanthan Gum', '["INS 415","E415","xanthan gum"]', 'thickener', 'safe', FALSE,
 'Fermentation-derived polysaccharide, well characterised.'),
('Pectin', '["INS 440","E440","pectin"]', 'thickener', 'safe', FALSE,
 'Fruit-derived soluble fibre.'),
('Acacia Gum', '["INS 414","E414","gum arabic","acacia gum"]', 'thickener', 'safe', FALSE,
 'Tree exudate, long history of use, also a soluble fibre.'),
('Locust Bean Gum', '["INS 410","E410","locust bean gum","carob gum"]', 'thickener', 'safe', FALSE,
 'Seed-derived galactomannan.'),

-- ── Anticaking, acidity regulators, raising agents ──────────────────────────
('Silicon Dioxide', '["INS 551","E551","silicon dioxide","silica"]', 'anticaking', 'safe', FALSE,
 'Anticaking agent, poorly absorbed. EFSA has asked for more nanoparticle data.'),
('Sodium Aluminosilicate', '["INS 554","E554","sodium aluminosilicate"]', 'anticaking', 'caution', FALSE,
 'Aluminium-containing anticaking agent; the concern is cumulative dietary aluminium rather than acute toxicity.'),
('Sodium Bicarbonate', '["INS 500","E500","sodium bicarbonate","baking soda"]', 'raising_agent', 'safe', FALSE,
 'Baking soda. Contributes sodium.'),
('Sodium Aluminium Phosphate', '["INS 541","E541","sodium aluminium phosphate"]', 'raising_agent', 'caution', FALSE,
 'Aluminium-containing raising agent in some baking powders. Cumulative aluminium intake.'),
('Phosphoric Acid', '["INS 338","E338","phosphoric acid"]', 'acidity_regulator', 'caution', FALSE,
 'Cola acidulant. High phosphate intake is a concern chiefly in chronic kidney disease.'),
('Acetic Acid', '["INS 260","E260","acetic acid","vinegar"]', 'acidity_regulator', 'safe', FALSE,
 'Vinegar acid.'),
('Lactic Acid', '["INS 270","E270","lactic acid"]', 'acidity_regulator', 'safe', FALSE,
 'Fermentation acid. Despite the name it is not dairy-derived.'),
('Malic Acid', '["INS 296","E296","malic acid"]', 'acidity_regulator', 'safe', FALSE,
 'Fruit acid.'),

-- ── Flavour enhancers ───────────────────────────────────────────────────────
('Monosodium Glutamate', '["INS 621","E621","MSG","monosodium glutamate","ajinomoto","flavour enhancer 621","taste maker"]', 'flavour_enhancer', 'caution', FALSE,
 'FSSAI requires the declaration "Contains added Monosodium Glutamate" and does not permit it in foods for infants under 12 months. Broad safety reviews find no hazard at normal intakes; the caution reflects the declaration requirement and its role as an ultra-processing marker.'),
('Disodium Inosinate', '["INS 631","E631","disodium inosinate"]', 'flavour_enhancer', 'caution', FALSE,
 'Usually paired with MSG. Commonly animal-derived, which matters for vegetarian claims. Purine source, relevant in gout.'),
('Disodium Guanylate', '["INS 627","E627","disodium guanylate"]', 'flavour_enhancer', 'caution', FALSE,
 'Usually paired with MSG. Purine source, relevant in gout.'),
('Disodium Ribonucleotides', '["INS 635","E635","disodium ribonucleotides"]', 'flavour_enhancer', 'caution', FALSE,
 'Blend of INS 627 and INS 631; same considerations.'),
('Yeast Extract', '["yeast extract","autolysed yeast","hydrolysed vegetable protein","HVP"]', 'flavour_enhancer', 'caution', FALSE,
 'Naturally glutamate-rich, so it delivers the MSG effect without the INS 621 declaration. Flagged for label transparency rather than safety.'),

-- ── Sweeteners ──────────────────────────────────────────────────────────────
('Aspartame', '["INS 951","E951","aspartame"]', 'sweetener', 'caution', FALSE,
 'IARC classified it Group 2B in 2023 while JECFA retained the 40 mg/kg bw ADI the same week. Genuine phenylalanine hazard in phenylketonuria, which requires a label warning.'),
('Sucralose', '["INS 955","E955","sucralose"]', 'sweetener', 'caution', FALSE,
 'Permitted and widely used. Emerging work on glycaemic and microbiota effects is unsettled; degradation products at high baking temperatures are a separate open question.'),
('Acesulfame Potassium', '["INS 950","E950","acesulfame K","acesulfame potassium","ace-K"]', 'sweetener', 'caution', FALSE,
 'Permitted. Usually blended with aspartame or sucralose, so intakes stack across products.'),
('Saccharin', '["INS 954","E954","saccharin"]', 'sweetener', 'caution', FALSE,
 'Permitted. The historical bladder tumour finding was rat-specific and the substance was delisted as a carcinogen in 2000.'),
('Steviol Glycosides', '["INS 960","E960","stevia","steviol glycosides"]', 'sweetener', 'safe', FALSE,
 'Plant-derived high-intensity sweetener with an established ADI.'),
('Sorbitol', '["INS 420","E420","sorbitol"]', 'sweetener', 'caution', FALSE,
 'Sugar alcohol. Laxative effect above roughly 20 g per day; FSSAI requires an excess-consumption warning.'),
('Maltitol', '["INS 965","E965","maltitol"]', 'sweetener', 'caution', FALSE,
 'Sugar alcohol with a meaningful glycaemic response, unlike erythritol. Laxative at higher intakes.'),
('Xylitol', '["INS 967","E967","xylitol"]', 'sweetener', 'caution', FALSE,
 'Sugar alcohol, tooth-friendly, laxative at higher intakes. Severely toxic to dogs, which is worth surfacing on a household product.'),
('Erythritol', '["INS 968","E968","erythritol"]', 'sweetener', 'caution', FALSE,
 'Sugar alcohol, largely excreted unchanged. 2023 work associating circulating erythritol with cardiovascular events is contested and did not establish causation from dietary intake.'),

-- ── Blocked: not permitted in India, or ended by an FSSAI limit ─────────────
('Potassium Bromate', '["INS 924","E924","potassium bromate","bromate"]', 'flour_treatment', 'blocked', TRUE,
 'Removed from the Indian permitted-additives list in 2016 after bromate residues were found in bread. IARC Group 2B. Presence in a current product would be a compliance failure.'),
('Brominated Vegetable Oil', '["BVO","brominated vegetable oil"]', 'stabiliser', 'blocked', TRUE,
 'Not permitted in India. The US FDA revoked its authorisation in 2024.'),
('Partially Hydrogenated Vegetable Oil', '["PHVO","partially hydrogenated oil","partially hydrogenated vegetable oil","hydrogenated vegetable fat"]', 'fat_oil', 'blocked', TRUE,
 'The industrial trans fat source. FSSAI capped trans fat at 2 percent by mass of total oils and fats from January 2022, which ends its use in practice.'),
('Industrial Trans Fat', '["trans fat","trans fatty acids","industrial trans fat"]', 'fat_oil', 'blocked', TRUE,
 'Subject to the FSSAI 2 percent limit. Note that trace ruminant trans fat in dairy and meat is a different substance and not covered by this row.'),

-- ── Declarable allergens ────────────────────────────────────────────────────
-- risk_level 'caution' on these rows reflects a MANDATORY DECLARATION under
-- FSSAI labelling rules, not a judgement that the food is unhealthy. Milk is
-- not risky; milk is an allergen. A copilot needs both facts and only has room
-- for one column, so the notes carry the distinction.
('Milk', '["milk","milk solids","milk powder","skimmed milk powder","SMP","dairy","butter","ghee","cream","cheese","curd","paneer","khoya","malai"]', 'allergen', 'caution', FALSE,
 'Declarable milk allergen. Also the marker for lactose intolerance, which is highly prevalent in India, and disqualifies a vegan claim.'),
('Casein', '["casein","caseinate","sodium caseinate","calcium caseinate","milk protein"]', 'allergen', 'caution', FALSE,
 'Milk protein fraction. Declarable milk allergen even where the word milk does not appear.'),
('Whey', '["whey","whey protein","whey protein concentrate","WPC","whey protein isolate","WPI","whey permeate"]', 'allergen', 'caution', FALSE,
 'Milk-derived. Declarable milk allergen; common in protein products where shoppers may not expect it.'),
('Egg', '["egg","egg white","egg yolk","albumen","albumin","egg powder","liquid egg"]', 'allergen', 'caution', FALSE,
 'Declarable egg allergen. Disqualifies vegan and most Indian vegetarian claims.'),
('Peanut', '["peanut","groundnut","groundnut oil","peanut butter","moongphali","arachis oil"]', 'allergen', 'caution', FALSE,
 'Declarable allergen and among the most common causes of food anaphylaxis.'),
('Tree Nuts', '["tree nuts","almond","badam","cashew","kaju","walnut","akhrot","pistachio","pista","hazelnut","pecan","macadamia","brazil nut"]', 'allergen', 'caution', FALSE,
 'Declarable allergen group. Distinct from peanut, which is a legume.'),
('Soya', '["soy","soya","soybean","soya bean","soy protein","soya flour","textured vegetable protein","TVP","tofu"]', 'allergen', 'caution', FALSE,
 'Declarable allergen. Highly refined soybean oil and soy lecithin are usually tolerated but are still declared.'),
('Wheat', '["wheat","atta","maida","suji","semolina","rava","wheat flour","durum","couscous"]', 'allergen', 'caution', FALSE,
 'Declarable cereal allergen and a gluten source. See the Refined Wheat Flour row for the separate refinement question.'),
('Gluten', '["gluten","wheat gluten","vital gluten","barley","rye","malt","malt extract","triticale"]', 'allergen', 'caution', FALSE,
 'Declarable. Central to coeliac disease and non-coeliac gluten sensitivity. Note barley malt in cereals and drinks is an easily missed source.'),
('Sesame', '["sesame","til","gingelly","sesame oil","tahini","sesame seeds"]', 'allergen', 'caution', FALSE,
 'Declarable allergen, common in Indian sweets and snacks.'),
('Fish', '["fish","fish oil","anchovy","tuna","sardine","fish sauce"]', 'allergen', 'caution', FALSE,
 'Declarable allergen. Also disqualifies vegetarian claims.'),
('Crustacean Shellfish', '["crustacean","shellfish","prawn","shrimp","crab","lobster","krill"]', 'allergen', 'caution', FALSE,
 'Declarable allergen and a frequent cause of adult-onset food allergy.'),
('Mustard', '["mustard","sarson","rai","mustard oil","mustard seeds","kasundi"]', 'allergen', 'caution', FALSE,
 'Declarable allergen in several jurisdictions and very common in Indian cooking.'),
('Sulphites (Declarable)', '["sulphites","sulfites","sulphiting agents"]', 'allergen', 'caution', FALSE,
 'Declarable above 10 ppm. Grouped with allergens by labelling convention though the mechanism is not IgE-mediated.'),

-- ── Refined carbohydrates and sugars ────────────────────────────────────────
('Refined Wheat Flour', '["maida","refined wheat flour","refined flour","all purpose flour","APF","white flour"]', 'refined_carb', 'caution', FALSE,
 'Bran and germ removed, so fibre and micronutrients are largely lost and the glycaemic response is higher than wholemeal. Also a wheat allergen and gluten source.'),
('Refined Sugar', '["sugar","refined sugar","white sugar","sucrose","cane sugar","chini"]', 'sugar', 'caution', FALSE,
 'Free sugar. The WHO conditional recommendation is under 5 percent of energy. Relevant to added-sugar limits regardless of source.'),
('High Fructose Corn Syrup', '["HFCS","high fructose corn syrup","corn syrup","glucose-fructose syrup","fructose syrup"]', 'sugar', 'caution', FALSE,
 'Free sugar in liquid form, cheap and easy to over-consume. Metabolically close to sucrose; the concern is quantity and the products it appears in.'),
('Invert Sugar', '["invert sugar","invert syrup","invert sugar syrup"]', 'sugar', 'caution', FALSE,
 'Hydrolysed sucrose. A free sugar that often appears where a label is trying not to print the word sugar.'),
('Dextrose', '["dextrose","glucose","glucose syrup","dextrose monohydrate","liquid glucose"]', 'sugar', 'caution', FALSE,
 'Free sugar with a high glycaemic index.'),
('Maltodextrin', '["maltodextrin"]', 'refined_carb', 'caution', FALSE,
 'Starch-derived. Frequently has a higher glycaemic index than table sugar despite not being counted as a sugar on the label, which is exactly the gap a copilot should close.'),
('Modified Starch', '["modified starch","modified corn starch","INS 1422","E1422","acetylated distarch adipate"]', 'refined_carb', 'caution', FALSE,
 'Chemically modified starch. Permitted; flagged as an ultra-processing marker.'),
('Rice Flour', '["rice flour","chawal atta"]', 'refined_carb', 'caution', FALSE,
 'Naturally gluten free but low in fibre with a high glycaemic response.'),
('Jaggery', '["jaggery","gur","gud","cane jaggery"]', 'sugar', 'caution', FALSE,
 'Retains trace minerals but is metabolically a free sugar. Counts toward added sugar despite its natural reputation.'),
('Honey', '["honey","shahad","madhu"]', 'sugar', 'caution', FALSE,
 'Free sugar under WHO definitions. Must not be given to infants under 12 months because of infant botulism risk.'),
('Date Syrup', '["date syrup","date paste","khajur syrup"]', 'sugar', 'caution', FALSE,
 'Whole-fruit derived but concentrated, so it counts as a free sugar.'),

-- ── Fats and oils ───────────────────────────────────────────────────────────
('Palm Oil', '["palm oil","palmolein","refined palmolein","palm kernel oil","palm fat","vegetable fat (palm)"]', 'fat_oil', 'caution', FALSE,
 'High in palmitic acid, a saturated fat that raises LDL. Dominant in Indian processed food. Deforestation is a separate and legitimate reason a brand may exclude it.'),
('Vanaspati', '["vanaspati","hydrogenated vegetable oil","vanaspati ghee","dalda"]', 'fat_oil', 'risky', FALSE,
 'Historically the main industrial trans fat source in India. Now bound by the 2 percent trans fat limit, so modern product is fully hydrogenated and highly saturated rather than trans-rich.'),
('Interesterified Fat', '["interesterified fat","interesterified vegetable fat"]', 'fat_oil', 'caution', FALSE,
 'The common replacement for partially hydrogenated fat. Avoids trans fat; long-term health data is thinner than for the fats it replaced.'),
('Mustard Oil', '["mustard oil","sarson ka tel","kachi ghani"]', 'fat_oil', 'safe', FALSE,
 'Traditional Indian cooking oil, favourable unsaturated profile. Contains erucic acid, the basis for restrictions in some other countries. Also a mustard allergen.'),
('Groundnut Oil', '["groundnut oil","peanut oil","arachis oil"]', 'fat_oil', 'safe', FALSE,
 'Stable cooking oil. Refined grades are usually tolerated by peanut-allergic people but are still declared.'),
('Coconut Oil', '["coconut oil","nariyal tel","virgin coconut oil"]', 'fat_oil', 'caution', FALSE,
 'Roughly 90 percent saturated. Raises LDL despite a strong health-food reputation, which is a reason to flag rather than to block.'),
('Sunflower Oil', '["sunflower oil","sunflower seed oil"]', 'fat_oil', 'safe', FALSE,
 'High in linoleic acid. Not suited to high-heat repeated frying.'),
('Rice Bran Oil', '["rice bran oil"]', 'fat_oil', 'safe', FALSE,
 'Balanced fatty acid profile, contains oryzanol, high smoke point.'),
('Olive Oil', '["olive oil","extra virgin olive oil","EVOO"]', 'fat_oil', 'safe', FALSE,
 'Monounsaturated, well evidenced within Mediterranean dietary patterns.'),
('Ghee', '["ghee","clarified butter","desi ghee"]', 'fat_oil', 'caution', FALSE,
 'Highly saturated and a milk allergen, though free of milk protein when well clarified. Flagged for saturated fat, not for tradition.'),

-- ── Whole foods and recognised-good ingredients ────────────────────────────
-- A knowledge base that only knows what is wrong cannot recognise what is
-- right, and a copilot that can only warn is not much use to a health brand.
('Whole Wheat Flour', '["whole wheat flour","atta","whole meal flour","chakki atta","gehun atta"]', 'whole_food', 'safe', FALSE,
 'Bran and germ retained. Still a wheat allergen and gluten source.'),
('Oats', '["oats","rolled oats","steel cut oats","oat flour","jai"]', 'whole_food', 'safe', FALSE,
 'Beta-glucan soluble fibre with an authorised cholesterol-lowering role. Frequently cross-contaminated with gluten unless certified.'),
('Ragi', '["ragi","finger millet","nachni","ragi flour"]', 'whole_food', 'safe', FALSE,
 'Millet, notably high in calcium, naturally gluten free.'),
('Jowar', '["jowar","sorghum","jowar flour"]', 'whole_food', 'safe', FALSE,
 'Millet, naturally gluten free, good fibre.'),
('Bajra', '["bajra","pearl millet","bajra flour"]', 'whole_food', 'safe', FALSE,
 'Millet, naturally gluten free, iron source.'),
('Quinoa', '["quinoa"]', 'whole_food', 'safe', FALSE,
 'Complete protein pseudocereal, naturally gluten free.'),
('Brown Rice', '["brown rice","unpolished rice"]', 'whole_food', 'safe', FALSE,
 'Bran retained, so more fibre and a lower glycaemic response than polished rice.'),
('Chickpea', '["chickpea","chana","besan","gram flour","kabuli chana","chana dal"]', 'whole_food', 'safe', FALSE,
 'Legume protein and fibre. Besan is a common gluten-free flour.'),
('Lentils', '["lentil","dal","masoor","moong","toor","urad","arhar"]', 'whole_food', 'safe', FALSE,
 'Staple Indian protein and fibre source.'),
('Moringa', '["moringa","drumstick leaf","sahjan","moringa oleifera"]', 'whole_food', 'safe', FALSE,
 'Nutrient-dense leaf. Marketing claims frequently outrun the evidence, so treat product claims on their own merits.'),
('Flaxseed', '["flaxseed","linseed","alsi","flax seeds"]', 'whole_food', 'safe', FALSE,
 'Plant omega-3 (ALA) and fibre.'),
('Chia Seeds', '["chia","chia seeds","sabja substitute"]', 'whole_food', 'safe', FALSE,
 'ALA and soluble fibre.'),
('Dates', '["dates","khajur","medjool"]', 'whole_food', 'safe', FALSE,
 'Whole fruit with intact fibre. Sugar-dense, so portion still matters; distinct from date syrup.'),
('Turmeric', '["turmeric","haldi","curcuma"]', 'whole_food', 'safe', FALSE,
 'Culinary spice. Concentrated curcumin supplements are a different question from culinary use.'),
('Rock Salt', '["rock salt","sendha namak","himalayan salt","pink salt"]', 'whole_food', 'caution', FALSE,
 'Sodium is sodium regardless of origin; mineral claims are marginal at culinary doses. Usually not iodised, which matters in a country with iodine deficiency programmes.'),
('Iodised Salt', '["iodised salt","iodized salt","namak","table salt","common salt"]', 'whole_food', 'caution', FALSE,
 'Iodine fortification is a public health success. The caution is the sodium load, not the iodine.'),

-- ── Further additives common on Indian labels ──────────────────────────────
('Sodium Citrate', '["INS 331","E331","sodium citrate","trisodium citrate"]', 'acidity_regulator', 'safe', FALSE,
 'Buffering salt, well characterised.'),
('Calcium Carbonate', '["INS 170","E170","calcium carbonate","chalk"]', 'anticaking', 'safe', FALSE,
 'Anticaking agent, colour and calcium fortificant.'),
('Diphosphates', '["INS 450","E450","diphosphate","sodium acid pyrophosphate","SAPP"]', 'raising_agent', 'caution', FALSE,
 'Raising agent and moisture binder. Added phosphate matters chiefly in chronic kidney disease.'),
('Polyphosphates', '["INS 452","E452","polyphosphate","sodium polyphosphate"]', 'stabiliser', 'caution', FALSE,
 'Water binder in processed meat and dairy. Same added-phosphate consideration.'),
('Potassium Chloride', '["INS 508","E508","potassium chloride","low sodium salt"]', 'acidity_regulator', 'caution', FALSE,
 'Common sodium-reduction salt substitute. Potassium load is a real concern in chronic kidney disease and on some blood pressure medication.'),
('Lysozyme', '["INS 1105","E1105","lysozyme"]', 'preservative', 'caution', FALSE,
 'Egg-white derived preservative. Declarable egg allergen, and easily missed because the name gives no hint of eggs.'),
('Shellac', '["INS 904","E904","shellac","confectioners glaze"]', 'glazing_agent', 'caution', FALSE,
 'Insect-derived resin glaze. Disqualifies vegan claims and matters to strict vegetarians.'),
('Carmine', '["INS 120","E120","carmine","cochineal","carminic acid"]', 'colour', 'caution', FALSE,
 'Insect-derived red colour. Not vegetarian or vegan, and a recognised if uncommon allergen.'),
('Neotame', '["INS 961","E961","neotame"]', 'sweetener', 'caution', FALSE,
 'High-intensity sweetener, aspartame-derived but without the phenylketonuria warning requirement.'),
('Monk Fruit Extract', '["monk fruit","luo han guo","mogroside"]', 'sweetener', 'safe', FALSE,
 'Plant-derived high-intensity sweetener.'),
('Annatto', '["INS 160b","E160b","annatto","bixin","norbixin"]', 'colour', 'safe', FALSE,
 'Seed-derived colour. Rare hypersensitivity reports.'),
('Glycerol', '["INS 422","E422","glycerol","glycerine","glycerin"]', 'humectant', 'safe', FALSE,
 'Humectant. Can be animal- or plant-derived, which matters for vegan claims.'),

-- ── Further refined ingredients ────────────────────────────────────────────
('Corn Starch', '["corn starch","cornflour","corn flour","maize starch","makai starch"]', 'refined_carb', 'caution', FALSE,
 'Pure starch, no fibre, high glycaemic response.'),
('Potato Starch', '["potato starch","potato flour"]', 'refined_carb', 'caution', FALSE,
 'Pure starch. Unmodified potato starch is a resistant starch when raw, but not after cooking.'),
('Tapioca Starch', '["tapioca","sago","sabudana","tapioca starch","cassava starch"]', 'refined_carb', 'caution', FALSE,
 'Pure starch, negligible protein or micronutrients.'),
('Polished Rice', '["white rice","polished rice","basmati rice","chawal"]', 'refined_carb', 'caution', FALSE,
 'Bran and germ removed. Staple food; flagged for glycaemic response rather than as a problem ingredient.'),

-- ── Further fats and oils ──────────────────────────────────────────────────
('Soybean Oil', '["soybean oil","soya oil","soyabean oil"]', 'fat_oil', 'caution', FALSE,
 'Widely used refined oil. Highly refined grades carry negligible soy protein but are still soy-derived.'),
('Cottonseed Oil', '["cottonseed oil","binola oil"]', 'fat_oil', 'caution', FALSE,
 'Cheap refined oil. Cotton is not grown as a food crop, so pesticide residue standards differ from food oilseeds.'),
('Rapeseed Oil', '["rapeseed oil","canola oil","canola"]', 'fat_oil', 'safe', FALSE,
 'Favourable unsaturated profile. Canola is the low-erucic-acid cultivar.'),
('Sesame Oil', '["sesame oil","til oil","gingelly oil"]', 'fat_oil', 'safe', FALSE,
 'Stable oil with a good fatty acid profile. Also a declarable sesame allergen.'),

-- ── Further whole foods ────────────────────────────────────────────────────
('Amaranth', '["amaranth","rajgira","ramdana"]', 'whole_food', 'safe', FALSE,
 'Pseudocereal, naturally gluten free, good protein and calcium.'),
('Buckwheat', '["buckwheat","kuttu","kuttu atta"]', 'whole_food', 'safe', FALSE,
 'Pseudocereal, naturally gluten free despite the name. Fasting staple in India.'),
('Barley', '["barley","jau","pearl barley"]', 'whole_food', 'caution', FALSE,
 'Good beta-glucan fibre, but a gluten source, so the caution is the allergen not the grain.'),
('Foxtail Millet', '["foxtail millet","kangni","navane"]', 'whole_food', 'safe', FALSE,
 'Millet, naturally gluten free.'),
('Kodo Millet', '["kodo millet","kodra","varagu"]', 'whole_food', 'safe', FALSE,
 'Millet, naturally gluten free, high fibre.'),
('Makhana', '["makhana","fox nut","lotus seed","phool makhana"]', 'whole_food', 'safe', FALSE,
 'Popped lotus seed. Low fat and reasonable protein when not fried or heavily salted.'),
('Pumpkin Seeds', '["pumpkin seeds","pepita","kaddu ke beej"]', 'whole_food', 'safe', FALSE,
 'Protein, magnesium and zinc source.'),
('Sunflower Seeds', '["sunflower seeds","surajmukhi ke beej"]', 'whole_food', 'safe', FALSE,
 'Vitamin E and protein source.'),
('Yoghurt Cultures', '["live cultures","probiotic cultures","lactobacillus","bifidobacterium","yoghurt culture","dahi culture"]', 'whole_food', 'safe', FALSE,
 'Fermentation cultures. Strain and viable count determine whether a probiotic claim is meaningful.'),
('Cocoa Solids', '["cocoa","cocoa solids","cocoa mass","cacao","cocoa powder"]', 'whole_food', 'safe', FALSE,
 'Flavanol source. Distinct from the sugar and milk it is usually combined with.'),
('Cocoa Butter', '["cocoa butter"]', 'fat_oil', 'caution', FALSE,
 'Highly saturated, though its stearic acid fraction has a smaller LDL effect than palmitic acid.'),
('Inulin', '["inulin","chicory root fibre","chicory inulin","fructooligosaccharide","FOS"]', 'whole_food', 'caution', FALSE,
 'Prebiotic soluble fibre. Genuinely beneficial, but causes bloating at higher intakes and is often added to inflate a fibre claim.')

ON CONFLICT (canonical_name) DO UPDATE SET
  aliases             = EXCLUDED.aliases,
  ingredient_category = EXCLUDED.ingredient_category,
  risk_level          = EXCLUDED.risk_level,
  is_blocked          = EXCLUDED.is_blocked,
  notes               = EXCLUDED.notes,
  updated_at          = NOW();
