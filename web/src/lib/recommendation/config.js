// ============================================================================
// KOI Recommendation Engine (KRE) — Configuration
// The ONLY place weights, thresholds and mappings live. Business logic reads
// from here; changing behaviour = editing config, never code. Keys are shared
// with the DB catalog (supabase/migrations/00007_user_preferences.sql) and the
// onboarding UI so everything lines up deterministically.
// ============================================================================

// ── Supply availability ──
// Tri-state, because "we have not checked" is a real and common answer and is
// NOT the same as "in stock". Treating absence of evidence as evidence of
// stock is the availability version of inventing a nutrition value.
//
// `unknown` is the default and must be CONSTRUCTED, never inferred. It is not
// a reason to hide a screened product - only a reason to make no claim about
// its availability, price or delivery.
//
// Shared with lib/availability.js (presentation) and, when the supply tier
// lands, a CHECK constraint in the migration. Change here, change all three.
export const AVAILABILITY = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
});

// ── Scoring weights (max additive = 100) ──
export const WEIGHTS = Object.freeze({
  goalMatch: 35,
  macroMatch: 25,
  preferredFood: 15,
  mealMatch: 10,
  budgetMatch: 5,
  popularity: 5,
  trust: 5,
});

// ── Penalties (documented, deterministic) ──
export const PENALTIES = Object.freeze({
  avoidedIngredient: -100, // a soft-avoided attribute is present → effectively excluded
  // The shopper avoids something KOI cannot check on this product.
  //
  // Two avoid flags are derived from macros rather than ingredient keywords —
  // refined_sugar from sugars_g, high_sodium from sodium_mg — so where that
  // figure is undeclared, the ABSENCE of the flag proves nothing. Scoring such
  // a product as clean is how a missing number became a clean bill of health;
  // scoring it as -100 would assert the flag is present, which is the same
  // error pointed the other way.
  //
  // So it sits between: enough that a product declaring a clean figure
  // outranks an identical one that declares nothing, never enough to exclude a
  // screened product over a gap in KOI's own data. Sized against
  // proteinBelowThreshold (-15), a comparable "this is a real mark against it"
  // signal, rather than against the exclusion.
  unverifiableAvoid: -15,
  lowStock: -10,
  highSugarForFatLoss: -20,
  proteinBelowThreshold: -15,
  highSodium: -10,
});

// The value a scoring component takes where KOI holds no evidence either way.
//
// Not 0 — that punishes a screened product for a gap in KOI's own data. Not 1 —
// that lets a missing nutrition panel outrank a good one, which is how this
// engine used to behave when an undeclared macro was read as zero. Components
// shrink toward this in proportion to how much of their input is undeclared,
// so a fully declared good product always outranks a half-declared one, and
// uncertainty pulls a score toward the middle from whichever side it started.
export const UNKNOWN_FIT = 0.5;

// ── Nutrition thresholds (grams unless noted) ──
//
// These are compared against PER-100 figures, not per-serving ones - this
// comment used to say the opposite and it misled every reader of it.
// `sku_nutrition` declares `per_100g` for almost every live row, resolveIntent
// pins numeric search to LIMIT_BASIS = 'per_100g', and shelves.js and the KRE
// all read that same column. `proteinPerServingFloor` is the sole exception and
// says so in its name.
export const THRESHOLDS = Object.freeze({
  proteinHigh: 12, // per 100 g/ml: dense enough for the claim to mean something
  proteinMin: 6, // below this, protein-focused goals penalise
  // Density alone is not a claim. A per-100 g figure says nothing about what a
  // shopper actually eats, which is how "High Protein" reached a 0.1 g serving
  // of saffron - 11.4 g per 100 g, about 0.01 g per pinch. A claim has to
  // survive contact with the declared serving too. 5 g is the FDA "good source
  // of protein" bar (10% DV), applied per serving rather than per 100 g.
  proteinPerServingFloor: 5,
  // sugarLow and fibreHigh are FSSAI Schedule I's figures for solids, and they
  // double as scoring scales. Whether a product may be CALLED low in sugar or
  // high in fibre is decided only by lib/nutrition/claims.js, which also knows
  // a drink's low-sugar limit is 2.5 g per 100 ml and fibre's per-100-kcal route.
  sugarLow: 5,
  sugarHigh: 10,
  fibreHigh: 6,
  kcalLow: 120,
  kcalHigh: 170,
  sodiumHighMg: 400,
  // inclusion cut-off: anything below this raw score is not recommended
  minInclusionScore: 20,
});

