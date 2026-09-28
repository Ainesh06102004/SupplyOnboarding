// ============================================================================
// Agent Mode: the tools the model may call, as strict JSON schemas, and what
// the model is told about its job. Pure.
//
// Few, consolidated tools with plain names (Anthropic, "Writing tools for
// agents"); every argument required, nullable where optional (OpenAI strict
// mode). Every tool takes `say`: one short line KOI shows while it works,
// held to lib/agent/narration.js — no figures, no claims, nothing the shopper
// or the tools didn't say.
// ============================================================================

import { strictObject, nullableEnum, nullableNumber, enumArray } from "@/lib/ai/providers/openaiFormat";
import { AGE_BAND_KEYS } from "@/lib/planner/brief";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";

export const PLAN_STEPS = Object.freeze(["define", "you", "plan", "pantry", "shop", "track"]);
const PROFILE_DIET_KEYS = DIET_TYPES.filter((d) => !d.forOnePlanOnly).map((d) => d.key);
const AVOID_KEYS = FOODS_AVOID.map((a) => a.key);
const say = { type: ["string", "null"], description: "One short line to show the shopper while this runs, or null. No numbers, no health claims." };
const quote = { type: ["string", "null"], description: "The part of the shopper's message this is about, copied word for word; null means their whole latest message." };

