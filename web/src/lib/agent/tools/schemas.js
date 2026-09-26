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
    description: "Read what is on screen: the household (labels and what is missing), the plan (cost, days, who is short), the basket (product names), the plan's explanation (shown on the page), or the page the shopper is on (e.g. the product they are viewing).",
    parameters: strictObject({ what: { type: "string", enum: ["household", "plan", "basket", "explanation", "page"] }, say }),
  },
  {
    name: "draft_people",
    description: "Read who is eating from the shopper's words (people, ages, diets, foods to avoid, days, budget). Saves nothing. Use when the shopper describes their household or new people. KOI then asks the shopper for anything missing by itself.",
    parameters: strictObject({ quote, say }),
  },
  {
    name: "save_people",
    description: "Save people to the household. The shopper must approve a card first; KOI shows it. source=draft saves the drafted people. source=changes updates saved people with values the shopper stated (a diet, an age group, a goal, foods to avoid or no longer avoid, a daily target). this_is_me names which label is the shopper.",
    parameters: strictObject({
      source: { type: "string", enum: ["draft", "changes"] },
      changes: {
        type: "array",
        items: strictObject({
          person: { type: "string" },
          set_age_band: nullableEnum(AGE_BAND_KEYS),
          set_diet: nullableEnum(PROFILE_DIET_KEYS),
          set_goal: nullableEnum(["maintain", "lose", "gain"]),
          set_pattern: nullableEnum(["balanced", "high_protein", "low_carb", "keto"]),
          add_avoids: enumArray(AVOID_KEYS),
          remove_avoids: enumArray(AVOID_KEYS),
          avoid_severity: nullableEnum(["allergy", "intolerance", "rule", "dislike"]),
          target_kcal: nullableNumber(),
          target_protein_g: nullableNumber(),
        }),
      },
      this_is_me: { type: ["string", "null"] },
      say,
    }),
  },
  {
    name: "make_plan",
    description: "Make a new week's plan for the saved household with KOI's planner. Reads days, budget, who and stated targets from the shopper's words. days and budget: only numbers the shopper gave, else null.",
    parameters: strictObject({ quote, days: { type: ["integer", "null"] }, budget: nullableNumber(), say }),
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
    name: "ask_shopper",
    description: "Ask the shopper something only they can decide, when it changes the result: who is eating, how many days, a budget, which person they mean, or a choice between options they mentioned. KOI writes the question. Ages, diets and who avoids what are asked by KOI automatically; don't ask those.",
    parameters: strictObject({ topic: { type: "string", enum: ["who", "days", "budget", "which_person", "clarify"] }, about: { type: ["string", "null"] }, options: { type: "array", items: { type: "string" } }, say }),
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
  "Never write a number, price, nutrient amount, product or health claim yourself: the tools produce them and KOI shows them. Your `say` lines are short, warm, first person, with no digits and no health words (healthy, diabetic, boosts, cures).",
  "Quote the shopper's own words in `quote` when only part of their message applies; otherwise null. Never paraphrase into a quote.",
  "Saving people and adding to the cart need the shopper's approval; KOI shows the card. If they decline, carry on without it. KOI cannot check out or place orders.",
  "If a tool refuses, read why and do what it says. Don't repeat the same call.",
  "Asked to change a plan when none exists (\"make it cheaper\", \"no dates\"): make_plan first with the shopper's words, then change_plan if anything is left to change.",
  "Hinglish is normal (\"hum do hamare do\", \"4k budget\"). A medical condition is never a diet or target; leave it out.",
].join("\n");
