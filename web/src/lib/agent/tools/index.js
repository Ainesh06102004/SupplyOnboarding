// ============================================================================
// Agent Mode: the tools, done by KOI's own functions. SERVER ONLY.
//
// Each tool is one of:
//   run(ctx, args)              does it now (reads, and plan writes that undo)
//   prepare(ctx, args) + execute(ctx, args, prepared)
//                               needs the shopper's approval first: prepare
//                               builds the card and refuses what it may not
//                               do; execute runs after Allow, re-checked
//                               against the database as it is then
//   card(ctx, args)             asks the shopper (ask_shopper)
//
// A tool returns { ok, summary, forModel, data?, ui?, notice?, ask?, end? }:
//   summary   the dock's line, a template (never the model's words)
//   forModel  what the model is told: labels, outcomes, gaps — never an age,
//             a diet, an allergy or a target (lib/agent/digest.js)
// A refusal is { ok: false, forModel: what to do instead } — actionable, so
// the model can recover on its next turn.
// ============================================================================

import "server-only";

import { planForHousehold, planFollowUp, planWithout, PlanStopped } from "@/lib/planner/plan";
import { draftHousehold } from "@/lib/planner/briefModel";
import { AGE_BANDS, dietsNamed } from "@/lib/planner/brief";
import { avoidKeysNamed } from "@/lib/planner/avoidWords";
import { productsNamed, MAX_FOLLOWUP_CHARS } from "@/lib/planner/followup";
import { materiallyShort } from "@/lib/planner/report";
import { ageRefusal, ageReason } from "@/lib/planner/ageSafety";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { extractFacts } from "@/lib/recommendation/productFacts";
import { filterEligible } from "@/lib/recommendation/eligibilityFilter";
import { unverifiedFor } from "@/lib/recommendation/verification";
import { interpret, resolveIntent } from "@/lib/ai/intent";
import { swapsFor } from "@/lib/food/swaps";
import { readFavourites, MAX_FAVOURITES } from "@/lib/plan/favourites";
import { noteLines } from "@/lib/plan/planView";
import { trackRead } from "@/lib/plan/track";
import { festivalNamed, FAST_WORDS } from "@/lib/calendar/festivals";
import { blankProfile, memberPayload, profileProblems, SEVERITIES } from "@/lib/household/profile";
import { mergeAvoids, applyProfileSet, withSuggestedTargets, weakens } from "@/lib/household/save";
import { ASKS_CART } from "../router";
import { asksForParticularProducts } from "../cartWords";
import { planArgs } from "../planArgs";
import { isQuote, numbersOf, norm, wordsOf } from "../evidence";
import { gapsFor, gapWords, askCardFor, bandsNamed, nextAskFor, detailsCardFor, missingDetails } from "../readiness";
import { fingerprint } from "../sign";

const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;
const refuse = (forModel, summary = null) => ({ ok: false, forModel, summary });
const joinLabels = (labels) => (labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`);

/** The shopper's words a tool acts on: a verified quote, or their latest message. */
function wordsFor(ctx, quote) {
  const latest = ctx.memory.said.at(-1) ?? "";
  if (quote === null || quote === undefined || quote === "") return { text: latest };
  if (!isQuote(quote, ctx.evidence())) return { error: "quote must be the shopper's own words, copied exactly; pass null to use their whole latest message" };
  return { text: String(quote) };
}

const currentPlanId = (ctx) => ctx.memory.planId ?? ctx.plan?.id ?? null;

/** A person's profile, said as a change: "son's age to middle teens", "my weight is 70 kg now", "wife is vegan now". */
const PROFILE_EDIT = /\b(age|years? old|height|weight is|weigh|tall|sex|gender|activity|active|goal)\b.*\b(to|is|now|as)\b|\b(is|are|turned|became|going)\s+(now\s+)?(vegan|vegetarian|veg|non[- ]?veg|eggetarian|jain|pescatarian)\b|\bdiet to\b|\brename\b/;
/** The week's dishes: "reshuffle the snacks", "different breakfast on Tuesday", "swap Monday and Wednesday dinners". */
const MENU_WORDS = /\b(reshuffle|shuffle|menu|dish(es)?|recipes?|breakfasts?|lunch(es)?|dinners?|snacks?|meals?)\b.*\b(reshuffle|shuffle|different|change|swap|switch|new|other|another|vary|variety)\b|\b(reshuffle|shuffle|swap|switch|change|vary)\b.*\b(breakfasts?|lunch(es)?|dinners?|snacks?|meals?|menu|dish(es)?)\b/;

/** The product on screen. The page names a product by its id; plans and baskets by its SKU. */
const onScreen = (catalogue, id) => (id ? catalogue.find((p) => String(p.id) === String(id) || String(p.skuId) === String(id)) ?? null : null);

// ── look ────────────────────────────────────────────────────────────────────
async function look(ctx, { what }) {
  if (what === "household") {
    const draft = ctx.memory.draft;
    const gaps = gapsFor(draft, { savedCount: ctx.saved.length });
    return {
      ok: true,
      summary: ctx.saved.length ? `Your household: ${joinLabels(ctx.saved.map((p) => p.label))}` : "No one saved yet",
      forModel: `Saved people: ${ctx.saved.map((p) => p.label).join(", ") || "none"}. Drafted, not saved: ${(draft?.members ?? []).map((m) => m.label).join(", ") || "none"}. Missing: ${gapWords(gaps)}.`,
    };
  }
  if (what === "page") {
    const product = onScreen(await ctx.catalogue(), ctx.page.productId);
    return { ok: true, summary: "Looked at this page", forModel: `The shopper is on: ${ctx.page.route}${ctx.page.step ? ` (${ctx.page.step} step)` : ""}${product ? `, viewing "${product.name}"` : ""}.` };
  }
  if (what === "menu") {
    // The week's dishes are built in the browser; the page describes them (kinds and names only).
    const week = ctx.page.week;
    if (!week?.length) return refuse("KOI can only read the week's dishes on the Plan page. Call show target=plan_step step=plan first, then look what=menu.");
    return {
      ok: true,
      summary: "Read the week's dishes",
      forModel: `The week's dishes (shown to the shopper in the chat): ${week.map((d) => `${d.day}: ${Object.entries(d.slots).map(([s, v]) => `${s} ${v}`).join("; ")}`).join(" | ")}.`,
      data: { kind: "menu", days: week },
    };
  }
  const planId = currentPlanId(ctx);
  if (!planId) return refuse("There is no plan yet. Make one with make_plan (after people are saved).");
  const { data: plan } = await ctx.db.from("plan").select("id, days, budget_rupees, achieved, report, explanation").eq("id", planId).maybeSingle();
  if (!plan) return refuse("That plan is not available. Make a new one with make_plan.");
  const basket = plan.achieved?.basket ?? [];
  if (what === "basket") {
    return { ok: true, summary: `The basket: ${basket.length} products`, forModel: `Basket (shown in the chat): ${basket.map((l) => l.name).join(", ")}.`, data: { kind: "basket", lines: basket.map((l) => ({ skuId: String(l.skuId), name: l.name, packs: l.packs, cost: l.cost })) } };
  }
  if (what === "explanation") {
    const lines = noteLines({ explanation: plan.explanation, days: plan.days, report: plan.report });
    return { ok: true, summary: "How KOI made this plan", forModel: "The plan's explanation is shown to the shopper in the chat.", data: { kind: "explain", lines } };
  }
  if (what === "per_day") {
    // A plan is a week's food, so "Tuesday's macros" is the plan's day: its figures ÷ days, per person.
    const days = Math.max(1, Number(plan.days) || 7);
    const people = (plan.report?.perMember ?? []).map((m) => ({
      label: m.label,
      rows: ["kcal", "protein", "carbs", "fat"].map((n) => ({
        nutrient: n,
        planned: Number.isFinite(Number(m.achieved?.[n])) ? Math.round((Number(m.achieved[n]) / days) * 10) / 10 : null,
        asked: Number.isFinite(Number(m.asked?.[n])) ? Math.round((Number(m.asked[n]) / days) * 10) / 10 : null,
      })).filter((r) => r.planned !== null || r.asked !== null),
    }));
    return {
      ok: true,
      summary: "Each person's day in this plan",
      forModel: "Per-person daily figures are shown to the shopper in the chat. They are the plan's daily average: KOI plans a week of food, not a set menu's nutrients per day. Don't restate the figures.",
      data: { kind: "per_day", days, people },
    };
  }
  const short = (plan.report?.unmet ?? []).map((u) => `${u.label} (${u.nutrient})`);
  return {
    ok: true,
    summary: "Read the plan",
    forModel: `Plan (summary shown in the chat): ${plan.days} days, ${basket.length} products, within budget: ${plan.achieved?.within_budget === false ? "no" : plan.achieved?.within_budget ? "yes" : "no budget"}. Short of a target: ${short.join(", ") || "nobody"}. To open it on the page, call show.`,
    data: { kind: "plan", payload: { days: plan.days, report: plan.report } },
  };
}