export const TOOL_SCHEMAS = Object.freeze([
  {
    name: "look",
    description: "Read, and show the shopper in the chat: the household (labels, what is missing), the plan (cost, days, who is short), the basket (products and packs), the explanation (what KOI gave up and why), per_day (each person's daily calories, protein, carbs, fat in this plan — for 'my macros', 'Tuesday's protein'), menu (the week's dishes, day by day — for 'what's for dinner Tuesday'), or the page the shopper is on. It does NOT open anything on the page: use show for that.",
    parameters: strictObject({ what: { type: "string", enum: ["household", "plan", "basket", "explanation", "per_day", "menu", "page"] }, say }),
  },
  {
    name: "draft_people",
    description: "Read who is eating from the shopper's words (people, ages, diets, foods to avoid, days, budget). Saves nothing. Use when the shopper describes their household or new people. KOI then asks the shopper for anything missing by itself.",
    parameters: strictObject({ quote, say }),
  },
  {
    name: "save_people",
    description: "Save people to the household (the Define and You steps). The shopper approves a card first; KOI shows it. source=draft saves the drafted people. source=changes updates SAVED people with what the shopper stated: age group (\"middle teens\" → teen_13_15), age in years, height, weight, target weight, sex, activity, goal, eating pattern, diet, foods to avoid or no longer avoid (with severity only if they said allergic/intolerant/never/dislikes), daily targets, favourite foods (their words), a new name, or remove_person=true to take someone out of the household. this_is_me names which label is the shopper. Use this — not change_plan — for anything about a person.",
    parameters: strictObject({
      source: { type: "string", enum: ["draft", "changes"] },
      changes: {
        type: "array",
        items: strictObject({
          person: { type: "string" },
          set_age_band: nullableEnum(AGE_BAND_KEYS),
          set_age_years: { type: ["integer", "null"] },
          set_height_cm: nullableNumber(),
          set_weight_kg: nullableNumber(),
          set_target_weight_kg: nullableNumber(),
          set_sex: nullableEnum(["female", "male", "unspecified"]),
          set_activity: nullableEnum(["sedentary", "light", "moderate", "heavy"]),
          set_diet: nullableEnum(PROFILE_DIET_KEYS),
          set_goal: nullableEnum(["maintain", "lose", "gain"]),
          set_pattern: nullableEnum(["balanced", "high_protein", "low_carb", "keto"]),
          add_avoids: enumArray(AVOID_KEYS),
          remove_avoids: enumArray(AVOID_KEYS),
          avoid_severity: nullableEnum(["allergy", "intolerance", "rule", "dislike"]),
          target_kcal: nullableNumber(),
          target_protein_g: nullableNumber(),
          add_favourites: { type: "array", items: { type: "string" } },
          remove_favourites: { type: "array", items: { type: "string" } },
          rename_to: { type: ["string", "null"] },
          remove_person: { type: "boolean" },
        }),
      },
      this_is_me: { type: ["string", "null"] },
      say,
    }),
  },
  {
    name: "make_plan",
    description: "Make a new week's plan for the saved household with KOI's planner. Reads days, budget, who and stated targets from the shopper's words. days and budget: only numbers the shopper gave, else null. fasting: labels of people fasting for this plan (Navratri, a vrat), only if the shopper said so; naming a festival KOI knows (Navratri) sets the plan to its days.",
    parameters: strictObject({ quote, days: { type: ["integer", "null"] }, budget: nullableNumber(), fasting: { type: "array", items: { type: "string" } }, say }),
  },
  {
    name: "change_plan",
    description: "Change the plan on screen in the shopper's words: cheaper, a budget, days, add or leave out a food (for everyone or one person), swap, avoid, a stated target, add or drop a person. add_this_product=true adds the product the shopper is viewing. Can be undone.",
    parameters: strictObject({ quote, add_this_product: { type: "boolean" }, say }),
  },
  {
    name: "explore",
    description: "Look without changing anything: swaps for a product in the plan, what the plan would be without a product, or products in KOI's catalogue matching words.",
    parameters: strictObject({ kind: { type: "string", enum: ["swaps", "without", "products"] }, product: { type: ["string", "null"] }, say }),
  },
  {
    name: "check_product",
    description: "Whether a product fits people in the household: their diet, their foods to avoid, their age. product: \"this\" for the product being viewed, or its name. people: labels, or empty for everyone.",
    parameters: strictObject({ product: { type: ["string", "null"] }, people: { type: "array", items: { type: "string" } }, say }),
  },
  {
    name: "show",
    description: "Take the shopper to a page: a step of the plan (define, you, plan, pantry, shop, track), the shop, a product, the cart, or household settings.",
    parameters: strictObject({ target: { type: "string", enum: ["plan_step", "shop", "product", "cart", "household"] }, step: nullableEnum(PLAN_STEPS), product: { type: ["string", "null"] }, say }),
  },
  {
    name: "add_to_cart",
    description: "Put the plan's basket in the cart. Only when the shopper asked for the cart, an order or to buy. The shopper reviews and approves first. KOI never checks out.",
    parameters: strictObject({ say }),
  },
  {
    name: "save_kitchen_rules",
    description: "Save the household's standing kitchen rules (household settings), after the shopper approves: foods kept out of the house (keep_out_*), what is in the pantry (pantry_*, their words), brands never to buy or to prefer, leftover packs (waste: none/some/any), repeating last week's food (repeat: low/usual/high), what matters most in order (priorities), the most processed food allowed (processing_ceiling 1–4, NOVA), fridge-free only (shelf_stable_only), and cooking style (cuisine). null or empty leaves a setting as it is. Only what the shopper said.",
    parameters: strictObject({
      keep_out_add: enumArray(AVOID_KEYS),
      keep_out_remove: enumArray(AVOID_KEYS),
      pantry_add: { type: "array", items: { type: "string" } },
      pantry_remove: { type: "array", items: { type: "string" } },
      refuse_brands_add: { type: "array", items: { type: "string" } },
      prefer_brands_add: { type: "array", items: { type: "string" } },
      brands_remove: { type: "array", items: { type: "string" } },
      waste: nullableEnum(["none", "some", "any"]),
      repeat: nullableEnum(["low", "usual", "high"]),
      priorities: { type: ["array", "null"], items: { type: "string", enum: ["budget", "targets", "familiar", "less_processed", "variety"] } },
      processing_ceiling: { type: ["integer", "null"] },
      shelf_stable_only: { type: ["boolean", "null"] },
      cuisine: nullableEnum(["indian", "global"]),
      say,
    }),
  },
  {
    name: "week_menu",
    description: "Change the week's dishes (the Plan step's week grid): reshuffle a meal (slot) for a day or the whole week, optionally only where a person eats it; swap two days (swap_days, day + other_day, one slot or all); or reset to KOI's own picks. The page makes the change; dishes someone can't have are never picked. For 'reshuffle the snacks', 'different breakfast on Tuesday', 'swap Monday and Wednesday dinner'.",
    parameters: strictObject({
      action: { type: "string", enum: ["reshuffle", "swap_days", "reset"] },
      slot: nullableEnum(["breakfast", "lunch", "snack", "dinner", "drinks"]),
      day: nullableEnum(["mon", "tue", "wed", "thu", "fri", "sat", "sun", "today", "tomorrow"]),
      other_day: nullableEnum(["mon", "tue", "wed", "thu", "fri", "sat", "sun", "today", "tomorrow"]),
      person: { type: ["string", "null"] },
      say,
    }),
  },
  {
    name: "edit_cart",
    description: "Change the cart after the shopper approves: add packs of a product, set how many, or remove it. product: the shopper's words for it. KOI never checks out.",
    parameters: strictObject({
      changes: { type: "array", items: strictObject({ product: { type: "string" }, mode: { type: "string", enum: ["add", "set", "remove"] }, packs: { type: "integer" } }) },
      say,
    }),
  },
  {
    name: "accept_track_proposal",
    description: "Track: use KOI's suggested daily calorie target from the shopper's weigh-in trend (the same suggestion the Track step offers), after they approve. Only for the account holder.",
    parameters: strictObject({ say }),
  },
  {
    name: "log_weigh_in",
    description: "Log today's weight for the shopper themself (Track), after they approve. kg: only the number the shopper said. Only for the account holder, and only an adult.",
    parameters: strictObject({ kg: { type: "number" }, say }),
  },
  {
    name: "ask_shopper",
    description: "Ask the shopper something only they can decide: who is eating, how many days, a budget, which person they mean, a choice between options they mentioned, or — for a SAVED person (about = their label) — their age group (age), diet (diet), or their You-step details (details: age, sex, height, weight, activity, goal; KOI then shows a save card). KOI writes the question. While setting up new people KOI asks ages, diets, avoids and details by itself; don't ask those.",
    parameters: strictObject({ topic: { type: "string", enum: ["who", "days", "budget", "which_person", "clarify", "age", "diet", "details"] }, about: { type: ["string", "null"] }, options: { type: "array", items: { type: "string" } }, say }),
  },
  {
    name: "finish",
    description: "End the run. outcome done when the shopper's request is handled, nothing_to_do when nothing needed doing, cannot_do when KOI can't do it (say what instead, without numbers).",
    parameters: strictObject({ outcome: { type: "string", enum: ["done", "nothing_to_do", "cannot_do"] }, say }),
  },
]);

