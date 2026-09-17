// ============================================================================
// KOI PLANNER — What a child must not be given, whatever anyone prefers
//
// Plan §9.10.4, C1. Pure. A member's age band can make a product unsafe for
// them regardless of allergens, diet or taste, and until now nothing in the
// planner knew a toddler from an adult: California Almonds could be planned
// for a one-year-old.
//
// These are refusals, exactly like an allergen: a product one member may not
// have is still bought for the others, the reason is shown in "Who eats what",
// and no step of the relaxation ladder touches them.
//
//   whole_nuts   Children under 5 can choke on whole nuts and peanuts (NHS,
//                "Foods to avoid giving babies and young children"). The 4–6
//                band straddles 5, so the rule covers all of it. A product is
//                treated as whole nuts when its category sells them whole
//                (nuts, nut and dry-fruit mixes) or when it is a namkeen with
//                peanuts or tree nuts in it, and — because KOI cannot show the
//                nuts are ground — when it has nuts and no category at all.
//                Nut butters, flours, bars and mueslis are not refused by this.
//   caffeine     Not for children up to 12.
//
// The ages are editorial and versioned; a nutritionist reviews them (plan §15
// item 17).
// ============================================================================

export const AGE_SAFETY_VERSION = "age-safety-v1";

const UNDER_FIVE = Object.freeze(["child_1_3", "child_4_6"]);
const CHILDREN = Object.freeze(["child_1_3", "child_4_6", "child_7_9", "child_10_12"]);

/** Categories whose products are nuts, whole. */
const WHOLE_NUT_CATEGORIES = Object.freeze(["nuts_seeds.nuts", "nuts_seeds.mixes"]);
/** Categories where nuts in the product are usually whole pieces. */
const NUTS_USUALLY_WHOLE_IN = Object.freeze(["snacks.namkeen"]);
const NUT_FLAGS = Object.freeze(["peanut", "tree_nut"]);

const hasNuts = (item) => (item?.contains ?? []).some((flag) => NUT_FLAGS.includes(flag));

export const AGE_RULES = Object.freeze([
  Object.freeze({
    key: "whole_nuts",
    bands: UNDER_FIVE,
    words: "whole nuts can choke a child under 5",
    applies: (item) => {
      const category = item?.categoryKey ?? null;
      if (WHOLE_NUT_CATEGORIES.includes(category)) return true;
      if (NUTS_USUALLY_WHOLE_IN.includes(category)) return hasNuts(item);
      return category === null && hasNuts(item);
    },
  }),
  Object.freeze({
    key: "caffeine",
    bands: CHILDREN,
    words: "caffeine is not for children",
    applies: (item) => (item?.contains ?? []).includes("caffeine"),
  }),
]);

/**
 * Why this product is not safe for a member of this age band, or null.
 *
 * @param {object} item a catalogue row: categoryKey, contains
 * @param {string|null} ageBand a household_member age band
 * @returns {{ flag: string, rule: "age" }|null}
 */
export function ageRefusal(item, ageBand) {
  if (!ageBand) return null;
  const rule = AGE_RULES.find((r) => r.bands.includes(ageBand) && r.applies(item));
  return rule ? { flag: rule.key, rule: "age" } : null;
}

/**
 * The words for an age refusal: "not for their age: whole nuts can choke a child under 5".
 * @param {string} key an AGE_RULES key
 * @returns {string}
 */
export function ageReason(key) {
  const rule = AGE_RULES.find((r) => r.key === key);
  return `not for their age: ${rule?.words ?? key.replace(/_/g, " ")}`;
}
