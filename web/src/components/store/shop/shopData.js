// ============================================================================
// KOI SHOP - Data & facets for the editorial discovery experience.
// The real catalogue still flows through fetchAllProducts(); this provides the
// universal-search facets and a full-shape fallback so the shop is never empty.
// ============================================================================

const clamp = (v) => Math.max(0, Math.min(99, v));

// Build a product in the exact shape the shop + overlays expect.
function mk({ id, brand, name, category, img, price, weight, score, goals, dietary, tags, insight, recommended = true, n }) {
  return {
    id,
    brand,
    name,
    category,
    goalTags: goals,
    dietary,
    image: {
      hero: `/media/${img}-hero.jpg`,
      label: `/media/${img}-label.jpg`,
      lifestyle: `/media/${img}-lifestyle.jpg`,
    },
    price,
    weight,
    score,
    tags,
    insight,
    recommended,
    scoreBreakdown: {
      "Protein Quality": clamp(score - 4),
      "Sugar Content": clamp(score + 3),
      Additives: clamp(score + 2),
      "Ingredient Quality": clamp(score),
    },
    betterThanPercentage: Math.min(99, score + 4),
    categoryAverage: { Protein: "9g", Sugar: "11g", Fibre: "2g", Additives: "Medium" },
    strengths: tags,
    watchouts: ["Enjoy as part of a balanced day"],
    compareInsight: "Cleaner ingredient profile than the category average.",
    nutrition: [
      { label: "Calories", value: n.kcal, unit: "kcal", icon: "Flame" },
      { label: "Protein", value: n.protein, unit: "g", icon: "Dumbbell" },
      { label: "Carbs", value: n.carbs, unit: "g", icon: "Zap" },
      { label: "Sugar", value: n.sugar, unit: "g", icon: "CircleDot" },
      { label: "Fat", value: n.fat, unit: "g", icon: "Heart" },
      { label: "Fibre", value: n.fibre, unit: "g", icon: "Leaf" },
    ],
  };
}

export const FALLBACK_PRODUCTS = [
  mk({ id: "os-dfm", brand: "Open Secret", name: "Un-Junked Daily Dry Fruit Mix", category: "Snacks", img: "os-dfm", price: 649, weight: "250 g", score: 95, goals: ["High Protein", "Weight Loss", "Gut Health"], dietary: ["Vegan", "Gluten Free"], tags: ["High protein", "Zero added sugar", "Full of fibre"], insight: "Six nuts and seeds, nothing else added.", n: { kcal: 168, protein: 21, carbs: 12, sugar: 0, fat: 9, fibre: 9 } }),
  mk({ id: "troovy-butter", brand: "Troovy", name: "The Healthy Butter Cookies", category: "Breakfast", img: "troovy-butter", price: 149, weight: "60 g", score: 92, goals: ["High Protein", "Kids Nutrition"], dietary: ["Vegetarian"], tags: ["No refined sugar", "No palm oil", "No maida"], insight: "Buttery, protein-rich, and honestly good.", n: { kcal: 118, protein: 6, carbs: 14, sugar: 0, fat: 5, fibre: 3 } }),
  mk({ id: "os-ca", brand: "Open Secret", name: "Chocolate Coated Almonds", category: "Snacks", img: "os-ca", price: 299, weight: "150 g", score: 91, goals: ["High Protein", "Post-Workout"], dietary: ["Vegetarian", "Gluten Free"], tags: ["Real chocolate", "No preservatives", "High protein"], insight: "The snack that reads its own label.", n: { kcal: 176, protein: 12, carbs: 15, sugar: 6, fat: 11, fibre: 5 } }),
  mk({ id: "kisaansay-saffron", brand: "KisaanSay", name: "Himalayan Mongra Saffron", category: "Pantry", img: "kisaansay-saffron", price: 899, weight: "2 g", score: 93, goals: ["Heart Health"], dietary: ["Vegan"], tags: ["100% pure", "ISO graded", "Lab certified"], insight: "Hand-picked threads, grade A1.", recommended: false, n: { kcal: 6, protein: 0, carbs: 1, sugar: 0, fat: 0, fibre: 0 } }),
  mk({ id: "kisaansay-honey", brand: "KisaanSay", name: "Wild Forest Raw Honey", category: "Pantry", img: "kisaansay-honey", price: 449, weight: "500 g", score: 90, goals: ["Better Energy", "Heart Health"], dietary: ["Vegetarian"], tags: ["Raw & unprocessed", "Single origin", "Lab tested"], insight: "Unheated, unfiltered, single origin.", n: { kcal: 64, protein: 0, carbs: 17, sugar: 17, fat: 0, fibre: 0 } }),
  mk({ id: "troovy-chocolate", brand: "Troovy", name: "The Healthy Choco Cookies", category: "Breakfast", img: "troovy-chocolate", price: 179, weight: "60 g", score: 89, goals: ["Kids Nutrition", "Low Sugar"], dietary: ["Vegetarian"], tags: ["No refined sugar", "Real cocoa", "No palm oil"], insight: "Cocoa-rich, guilt-free by design.", n: { kcal: 124, protein: 5, carbs: 15, sugar: 1, fat: 5, fibre: 3 } }),
  mk({ id: "skc-madras", brand: "Sweet Karam Coffee", name: "Madras Mixture", category: "Snacks", img: "skc-madras", price: 199, weight: "180 g", score: 88, goals: ["Better Energy"], dietary: ["Vegan"], tags: ["Zero trans fat", "No artificial colours", "Source of fibre"], insight: "A symphony of the South, slow-made.", n: { kcal: 142, protein: 8, carbs: 18, sugar: 2, fat: 7, fibre: 4 } }),
  mk({ id: "mn-chivda", brand: "Mama Nourish", name: "Roasted Millet Chivda", category: "Snacks", img: "mn-chivda", price: 189, weight: "200 g", score: 88, goals: ["Better Energy", "Weight Loss"], dietary: ["Vegan"], tags: ["Roasted not fried", "Millet based", "No maida"], insight: "Air-roasted millets, never deep-fried.", n: { kcal: 132, protein: 7, carbs: 19, sugar: 1, fat: 4, fibre: 5 } }),
  mk({ id: "thb-crispies", brand: "The Healthy Binge", name: "Protein Crispies", category: "Snacks", img: "thb-crispies", price: 159, weight: "40 g", score: 87, goals: ["Low Sugar", "Weight Loss", "Post-Workout"], dietary: ["Vegan", "Gluten Free"], tags: ["Baked", "High protein", "Low calorie"], insight: "A crunch that counts its macros.", recommended: false, n: { kcal: 96, protein: 10, carbs: 11, sugar: 2, fat: 2, fibre: 3 } }),
  mk({ id: "skc-ragi", brand: "Sweet Karam Coffee", name: "Ragi Chocolate Coffee", category: "Beverages", img: "skc-ragi", price: 249, weight: "200 g", score: 87, goals: ["Better Energy", "Gut Health"], dietary: ["Vegan"], tags: ["Millet based", "No refined sugar", "Instant"], insight: "Ragi + cocoa, an easier morning.", recommended: false, n: { kcal: 110, protein: 4, carbs: 20, sugar: 5, fat: 2, fibre: 4 } }),
];