// ── draft_people ────────────────────────────────────────────────────────────
async function draftPeople(ctx, { quote }) {
  const w = wordsFor(ctx, quote);
  if (w.error) return refuse(w.error);
  // Who is eating is read from the whole message: a quote of part of it lost
  // "family of five". A quote only matters when it is from an earlier message.
  const latest = ctx.memory.said.at(-1) ?? "";
  const read = await draftHousehold(norm(latest).includes(norm(w.text)) ? latest : w.text);
  const savedLabels = new Set(ctx.saved.map((p) => norm(p.label)));
  // Someone already saved is not drafted again: "me" is Me.
  const members = read.members.filter((m) => !savedLabels.has(norm(m.label)));
  const draft = { members, avoidEveryone: read.avoidEveryone ?? [], days: read.days ?? null, budget: read.budget ?? null };
  ctx.memory.draft = members.length ? draft : null;
  const gaps = gapsFor(ctx.memory.draft, { savedCount: ctx.saved.length });
  // Blocking gaps first; then, once each, an adult's You-step details (skippable).
  const next = ctx.memory.draft ? nextAskFor(ctx.memory.draft, { savedCount: ctx.saved.length, asked: ctx.memory.detailsAsked ?? {} }) : null;
  if (next?.details) ctx.memory.detailsAsked = { ...(ctx.memory.detailsAsked ?? {}), [next.details]: true };
  const notice = (read.unresolved ?? []).length
    ? `KOI can't plan around a health condition, so it left out "${read.unresolved.join('", "')}".`
    : null;
  const labels = members.map((m) => m.label);
  return {
    ok: true,
    summary: labels.length ? `Drafted ${labels.length} ${labels.length === 1 ? "person" : "people"}: ${joinLabels(labels)}` : "Found no one new to add",
    forModel: `Drafted, not saved: ${labels.join(", ") || "nobody new"}. Missing: ${gapWords(gaps)}.${next ? " KOI is asking the shopper now; wait for their answers." : labels.length ? " Next: save_people source=draft." : ""}`,
    notice,
    ask: next?.card ?? null,
    data: { kind: "draft", people: labels },
  };
}

// ── save_people (approval) ──────────────────────────────────────────────────
const SEVERITY_WORDS = {
  allergy: /\ballerg(y|ic|ies)\b/,
  intolerance: /\bintoleran(t|ce)\b|\bupsets?\b/,
  rule: /\b(never|by choice|belief|religio\w*|don t eat|doesn t eat|do not eat|does not eat)\b/,
  dislike: /\b(dislikes?|doesn t like|don t like|not a fan|hates?|rather not)\b/,
};
const GOAL_WORDS = { lose: /\b(lose|losing|cut|slim|weight down)\b/, gain: /\b(gain|bulk|build muscle|put on)\b/, maintain: /\b(maintain|stay the same|stay as|keep my weight|keep (his|her|their) weight)\b/ };
const PATTERN_WORDS = { high_protein: /\b(high|more|extra) protein\b|\bprotein\b/, low_carb: /\blow[- ]?carbs?\b|\bless carbs?\b/, keto: /\bketo\b/, balanced: /\bbalanced\b|\bnormal\b/ };
// A relationship says it too: a message about "my wife" and "my mother" needn't say "she".
const SEX_WORDS = {
  female: /\b(female|woman|she|her|wife|mother|mom|mum|maa|daughter|sister|grandmother|grandma|nani|dadi|aunt|mother in law)\b/,
  male: /\b(male|man|he|him|his|husband|father|dad|papa|son|brother|grandfather|grandpa|nana|dada|uncle|father in law)\b/, unspecified: /\b(prefer not|rather not say|not say)\b/ };
const ACTIVITY_WORDS = {
  sedentary: /\b(sedentary|sits?|sitting|desk|not active|inactive)\b/,
  light: /\b(light|lightly|a few days|walks?|walking)\b/,
  moderate: /\b(moderate(ly)?|active|exercises?|gym|on (his|her|my|their) feet)\b/,
  heavy: /\b(heavy|very active|trains? hard|athlete|physical work|labou?r)\b/,
};
const REMOVE_WORDS = /\b(remove|delete|take out|drop|no longer (lives|eats)|moved out|left)\b/;

/** Is each value the model set for a person one the shopper actually stated? */
function unsupported(change, ev) {
  const said = norm(ev.saidText);
  const out = [];
  if (change.set_diet && !dietsNamed(said).includes(change.set_diet)) out.push(`diet ${change.set_diet}`);
  const named = new Set(avoidKeysNamed(said));
  for (const k of [...(change.add_avoids ?? []), ...(change.remove_avoids ?? [])]) if (!named.has(k)) out.push(`avoid ${k}`);
  // An age group from a number or from words ("middle teens"), or one of KOI's own options the shopper picked.
  // Any age in the message may be this person's: "son is 10, my mother 67" states two.
  if (change.set_age_band && !bandsNamed(said).has(change.set_age_band) && !said.includes(norm(labelOf(AGE_BANDS, change.set_age_band)))) out.push(`age group ${change.set_age_band}`);
  if (change.set_goal && !GOAL_WORDS[change.set_goal]?.test(said)) out.push(`goal ${change.set_goal}`);
  if (change.set_pattern && !PATTERN_WORDS[change.set_pattern]?.test(said)) out.push(`eating pattern ${change.set_pattern}`);
  if (change.set_sex && !SEX_WORDS[change.set_sex]?.test(said)) out.push(`sex ${change.set_sex}`);
  if (change.set_activity && !ACTIVITY_WORDS[change.set_activity]?.test(said)) out.push(`activity ${change.set_activity}`);
  for (const f of ["target_kcal", "target_protein_g", "set_age_years", "set_height_cm", "set_weight_kg", "set_target_weight_kg"]) {
    if (change[f] !== null && change[f] !== undefined && !ev.numbers.has(Number(change[f]))) out.push(f.replace(/^set_/, ""));
  }
  if (change.rename_to && !wordsOf(change.rename_to).every((w) => ev.words.has(w))) out.push(`name ${change.rename_to}`);
  if (change.remove_person && !REMOVE_WORDS.test(said)) out.push("removing them");
  for (const w of [...(change.add_favourites ?? []), ...(change.remove_favourites ?? [])]) if (!wordsOf(w).every((x) => ev.words.has(x))) out.push(`favourite ${w}`);
  return out;
}