// ── Budget bands (₹ price of the product) ──
export const BUDGET_RANGES = Object.freeze({
  low: [0, 200],
  medium: [200, 500],
  high: [500, Infinity],
  any: [0, Infinity],
});

// ── Goal profiles: per-goal metric directions used to compute "goal fit" ──
// direction: 'high' (more is better) | 'low' (less is better) | 'mid'
export const GOAL_PROFILES = Object.freeze({
  fatloss: { label: "Fat loss", metrics: { protein: "high", fibre: "high", kcal: "low", sugar: "low", fat: "low" } },
  muscle: { label: "Muscle gain", metrics: { protein: "high", kcal: "high", fat: "mid" } },
  weight_gain: { label: "Weight gain", metrics: { kcal: "high", protein: "high", fat: "high" } },
  maintenance: { label: "Maintenance", metrics: { protein: "mid", sugar: "low", fibre: "high" } },
  wellness: { label: "General wellness", metrics: { sugar: "low", fibre: "high", protein: "mid" } },
  high_protein: { label: "High protein", metrics: { protein: "high" } },
  low_sugar: { label: "Low sugar", metrics: { sugar: "low", fibre: "high" } },
  heart_health: { label: "Heart health", metrics: { fibre: "high", fat: "low", sugar: "low" } },
  gut_health: { label: "Gut health", metrics: { fibre: "high", sugar: "low" } },
});

// ── Preference catalogs (shared with onboarding UI) ──
export const FOODS_LOVE = [
  { key: "chicken", label: "Chicken", emoji: "🍗", keywords: ["chicken"] },
  { key: "eggs", label: "Eggs", emoji: "🥚", keywords: ["egg"] },
  { key: "fish", label: "Fish", emoji: "🐟", keywords: ["fish", "tuna", "salmon"] },
  { key: "paneer", label: "Paneer", emoji: "🧀", keywords: ["paneer"] },
  { key: "tofu", label: "Tofu", emoji: "🫛", keywords: ["tofu", "soy"] },
  { key: "greek_yogurt", label: "Greek Yogurt", emoji: "🥛", keywords: ["yogurt", "curd", "greek"] },
  { key: "oats", label: "Oats", emoji: "🌾", keywords: ["oat"] },
  { key: "rice", label: "Rice", emoji: "🍚", keywords: ["rice"] },
  { key: "millets", label: "Millets", emoji: "🌾", keywords: ["millet", "ragi", "jowar", "bajra", "chivda"] },
  { key: "nuts", label: "Nuts", emoji: "🥜", keywords: ["almond", "cashew", "walnut", "nut", "dry fruit"] },
  { key: "seeds", label: "Seeds", emoji: "🌻", keywords: ["seed"] },
  { key: "peanut_butter", label: "Peanut Butter", emoji: "🥜", keywords: ["peanut butter", "peanut"] },
  { key: "fruits", label: "Fruits", emoji: "🍎", keywords: ["fruit", "mango", "berry", "apple"] },
  { key: "dark_chocolate", label: "Dark Chocolate", emoji: "🍫", keywords: ["chocolate", "cocoa", "choco", "cacao"] },
  { key: "protein_bars", label: "Protein Bars", emoji: "🍫", keywords: ["protein bar", "bar", "crispies"] },
  { key: "protein_powder", label: "Protein Powder", emoji: "💪", keywords: ["protein powder", "whey", "isolate"] },
  { key: "coffee", label: "Coffee", emoji: "☕", keywords: ["coffee"] },
  { key: "tea", label: "Tea", emoji: "🍵", keywords: ["tea"] },
  { key: "cookies", label: "Cookies", emoji: "🍪", keywords: ["cookie", "biscuit"] },
  { key: "granola", label: "Granola", emoji: "🥣", keywords: ["granola"] },
  { key: "muesli", label: "Muesli", emoji: "🥣", keywords: ["muesli"] },
  { key: "honey", label: "Honey", emoji: "🍯", keywords: ["honey"] },
  { key: "smoothies", label: "Smoothies", emoji: "🥤", keywords: ["smoothie", "shake"] },
  // Key unchanged (food_item has it); the label was KOI calling a category
  // "healthy", which the claims regulations do not allow.
  { key: "healthy_desserts", label: "Desserts", emoji: "🍮", keywords: ["dessert", "laddu", "halwa"] },
];

