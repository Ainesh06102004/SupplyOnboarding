// ============================================================================
// KOI — Shelf registry
//
// A shelf IS a stored query string. This is the load-bearing idea in the whole
// supply design: rendering a shelf costs ONE provider call that returns many
// products, so cost scales with (zones × shelves) per TTL window rather than
// with traffic or catalogue size.
//
// The set is deliberately CLOSED and small. Cache cardinality is
// zones × shelves, and the budget in config.js allows roughly 60 live keys, so
// the number of shelves is a capacity decision rather than a content one.
// Adding one multiplies upstream cost by the number of active zones.
//
// The queries are also KOI's merchandising. A provider gives only a search box,
// so which words KOI sends IS its curation — that is proprietary, it works
// before the nutrition graph is complete, and it is why this file matters more
// than it looks.
//
// These ids match the eight "Explore by intention" tiles the shop already
// renders (shopData.js GOALS), so the UI needed no redesign to become
// supply-aware.
//
// Moves to a `koi_shelf` table when shelves need editing without a deploy.
// Until then the registry being code keeps the set auditable in review.
// ============================================================================

/**
 * @typedef {Object} Shelf
 * @property {string} id     stable key; the second cache dimension
 * @property {string} title  matches the tile the shopper tapped
 * @property {string} query  what actually gets sent upstream
 * @property {number} limit
 */

/** @type {Shelf[]} */
export const SHELVES = Object.freeze([
  {
    id: "high-protein",
    title: "High Protein",
    // Deliberately concrete foods rather than the abstract goal: a provider's
    // search box matches product names, and "high protein" as a phrase returns
    // marketing copy rather than the paneer and yogurt a shopper wants.
    query: "paneer greek yogurt soya chunks peanut butter tofu",
    limit: 20,
  },
  {
    id: "low-sugar",
    title: "Low Sugar",
    query: "no added sugar unsweetened sugar free",
    limit: 20,
  },
  {
    id: "gut-health",
    title: "Gut Health",
    query: "curd yogurt probiotic fibre oats",
    limit: 20,
  },
  {
    id: "better-energy",
    title: "Better Energy",
    query: "oats millet muesli granola dry fruits",
    limit: 20,
  },
  {
    id: "weight-loss",
    title: "Weight Loss",
    query: "high fibre low calorie salad sprouts",
    limit: 20,
  },
  {
    id: "kids-nutrition",
    title: "Kids Nutrition",
    query: "milk cereal nuts kids snack",
    limit: 20,
  },
  {
    id: "heart-health",
    title: "Heart Health",
    query: "olive oil flax seeds walnuts oats",
    limit: 20,
  },
  {
    id: "post-workout",
    title: "Post-Workout",
    query: "whey protein bar banana eggs",
    limit: 20,
  },
]);

const BY_ID = new Map(SHELVES.map((s) => [s.id, s]));
const BY_TITLE = new Map(SHELVES.map((s) => [s.title.toLowerCase(), s]));

/** @returns {Shelf|null} */
export const getShelfById = (id) => BY_ID.get(String(id)) || null;

/** Resolve the tile label the shop renders to its shelf. @returns {Shelf|null} */
export const getShelfByTitle = (title) => BY_TITLE.get(String(title).toLowerCase()) || null;