async function planSave(ctx, args) {
  const people = [];
  const unchanged = [];
  if (args.source === "draft") {
    const draft = ctx.memory.draft;
    if (!draft?.members?.length) return { refused: "There is no draft to save. Use draft_people first, or source=changes for saved people." };
    const gaps = gapsFor(draft, { savedCount: ctx.saved.length });
    if (gaps.length) return { gaps, draft };
    for (const m of draft.members) {
      const text = (v) => (v === null || v === undefined ? "" : String(v));
      const form = withSuggestedTargets({
        ...blankProfile(),
        label: m.label,
        age_band: m.age_band,
        diet_type: m.diet_type,
        // The You step's details, when the shopper gave them on the details card.
        sex: text(m.sex),
        age_years: text(m.age_years),
        height_cm: text(m.height_cm),
        weight_kg: text(m.weight_kg),
        activity_level: text(m.activity_level),
        energy_goal: m.energy_goal || "maintain",
        target_kcal: m.target_kcal ?? "",
        target_protein_g: m.target_protein_g ?? "",
        target_source: m.target_kcal || m.target_protein_g ? "stated" : "suggested",
      });
      const avoids = mergeAvoids([], { add: (m.avoidKeys ?? []).map((key) => ({ key })) });
      people.push({ label: m.label, isNew: true, form, avoids, changed: [] });
    }
  } else {
    const ev = ctx.evidence();
    for (const c of args.changes ?? []) {
      const held = ctx.saved.find((p) => norm(p.label) === norm(c.person));
      if (!held) return { refused: `${c.person} is not a saved person. Saved: ${ctx.saved.map((p) => p.label).join(", ") || "none"}. To add someone new use draft_people.` };
      const bad = unsupported(c, ev);
      if (bad.length) return { refused: `The shopper didn't state: ${bad.join(", ")}. Only save what they said, or ask them.` };
      if (c.remove_person) {
        people.push({ label: held.label, isNew: false, memberId: held.memberId, remove: true, form: held, avoids: mergeAvoids(held.avoids, {}), changed: [] });
        continue;
      }
      const set = applyProfileSet(held, {
        age_band: c.set_age_band, diet_type: c.set_diet, energy_goal: c.set_goal, eating_pattern: c.set_pattern,
        sex: c.set_sex, age_years: c.set_age_years, height_cm: c.set_height_cm, weight_kg: c.set_weight_kg, target_weight_kg: c.set_target_weight_kg,
        activity_level: c.set_activity, target_kcal: c.target_kcal, target_protein_g: c.target_protein_g, label: c.rename_to,
      });
      // Favourites are category keys, read from the shopper's words (lib/plan/favourites.js), never the model's.
      const favWords = [...(c.add_favourites ?? []), ...(c.remove_favourites ?? [])];
      if (favWords.length) {
        const stocked = [...new Set((await ctx.catalogue()).map((p) => p.categoryKey).filter(Boolean))];
        const keysOf = (words) => words.flatMap((w) => readFavourites(w, stocked).matched.map((m) => m.key));
        const add = keysOf(c.add_favourites ?? []);
        const drop = new Set(keysOf(c.remove_favourites ?? []));
        const before = held.favourite_categories ?? [];
        const after = [...new Set([...before.filter((k) => !drop.has(k)), ...add])].slice(0, MAX_FAVOURITES);
        if (after.join() !== before.join()) {
          set.form.favourite_categories = after;
          set.changed.push({ field: "favourite_categories", from: before, to: after });
        }
      }
      // A different age group can't keep an age that doesn't fit it.
      if (set.changed.some((ch) => ch.field === "age_band") && !set.changed.some((ch) => ch.field === "age_years")) set.form.age_years = "";
      const form = withSuggestedTargets(set.form);
      // A severity only when the shopper's words give it; otherwise what is held stays.
      // (Live, 27 Sep: "keep peanuts away from my son" was sent as "never", which would have weakened his allergy.)
      const severity = c.avoid_severity && SEVERITY_WORDS[c.avoid_severity]?.test(norm(ev.saidText)) ? c.avoid_severity : null;
      const avoids = mergeAvoids(held.avoids, { add: (c.add_avoids ?? []).map((key) => ({ key, severity })), remove: c.remove_avoids ?? [] });
      const same = !set.changed.length && !avoids.added.length && !avoids.removed.length && !avoids.stronger.length && !avoids.weaker.length;
      // Nothing would change: no card. (Live, 27 Sep: "keep peanuts away from my son" asked to save a Son who already avoids peanuts.)
      if (same) { unchanged.push(held.label); continue; }
      people.push({ label: held.label, isNew: false, memberId: held.memberId, form: { ...form, memberId: held.memberId }, avoids, changed: set.changed });
    }
    if (!people.length && unchanged.length && !args.this_is_me) {
      return { refused: `Nothing to save: ${joinLabels(unchanged)} already ${unchanged.length === 1 ? "has" : "have"} that. For this week's plan only, use change_plan.` };
    }
  }
  if (args.this_is_me) {
    const me = people.find((p) => norm(p.label) === norm(args.this_is_me));
    if (me) me.form = { ...me.form, is_account_holder: true };
    else {
      const held = ctx.saved.find((p) => norm(p.label) === norm(args.this_is_me));
      if (!held) return { refused: `this_is_me must be a label: ${[...ctx.saved.map((p) => p.label), ...people.map((p) => p.label)].join(", ")}.` };
      people.push({ label: held.label, isNew: false, memberId: held.memberId, form: { ...held, is_account_holder: true }, avoids: mergeAvoids(held.avoids, {}), changed: [{ field: "is_account_holder", from: false, to: true }] });
    }
  }
  for (const p of people) {
    const problems = profileProblems(p.form);
    if (problems.length) return { refused: `${p.label} can't be saved yet: ${problems.join(" ")}` };
  }
  if (!people.length) return { refused: "Nothing to save." };
  return { people };
}

const FIELD_WORDS = {
  age_band: "Age group", diet_type: "Diet", energy_goal: "Goal", eating_pattern: "Eating pattern", target_kcal: "Calories a day", target_protein_g: "Protein a day",
  is_account_holder: "This is you", sex: "Sex", age_years: "Age", height_cm: "Height", weight_kg: "Weight", target_weight_kg: "Target weight",
  activity_level: "Activity", label: "Name", favourite_categories: "Favourites",
};
const VALUE_WORDS = {
  energy_goal: { maintain: "Stay as they are", lose: "Lose weight", gain: "Gain / build muscle" },
  eating_pattern: { balanced: "Balanced", high_protein: "High protein", low_carb: "Low carb", keto: "Keto" },
  sex: { female: "Female", male: "Male", unspecified: "Not said" },
  activity_level: { sedentary: "Mostly sitting", light: "Light exercise", moderate: "Active most days", heavy: "Physical work / trains hard" },
};
const UNITS = { age_years: "years", height_cm: "cm", weight_kg: "kg", target_weight_kg: "kg", target_kcal: "kcal", target_protein_g: "g" };
function fieldText({ field, to }) {
  const value = field === "age_band" ? labelOf(AGE_BANDS, to)
    : field === "diet_type" ? labelOf(DIET_TYPES, to)
      : field === "favourite_categories" ? `${(to ?? []).length} kinds of food`
        : field === "is_account_holder" ? "yes"
          : VALUE_WORDS[field]?.[to] ?? `${to}${UNITS[field] ? ` ${UNITS[field]}` : ""}`;
  return `${FIELD_WORDS[field] ?? field}: ${value}`;
}

