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
  lowStock: -10,
  highSugarForFatLoss: -20,
  proteinBelowThreshold: -15,
  highSodium: -10,
});

// ── Nutrition thresholds (per serving, grams unless noted) ──
export const THRESHOLDS = Object.freeze({
  proteinHigh: 12,
  proteinMin: 6, // below this, protein-focused goals penalise
  sugarLow: 4,
  sugarHigh: 10,
  fibreHigh: 5,
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
  { key: "healthy_desserts", label: "Healthy Desserts", emoji: "🍮", keywords: ["dessert", "laddu", "halwa"] },
];

// avoid key → { flag, mode, label }. hard = eligibility removal, soft = penalty.
export const FOODS_AVOID = [
  { key: "peanuts", label: "Peanuts", emoji: "🥜", flag: "peanut", mode: "hard" },
  { key: "soy", label: "Soy", emoji: "🫛", flag: "soy", mode: "hard" },
  { key: "gluten", label: "Gluten", emoji: "🌾", flag: "gluten", mode: "hard" },
  { key: "milk", label: "Milk", emoji: "🥛", flag: "dairy", mode: "hard" },
  { key: "lactose", label: "Lactose", emoji: "🥛", flag: "dairy", mode: "hard" },
  { key: "eggs", label: "Eggs", emoji: "🥚", flag: "egg", mode: "hard" },
  { key: "fish", label: "Fish", emoji: "🐟", flag: "fish", mode: "hard" },
  { key: "shellfish", label: "Shellfish", emoji: "🦐", flag: "shellfish", mode: "hard" },
  { key: "red_meat", label: "Red Meat", emoji: "🥩", flag: "meat", mode: "hard" },
  { key: "caffeine", label: "Caffeine", emoji: "☕", flag: "caffeine", mode: "hard" },
  { key: "artificial_sweeteners", label: "Artificial Sweeteners", emoji: "🧪", flag: "artificial_sweetener", mode: "soft" },
  { key: "palm_oil", label: "Palm Oil", emoji: "🌴", flag: "palm_oil", mode: "soft" },
  { key: "refined_sugar", label: "Refined Sugar", emoji: "🍬", flag: "refined_sugar", mode: "soft" },
  { key: "high_sodium", label: "High Sodium", emoji: "🧂", flag: "high_sodium", mode: "soft" },
  { key: "preservatives", label: "Preservatives", emoji: "🧪", flag: "preservatives", mode: "soft" },
  { key: "artificial_colours", label: "Artificial Colours", emoji: "🎨", flag: "artificial_colour", mode: "soft" },
  { key: "artificial_flavours", label: "Artificial Flavours", emoji: "🧪", flag: "artificial_flavour", mode: "soft" },
  { key: "spicy", label: "Spicy Food", emoji: "🌶️", flag: "spicy", mode: "soft" },
];

export const DIET_TYPES = [
  { key: "vegetarian", label: "Vegetarian", emoji: "🥗" },
  { key: "eggetarian", label: "Eggetarian", emoji: "🍳" },
  { key: "vegan", label: "Vegan", emoji: "🌱" },
  { key: "jain", label: "Jain", emoji: "🙏" },
  { key: "non_vegetarian", label: "Non-Vegetarian", emoji: "🍗" },
  { key: "pescatarian", label: "Pescatarian", emoji: "🐟" },
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

// ── Ingredient flag inference: flag → keyword signals (name/tags/ingredients) ──
export const CONTAINS_KEYWORDS = Object.freeze({
  dairy: ["milk", "butter", "ghee", "yogurt", "curd", "paneer", "cheese", "khoya", "cream", "whey"],
  egg: ["egg"],
  meat: ["chicken", "mutton", "beef", "pork", "meat", "lamb"],
  fish: ["fish", "tuna", "salmon", "anchovy"],
  shellfish: ["prawn", "shrimp", "crab", "lobster", "shellfish"],
  peanut: ["peanut", "groundnut"],
  tree_nut: ["almond", "cashew", "walnut", "hazelnut", "pistachio"],
  soy: ["soy", "soya", "tofu"],
  gluten: ["wheat", "maida", "bread", "pasta", "gluten", "barley", "rava", "suji"],
  honey: ["honey"],
  caffeine: ["coffee", "tea", "caffeine", "espresso"],
  spicy: ["madras", "spicy", "chilli", "chili", "masala", "mixture", "chivda", "peri"],
  palm_oil: ["palm oil", "palmolein"],
});

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
export const DIET_EXCLUSIONS = Object.freeze({
  vegan: ["dairy", "egg", "meat", "fish", "shellfish", "honey"],
  vegetarian: ["meat", "fish", "shellfish", "egg"],
  eggetarian: ["meat", "fish", "shellfish"],
  jain: ["meat", "fish", "shellfish", "egg"],
  pescatarian: ["meat"],
  non_vegetarian: [],
});

// meal → matching categories / keywords
export const MEAL_MATCH = Object.freeze({
  breakfast: { categories: ["Breakfast"], keywords: ["oats", "granola", "muesli", "cookie", "honey", "coffee", "cereal"] },
  lunch: { categories: ["Pantry", "Meals"], keywords: ["rice", "meal", "mixture"] },
  dinner: { categories: ["Pantry", "Meals"], keywords: ["rice", "meal"] },
  snacks: { categories: ["Snacks"], keywords: ["snack", "chivda", "mixture", "cookie", "nut", "crispies", "almond", "bar"] },
  office_snacks: { categories: ["Snacks"], keywords: ["snack", "nut", "cookie", "bar", "crispies"] },
  late_night: { categories: ["Snacks"], keywords: ["cookie", "chocolate", "nut"] },
  pre_workout: { categories: ["Beverages"], keywords: ["coffee", "energy"] },
  post_workout: { categories: ["Snacks"], keywords: ["protein", "almond", "nut", "bar", "crispies"] },
});