// avoid key → { flag, mode, kind, label }. hard = eligibility removal, soft = penalty.
//
// `kind` mirrors `avoided_item.kind` in the database, and it is what decides
// whether an absence can be asserted. An `allergen` is a promise about what is
// NOT in the food, which only a complete ingredient list a person has checked
// can keep — a partial list, a product name or a tag cannot. `ingredient` and
// `attribute` are preferences and are scored on the evidence there is.
//
// Adding a key here needs a matching `avoided_item` row (user_avoided_food has a
// foreign key to it) — see migration 00021 for tree nuts.
export const FOODS_AVOID = [
  { key: "peanuts", label: "Peanuts", emoji: "🥜", flag: "peanut", kind: "allergen", mode: "hard" },
  { key: "tree_nuts", label: "Tree Nuts", emoji: "🌰", flag: "tree_nut", kind: "allergen", mode: "hard" },
  { key: "soy", label: "Soy", emoji: "🫛", flag: "soy", kind: "allergen", mode: "hard" },
  { key: "gluten", label: "Gluten", emoji: "🌾", flag: "gluten", kind: "allergen", mode: "hard" },
  { key: "milk", label: "Milk", emoji: "🥛", flag: "dairy", kind: "allergen", mode: "hard" },
  { key: "lactose", label: "Lactose", emoji: "🥛", flag: "dairy", kind: "allergen", mode: "hard" },
  { key: "eggs", label: "Eggs", emoji: "🥚", flag: "egg", kind: "allergen", mode: "hard" },
  { key: "fish", label: "Fish", emoji: "🐟", flag: "fish", kind: "allergen", mode: "hard" },
  { key: "shellfish", label: "Shellfish", emoji: "🦐", flag: "shellfish", kind: "allergen", mode: "hard" },
  // `red_meat`, not `meat`: the broader flag removed chicken for a shopper who
  // only avoids red meat. Diets still exclude all `meat` (DIET_EXCLUSIONS).
  { key: "red_meat", label: "Red Meat", emoji: "🥩", flag: "red_meat", kind: "ingredient", mode: "hard" },
  { key: "caffeine", label: "Caffeine", emoji: "☕", flag: "caffeine", kind: "ingredient", mode: "hard" },
  // The allium flag (00056) reached only the fasting diet; "no onion-garlic"
  // is its own rule for many households, Jain or not (00066).
  { key: "onion_garlic", label: "Onion & garlic", emoji: "🧅", flag: "allium", kind: "ingredient", mode: "hard" },
  { key: "artificial_sweeteners", label: "Artificial Sweeteners", emoji: "🧪", flag: "artificial_sweetener", kind: "attribute", mode: "soft" },
  { key: "palm_oil", label: "Palm Oil", emoji: "🌴", flag: "palm_oil", kind: "ingredient", mode: "soft" },
  { key: "refined_sugar", label: "Refined Sugar", emoji: "🍬", flag: "refined_sugar", kind: "attribute", mode: "soft" },
  { key: "high_sodium", label: "High Sodium", emoji: "🧂", flag: "high_sodium", kind: "attribute", mode: "soft" },
  { key: "preservatives", label: "Preservatives", emoji: "🧪", flag: "preservatives", kind: "attribute", mode: "soft" },
  { key: "artificial_colours", label: "Artificial Colours", emoji: "🎨", flag: "artificial_colour", kind: "attribute", mode: "soft" },
  { key: "artificial_flavours", label: "Artificial Flavours", emoji: "🧪", flag: "artificial_flavour", kind: "attribute", mode: "soft" },
  { key: "spicy", label: "Spicy Food", emoji: "🌶️", flag: "spicy", kind: "attribute", mode: "soft" },
];

export const DIET_TYPES = [
  { key: "vegetarian", label: "Vegetarian", emoji: "🥗" },
  { key: "eggetarian", label: "Eggetarian", emoji: "🍳" },
  { key: "vegan", label: "Vegan", emoji: "🌱" },
  { key: "jain", label: "Jain", emoji: "🙏" },
  { key: "non_vegetarian", label: "Non-Vegetarian", emoji: "🍗" },
  { key: "pescatarian", label: "Pescatarian", emoji: "🐟" },
  // A day, not a way of living: offered on the plan page as a diet for this
  // plan only, never as a saved profile (00056).
  { key: "fasting", label: "Fasting (vrat)", emoji: "🕉️", forOnePlanOnly: true },
];

