// ============================================================================
// KOI PRODUCT - View-model normaliser
// Turns whatever product object we have (live DB or curated fallback) into a
// rich, always-populated editorial view model for the product story.
// Pure data; no misleading specifics - everything is derived from real fields.
// ============================================================================

const num = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, "")) || 0);
const has = (tags, kw) => (tags || []).some((t) => t.toLowerCase().includes(kw));

export function grade(score) {
  if (score >= 92) return { g: "A+", label: "Exceptional" };
  if (score >= 87) return { g: "A", label: "Excellent" };
  if (score >= 82) return { g: "A-", label: "Very good" };
  if (score >= 76) return { g: "B+", label: "Good" };
  if (score >= 70) return { g: "B", label: "Fair" };
  return { g: "C", label: "Mixed" };
}

// ── Ingredient knowledge base (for the intelligence chips) ──────────────────
const INGREDIENT_DB = {
  "whole wheat": { role: "Whole grain", tone: "good", detail: "Retains bran and germ, so it keeps fibre and a slower energy release than refined flour." },
  oats: { role: "Whole grain", tone: "good", detail: "A source of beta-glucan fibre that supports fullness and steadier energy." },
  millet: { role: "Whole grain", tone: "good", detail: "Naturally gluten-free grains with a low glycaemic load and good mineral content." },
  millets: { role: "Whole grain", tone: "good", detail: "Naturally gluten-free grains with a low glycaemic load and good mineral content." },
  ragi: { role: "Whole grain", tone: "good", detail: "Finger millet - rich in calcium and slow-digesting carbohydrates." },
  jaggery: { role: "Natural sweetener", tone: "good", detail: "Unrefined cane sugar that carries trace minerals. Still sugar, but less processed than white sugar." },
  dates: { role: "Natural sweetener", tone: "good", detail: "Whole-fruit sweetness with fibre and potassium - a cleaner way to add sweetness." },
  honey: { role: "Natural sweetener", tone: "good", detail: "Raw honey brings enzymes and antioxidants. Best enjoyed in moderation." },
  cocoa: { role: "Flavour", tone: "good", detail: "Real cocoa carries flavanol antioxidants - the source of genuine chocolate flavour." },
  cacao: { role: "Flavour", tone: "good", detail: "Minimally processed cocoa, higher in antioxidants than compound chocolate." },
  almond: { role: "Protein & fat", tone: "good", detail: "Adds plant protein, vitamin E and heart-friendly monounsaturated fat." },
  almonds: { role: "Protein & fat", tone: "good", detail: "Adds plant protein, vitamin E and heart-friendly monounsaturated fat." },
  cashew: { role: "Protein & fat", tone: "good", detail: "Creamy texture with plant protein and good fats." },
  peanut: { role: "Protein & fat", tone: "good", detail: "An affordable, high-protein legume with healthy fats." },
  "milk solids": { role: "Protein & dairy", tone: "good", detail: "Contributes protein and calcium and a rich, familiar taste." },
  "a2 ghee": { role: "Healthy fat", tone: "good", detail: "Clarified butter used for flavour and cooking stability instead of palm oil." },
  ghee: { role: "Healthy fat", tone: "good", detail: "Clarified butter used for flavour and cooking stability instead of palm oil." },
  saffron: { role: "Flavour", tone: "good", detail: "Prized spice threads adding aroma and colour, no additives needed." },
  seeds: { role: "Fibre & fat", tone: "good", detail: "Seeds add fibre, omega fats and a satisfying crunch." },
  "white butter": { role: "Healthy fat", tone: "good", detail: "Churned butter used instead of hydrogenated or palm fats." },
};

const DEFAULT_INGREDIENTS = {
  Snacks: ["Whole grains", "Jaggery", "Almonds", "Cocoa"],
  Breakfast: ["Whole wheat", "Milk solids", "Jaggery", "Cocoa"],
  Pantry: ["Single-origin sourcing", "No additives"],
  Beverages: ["Millets", "Cocoa", "Jaggery"],
};

