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
import { blankProfile, memberPayload, profileProblems, SEVERITIES } from "@/lib/household/profile";
import { mergeAvoids, applyProfileSet, withSuggestedTargets, weakens } from "@/lib/household/save";
import { ASKS_CART } from "../router";
import { planArgs } from "../planArgs";
import { isQuote, numbersOf, norm, wordsOf } from "../evidence";
import { gapsFor, gapWords, askCardFor, bandForAge } from "../readiness";
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
  const planId = currentPlanId(ctx);
  if (!planId) return refuse("There is no plan yet. Make one with make_plan (after people are saved).");
  const { data: plan } = await ctx.db.from("plan").select("id, days, budget_rupees, achieved, report").eq("id", planId).maybeSingle();
  if (!plan) return refuse("That plan is not available. Make a new one with make_plan.");
  const basket = plan.achieved?.basket ?? [];
  if (what === "basket") return { ok: true, summary: `The basket: ${basket.length} products`, forModel: `Basket: ${basket.map((l) => l.name).join(", ")}.` };
  if (what === "explanation") return { ok: true, summary: "How KOI made this plan", forModel: "The plan's explanation is now shown on the page.", ui: { explain: true, navigate: { href: "/store/plan?step=plan", step: "plan" } } };
  const short = (plan.report?.unmet ?? []).map((u) => `${u.label} (${u.nutrient})`);
  return {
    ok: true,
    summary: "Read the plan",
    forModel: `Plan: ${plan.days} days, ${basket.length} products, within budget: ${plan.achieved?.within_budget === false ? "no" : plan.achieved?.within_budget ? "yes" : "no budget"}. Short of a target: ${short.join(", ") || "nobody"}.`,
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
  const notice = (read.unresolved ?? []).length
    ? `KOI can't plan around a health condition, so it left out "${read.unresolved.join('", "')}".`
    : null;
  const labels = members.map((m) => m.label);
  return {
    ok: true,
    summary: labels.length ? `Drafted ${labels.length} ${labels.length === 1 ? "person" : "people"}: ${joinLabels(labels)}` : "Found no one new to add",
    forModel: `Drafted, not saved: ${labels.join(", ") || "nobody new"}. Missing: ${gapWords(gaps)}.${gaps.length ? " KOI is asking the shopper now." : labels.length ? " Next: save_people source=draft." : ""}`,
    notice,
    ask: gaps.length ? askCardFor(gaps, { draft: ctx.memory.draft }) : null,
    data: { kind: "draft", people: labels },
  };
}

// ── save_people (approval) ──────────────────────────────────────────────────
const GOAL_WORDS = { lose: /\b(lose|losing|cut|slim|weight down)\b/, gain: /\b(gain|bulk|build muscle|put on)\b/, maintain: /\b(maintain|stay the same|keep my weight)\b/ };

/** Is each value the model set for a person one the shopper actually stated? */
function unsupported(change, ev) {
  const said = ev.saidText;
  const out = [];
  if (change.set_diet && !dietsNamed(said).includes(change.set_diet)) out.push(`diet ${change.set_diet}`);
  const named = new Set(avoidKeysNamed(said));
  for (const k of [...(change.add_avoids ?? []), ...(change.remove_avoids ?? [])]) if (!named.has(k)) out.push(`avoid ${k}`);
  if (change.set_age_band) {
    const typed = bandForAge(said);
    if (typed !== change.set_age_band) out.push(`age group ${change.set_age_band}`);
  }
  if (change.set_goal && !GOAL_WORDS[change.set_goal]?.test(norm(said))) out.push(`goal ${change.set_goal}`);
  for (const f of ["target_kcal", "target_protein_g"]) if (change[f] !== null && change[f] !== undefined && !ev.numbers.has(Number(change[f]))) out.push(f);
  return out;
}

