// ============================================================================
// KOI — what the KOI bar says on its own: the prompts it suggests, and the
// words it shows while it works. Pure.
//
// PROMPTS. The bar's placeholder is a suggestion of something KOI can really do
// HERE: it knows the page, the Plan's step, the product or dish open, the next
// meal to log on Track, who is open in Household, the cart, and the time of day
// (pages publish what they know through store/koiBarStore.js `facts`). No line
// is generic filler, and none promises what KOI can't do: each is tagged with
// what can carry it out. "agent" lines need Agent Mode (lib/agent/tools); the
// rest are sentences the plain bar already routes: a meal ("had …") to Track,
// a schedule ("… every Tuesday") to the Calendar, anything else to the shop.
//
// WORKING WORDS. While the agent runs, the bar shows a kitchen verb that turns
// over every couple of seconds ("Tempering…", "Squinting at the label…"), in
// the spirit of a CLI spinner, drawn from the tool KOI is running so the joke
// is also a clue. The tool's own plain label stays beside it.
// ============================================================================

const HOURS = Object.freeze([
  { from: 5, to: 11, meal: "breakfast" },
  { from: 11, to: 16, meal: "lunch" },
  { from: 16, to: 19, meal: "snack" },
  { from: 19, to: 24, meal: "dinner" },
]);

/** The meal of the moment: breakfast at 8, lunch at 1, a snack at 5, dinner at 8 pm; late night counts as dinner. */
export function mealAt(hour) {
  return HOURS.find((h) => hour >= h.from && hour < h.to)?.meal ?? "dinner";
}

const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** A round rupee figure under the total: ₹2,162 → ₹1,900. */
const under = (total) => inr(Math.max(100, Math.floor((total * 0.9) / 100) * 100));
const any = (text) => ({ text, needs: "any" });
const agent = (text) => ({ text, needs: "agent" });

/** What each page suggests. `f` is the page's facts; `c` the cart; `meal` the meal of the moment. */
function linesFor(path, f, c, meal) {
  if (path === "/store") {
    return [
      agent(c.members ? `Plan next week for the ${c.members} of us, ₹3,000, high protein for me` : "Plan this week for my family, vegetarian, ₹3,000"),
      any(meal === "snack" ? "Something crunchy for evening chai, not sweet" : meal === "breakfast" ? "A quick high-protein breakfast, no eggs" : `A light ${meal} I can make in 15 minutes`),
      any("Biscuits my kid can have, no maida, no palm oil"),
      agent("What can my diabetic dad snack on from here?"),
    ];
  }
  if (path === "/store/shop") {
    return [
      ...(f.query ? [any(`Like “${f.query}”, but cheaper`), any(`“${f.query}”, without palm oil`)] : []),
      any(meal === "snack" ? "Evening snacks under ₹150, not fried" : "High protein, no palm oil, under ₹200"),
      agent("Which of these are safe for a peanut allergy?"),
      any("Breakfast cereal with less than 5 g sugar"),
    ];
  }
  if (path.startsWith("/store/product")) {
    const p = f.product;
    return p
      ? [
        agent(`Is ${p} okay for my kid?`),
        any(`Something like ${p}, with less sugar`),
        agent(`Put ${p} in this week’s plan`),
        agent(`How does ${p} compare with the other ${f.category ? f.category.toLowerCase() : "options"}?`),
      ]
      : [agent("Is this okay for my dad? He’s diabetic")];
  }
  if (path.startsWith("/store/cart")) {
    return [
      agent("Anything here my kid shouldn’t have?"),
      ...(c.total > 500 ? [agent(`Bring this cart under ${under(c.total)}`)] : []),
      ...(c.own > 0 ? [agent(`Swap the ${c.own === 1 ? "thing" : `${c.own} things`} I added for better scores`)] : []),
      ...(!c.plan ? [agent("Plan the week and fill this cart for me")] : [agent("We already have the atta, take it out")]),
    ];
  }
  if (path.startsWith("/store/orders")) {
    return [agent("Make last week’s basket again, without the biscuits"), agent("Same order as last time, but for 4 people")];
  }
  if (path.startsWith("/store/household")) {
    const who = f.person && f.person !== "Me" ? f.person : null;
    return [
      ...(who ? [agent(`${who} has started avoiding gluten`), agent(`${who} is eating out on weekdays now`)] : [agent("I’m training for a half marathon, set my numbers")]),
      agent("My mother is staying with us this week, she’s diabetic"),
      agent("Add my son, 8, allergic to peanuts"),
    ];
  }
  if (path.startsWith("/store/plan/dish")) {
    const d = f.dish;
    return d
      ? [agent(`Swap ${d} for something lighter this week`), agent(`Make ${d} twice this week`), any(`Had ${d} for ${meal}`)]
      : [agent("Swap this for something lighter")];
  }
  if (path.startsWith("/store/plan")) {
    const step = f.step ?? "define";
    const who = f.person && f.person !== "Me" ? f.person : null;
    if (step === "define") return [agent("Vegetarian week, ₹3,000, high protein for me"), agent("Nothing too spicy for the kids this week"), agent("Lunch out on weekdays, cook dinners only")];
    if (step === "you") return [agent(who ? `${who} wants to lose 4 kg, slowly` : "My coach says 1,900 kcal and 140 g protein"), agent("I’m travelling Thursday to Saturday")];
    if (step === "plan") {
      return [
        agent(f.planned ? "Make this week cheaper, keep the protein" : "Plan the week"),
        agent("No paneer twice in a row"),
        agent("Swap Wednesday dinner for something lighter"),
        agent("Batch-cook the lunches on Sunday"),
      ];
    }
    if (step === "pantry") return [agent("We already have rice and atta at home"), any(meal === "snack" ? "Something crunchy for evening chai" : "Add Greek yogurt for breakfasts"), agent("Which of these could I skip and still hit my protein?")];
    return [agent("Anything here my kid shouldn’t have?"), agent("Take out the peanut butter, we have some"), agent("Bring this under ₹2,000")];
  }
  if (path.startsWith("/store/track")) {
    const n = f.nextMeal;
    return [
      ...(n?.dish ? [any(`Had a thali at the canteen instead of ${n.dish}`), any(`Skipped ${n.slot}, had a coffee`)] : [any(`Had a veg thali for ${meal} at the office`)]),
      any(meal === "dinner" ? "Ordered biryani for dinner, a full plate" : `Had 2 idli and a vada for ${meal}`),
      agent("Weighed 74.2 kg this morning"),
    ];
  }
  if (path.startsWith("/store/calendar")) {
    return [any("Lunch out every Tuesday"), any("Gym Monday, Wednesday and Friday at 7"), any("Travelling 12 to 15 November, no cooking"), agent("Plan next week every Sunday at 6 pm")];
  }
  if (path.startsWith("/store/profile")) {
    return [agent("Change my calories to 2,100 a day"), agent("I’ve gone vegetarian"), any(`Had a veg thali for ${meal}`)];
  }
  return [agent("Plan this week for my family"), any(`Had a veg thali for ${meal}`)];
}