function saveCard(people) {
  return {
    kind: "save_people",
    title: people.every((p) => p.remove)
      ? `Remove ${joinLabels(people.map((p) => p.label))} from your household?`
      : people.some((p) => p.isNew) ? `Save ${people.length} ${people.length === 1 ? "person" : "people"} to your household?` : `Save changes to ${joinLabels(people.map((p) => p.label))}?`,
    note: people.some((p) => p.remove) ? "Their saved details and foods to avoid go too. Past plans keep what they were made for." : "Not now keeps this to this week's plan only.",
    people: people.map((p) => ({
      label: p.label,
      isNew: p.isNew,
      rows: p.remove ? [{ text: "Removed from the household", tone: "removed" }] : p.isNew
        ? [
          { text: labelOf(AGE_BANDS, p.form.age_band), tone: "added" },
          { text: labelOf(DIET_TYPES, p.form.diet_type), tone: "added" },
          { text: p.form.target_source === "stated" ? "Daily targets as you stated them" : `Daily targets suggested (${p.form.target_source === "mifflin_st_jeor" ? "Mifflin–St Jeor" : "ICMR-NIN 2020"})`, tone: "added" },
        ]
        : p.changed.map((c) => ({ text: fieldText(c), tone: "changed" })),
      avoids: [
        ...p.avoids.added.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: ${labelOf(SEVERITIES, a.severity)}`, tone: a.severity === "allergy" ? "allergy" : "added" })),
        ...p.avoids.stronger.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: ${labelOf(SEVERITIES, a.from)} → ${labelOf(SEVERITIES, a.to)}`, tone: "changed" })),
        ...p.avoids.weaker.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: ${labelOf(SEVERITIES, a.from)} → ${labelOf(SEVERITIES, a.to)} (less strict)`, tone: "weaker" })),
        ...p.avoids.removed.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: no longer avoided`, tone: "removed" })),
      ],
    })),
    weakens: people.some((p) => p.remove || weakens(p.avoids)),
  };
}

const planFingerprint = (people) => fingerprint(people.map((p) => ({ l: p.label, m: memberPayload(p.form), a: p.avoids.avoids })));

async function prepareSave(ctx, args) {
  const planned = await planSave(ctx, args);
  if (planned.refused) return { refused: planned.refused };
  if (planned.gaps) return { gaps: planned.gaps, card: askCardFor(planned.gaps, { draft: planned.draft }) };
  return { card: saveCard(planned.people), fp: planFingerprint(planned.people) };
}

async function executeSave(ctx, args, prepared) {
  await ctx.reload();
  const planned = await planSave(ctx, args);
  if (planned.refused || planned.gaps) return refuse(`Not saved: ${planned.refused ?? "something is missing again"}.`);
  if (planFingerprint(planned.people) !== prepared.fp) return refuse("The household changed since the shopper saw the card. Nothing was saved; call save_people again so they see the new card.");
  let householdId = ctx.household?.id ?? null;
  if (!householdId) {
    const { data, error } = await ctx.db.from("household").insert({ label: "My household" }).select("id").single();
    if (error) throw error;
    householdId = data.id;
  }
  for (const p of planned.people) {
    if (p.remove) {
      // RLS: only this shopper's own household's members. Avoids cascade; plans keep their snapshots.
      const { error } = await ctx.db.from("household_member").delete().eq("id", p.memberId).eq("household_id", householdId);
      if (error) throw error;
      continue;
    }
    const { error } = await ctx.db.rpc("save_household_member", { p_household_id: householdId, p_member: memberPayload(p.form), p_avoids: p.avoids.avoids });
    if (error) throw error;
  }
  if (args.source === "draft") ctx.memory.draft = null;
  await ctx.reload();
  const labels = planned.people.map((p) => p.label);
  return { ok: true, summary: `Saved ${joinLabels(labels)}`, forModel: `Saved to the household: ${labels.join(", ")}.`, ui: { householdChanged: true, highlight: { members: labels } } };
}

// ── make_plan / change_plan ─────────────────────────────────────────────────
const progress = (ctx, callId) => (event) => ctx.emit({ type: "tool_progress", callId, event });

function planOutcome(result) {
  const r = result.report ?? {};
  const short = (r.unmet ?? []).map((u) => `${u.label} (${u.nutrient})`);
  return `within budget: ${r.withinBudget === false ? "no" : r.withinBudget ? "yes" : "no budget set"}; short of a target: ${short.join(", ") || "nobody"}${materiallyShort(r) ? " (see the explanation)" : ""}`;
}

async function makePlan(ctx, { quote, days, budget, fasting = [] }, callId) {
  if (!ctx.saved.length) return refuse("Nobody is saved yet. draft_people, then save_people source=draft, then make_plan.");
  if (ctx.memory.draft?.members?.length) return refuse(`${joinLabels(ctx.memory.draft.members.map((m) => m.label))} are drafted but not saved. Call save_people source=draft first (or plan without them if the shopper declined).`);
  const w = wordsFor(ctx, quote);
  if (w.error) return refuse(w.error);
  const ev = ctx.evidence();
  if (days !== null && days !== undefined && !ev.numbers.has(Number(days))) return refuse(`The shopper didn't say ${days} days. Pass days=null.`);
  if (budget !== null && budget !== undefined && !ev.numbers.has(Number(budget))) return refuse(`The shopper didn't give a budget of ${budget}. Pass budget=null.`);
  const args = planArgs(w.text, ctx.savedRows, { days: 7, budget: null, memberIds: null, thisWeek: {} });
  // A fast for this plan only (lib/calendar/festivals.js): only people the shopper said are fasting.
  const festival = festivalNamed(ev.saidText);
  if ((fasting ?? []).length) {
    if (!FAST_WORDS.test(norm(ev.saidText)) && !festival) return refuse("The shopper didn't say anyone is fasting. Pass fasting=[].");
    for (const label of fasting) {
      const row = ctx.savedRows.find((r) => norm(r.label) === norm(label));
      if (!row) return refuse(`${label} isn't a saved person.`);
      const was = args.thisWeek[String(row.id)] ?? { dietType: null, prefer: [], skip: [], targets: {} };
      args.thisWeek[String(row.id)] = { ...was, dietType: "fasting" };
    }
  }
  const festivalDays = festival && days == null && !numbersOf(w.text).length ? festival.days : null;
  const result = await planForHousehold({
    householdId: ctx.household.id,
    days: days ?? festivalDays ?? args.days ?? 7,
    budget: budget ?? args.budget ?? null,
    memberIds: args.memberIds,
    thisWeek: args.thisWeek,
    availability: "allow_unknown",
    onStep: progress(ctx, callId),
    signal: ctx.signal,
  });
  ctx.memory.planId = result.planId;
  ctx.memory.created = [...(ctx.memory.created ?? []), result.planId];
  return {
    ok: true,
    summary: `Planned ${result.days} days`,
    forModel: `Plan made for ${result.days} days; ${planOutcome(result)}.`,
    data: { kind: "plan", payload: result },
    ui: { navigate: { href: "/store/plan?step=plan", step: "plan" } },
  };
}