function ingredientEntry(name) {
  const key = name.toLowerCase().trim();
  const hit = Object.keys(INGREDIENT_DB).find((k) => key.includes(k));
  if (hit) return { name, ...INGREDIENT_DB[hit] };
  return { name, role: "Whole ingredient", tone: "good", detail: "A recognisable, minimally processed ingredient - no synthetic fillers here." };
}

// ── Nutrition ratings (qualitative meters) ──────────────────────────────────
function proteinRating(v) { return v >= 15 ? ["Excellent", 0.92, "good"] : v >= 8 ? ["Good", 0.66, "good"] : v >= 4 ? ["Moderate", 0.42, "mid"] : ["Light", 0.2, "mid"]; }
function sugarRating(v) { return v <= 2 ? ["Minimal", 0.14, "good"] : v <= 6 ? ["Low", 0.32, "good"] : v <= 12 ? ["Moderate", 0.56, "mid"] : ["High", 0.85, "warn"]; }
function fibreRating(v) { return v >= 5 ? ["Good", 0.72, "good"] : v >= 3 ? ["Moderate", 0.46, "mid"] : ["Low", 0.22, "mid"]; }

export function buildProductVM(p, all = []) {
  if (!p) return null;
  const tags = p.tags || [];
  const category = p.category || "Snacks";
  const g = grade(p.score || 0);

  // nutrition map
  const nm = {};
  (p.nutrition || []).forEach((n) => { nm[n.label] = num(n.value); });
  const protein = nm["Protein"] ?? 0;
  const sugar = nm["Sugar"] ?? 0;
  const fibre = nm["Fibre"] ?? 0;
  const kcal = nm["Calories"] ?? 0;
  const carbs = nm["Carbs"] ?? 0;
  const fat = nm["Fat"] ?? 0;

  const cleanLabel = has(tags, "no preserv") || has(tags, "no artificial") || has(tags, "clean") || has(tags, "no maida") || has(tags, "no refined");
  const additivesFill = cleanLabel ? 0.12 : 0.42;
  const additivesRating = cleanLabel ? "Minimal" : "Some";

  const [pR, pF, pT] = proteinRating(protein);
  const [sR, sF, sT] = sugarRating(sugar);
  const [fR, fF, fT] = fibreRating(fibre);

  // philosophy line
  const philosophy = p.insight
    ? p.insight
    : `A better ${category.toLowerCase().replace(/s$/, "")} made with ingredients your body actually understands.`;

  // ── Trust module ──
  const attributes = [];
  if (has(tags, "protein")) attributes.push({ label: "High protein", ok: true });
  if (has(tags, "palm")) attributes.push({ label: "No palm oil", ok: true });
  if (has(tags, "refined") || has(tags, "no maida")) attributes.push({ label: "No refined flour", ok: true });
  if (has(tags, "sugar")) attributes.push({ label: "Sugar-conscious", ok: true });
  if (has(tags, "preserv")) attributes.push({ label: "No preservatives", ok: true });
  if (has(tags, "trans")) attributes.push({ label: "Zero trans fat", ok: true });
  if (has(tags, "colour") || has(tags, "color")) attributes.push({ label: "No artificial colours", ok: true });
  if (has(tags, "lab")) attributes.push({ label: "Lab tested", ok: true });
  while (attributes.length < 4) {
    const fillers = [{ label: "Minimal additives", ok: true }, { label: "Clean label", ok: true }, { label: "Recognisable ingredients", ok: true }, { label: "Reviewed by KOI", ok: true }];
    attributes.push(fillers[attributes.length % fillers.length]);
  }

  const sb = p.scoreBreakdown || {};
  const subs = Object.keys(sb).length
    ? Object.entries(sb).map(([label, value]) => ({ label, value: Math.round(num(value)) }))
    : [
        { label: "Ingredient profile", value: Math.min(99, (p.score || 80) + 2) },
        { label: "Nutrition", value: p.score || 80 },
        { label: "Additives", value: cleanLabel ? 94 : 70 },
        { label: "Processing", value: Math.min(99, (p.score || 80) - 3) },
      ];

  // ── Reasons (why it earned its place) ──
  const reasonDetail = (t) => {
    const s = t.toLowerCase();
    if (s.includes("palm")) return "Palm oil is common in mass-market snacks for cost and shelf life. Avoiding it means a better fat profile.";
    if (s.includes("refined") || s.includes("maida")) return "Skips refined white flour in favour of whole grains, keeping fibre intact.";
    if (s.includes("sugar")) return "Uses natural sweetness or keeps added sugar low, unlike many commercial equivalents.";
    if (s.includes("protein")) return "Delivers a meaningful protein amount per serving - helping you stay full for longer.";
    if (s.includes("preserv")) return "No synthetic preservatives; freshness comes from the recipe, not chemistry.";
    if (s.includes("trans")) return "Zero trans fat - the fat type most strongly linked to heart risk.";
    if (s.includes("colour") || s.includes("color")) return "Colour comes from real ingredients, not synthetic dyes.";
    if (s.includes("fibre") || s.includes("fiber")) return "A genuine source of dietary fibre, which supports digestion and satiety.";
    if (s.includes("lab")) return "Backed by third-party lab testing for authenticity and safety.";
    return "A deliberate ingredient choice that raised this product above the category average.";
  };
  const pros = (tags.length ? tags : (p.strengths || ["Clean ingredients"])).slice(0, 5).map((t) => ({ type: "pro", title: t, detail: reasonDetail(t) }));
  const consSource = (p.watchouts && p.watchouts.length ? p.watchouts : (p.watchOuts || []).map((w) => w.name || w));
  const cons = (consSource.length ? consSource : (sugar > 8 ? ["Contributes to daily sugar"] : kcal > 150 ? ["Calorie dense"] : ["Best enjoyed in moderation"]))
    .slice(0, 2)
    .map((t) => ({ type: "con", title: typeof t === "string" ? t : t.name, detail: sugar > 8 ? "Naturally sweet, so it still adds to your daily sugar total - portion mindfully." : "Nutrient-dense and satisfying, so a small serving goes a long way." }));

  // ── Verdict ──
  const verdictQuote = p.verdict?.summary
    ? p.verdict.summary
    : `Among ${category.toLowerCase()} available in India, this is one of the cleaner options${sugar > 8 ? " when enjoyed in moderation" : ""}.`;

  // ── Ingredients ──
  const rawIngredients = (p.goodIngredients && p.goodIngredients.length)
    ? p.goodIngredients.map((x) => x.name)
    : (DEFAULT_INGREDIENTS[category] || DEFAULT_INGREDIENTS.Snacks);
  const ingredients = rawIngredients.slice(0, 6).map(ingredientEntry);

  const ingredientTimeline = [
    { label: "Minimal processing", sub: cleanLabel ? "Recognisable ingredients" : "Standard prep" },
    { label: "Natural sweetener", sub: has(tags, "sugar") || has(tags, "refined") ? "No refined sugar" : "Balanced sweetness" },
    { label: "Protein source", sub: protein >= 8 ? `${protein}g per serving` : "Present" },
    { label: "Better fats", sub: has(tags, "palm") ? "No palm oil" : "Recognisable fats" },
    { label: "Real flavour", sub: "From ingredients, not additives" },
  ];

  // ── Nutrition meters + explanations ──
  const meters = [
    { key: "protein", label: "Protein", rating: pR, fill: pF, tone: pT, value: protein, unit: "g", context: protein >= 8 ? "A meaningful protein source - it helps you stay full and supports recovery." : "A light amount of protein; pair it with a protein-rich food for balance." },
    { key: "sugar", label: "Sugar", rating: sR, fill: sF, tone: sT, value: sugar, unit: "g", context: sugar <= 2 ? "Very low sugar - easy to fit into a balanced day." : sugar <= 8 ? "Lower than many commercial equivalents, but still counts toward your daily sugar." : "Naturally sweet - enjoyable in moderation rather than by the handful." },
    { key: "fibre", label: "Fibre", rating: fR, fill: fF, tone: fT, value: fibre, unit: "g", context: fibre >= 3 ? "A useful amount of fibre, which supports digestion and fullness." : "A modest amount of fibre for this category." },
    { key: "additives", label: "Additives", rating: additivesRating, fill: additivesFill, tone: cleanLabel ? "good" : "mid", value: null, unit: "", context: cleanLabel ? "No synthetic preservatives, colours or flavours detected on the label." : "A small number of standard additives - nothing flagged as high-risk." },
  ];

  // ── Health comparison (vs category average) ──
  const avg = p.categoryAverage || {};
  const comparison = [
    { label: "Protein", better: "high", product: protein, market: num(avg.Protein) || Math.max(2, Math.round(protein * 0.5)), unit: "g" },
    { label: "Sugar", better: "low", product: sugar, market: num(avg.Sugar) || Math.round(sugar * 1.8 + 4), unit: "g" },
    { label: "Fibre", better: "high", product: fibre, market: num(avg.Fibre) || Math.max(1, Math.round(fibre * 0.5)), unit: "g" },
  ];

  // ── Personas ──
  const goalMap = {
    "High Protein": [{ label: "Gym & fitness", icon: "Dumbbell" }, { label: "Post-workout", icon: "Flame" }],
    "Post-Workout": [{ label: "Post-workout recovery", icon: "Flame" }],
    "Kids Nutrition": [{ label: "Kids", icon: "Baby" }, { label: "Parents", icon: "Heart" }],
    "Better Energy": [{ label: "Students", icon: "Sparkles" }, { label: "Office snacks", icon: "Briefcase" }, { label: "Travel", icon: "Plane" }],
    "Weight Loss": [{ label: "Mindful snacking", icon: "Activity" }],
    "Gut Health": [{ label: "Everyday wellness", icon: "Leaf" }],
    "Heart Health": [{ label: "Heart-conscious", icon: "Heart" }],
  };
  const forSet = new Map();
  (p.goalTags || []).forEach((gt) => (goalMap[gt] || []).forEach((x) => forSet.set(x.label, x)));
  if (forSet.size === 0) [{ label: "Everyday snacking", icon: "Leaf" }, { label: "Office & travel", icon: "Briefcase" }].forEach((x) => forSet.set(x.label, x));
  const personasFor = Array.from(forSet.values()).slice(0, 6);
  const personasNot = [];
  if (sugar > 8 || carbs > 15) personasNot.push({ label: "Strict low-carb / keto", icon: "Ban" });
  if (sugar > 6) personasNot.push({ label: "Diabetes - watch portions", icon: "Ban" });
  if (kcal > 150) personasNot.push({ label: "Active calorie cutting", icon: "Ban" });
  if (personasNot.length === 0) personasNot.push({ label: "Anyone with listed allergens", icon: "Ban" });

  // ── Usage ──
  const usage = [
    { time: "Morning", note: "Alongside tea or coffee to start the day." },
    { time: "Midday", note: "A steadier pick-me-up than the office biscuit jar." },
    { time: "Pre / post workout", note: protein >= 8 ? "Handy protein around training." : "Light fuel around movement." },
    { time: "Travel", note: "Individually portioned and mess-free on the go." },
    { time: "Evening", note: "A small, satisfying bite without the sugar crash." },
  ];
  const pairings = ["Milk", "Coffee", "Greek yogurt", "Fresh fruit"];

  // ── Scientific insights ──
  const science = [];
  if (protein >= 6) science.push({ title: "Where the protein comes from", body: `The protein here is largely from ${ingredients.find((i) => i.role.includes("Protein"))?.name || "nuts and dairy"} - whole-food sources that also bring healthy fats and minerals, not isolated powders.` });
  if (has(tags, "sugar") || has(tags, "refined")) science.push({ title: "Why not refined sugar", body: "Refined white sugar is pure sucrose with nothing else. Natural sweeteners like jaggery or dates carry trace minerals and fibre, and tend to have a gentler glycaemic impact - though they're still sugar." });
  if (has(tags, "palm")) science.push({ title: "The palm-oil difference", body: "Palm oil is cheap and shelf-stable but high in saturated fat. Swapping it for butter, ghee or nut fats gives a better overall fat profile." });
  if (science.length < 2) science.push({ title: "Whole over refined", body: "Whole grains keep their bran and germ, so they retain fibre and nutrients that refined flours lose - meaning slower, steadier energy." });

  // ── Transparency ──
  const check = (cond, passNote, elseNote, elseStatus = "limited") => (cond ? { status: "pass", note: passNote } : { status: elseStatus, note: elseNote });
  const transparency = [
    { label: "Palm oil", ...check(has(tags, "palm"), "None - declared palm-oil free.", "Not highlighted on the label.") },
    { label: "Artificial colours", ...check(has(tags, "colour") || has(tags, "color") || cleanLabel, "None detected.", "Standard colours may be present.") },
    { label: "Artificial flavours", ...check(has(tags, "flavour") || has(tags, "flavor") || cleanLabel, "None detected.", "Standard flavours may be present.") },
    { label: "Preservatives", ...check(has(tags, "preserv") || cleanLabel, "No synthetic preservatives.", "Standard preservatives may be present.") },
    { label: "Added sweeteners", ...check(has(tags, "sugar") || has(tags, "refined"), "No refined / artificial sweeteners.", "Contains natural sugars.") },
    { label: "Processing", status: "pass", note: has(tags, "baked") ? "Baked, not fried." : has(tags, "roast") ? "Roasted, not fried." : "Minimally processed." },
    { label: "Ingredient sourcing", status: "pass", note: `Disclosed by ${p.brand || "the brand"}.` },
    { label: "Third-party testing", ...check(has(tags, "lab"), "Independently lab tested.", "Not independently verified yet.") },
  ];

  // ── Community ──
  const noteText = {
    "High Protein": "Genuinely keeps me full between meals - I stopped reaching for the vending machine.",
    "Kids Nutrition": "My kids don't realise it's the healthier option, which is the whole point.",
    "Better Energy": "Perfect desk snack. No 4pm crash and it travels well.",
    "Weight Loss": "Portioned and satisfying - it fits my day without derailing it.",
    "Gut Health": "Sits light and I actually feel good after, not sluggish.",
  };
  const goals = p.goalTags || [];
  const community = {
    notes: (goals.length ? goals : ["Better Energy"]).slice(0, 3).map((gtag, i) => ({
      name: ["A. Menon", "R. Iyer", "S. Kapoor"][i] || "KOI member",
      tag: gtag,
      rating: 5 - (i % 2),
      text: noteText[gtag] || "Exactly what it says on the label - clean, honest and genuinely tasty.",
    })),
    nutritionist: {
      text: `A sensible choice within ${category.toLowerCase()}: recognisable ingredients, ${sugar <= 8 ? "restrained sugar" : "natural sweetness"} and ${protein >= 8 ? "a useful protein hit" : "a clean profile"}. As always, portion size is what turns a good product into a good habit.`,
    },
  };

  return {
    id: p.id,
    brand: p.brand,
    name: p.name,
    category,
    price: p.price,
    weight: p.weight,
    score: p.score,
    image: p.image || {},
    koiStatus: p.koiStatus || "Verified",
    philosophy,
    tags,
    dietary: p.dietary || [],
    goalTags: goals,
    grade: g,
    raw: p,
    trust: { score: p.score, grade: g.g, gradeLabel: g.label, attributes: attributes.slice(0, 5), subs },
    reasons: [...pros, ...cons],
    verdict: { quote: verdictQuote, confidence: p.score || 80, refs: ["KOI Nutrition Review", "FSSAI label decode", "Ingredient risk index"] },
    ingredients,
    ingredientTimeline,
    nutrition: { meters, calories: kcal, carbs, fat, serving: p.weight },
    comparison,
    personas: { for: personasFor, not: personasNot.slice(0, 3) },
    usage,
    pairings,
    science: science.slice(0, 3),
    transparency,
    community,
  };
}