export const MEALS = [
  { key: "breakfast", label: "Breakfast", emoji: "🌅" },
  { key: "lunch", label: "Lunch", emoji: "🍽️" },
  { key: "dinner", label: "Dinner", emoji: "🌙" },
  { key: "snacks", label: "Snacks", emoji: "🥨" },
  { key: "pre_workout", label: "Pre Workout", emoji: "⚡" },
  { key: "post_workout", label: "Post Workout", emoji: "💪" },
  { key: "late_night", label: "Late Night", emoji: "🌚" },
  { key: "office_snacks", label: "Office Snacks", emoji: "💼" },
];

export const BUDGETS = [
  { key: "low", label: "₹", hint: "Budget-friendly" },
  { key: "medium", label: "₹₹", hint: "Mid-range" },
  { key: "high", label: "₹₹₹", hint: "Premium" },
  { key: "any", label: "Any", hint: "No preference" },
];

export const COOKING = [
  { key: "ready_to_eat", label: "Ready to Eat", emoji: "✅" },
  { key: "instant", label: "Instant", emoji: "⚡" },
  { key: "needs_cooking", label: "Needs Cooking", emoji: "🍳" },
  { key: "any", label: "No Preference", emoji: "🤷" },
];

// ── Flags a product raises ──
// Not here any more. Allergens (Phase 2.1), additive filters (2.2) and meat,
// red meat, honey, caffeine, spicy, palm oil and root vegetables (2.4) all come
// from the ingredient graph, compiled into lib/food/allergens.js, which matches
// whole names instead of substrings. What a Jain diet excludes as root_veg,
// ginger included, is recorded on the ingredients in food.ingredient_flag.

// "Free-from" tag signals that CLEAR a flag even if a keyword appears.
export const CLEAR_TAGS = Object.freeze({
  palm_oil: ["no palm oil"],
  refined_sugar: ["no refined sugar", "no added sugar", "zero added sugar", "no refined"],
  gluten: ["gluten free", "gluten-free"],
  preservatives: ["no preservatives", "no preservative"],
  artificial_colour: ["no artificial colour", "no artificial color", "no artificial colours"],
  artificial_flavour: ["no artificial flavour", "no artificial flavor"],
});

// dietType → contains-flags to exclude
//
// Jain used to be identical to vegetarian, which recommended potato chips and
// honey to a Jain shopper. Jainism excludes both: root vegetables, and honey.
export const DIET_EXCLUSIONS = Object.freeze({
  vegan: ["dairy", "egg", "meat", "fish", "shellfish", "honey"],
  vegetarian: ["meat", "fish", "shellfish", "egg"],
  eggetarian: ["meat", "fish", "shellfish"],
  jain: ["meat", "fish", "shellfish", "egg", "honey", "root_veg"],
  // A fasting (vrat/phalahar) day, chosen for one plan rather than kept on a
  // profile. Not "eat less": a different list of permitted foods. Grains,
  // pulses, common salt, onion and garlic are out — and buckwheat, amaranth,
  // water chestnut, potato, dairy, fruit, nuts and rock salt are in, which is
  // why allium is a flag of its own and not folded into root_veg (00056).
  fasting: ["grain", "pulse", "common_salt", "allium", "meat", "fish", "shellfish", "egg"],
  pescatarian: ["meat"],
  non_vegetarian: [],
});

// Diets that can only be confirmed from a complete ingredient list.
//
// Vegetarian is not here, and that is deliberate: FSSAI makes the green/brown
// veg mark mandatory on every pack, so vegetarian status is declared by law on
// the label itself. Nothing marks a pack vegan or Jain. "Spices" on a partial
// list can hide garlic, and "milk solids" can be missing from one entirely, so
// without a verified list — or the brand's own declaration — KOI says the diet
// is not verified rather than implying it fits.
export const LABEL_VERIFIED_DIETS = Object.freeze(["vegan", "jain", "fasting"]);

// Which meal occasions a product serves is no longer a table here: since
// Phase 2.4 it comes from the product's category (food.category_occasion,
// lib/food/taxonomy.js#servesOccasion).