async function changePlan(ctx, { quote, add_this_product: addThis }, callId) {
  const planId = currentPlanId(ctx);
  if (!planId) return refuse("There is no plan to change. make_plan first.");
  let text;
  let reading = null;
  if (addThis) {
    if (!ctx.page.productId) return refuse("The shopper isn't viewing a product. Use change_plan with their words instead.");
    const product = onScreen(await ctx.catalogue(), ctx.page.productId);
    if (!product?.skuId) return refuse("The product on screen isn't in KOI's catalogue.");
    text = `Add ${product.name}`;
    reading = { includeSkus: [String(product.skuId)] };
  } else {
    const w = wordsFor(ctx, quote);
    if (w.error) return refuse(w.error);
    if (w.text.length > MAX_FOLLOWUP_CHARS) return refuse(`That message is long; quote just the part that changes the plan (${MAX_FOLLOWUP_CHARS} characters at most).`);
    text = w.text;
    // A person's age, body, diet or goal is their profile, not this week's basket.
    // (Live, 27 Sep: "change my son's age to middle teens" went to the planner, which read "sons age" as a food.)
    if (PROFILE_EDIT.test(norm(text))) {
      return refuse("That changes a person, not the plan: use save_people source=changes (age group, age, height, weight, sex, activity, goal, diet, name), or ask_shopper topic=details for them. Then make_plan again if they want the plan to follow.");
    }
    // The week's dishes are the menu, not the basket.
    if (MENU_WORDS.test(norm(text))) return refuse("That is about the week's dishes: use week_menu (reshuffle a meal, swap days, reset) instead.");
  }
  const body = await planFollowUp({ planId, text, reading, onStep: progress(ctx, callId), signal: ctx.signal });
  if (body.changed) {
    ctx.memory.planId = body.planId;
    ctx.memory.created = [...(ctx.memory.created ?? []), body.planId];
  }
  if (!body.changed) {
    // Nothing changed: a line, never a "Plan changed" card.
    return { ok: false, summary: "Nothing in the plan changed", forModel: `Nothing changed. ${(body.notApplied ?? []).join("; ") || "KOI couldn't read a change in that."} Don't retry the same words; ask the shopper or say what KOI can do.` };
  }
  return {
    ok: true,
    summary: body.changed ? `Changed the plan: ${(body.applied ?? []).join(" · ")}` : "Nothing in that could be changed",
    forModel: body.changed
      ? `Changed: ${(body.applied ?? []).join("; ")}.${(body.notApplied ?? []).length ? ` Not applied: ${body.notApplied.join("; ")}.` : ""} ${planOutcome(body)}.`
      : `Nothing changed. ${(body.notApplied ?? []).join("; ") || "KOI couldn't read a change in that."}`,
    data: { kind: "change", payload: body, text },
    ui: body.changed ? { navigate: { href: "/store/plan?step=plan", step: "plan" }, highlight: { skus: [...(body.basketChange?.added ?? []), ...(body.basketChange?.changed ?? [])].map((l) => String(l.skuId ?? l)) } } : null,
  };
}

// ── explore / check_product ─────────────────────────────────────────────────
async function productNamed(ctx, name) {
  const catalogue = await ctx.catalogue();
  if (!name || norm(name) === "this" || norm(name) === "this product") return onScreen(catalogue, ctx.page.productId);
  const hit = productsNamed(name, catalogue.map((p) => ({ skuId: String(p.skuId ?? p.id), name: p.name })))[0];
  return hit ? catalogue.find((p) => String(p.skuId ?? p.id) === hit.skuId) ?? null : null;
}

async function explore(ctx, { kind, product }, callId) {
  if (kind === "products") {
    const words = product || ctx.memory.said.at(-1) || "";
    const intent = interpret(words);
    const catalogue = await ctx.catalogue();
    const resolved = resolveIntent(catalogue, intent);
    const ids = resolved.ids ? [...resolved.ids] : [];
    const found = catalogue.filter((p) => ids.includes(p.id)).slice(0, 6);
    return {
      ok: true,
      summary: found.length ? `Found ${found.length} in KOI's shelves` : "Nothing on KOI's shelves matches that",
      forModel: found.length ? `Matching products: ${found.map((p) => p.name).join(", ")}.` : "No product in KOI's catalogue matches.",
      data: { kind: "products", items: found.map((p) => ({ id: p.id, name: p.name, image: p.image ?? null })) },
    };
  }
  const planId = currentPlanId(ctx);
  if (!planId) return refuse("There is no plan yet. make_plan first.");
  const { data: plan } = await ctx.db.from("plan").select("id, achieved").eq("id", planId).maybeSingle();
  const basket = (plan?.achieved?.basket ?? []).map((l) => ({ skuId: String(l.skuId), name: l.name ?? "" }));
  const hit = product ? productsNamed(product, basket)[0] : null;
  if (!hit) return refuse(`Nothing in the plan is called "${product ?? ""}". Basket: ${basket.map((b) => b.name).join(", ")}.`);
  if (kind === "without") {
    const body = await planWithout({ planId, skuId: hit.skuId });
    return { ok: true, summary: `Without ${hit.name}: what KOI would do`, forModel: `Worked out the plan without ${hit.name}; shown to the shopper, nothing changed.`, data: { kind: "without", skuId: hit.skuId, name: hit.name, payload: body } };
  }
  const catalogue = await ctx.catalogue();
  const { data: edges } = await ctx.db.schema("food").from("substitution_edge").select("*").eq("from_sku", hit.skuId);
  const from = catalogue.find((p) => String(p.skuId) === hit.skuId);
  const swaps = from ? swapsFor({ product: from, edges: edges ?? [], catalogue }) : [];
  return {
    ok: true,
    summary: swaps.length ? `${swaps.length} ${swaps.length === 1 ? "swap" : "swaps"} for ${hit.name}` : `No better swap for ${hit.name}`,
    forModel: swaps.length ? `Swaps for ${hit.name}: ${swaps.map((s) => s.name).join(", ")}. To use one, change_plan with the shopper's words, or offer it in finish.` : `KOI has no swap for ${hit.name}.`,
    data: { kind: "swaps", from: hit.name, items: swaps.map((s) => ({ id: s.id, skuId: s.skuId, name: s.name, facts: s.facts, price: s.price })) },
  };
}

async function checkProduct(ctx, { product, people }) {
  const item = await productNamed(ctx, product);
  if (!item) return refuse(product && norm(product) !== "this" ? `No product called "${product}" in KOI's catalogue.` : "The shopper isn't viewing a product; ask which one.");
  if (!ctx.saved.length) return refuse("Nobody is saved yet, so there's no one to check it for. draft_people first.");
  const wanted = (people ?? []).map(norm);
  const who = wanted.length ? ctx.saved.filter((p) => wanted.includes(norm(p.label))) : ctx.saved;
  if (!who.length) return refuse(`Those aren't household labels: ${ctx.saved.map((p) => p.label).join(", ")}.`);
  const facts = extractFacts(item);
  const verdicts = who.map((p) => {
    const hard = (p.avoids ?? []).filter((a) => AVOID_BY_KEY[a.key]?.mode === "hard").map((a) => a.key);
    const profile = { dietType: p.diet_type || null, foodsAvoid: hard };
    const { removed } = filterEligible([{ ...facts, id: item.id }], profile);
    const age = ageRefusal({ categoryKey: item.categoryKey ?? null, contains: [...facts.contains] }, p.age_band);
    const gaps = unverifiedFor(facts, profile);
    let why = null;
    if (removed.length) {
      const [kind, a, b] = removed[0].reason.split(":");
      why = kind === "diet" ? `not in their diet (${labelOf(DIET_TYPES, a).toLowerCase()})` : `contains ${FOODS_AVOID.find((x) => x.flag === a)?.label?.toLowerCase() ?? a}`;
      if (kind === "diet" && b) why = `not in their diet (${labelOf(DIET_TYPES, a).toLowerCase()})`;
    } else if (age) {
      why = ageReason(age.flag);
    }
    return {
      label: p.label,
      fits: !why,
      why,
      notVerified: why ? [] : gaps.allergens.map((g) => g.label),
      dietUnverified: !why && gaps.diet ? gaps.diet.label : null,
    };
  });
  const not = verdicts.filter((v) => !v.fits).map((v) => v.label);
  return {
    ok: true,
    summary: `Checked ${item.name}`,
    forModel: `Checked ${item.name}: fits ${verdicts.filter((v) => v.fits).map((v) => v.label).join(", ") || "nobody"}; not for ${not.join(", ") || "nobody"}. The verdicts are shown to the shopper.`,
    data: { kind: "check", product: { id: item.id, name: item.name }, verdicts },
  };
}

