// ============================================================================
// Every way a shopper has actually asked KOI for a change
//
// Not invented phrasings. Each line below was typed at the live chat by the
// founder or found in the follow-up log (migration 00055), and most of them
// were bugs when they were first said. That is the point: this is the set a
// change to the reader — a new rule, a new prompt, a different model — has to
// keep passing, so "did that help?" stops being a matter of opinion.
//
// `expect` says only what matters about the reading. A phrasing is here to pin
// one behaviour, not to freeze the whole answer, so anything unstated is free
// to change.
//
// Run it: node scripts/evalFollowUps.mjs
// ============================================================================

/** The shop these are read against: the products the live bugs involved. */
export const CORPUS_SHOP = Object.freeze([
  { skuId: "atta", name: "Superior MP Atta", categoryKey: "staples.flours" },
  { skuId: "rice", name: "Gorakhpur Kalanamak Rice", categoryKey: "staples.rice" },
  { skuId: "brown", name: "Brown Rice", categoryKey: "staples.rice" },
  { skuId: "oats", name: "Oats", categoryKey: "staples.breakfast_cereals" },
  { skuId: "toor", name: "Unpolished Toor Dal", categoryKey: "staples.pulses" },
  { skuId: "poha", name: "Poha (Thick)", categoryKey: "staples.rice" },
  { skuId: "dates", name: "Medjool Dates", categoryKey: "nuts_seeds.dried_fruit" },
  { skuId: "mix", name: "Daily Dry Fruit Mix", categoryKey: "nuts_seeds.dried_fruit" },
  { skuId: "almonds", name: "California Almonds", categoryKey: "nuts_seeds.nuts" },
  { skuId: "chikki", name: "Peanut Chikki", categoryKey: "snacks.bars" },
  { skuId: "honey", name: "Raw Forest Honey", categoryKey: "sweeteners.honey" },
]);

export const CORPUS_MEMBERS = Object.freeze([
  { id: "me", label: "Me", targets: { protein: 144 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] },
  { id: "wife", label: "Wife", targets: { protein: 50 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] },
]);

/**
 * @typedef {object} Case
 * @property {string} said        what the shopper typed
 * @property {string} pins        the behaviour this line exists to hold
 * @property {string[]} [applied] every line that must appear in `applied`
 * @property {string[]} [absent]  words that must NOT appear anywhere in `applied`
 * @property {string[]} [excludes] sku ids the change must leave out
 * @property {string[]} [includes] sku ids the change must ask for
 * @property {string[]} [includesAny] any one of these is right (a kind of food)
 * @property {string[]} [members] who is left in the plan
 * @property {number} [days]
 * @property {number|null} [budget]
 */
export const FOLLOW_UP_CORPUS = Object.freeze([
  { said: "add oats", pins: "an ask to add is not an ask to remove", includes: ["oats"], absent: ["Left out"] },
  { said: "can you add oats?", pins: "a question is still an ask", includes: ["oats"], absent: ["Left out"] },
  { said: "can you add wheat to the plan?", pins: "wheat reaches the atta", includes: ["atta"] },
  { said: "no oats", pins: "the plain removal still works", excludes: ["oats"] },
  { said: "swap the rice for aata please", pins: "a misspelling reaches the product", excludes: ["rice"], includes: ["atta"] },
  { said: "can you swap toor dal with oats", pins: "a swap is one change, not two removals", excludes: ["toor"], includes: ["oats"] },
  { said: "use honey instead of dates", pins: "the leading verb is not part of the food", excludes: ["dates"], includes: ["honey"] },
  { said: "swap out the dates", pins: "\"out\" is a cue, not a product", excludes: ["dates"] },
  { said: "take out chikki and replace with almonds", pins: "the thing replaced need not be said twice", excludes: ["chikki"], includes: ["almonds"] },
  // Any dried fruit is a right answer here: the ask was for a kind of food, so
  // pinning one product would be pinning an accident of shelf order.
  { said: "remove the 1 pack of almonds and put another dry fruit in there please", pins: "a kind of food, not a product name", excludes: ["almonds"], includesAny: ["mix", "dates"] },
  { said: "remove 1 date pack", pins: "a count and a pack word are not the food", excludes: ["dates"] },
  { said: "take out the brown rice and add oats", pins: "two changes in one sentence", excludes: ["brown"], includes: ["oats"] },
  { said: "plan 4 days on 4000", pins: "a bare number is a budget", days: 4, budget: 4000 },
  { said: "10 days", pins: "days alone", days: 10 },
  { said: "cheaper", pins: "cheaper without a number", budget: 2300 },
  { said: "replan without my wife", pins: "a person can leave the week", members: ["me"] },
  { said: "remove wife", pins: "and by their label alone", members: ["me"] },
  { said: "75 g protein for my wife", pins: "a target for one person", applied: ["Wife: 75 g protein a day"] },
]);
