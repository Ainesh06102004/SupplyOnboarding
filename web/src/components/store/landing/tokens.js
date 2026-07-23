// ============================================================================
// KOI EDITORIAL LANDING - Design Tokens + Curated Content
// ----------------------------------------------------------------------------
// Single source of truth for the redesigned /store landing page.
// Palette: KOI green owns the identity; accents add energy, never a rainbow.
// ============================================================================

export const C = {
  // Greens (dominant identity)
  forest: "#083D2D",
  green: "#0C6B4C",
  emerald: "#16A06E",
  mint: "#EAF8F0",
  // Neutrals
  offwhite: "#F9F8F4",
  cream: "#F5F1E8",
  ink: "#101412",
  // Accents (sparingly)
  orange: "#F36A1D",
  tangerine: "#FF8B42",
  butter: "#F3F58A",
  lime: "#DDF247",
};

export const HEADING = { fontFamily: "var(--font-koi-heading)" };
export const BODY = { fontFamily: "var(--font-koi-body)" };

// Score → color ramp (reused by rings and meters)
export function scoreColor(score) {
  if (score >= 90) return C.forest;
  if (score >= 80) return C.emerald;
  return C.tangerine;
}

// ----------------------------------------------------------------------------
// Curated catalogue - mapped to real product renders in /public/media.
// Shape stays cart-compatible (id, name, brand, price, weight, score, image).
// ----------------------------------------------------------------------------
export const PRODUCTS = [
  {
    id: "troovy-butter",
    brand: "Troovy",
    name: "The Healthy Butter Cookies",
    category: "Snacks",
    price: 149,
    weight: "60 g",
    score: 92,
    image: "/media/troovy-butter-hero.jpg",
    tagline: "Buttery, protein-rich, and honestly good.",
    claims: ["No refined sugar", "No palm oil", "No maida"],
    nutrition: { protein: 6, sugar: 0, fibre: 3, kcal: 118 },
  },
  {
    id: "os-dfm",
    brand: "Open Secret",
    name: "Un-Junked Daily Dry Fruit Mix",
    category: "Snacks",
    price: 649,
    weight: "250 g",
    score: 95,
    image: "/media/os-dfm-hero.jpg",
    tagline: "Six nuts and seeds. Zero shortcuts.",
    claims: ["High protein", "Zero added sugar", "Full of fibre"],
    nutrition: { protein: 21, sugar: 0, fibre: 9, kcal: 168 },
  },
  {
    id: "skc-madras",
    brand: "Sweet Karam Coffee",
    name: "Madras Mixture",
    category: "Snacks",
    price: 199,
    weight: "180 g",
    score: 88,
    image: "/media/skc-madras-hero.jpg",
    tagline: "A symphony of the South. Slow-made.",
    claims: ["Zero trans fat", "No artificial colours", "Source of fibre"],
    nutrition: { protein: 8, sugar: 2, fibre: 4, kcal: 142 },
  },
  {
    id: "kisaansay-honey",
    brand: "KisaanSay",
    name: "Wild Forest Raw Honey",
    category: "Pantry",
    price: 449,
    weight: "500 g",
    score: 90,
    image: "/media/kisaansay-honey-hero.jpg",
    tagline: "Unheated, unfiltered, single origin.",
    claims: ["Raw & unprocessed", "Single origin", "Lab tested"],
    nutrition: { protein: 0, sugar: 17, fibre: 0, kcal: 64 },
  },
  {
    id: "os-ca",
    brand: "Open Secret",
    name: "Chocolate Coated Almonds",
    category: "Snacks",
    price: 299,
    weight: "150 g",
    score: 91,
    image: "/media/os-ca-hero.jpg",
    tagline: "The snack that reads its own label.",
    claims: ["Real chocolate", "No preservatives", "High protein"],
    nutrition: { protein: 12, sugar: 6, fibre: 5, kcal: 176 },
  },
  {
    id: "troovy-chocolate",
    brand: "Troovy",
    name: "The Healthy Choco Cookies",
    category: "Snacks",
    price: 179,
    weight: "60 g",
    score: 89,
    image: "/media/troovy-chocolate-hero.jpg",
    tagline: "Cocoa-rich. Guilt-free by design.",
    claims: ["No refined sugar", "No palm oil", "Real cocoa"],
    nutrition: { protein: 5, sugar: 1, fibre: 3, kcal: 124 },
  },
  {
    id: "skc-mango",
    brand: "Sweet Karam Coffee",
    name: "Mango Thokku Preserve",
    category: "Pantry",
    price: 249,
    weight: "200 g",
    score: 86,
    image: "/media/skc-mango-hero.jpg",
    tagline: "Small-batch. Sun-ripe. No shortcuts.",
    claims: ["No preservatives", "Cold-pressed oil", "Traditional recipe"],
    nutrition: { protein: 1, sugar: 9, fibre: 2, kcal: 88 },
  },
  {
    id: "kisaansay-saffron",
    brand: "KisaanSay",
    name: "Himalayan Mongra Saffron",
    category: "Pantry",
    price: 899,
    weight: "2 g",
    score: 93,
    image: "/media/kisaansay-saffron-hero.jpg",
    tagline: "Hand-picked threads. Grade A1.",
    claims: ["100% pure", "ISO graded", "Lab certified"],
    nutrition: { protein: 0, sugar: 0, fibre: 0, kcal: 6 },
  },
];