// ── show / add_to_cart / ask_shopper / finish ───────────────────────────────
async function show(ctx, { target, step, product }) {
  // Asked for, so it happens whether or not the page is following KOI.
  if (target === "plan_step") {
    const s = step ?? "plan";
    return { ok: true, summary: `Opened ${s[0].toUpperCase()}${s.slice(1)}`, forModel: `The page now shows the ${s} step.`, ui: { navigate: { href: `/store/plan?step=${s}`, step: s, explicit: true } } };
  }
  if (target === "product") {
    const item = await productNamed(ctx, product);
    if (!item) return refuse(`No product called "${product ?? ""}" in KOI's catalogue.`);
    return { ok: true, summary: `Opened ${item.name}`, forModel: `The page now shows ${item.name}.`, ui: { navigate: { href: `/store/product/${item.id}`, explicit: true } } };
  }
  const href = { shop: "/store/shop", cart: "/store/cart", household: "/store/household" }[target];
  return { ok: true, summary: `Opened the ${target}`, forModel: `The page now shows the ${target}.`, ui: { navigate: { href, explicit: true } } };
}

async function prepareCart(ctx) {
  if (!ctx.memory.said.some((s) => ASKS_CART.test(norm(s)))) return { refused: "The shopper didn't ask for the cart. Don't add to it; mention they can, in finish." };
  // Found in the eval, 27 Sep: "add 2 packs of oats to my cart" reached for the whole plan.
  const latest = ctx.memory.said.at(-1) ?? "";
  if (ASKS_CART.test(norm(latest)) && asksForParticularProducts(latest)) return { refused: "The shopper asked for particular products, not the whole plan: use edit_cart with their words." };
  const planId = currentPlanId(ctx);
  if (!planId) return { refused: "There is no plan to put in the cart. make_plan first." };
  const { data: plan } = await ctx.db.from("plan").select("id, achieved").eq("id", planId).maybeSingle();
  const lines = (plan?.achieved?.basket ?? []).filter((l) => Number(l.packs) > 0).map((l) => ({ skuId: String(l.skuId), name: l.name, packs: Number(l.packs), cost: Number(l.cost ?? 0) }));
  if (!lines.length) return { refused: "The plan's basket is empty." };
  const cost = Math.round(lines.reduce((s, l) => s + l.cost, 0));
  return { card: { kind: "cart", title: `Add ${lines.reduce((s, l) => s + l.packs, 0)} packs to your cart?`, planId, lines, cost, note: "KOI doesn't check out. You review and pay in the cart." }, fp: fingerprint({ planId, lines }) };
}

async function executeCart(ctx, args, prepared, decision) {
  const packs = prepared.card.lines.reduce((s, l) => s + l.packs, 0);
  // The browser holds the cart; it added exactly the approved lines before telling KOI.
  return { ok: true, summary: `Added ${packs} packs to your cart`, forModel: `The shopper added the plan (${prepared.card.lines.length} products) to the cart.`, ui: { navigate: { href: "/store/plan?step=shop", step: "shop" } }, end: decision?.endRun !== false };
}

// ── save_kitchen_rules / log_weigh_in (approval) ────────────────────────────
async function planRules(ctx, args) {
  if (!ctx.household) return { refused: "There's no household yet. Set people up first." };
  const ev = ctx.evidence();
  const named = new Set(avoidKeysNamed(ev.saidText));
  const keys = [...(args.keep_out_add ?? []), ...(args.keep_out_remove ?? [])];
  const unsaid = keys.filter((k) => !named.has(k));
  if (unsaid.length) return { refused: `The shopper didn't name ${unsaid.join(", ")}. Only save what they said.` };
  const clean = (list) => [...new Set((list ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const pantryAdd = clean(args.pantry_add);
  const pantryRemove = clean(args.pantry_remove);
  const unknownWords = [...pantryAdd, ...pantryRemove].filter((p) => !wordsOf(p).every((w) => ev.words.has(w)));
  if (unknownWords.length) return { refused: `Pantry items must be the shopper's own words; they didn't say "${unknownWords.join('", "')}".` };
  const { data: row } = await ctx.db.from("household").select("keep_out, refused_brands, preferred_brands, waste_tolerance, repeat_tolerance, priorities, processing_ceiling, shelf_stable_only, cuisine_leaning").eq("id", ctx.household.id).maybeSingle();
  const held = new Set(row?.keep_out ?? []);
  const keepOut = new Set(held);
  for (const k of args.keep_out_add ?? []) keepOut.add(k);
  for (const k of args.keep_out_remove ?? []) keepOut.delete(k);

  // The kitchen's standing rules (00052, 00054, 00057, 00075), as /store/household sets them.
  const brandWords = [...(args.refuse_brands_add ?? []), ...(args.prefer_brands_add ?? []), ...(args.brands_remove ?? [])];
  const unsaidBrand = brandWords.filter((b) => !wordsOf(b).every((w) => ev.words.has(w)));
  if (unsaidBrand.length) return { refused: `The shopper didn't name the brand "${unsaidBrand.join('", "')}".` };
  const lc = (list) => (list ?? []).map((b) => String(b).trim()).filter(Boolean);
  const dropBrand = new Set(lc(args.brands_remove).map((b) => b.toLowerCase()));
  const refused = [...new Set([...(row?.refused_brands ?? []).filter((b) => !dropBrand.has(b.toLowerCase())), ...lc(args.refuse_brands_add)])];
  const preferred = [...new Set([...(row?.preferred_brands ?? []).filter((b) => !dropBrand.has(b.toLowerCase())), ...lc(args.prefer_brands_add)])];
  const settings = {};
  const set = (col, value, text, tone = "changed") => { if (value !== null && value !== undefined && value !== row?.[col]) settings[col] = { value, text, tone }; };
  set("waste_tolerance", args.waste, `Leftover packs: ${{ none: "none", some: "a little", any: "don't mind" }[args.waste]}`);
  set("repeat_tolerance", args.repeat, `Repeating last week's food: ${{ low: "rarely", usual: "as usual", high: "happily" }[args.repeat]}`);
  set("processing_ceiling", args.processing_ceiling, `Most processed allowed: NOVA ${args.processing_ceiling}`);
  set("shelf_stable_only", args.shelf_stable_only, args.shelf_stable_only ? "Only things that keep without a fridge" : "Fridge items allowed");
  set("cuisine_leaning", args.cuisine, `Cooking: ${{ indian: "Indian", global: "global" }[args.cuisine] ?? args.cuisine}`);
  if (Array.isArray(args.priorities) && args.priorities.length && args.priorities.join() !== (row?.priorities ?? []).join()) {
    settings.priorities = { value: [...new Set(args.priorities)], text: `Priorities, first to last: ${[...new Set(args.priorities)].join(" › ").replace(/_/g, " ")}`, tone: "changed" };
  }

  const rows = [
    ...[...keepOut].filter((k) => !held.has(k)).map((k) => ({ text: `Keep ${AVOID_BY_KEY[k]?.label ?? k} out of the house`, tone: AVOID_BY_KEY[k]?.kind === "allergen" ? "allergy" : "added" })),
    ...[...held].filter((k) => !keepOut.has(k)).map((k) => ({ text: `${AVOID_BY_KEY[k]?.label ?? k} allowed in the house again`, tone: "removed" })),
    ...pantryAdd.map((p) => ({ text: `In the pantry: ${p}`, tone: "added" })),
    ...pantryRemove.map((p) => ({ text: `Not in the pantry: ${p}`, tone: "removed" })),
    ...lc(args.refuse_brands_add).map((b) => ({ text: `Never buy ${b}`, tone: "added" })),
    ...lc(args.prefer_brands_add).map((b) => ({ text: `Prefer ${b}`, tone: "added" })),
    ...lc(args.brands_remove).map((b) => ({ text: `No rule about ${b}`, tone: "removed" })),
    ...Object.values(settings).map(({ text, tone }) => ({ text, tone })),
  ];
  if (!rows.length) return { refused: "Nothing would change." };
  return { keepOut: [...keepOut], pantryAdd, pantryRemove, refused, preferred, settings: Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v.value])), rows };
}