async function planSave(ctx, args) {
  const people = [];
  if (args.source === "draft") {
    const draft = ctx.memory.draft;
    if (!draft?.members?.length) return { refused: "There is no draft to save. Use draft_people first, or source=changes for saved people." };
    const gaps = gapsFor(draft, { savedCount: ctx.saved.length });
    if (gaps.length) return { gaps, draft };
    for (const m of draft.members) {
      const form = withSuggestedTargets({
        ...blankProfile(),
        label: m.label,
        age_band: m.age_band,
        diet_type: m.diet_type,
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
      const set = applyProfileSet(held, { age_band: c.set_age_band, diet_type: c.set_diet, energy_goal: c.set_goal, eating_pattern: c.set_pattern, target_kcal: c.target_kcal, target_protein_g: c.target_protein_g });
      const form = withSuggestedTargets(set.form);
      const avoids = mergeAvoids(held.avoids, { add: (c.add_avoids ?? []).map((key) => ({ key, severity: c.avoid_severity })), remove: c.remove_avoids ?? [] });
      people.push({ label: held.label, isNew: false, memberId: held.memberId, form: { ...form, memberId: held.memberId }, avoids, changed: set.changed });
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

const FIELD_WORDS = { age_band: "Age group", diet_type: "Diet", energy_goal: "Goal", eating_pattern: "Eating pattern", target_kcal: "Calories a day", target_protein_g: "Protein a day", is_account_holder: "This is you" };

function saveCard(people) {
  return {
    kind: "save_people",
    title: `Save ${people.length} ${people.length === 1 ? "person" : "people"} to your household?`,
    note: "Not now keeps this to this week's plan only.",
    people: people.map((p) => ({
      label: p.label,
      isNew: p.isNew,
      rows: p.isNew
        ? [
          { text: labelOf(AGE_BANDS, p.form.age_band), tone: "added" },
          { text: labelOf(DIET_TYPES, p.form.diet_type), tone: "added" },
          { text: p.form.target_source === "stated" ? "Daily targets as you stated them" : `Daily targets suggested (${p.form.target_source === "mifflin_st_jeor" ? "Mifflin–St Jeor" : "ICMR-NIN 2020"})`, tone: "added" },
        ]
        : p.changed.map((c) => ({ text: `${FIELD_WORDS[c.field] ?? c.field}: ${c.field === "age_band" ? labelOf(AGE_BANDS, c.to) : c.field === "diet_type" ? labelOf(DIET_TYPES, c.to) : c.to}`, tone: "changed" })),
      avoids: [
        ...p.avoids.added.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: ${labelOf(SEVERITIES, a.severity)}`, tone: a.severity === "allergy" ? "allergy" : "added" })),
        ...p.avoids.stronger.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: ${labelOf(SEVERITIES, a.from)} → ${labelOf(SEVERITIES, a.to)}`, tone: "changed" })),
        ...p.avoids.weaker.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: ${labelOf(SEVERITIES, a.from)} → ${labelOf(SEVERITIES, a.to)} (less strict)`, tone: "weaker" })),
        ...p.avoids.removed.map((a) => ({ text: `${AVOID_BY_KEY[a.key]?.label ?? a.key}: no longer avoided`, tone: "removed" })),
      ],
    })),
    weakens: people.some((p) => weakens(p.avoids)),
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

async function makePlan(ctx, { quote, days, budget }, callId) {
  if (!ctx.saved.length) return refuse("Nobody is saved yet. draft_people, then save_people source=draft, then make_plan.");
  if (ctx.memory.draft?.members?.length) return refuse(`${joinLabels(ctx.memory.draft.members.map((m) => m.label))} are drafted but not saved. Call save_people source=draft first (or plan without them if the shopper declined).`);
  const w = wordsFor(ctx, quote);
  if (w.error) return refuse(w.error);
  const ev = ctx.evidence();
  if (days !== null && days !== undefined && !ev.numbers.has(Number(days))) return refuse(`The shopper didn't say ${days} days. Pass days=null.`);
  if (budget !== null && budget !== undefined && !ev.numbers.has(Number(budget))) return refuse(`The shopper didn't give a budget of ${budget}. Pass budget=null.`);
  const args = planArgs(w.text, ctx.savedRows, { days: 7, budget: null, memberIds: null, thisWeek: {} });
  const result = await planForHousehold({
    householdId: ctx.household.id,
    days: days ?? args.days ?? 7,
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
  }
  const body = await planFollowUp({ planId, text, reading, onStep: progress(ctx, callId), signal: ctx.signal });
  if (body.changed) {
    ctx.memory.planId = body.planId;
    ctx.memory.created = [...(ctx.memory.created ?? []), body.planId];
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
  if (target === "plan_step") {
    const s = step ?? "plan";
    return { ok: true, summary: `Opened ${s[0].toUpperCase()}${s.slice(1)}`, forModel: `Showing the ${s} step.`, ui: { navigate: { href: `/store/plan?step=${s}`, step: s } } };
  }
  if (target === "product") {
    const item = await productNamed(ctx, product);
    if (!item) return refuse(`No product called "${product ?? ""}" in KOI's catalogue.`);
    return { ok: true, summary: `Opened ${item.name}`, forModel: `Showing ${item.name}.`, ui: { navigate: { href: `/store/product/${item.id}` } } };
  }
  const href = { shop: "/store/shop", cart: "/store/cart", household: "/store/household" }[target];
  return { ok: true, summary: `Opened the ${target}`, forModel: `Showing the ${target}.`, ui: { navigate: { href } } };
}

async function prepareCart(ctx) {
  if (!ctx.memory.said.some((s) => ASKS_CART.test(norm(s)))) return { refused: "The shopper didn't ask for the cart. Don't add to it; mention they can, in finish." };
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

const DAY_OPTIONS = [7, 5, 3, 14];

function askCard(ctx, { topic, about, options }) {
  const labels = [...ctx.saved.map((p) => p.label), ...(ctx.memory.draft?.members ?? []).map((m) => m.label)];
  if (topic === "who") return { card: askCardFor([{ kind: "who" }]) };
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
  ask_shopper: { kind: "ask", card: askCard },
  finish: { kind: "end", run: finish },
});

export { PlanStopped };