/**
 * The bar's suggestions for where the shopper is, most specific first.
 * @param {{ path: string, hour: number, facts?: object, cart?: { members?: number|null, total?: number, own?: number, plan?: boolean }, agent?: boolean }} ctx
 * @returns {string[]} never empty
 */
export function promptsFor({ path = "/store", hour = 12, facts = {}, cart = {}, agent: withAgent = false } = {}) {
  const c = { members: cart.members ?? null, total: Number(cart.total) || 0, own: Number(cart.own) || 0, plan: Boolean(cart.plan) };
  const lines = linesFor(path, facts ?? {}, c, mealAt(hour)).filter((l) => withAgent || l.needs === "any").map((l) => l.text);
  // The plain bar can always take a meal: Track reads it.
  return lines.length ? lines : [`Had a veg thali for ${mealAt(hour)}`];
}

// ── While KOI works ─────────────────────────────────────────────────────────
const WORKING = Object.freeze({
  any: ["Tempering", "Simmering", "Kneading", "Whisking", "Marinating", "Steeping the chai", "Toasting the jeera", "Stirring the pot", "Sifting", "Mise-en-placing"],
  look: ["Peeking in the fridge", "Reading the room", "Taking stock", "Opening cupboards"],
  draft_people: ["Setting the table", "Counting plates", "Learning who likes what"],
  save_people: ["Writing it on the fridge", "Pinning the list up"],
  make_plan: ["Simmering the week", "Balancing the thali", "Juggling macros", "Portioning", "Rolling out the rotis", "Tadka-ing the plan", "Doing the dal maths"],
  change_plan: ["Re-tempering", "Swapping the sabzi", "Rebalancing the thali", "Adjusting the masala"],
  week_menu: ["Writing the menu card", "Chalking up the specials"],
  explore: ["Rummaging the shelves", "Wandering the aisles", "Checking the back of the shelf"],
  check_product: ["Squinting at the label", "Reading the small print", "Sniffing out palm oil", "Counting the sugar"],
  show: ["Laying it out", "Plating up"],
  add_to_cart: ["Packing the jhola", "Filling the basket"],
  edit_cart: ["Repacking the jhola", "Tidying the basket"],
  save_kitchen_rules: ["Labelling the dabbas", "Writing the house rules"],
  log_meal: ["Weighing the plate", "Guessing the ghee", "Doing the canteen maths"],
  log_weigh_in: ["Noting it down", "Reading the scale"],
  accept_track_proposal: ["Recalibrating", "Moving the goalposts, gently"],
  schedule: ["Pencilling it in", "Flipping the calendar"],
  ask_shopper: ["Waiting on you"],
  finish: ["Plating up", "Wiping the counter", "Garnishing"],
});

/**
 * The words to cycle through while a tool runs: its own first, then the kitchen's.
 * @param {string|null} tool the running tool (lib/agent/tools/schemas.js), or null
 * @returns {string[]}
 */
export function workingWords(tool = null) {
  const own = WORKING[tool] ?? [];
  return own.length ? [...own, ...WORKING.any.slice(0, 3)] : [...WORKING.any];
}

/** "4s", "1m 12s": how long KOI has been at it. */
export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