export const TOOL_NAMES = Object.freeze(TOOL_SCHEMAS.map((t) => t.name));

export const AGENT_INSTRUCTIONS = [
  "You are KOI's planning agent inside KOI, an Indian grocery store. One shopper plans a week of groceries for their household. You drive KOI's own tools; the page changes as you work.",
  "Do the whole request, in order, one tool call at a time: set up people if needed (draft_people, then save_people source=draft), make or change the plan, then anything else asked (show a page, add to cart only if they asked for the cart). Then call finish.",
  "KOI asks the shopper for missing ages, diets and who avoids what by itself; wait for that, then continue. Use ask_shopper only when a choice the shopper must make is genuinely unclear. Never ask what you can default: days default to 7, budget to none.",
  "Never write a number, price, nutrient amount, product or health claim yourself: the tools produce them and KOI shows them. Your `say` lines are short, warm, first person, with no digits and no health words (healthy, diabetic, boosts, cures). Never say whether something is okay, safe or fine to eat: the card shows the verdict with its cautions.",
  "Quote the shopper's own words in `quote` when only part of their message applies; otherwise null. Never paraphrase into a quote.",
  "Saving people and adding to the cart need the shopper's approval; KOI shows the card. If they decline, carry on without it. KOI cannot check out or place orders.",
  "If a tool refuses, read why and do what it says. Don't repeat the same call.",
  "Asked to change a plan when none exists (\"make it cheaper\", \"no dates\"): make_plan first with the shopper's words, then change_plan if anything is left to change.",
  "You can do everything the store's pages can. Route by what the words are about: a PERSON (age, body, diet, goal, favourites, name, remove) → save_people or ask_shopper topic=details/age/diet; the week's DISHES (reshuffle, different breakfast, swap days) → week_menu; the BASKET (cheaper, add/leave out a food, swap a product, days, budget, a target for this plan) → change_plan; the HOUSE (keep out, pantry, brands, waste, repeats, priorities, processing, fridge-free, cuisine) → save_kitchen_rules; the CART → add_to_cart or edit_cart; WEIGHT → log_weigh_in / accept_track_proposal; QUESTIONS about the plan → look (plan, basket, per_day, menu, explanation).",
  "\"Show me X\" or \"open X\" means show. Never say something is on the screen or shown unless show ran in this turn; look shows its result in the chat, not on the page.",
  "When setting up new people, KOI asks each adult for their details (age, sex, height, weight, activity, goal) after ages and diets; let it, then save.",
  "If something truly can't be done, say what KOI can do instead, in finish.",
  "Hinglish is normal (\"hum do hamare do\", \"4k budget\"). A medical condition is never a diet or target; leave it out.",
].join("\n");