async function prepareRules(ctx, args) {
  const planned = await planRules(ctx, args);
  if (planned.refused) return planned;
  return {
    card: { kind: "rules", title: "Save to your kitchen rules?", rows: planned.rows, weakens: planned.rows.some((r) => r.tone === "removed"), note: "KOI uses these for every plan from now on." },
    fp: fingerprint(planned),
  };
}

async function executeRules(ctx, args, prepared) {
  const planned = await planRules(ctx, args);
  if (planned.refused) return refuse(`Not saved: ${planned.refused}`);
  if (fingerprint(planned) !== prepared.fp) return refuse("The kitchen rules changed since the shopper saw the card. Nothing was saved; call save_kitchen_rules again.");
  const { error } = await ctx.db.from("household").update({ keep_out: planned.keepOut, refused_brands: planned.refused, preferred_brands: planned.preferred, ...planned.settings }).eq("id", ctx.household.id);
  if (error) throw error;
  for (const label of planned.pantryAdd) {
    const { error: e } = await ctx.db.from("household_pantry").insert({ household_id: ctx.household.id, label });
    if (e) throw e;
  }
  for (const label of planned.pantryRemove) {
    await ctx.db.from("household_pantry").delete().eq("household_id", ctx.household.id).ilike("label", label);
  }
  return { ok: true, summary: "Saved your kitchen rules", forModel: `Saved: ${planned.rows.map((r) => r.text).join("; ")}. The next plan uses them.` };
}

const ADULT_BANDS = new Set(["adult_19_59", "senior_60_plus"]);
/** Today in India, as the date a weigh-in belongs to. */
const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

async function planWeighIn(ctx, { kg }) {
  const me = ctx.saved.find((p) => p.is_account_holder);
  if (!me) return { refused: "KOI doesn't know which saved person is the shopper. Ask which_person, then save_people source=changes with this_is_me." };
  if (!ADULT_BANDS.has(me.age_band)) return { refused: "Weigh-ins are for adults only." };
  const n = Number(kg);
  if (!Number.isFinite(n) || n < 30 || n > 250) return { refused: "A weight between 30 and 250 kg." };
  if (!ctx.evidence().numbers.has(n)) return { refused: `The shopper didn't say ${kg} kg. Only log the number they gave.` };
  return { me, kg: Math.round(n * 10) / 10, on: todayIST() };
}

async function prepareWeighIn(ctx, args) {
  const planned = await planWeighIn(ctx, args);
  if (planned.refused) return planned;
  return { card: { kind: "rules", title: `Log ${planned.kg} kg for ${planned.me.label} today?`, rows: [{ text: `${planned.kg} kg on ${planned.on}`, tone: "added" }], note: "Only you see your weigh-ins. You can delete them in your data settings." }, fp: fingerprint({ m: planned.me.memberId, kg: planned.kg, on: planned.on }) };
}

async function executeWeighIn(ctx, args) {
  const planned = await planWeighIn(ctx, args);
  if (planned.refused) return refuse(`Not logged: ${planned.refused}`);
  const { error } = await ctx.db.from("member_checkin").upsert({ member_id: planned.me.memberId, checked_on: planned.on, weight_kg: planned.kg }, { onConflict: "member_id,checked_on" });
  if (error) throw error;
  return { ok: true, summary: `Logged ${planned.kg} kg`, forModel: "Logged today's weight. The Track step shows the trend.", ui: { navigate: { href: "/store/plan?step=track", step: "track" } } };
}

// ── week_menu: the week's dishes, changed on the page ───────────────────────
// The week of dishes is built in the browser from the plan (lib/plan/schedule.js);
// a change to it is the page's own pickDishes / swapCells / clearPicks, run
// through the bridge. KOI asks the page and says so; the page reports back.
async function weekMenu(ctx, { action, slot, day, other_day: otherDay, person }) {
  if (!currentPlanId(ctx)) return refuse("There is no plan yet, so no week of dishes. make_plan first.");
  if (person && !ctx.saved.some((p) => norm(p.label) === norm(person))) return refuse(`${person} isn't a saved person.`);
  if (action === "swap_days" && (!day || !otherDay)) return refuse("swap_days needs day and other_day.");
  const menu = { action, slot: slot ?? null, day: day ?? null, otherDay: otherDay ?? null, person: person ?? null };
  const what = action === "reset" ? "put the week's dishes back to KOI's picks"
    : action === "swap_days" ? `swap ${day} and ${otherDay}${slot ? ` (${slot})` : ""}`
      : `reshuffle ${person ? `${person}'s ` : ""}${slot ?? "meals"}${day ? ` on ${day}` : " for the week"}`;
  return {
    ok: true,
    summary: `Asked the week to ${what}`,
    forModel: `The page will ${what} and show the shopper what changed. Dishes a person can't have are never picked. Snacks and meals are shared by everyone eating them.`,
    ui: { navigate: { href: "/store/plan?step=plan", step: "plan" }, menu },
  };
}

// ── edit_cart (approval; the browser holds the cart) ───────────────────────
async function prepareCartEdit(ctx, { changes }) {
  const ev = ctx.evidence();
  const catalogue = await ctx.catalogue();
  const lines = [];
  for (const c of changes ?? []) {
    const words = String(c.product ?? "");
    if (!wordsOf(words).every((w) => ev.words.has(w) || w.length <= 2)) return { refused: `The shopper didn't name "${words}".` };
    const hit = productsNamed(words, catalogue.map((p) => ({ skuId: String(p.skuId ?? p.id), name: p.name })))[0];
    if (!hit) return { refused: `No product called "${words}" in KOI's catalogue.` };
    const packs = Number(c.packs);
    if (c.mode !== "remove" && (!Number.isInteger(packs) || packs < 1 || packs > 20)) return { refused: "Packs must be a whole number from 1 to 20." };
    if (c.mode !== "remove" && packs > 1 && !ev.numbers.has(packs)) return { refused: `The shopper didn't say ${packs} packs.` };
    lines.push({ skuId: hit.skuId, name: hit.name, mode: c.mode, packs: c.mode === "remove" ? 0 : packs });
  }
  if (!lines.length) return { refused: "Nothing to change in the cart." };
  return {
    card: {
      kind: "cart_edit",
      title: "Change your cart?",
      rows: lines.map((l) => ({ text: l.mode === "remove" ? `Remove ${l.name}` : l.mode === "set" ? `${l.name}: ${l.packs} ${l.packs === 1 ? "pack" : "packs"}` : `Add ${l.packs} × ${l.name}`, tone: l.mode === "remove" ? "removed" : "added" })),
      lines,
      note: "KOI doesn't check out. You review and pay in the cart.",
    },
    fp: fingerprint(lines),
  };
}
async function executeCartEdit(ctx, args, prepared) {
  return { ok: true, summary: "Changed your cart", forModel: `The shopper's cart was changed: ${prepared.card.rows.map((r) => r.text).join("; ")}.` };
}