// Editorial hero rotates through a few statement lines.
export const HERO_LINES = [
  ["We read", "the labels.", "You don't", "have to."],
];

// Why KOI - proof, not paragraphs
export const WHY_STATS = [
  { value: 9, suffix: " / 10", label: "Products we assess never make the shelf." },
  { value: 412, suffix: "+", label: "Ingredients flagged and permanently blocked." },
  { value: 100, suffix: "%", label: "Labels decoded, line by line, before listing." },
  { value: 0, suffix: "", label: "Marketing claims taken at face value." },
];

// Trust framework - the decode pipeline
export const TRUST_STEPS = [
  { k: "01", title: "Ingredient Decode", desc: "Every ingredient parsed, matched and risk-scored against our master index." },
  { k: "02", title: "Nutrition Scoring", desc: "Protein, sugar, fibre and fat normalised per serving and per 100g." },
  { k: "03", title: "Additive Scan", desc: "INS codes, hidden sugars, palm oil and trans fats surfaced instantly." },
  { k: "04", title: "Claim Verification", desc: "Front-of-pack claims checked against the actual panel - not the ad copy." },
  { k: "05", title: "Lab Evidence", desc: "Certificates and test reports cross-referenced for authenticity." },
  { k: "06", title: "KOI Verdict", desc: "A single, honest score. Approved only if it genuinely earns its place." },
];

// Ingredient explorer - the good and the watched
export const INGREDIENTS_GOOD = [
  "Millets", "Jaggery", "Cold-pressed oils", "A2 Ghee", "Almonds", "Dates", "Oats", "Whole grains",
];
export const INGREDIENTS_WATCH = [
  "Palm oil", "Maida", "Refined sugar", "INS colours", "Preservatives", "Trans fats", "Emulsifiers", "MSG",
];

// Trending categories - modular geometric blocks
export const CATEGORIES = [
  { name: "Everyday Snacks", count: 128, tone: "forest" },
  { name: "Protein & Fitness", count: 64, tone: "lime" },
  { name: "Pantry Staples", count: 92, tone: "cream" },
  { name: "Honey & Sweeteners", count: 37, tone: "butter" },
  { name: "Kids Nutrition", count: 45, tone: "emerald" },
  { name: "Coffee & Brews", count: 51, tone: "orange" },
];

// Community - editorial pull-quotes, no faces
export const VOICES = [
  {
    quote: "I stopped second-guessing labels. If it's on KOI, someone already did the reading for me.",
    who: "A. Menon",
    role: "Bengaluru · Member since 2025",
  },
  {
    quote: "It feels less like a store and more like a filter for everything I shouldn't have to research.",
    who: "R. Iyer",
    role: "Mumbai · Verified buyer",
  },
  {
    quote: "The scores are brutal in the best way. Nothing gets in just because the packaging looks healthy.",
    who: "S. Kapoor",
    role: "Delhi · Member since 2024",
  },
];