// Rotating placeholders for the command search input.
export const PLACEHOLDERS = [
  "Search products, goals, ingredients…",
  'Try "high protein snacks"',
  '"No palm oil peanut butter"',
  '"Best products for gut health"',
  '"Snacks under ₹300"',
  '"What should I eat after a workout?"',
];

export const SORTS = ["Recommended", "Highest KOI Score", "Price Low to High", "Newest"];

export const GOALS = [
  { name: "High Protein", icon: "Dumbbell", blurb: "20g+ per serving" },
  { name: "Low Sugar", icon: "ShieldCheck", blurb: "Under 5g added" },
  { name: "Gut Health", icon: "Sprout", blurb: "Fibre & ferments" },
  { name: "Better Energy", icon: "Zap", blurb: "Slow-release fuel" },
  { name: "Weight Loss", icon: "Activity", blurb: "Smart calories" },
  { name: "Kids Nutrition", icon: "Baby", blurb: "Parent-approved" },
  { name: "Heart Health", icon: "Heart", blurb: "Good fats only" },
  { name: "Post-Workout", icon: "Flame", blurb: "Recovery picks" },
];

export const INGREDIENTS = [
  { name: "Oats", note: "Beta-glucan fibre" },
  { name: "Dates", note: "Natural sweetness" },
  { name: "Almonds", note: "Protein & vitamin E" },
  { name: "Millets", note: "Low-GI grains" },
  { name: "Jaggery", note: "Unrefined sugar" },
  { name: "Peanut", note: "Plant protein" },
  { name: "A2 Ghee", note: "Clean fat" },
  { name: "Cocoa", note: "Antioxidants" },
];

export const EDITORIAL = [
  { title: "How KOI scores every product", tag: "Method" },
  { title: 'The truth about "no added sugar"', tag: "Labels" },
  { title: "Best healthy snacks under ₹300", tag: "Guide" },
  { title: "Palm oil: why we always flag it", tag: "Ingredients" },
];

export const TRENDING = [
  "High Protein", "Sugar Free", "No Palm Oil", "Breakfast",
  "Kids", "Gym", "Gut Health", "Weight Loss", "Diabetes Friendly",
];

export const DIETARY_OPTIONS = ["Vegan", "Vegetarian", "Gluten Free", "Keto", "No Added Sugar"];
export const PRICE_OPTIONS = ["All", "Under ₹200", "₹200–500", "₹500+"];
export const SCORE_OPTIONS = ["All", "90+", "80+", "70+"];