// ── accept_track_proposal (approval) ───────────────────────────────────────
async function planProposal(ctx) {
  const me = ctx.saved.find((p) => p.is_account_holder);
  if (!me) return { refused: "KOI doesn't know which saved person is the shopper. Ask which_person, then save_people with this_is_me." };
  const { data: rows, error } = await ctx.db.from("member_checkin").select("checked_on, weight_kg").eq("member_id", me.memberId).order("checked_on");
  if (error) throw error;
  const read = trackRead(me, rows ?? []);
  if (!read.allowed) return { refused: "Tracking is for adults only." };
  if (!read.proposal) {
    const why = read.status === "too_few" ? "There aren't enough weigh-ins yet (a few over two weeks)." : read.status === "on_track" ? "The trend is on track, so KOI suggests no change." : "KOI has no change to suggest.";
    return { refused: `No suggestion: ${why}` };
  }
  return { me, proposal: read.proposal };
}
async function prepareProposal(ctx) {
  const planned = await planProposal(ctx);
  if (planned.refused) return planned;
  const { me, proposal } = planned;
  return {
    card: { kind: "rules", title: `Change ${me.label}'s daily calories to ${proposal.kcal.toLocaleString("en-IN")} kcal?`, rows: [{ text: `${proposal.from.toLocaleString("en-IN")} → ${proposal.kcal.toLocaleString("en-IN")} kcal a day`, tone: "changed" }], note: "From the weigh-in trend, by energy balance. KOI moves a target at most 200 kcal at a time, and never below a safe floor." },
    fp: fingerprint({ m: me.memberId, k: proposal.kcal }),
  };
}
async function executeProposal(ctx, args, prepared) {
  const planned = await planProposal(ctx);
  if (planned.refused) return refuse(`Not changed: ${planned.refused}`);
  if (fingerprint({ m: planned.me.memberId, k: planned.proposal.kcal }) !== prepared.fp) return refuse("The trend changed since the card was shown. Nothing was changed; call accept_track_proposal again.");
  const form = { ...planned.me, target_kcal: String(planned.proposal.kcal), target_source: "stated" };
  const { error } = await ctx.db.rpc("save_household_member", { p_household_id: ctx.household.id, p_member: memberPayload(form), p_avoids: mergeAvoids(planned.me.avoids, {}).avoids });
  if (error) throw error;
  await ctx.reload();
  return { ok: true, summary: "Daily calories updated", forModel: `${planned.me.label}'s daily calorie target changed. The next plan uses it.`, ui: { householdChanged: true } };
}

const DAY_OPTIONS = [7, 5, 3, 14];

function askCard(ctx, { topic, about, options }) {
  const labels = [...ctx.saved.map((p) => p.label), ...(ctx.memory.draft?.members ?? []).map((m) => m.label)];
  if (topic === "who") return { card: askCardFor([{ kind: "who" }]) };
  if (topic === "age" || topic === "diet" || topic === "details") {
    const held = ctx.saved.find((p) => norm(p.label) === norm(about ?? ""));
    if (!held) return { refused: `about must be a saved person's label: ${ctx.saved.map((p) => p.label).join(", ") || "none"}.` };
    if (topic === "details") {
      if (!["adult_19_59", "senior_60_plus"].includes(held.age_band)) return { refused: `Body details are for adults. For ${held.label}, KOI needs only their age group and diet (topic=age or topic=diet).` };
      // What they haven't said yet; if they've said it all, every field again, to update. The answers become a save card.
      const fields = missingDetails(held).length ? missingDetails(held) : ["sex", "age_years", "height_cm", "weight_kg", "activity_level", "energy_goal"];
      return { card: detailsCardFor(held, { saved: true, fields }) };
    }
    return { card: askCardFor([{ kind: topic, person: held.label }], { draft: { members: [held] } }) };
  }
  if (topic === "days") {
    return { card: { kind: "ask", title: "One quick thing", questions: [{ id: "days", kind: "single", header: "Days", question: "How many days should KOI plan for?", allowOther: true, otherHint: "Or type a number of days (up to 14)", options: DAY_OPTIONS.map((n, i) => ({ key: `days:${n}`, label: `${n} days`, ...(i === 0 ? { recommended: true } : {}) })) }] } };
  }
  if (topic === "budget") {
    return { card: { kind: "ask", title: "One quick thing", questions: [{ id: "budget", kind: "single", header: "Budget", question: "Is there a budget for this?", allowOther: true, otherHint: "Or type an amount in ₹", options: [{ key: "budget:none", label: "No budget", recommended: true }] }] } };
  }
  if (topic === "which_person") {
    if (!labels.length) return { refused: "There's nobody saved or drafted to choose from." };
    return { card: { kind: "ask", title: "One quick thing", questions: [{ id: "which", kind: "single", header: "Who", question: about ? `Who do you mean by "${String(about).slice(0, 40)}"?` : "Who do you mean?", allowOther: false, options: labels.map((l) => ({ key: `person:${l}`, label: l })) }] } };
  }
  // clarify: options must be the shopper's own words, a label or a basket product.
  const ev = ctx.evidence();
  const known = new Set([...ev.words, ...labels.flatMap(wordsOf), ...ev.products.flatMap(wordsOf)]);
  const opts = (options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
  if (opts.length < 2 || !opts.every((o) => wordsOf(o).every((w) => known.has(w) || w.length <= 2))) {
    return { refused: "clarify options must be two to four choices in the shopper's own words (or labels, or products in the plan)." };
  }
  if (opts.some((o) => numbersOf(o).some((n) => !ev.numbers.has(n)))) return { refused: "clarify options can't contain numbers the shopper didn't say." };
  return { card: { kind: "ask", title: "One quick thing", questions: [{ id: "clarify", kind: "single", header: "Which", question: "Which did you mean?", allowOther: true, options: opts.map((o, i) => ({ key: `opt:${i}`, label: o })) }] } };
}

async function finish(ctx, { outcome }) {
  return { ok: true, summary: outcome === "cannot_do" ? "KOI couldn't do that" : "Done", forModel: "Finished.", end: true, outcome };
}

/** The registry the loop runs. kind: read | plan | approval | ask | ui | end */
export const TOOLS = Object.freeze({
  look: { kind: "read", run: look },
  draft_people: { kind: "plan", run: draftPeople },
  save_people: { kind: "approval", prepare: prepareSave, execute: executeSave },
  make_plan: { kind: "plan", run: makePlan, step: "plan" },
  change_plan: { kind: "plan", run: changePlan, step: "plan" },
  explore: { kind: "read", run: explore },
  check_product: { kind: "read", run: checkProduct },
  show: { kind: "ui", run: show },
  add_to_cart: { kind: "approval", prepare: prepareCart, execute: executeCart, clientExecutes: true },
  save_kitchen_rules: { kind: "approval", prepare: prepareRules, execute: executeRules },
  week_menu: { kind: "ui", run: weekMenu, step: "plan" },
  edit_cart: { kind: "approval", prepare: prepareCartEdit, execute: executeCartEdit, clientExecutes: true },
  accept_track_proposal: { kind: "approval", prepare: prepareProposal, execute: executeProposal, step: "track" },
  log_weigh_in: { kind: "approval", prepare: prepareWeighIn, execute: executeWeighIn, step: "track" },
  ask_shopper: { kind: "ask", card: askCard },
  finish: { kind: "end", run: finish },
});

export { PlanStopped };
