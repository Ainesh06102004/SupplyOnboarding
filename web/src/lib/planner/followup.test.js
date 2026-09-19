// ============================================================================
// KOI PLANNER — tests for follow-ups (Phase 4.3)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { readFollowUp, groundFollowUp, contextInstructions, mergeFollowUps, applyFollowUp, membersNamed, productsNamed, productWordFor, followUpExamples, CHEAPER_SHARE } from "@/lib/planner/followup.js";

// ── What a live conversation got wrong, 18 September 2026 ───────────────────
// A shopper asked, and the plan did the opposite or nothing:
//   "can you add oats?"              → "Left out Oats"
//   "can you add wheat to the plan?" → nothing applied
//   "swap the rice for aata please"  → every rice left out, and "nothing is
//                                      called aata" (Superior MP Atta is)
//   "can you swap toor dal with oats"→ both left out
// Each line below is one of those messages.
const SHOP = [
  { skuId: "atta", name: "Superior MP Atta", categoryKey: "staples.flours" },
  { skuId: "rice", name: "Gorakhpur Kalanamak Rice", categoryKey: "staples.rice" },
  { skuId: "brown", name: "Brown Rice", categoryKey: "staples.rice" },
  { skuId: "oats", name: "Oats", categoryKey: "staples.breakfast_cereals" },
  { skuId: "toor", name: "Unpolished Toor Dal", categoryKey: "staples.pulses" },
  { skuId: "poha", name: "Poha (Thick)", categoryKey: "staples.rice" },
];
const PLAN = { members: [{ id: "me", label: "Me", targets: {}, avoidFlags: [], softAvoidFlags: [] }], days: 7, budget: null, excludedSkus: [], includedSkus: [], cost: 1800 };
const applyText = (text, plan = PLAN) => applyFollowUp(plan, readFollowUp(text), SHOP);

test("\"add oats\" adds oats — it does not leave them out", () => {
  const r = applyText("can you add oats?");
  assert.deepEqual(r.includedSkus, ["oats"]);
  assert.deepEqual(r.excludedSkus, []);
  assert.deepEqual(r.applied, ["Added Oats"]);
});

test("\"add wheat\" finds the atta: one food, many spellings", () => {
  const wheat = applyText("can you add wheat to the plan?");
  assert.deepEqual(wheat.includedSkus, ["atta"]);
  // And asking for a food is never read as a restriction on the household.
  assert.equal(wheat.applied.join(" ").includes("avoided"), false, wheat.applied.join(" "));
  assert.deepEqual(wheat.householdChanges, []);
  assert.deepEqual(applyText("add some aata").includedSkus, ["atta"]);
  assert.deepEqual(productsNamed("aata", SHOP).map((p) => p.skuId), ["atta"]);
  assert.deepEqual(productsNamed("daal", SHOP).map((p) => p.skuId), ["toor"]);
});

test("a swap is one change: the rice goes out only because the atta comes in", () => {
  const r = applyText("swap the rice for aata please");
  assert.deepEqual(r.includedSkus, ["atta"]);
  // The rices by name. Poha is flaked rice, but nobody calls it rice.
  assert.deepEqual(r.excludedSkus.sort(), ["brown", "rice"]);
  assert.match(r.applied.join(" "), /Superior MP Atta instead of/);
});

test("a swap KOI cannot complete changes nothing at all", () => {
  const r = applyText("swap the rice for quinoa");
  assert.deepEqual(r.excludedSkus, [], "the rice stays");
  assert.deepEqual(r.includedSkus, []);
  assert.deepEqual(r.notApplied, ['KOI has nothing called "quinoa" to swap in, so the rice stays']);
});

test("\"swap toor dal with oats\" takes out the dal and puts in the oats", () => {
  const r = applyText("can you swap toor dal with oats");
  assert.deepEqual(r.excludedSkus, ["toor"]);
  assert.deepEqual(r.includedSkus, ["oats"]);
  assert.equal(r.notApplied.length, 0);
});

test("a count and a pack word are not the food's name", () => {
  const shop = [...SHOP, { skuId: "dates", name: "Dates", categoryKey: "nuts_seeds.dried_fruit" }, { skuId: "honey", name: "Uttrakhand Honey", categoryKey: "sweeteners.honey" }];
  // "Nothing KOI can plan with is called 'date pack'", and "one 250g pack" left over.
  for (const message of ["can you remove 1 date pack and swap it with honey instead?", "can you remove one 250g pack of dates and swap it with honey instead?"]) {
    const r = applyFollowUp({ ...PLAN, excludedSkus: [], includedSkus: [] }, readFollowUp(message), shop);
    assert.deepEqual(r.excludedSkus, ["dates"], message);
    assert.deepEqual(r.includedSkus, ["honey"], message);
    assert.equal(r.notApplied.length, 0, `${message}: ${r.notApplied.join(" · ")}`);
  }
});

// How people actually type, each line a message and what it must do. Added to
// whenever a live conversation finds one KOI reads wrongly.
test("the ways a shopper asks for a change", () => {
  const shop = [
    ...SHOP,
    { skuId: "dates", name: "Dates", categoryKey: "nuts_seeds.dried_fruit" },
    { skuId: "honey", name: "Uttrakhand Honey", categoryKey: "sweeteners.honey" },
    { skuId: "pb", name: "Natural Peanut Butter Crunch", categoryKey: "nuts_seeds.nut_butters" },
    { skuId: "chips", name: "The Healthy Potato Chips", categoryKey: "snacks.chips_crisps" },
    { skuId: "fruitmix", name: "Daily Fruit Mix", categoryKey: "nuts_seeds.dried_fruit" },
    { skuId: "biscuit", name: "NutriChoice Digestive", categoryKey: "snacks.biscuits_cookies" },
  ];
  const read = (message) => applyFollowUp({ ...PLAN, excludedSkus: [], includedSkus: [] }, readFollowUp(message), shop);
  const cases = [
    // [message, products out, products in]
    ["no dates", ["dates"], []],
    ["remove the dates please", ["dates"], []],
    ["i don t want dates", ["dates"], []],
    ["drop 2 packs of dates", ["dates"], []],
    ["take out the potato chips", ["chips"], []],
    ["add honey", [], ["honey"]],
    ["can you also add some peanut butter", [], ["pb"]],
    ["include 1 jar of honey", [], ["honey"]],
    ["add 500g atta", [], ["atta"]],
    ["swap dates for honey", ["dates"], ["honey"]],
    ["replace the dates with honey", ["dates"], ["honey"]],
    ["honey instead of dates", ["dates"], ["honey"]],
    ["switch out the oats for poha", ["oats"], ["poha"]],
    ["remove 1 date pack and swap it with honey instead", ["dates"], ["honey"]],
    ["remove one 250g pack of dates and swap it with honey", ["dates"], ["honey"]],
    ["swap the aata for brown rice", ["atta"], ["brown"]],
    ["no daal", ["toor"], []],
    ["add channa", [], []],
    // The thing being replaced is often not said twice.
    ["take out the dates and replace with honey", ["dates"], ["honey"]],
    ["remove the oats and put poha instead", ["oats"], ["poha"]],
    ["get rid of the dates", ["dates"], []],
    ["use honey instead of dates", ["dates"], ["honey"]],
    ["swap out the dates, honey please", ["dates"], []],
    // A kind of food, not a product: the category answers.
    ["remove the 1 pack of dates and put another dry fruit in there please", ["dates"], ["fruitmix"]],
    ["add some dry fruit", [], ["dates"]],
    ["swap the potato chips for a biscuit", ["chips"], ["biscuit"]],
  ];
  for (const [message, out, into] of cases) {
    const r = read(message);
    assert.deepEqual(r.excludedSkus.sort(), [...out].sort(), `${message} — out`);
    assert.deepEqual(r.includedSkus.sort(), [...into].sort(), `${message} — in`);
  }
});

test("\"for my wife\" is the wife: a possessive is not part of a name", () => {
  const people = [{ id: "me", label: "Me", targets: {}, avoidFlags: [], softAvoidFlags: [] }, { id: "wife", label: "Wife", targets: {}, avoidFlags: [], softAvoidFlags: [] }];
  assert.deepEqual(membersNamed("my wife", people).map((m) => m.id), ["wife"]);
  assert.deepEqual(membersNamed("the kids", people).map((m) => m.id), []);

  const avoid = applyFollowUp({ ...PLAN, members: people }, readFollowUp("no dairy for my wife"), SHOP);
  assert.match(avoid.applied.join(" "), /Milk avoided for Wife/);
  assert.deepEqual(avoid.notApplied, []);

  const target = applyFollowUp({ ...PLAN, members: people }, readFollowUp("75 g protein for my wife"), SHOP);
  assert.match(target.applied.join(" "), /Wife: 75 g protein a day/);
  assert.deepEqual(target.householdChanges.map((c) => c.memberId), ["wife"]);
});

test("what it cannot do, it says plainly", () => {
  const r = applyFollowUp({ ...PLAN, excludedSkus: [], includedSkus: [] }, readFollowUp("swap the oats for quinoa"), SHOP);
  assert.deepEqual(r.excludedSkus, []);
  assert.match(r.notApplied.join(" "), /nothing called "quinoa"/);
  const nothing = applyFollowUp({ ...PLAN }, readFollowUp("hello"), SHOP);
  assert.match(nothing.notApplied.join(" "), /could not find a change/);
});

test("a product asked for is never also left out", () => {
  const r = applyText("no oats, actually add oats");
  assert.deepEqual(r.includedSkus, ["oats"]);
  assert.deepEqual(r.excludedSkus, []);
});

test("examples for changing a plan come from the plan, and each one would work", () => {
  const names = [
    "Gorakhpur Kalanamak Rice", "Split Moong Dal", "Superior MP Atta", "Natural Peanut Butter Crunch",
    "The Healthy Butter Cookies", "Healthy Snack Combo - Pack of 6", "Golden Milk Mix", "Mango Mysore Pak", "Oats", "Besan",
  ];
  assert.deepEqual(names.map(productWordFor), [
    "kalanamak rice", "moong dal", "atta", "peanut butter", "butter cookies", "snack", "golden milk", "mysore pak", "oats", "besan",
  ]);
  const catalogue = names.map((name, i) => ({ skuId: String(i), name }));
  names.forEach((name, i) => assert.ok(productsNamed(productWordFor(name), catalogue).some((p) => p.skuId === String(i)), `"${productWordFor(name)}" finds ${name}`));

  const examples = followUpExamples({ basket: [{ name: "Natural Peanut Butter Crunch" }, { name: "Split Moong Dal" }, { name: "Superior MP Atta" }], days: 7 });
  assert.deepEqual(examples, ["swap the moong dal", "no atta", "cheaper", "10 days"], "peanut butter would read as a peanut avoid, so it is not offered");
  const plan = { members: [{ id: "me", label: "Me", targets: {}, avoidFlags: [], softAvoidFlags: [] }], days: 7, budget: null, excludedSkus: [], cost: 1000 };
  const dal = applyFollowUp(plan, readFollowUp(examples[0]), [{ skuId: "dal", name: "Split Moong Dal" }]);
  assert.deepEqual(dal.excludedSkus, ["dal"]);
});

const member = (label, targets = { protein: 60, kcal: 2000 }) => ({ id: label, label, targets, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] });
const household = [member("Adult 1"), member("Adult 2"), member("Kid 1", { protein: 30, kcal: 1400 }), member("Kid 2", { protein: 30, kcal: 1400 })];
const catalogue = [
  { skuId: "oats", name: "Oats" },
  { skuId: "muesli", name: "Super Muesli 0% Added Sugar" },
  { skuId: "basmati", name: "Rozana Super Basmati Rice" },
  { skuId: "brown", name: "Brown Rice" },
];
const plan = { members: household, days: 7, budget: 4000, excludedSkus: [], cost: 3976 };
const apply = (text) => applyFollowUp(plan, readFollowUp(text), catalogue);

test("the founder's three follow-ups", () => {
  const cheaper = apply("cheaper");
  assert.equal(cheaper.budget, Math.floor((3976 * CHEAPER_SHARE) / 10) * 10);
  assert.equal(cheaper.budget, 3570);
  assert.match(cheaper.applied[0], /10% under this plan's ₹3,976/);

  const paneer = apply("no paneer on Tuesday");
  assert.deepEqual(paneer.excludedSkus, []);
  assert.ok(paneer.notApplied.some((n) => /called "paneer"/.test(n)), "said, not silently ignored");
  assert.ok(paneer.members.every((m) => !m.avoidFlags.includes("dairy")), "no paneer is not no dairy");

  const groundedPaneer = groundFollowUp(blankModel({ avoid: [{ key: "milk", who: null }], leaveOut: ["paneer"] }), "no paneer on Tuesday");
  assert.deepEqual(groundedPaneer.avoid, [], "a model's 'avoid milk' for paneer is not kept");
  assert.deepEqual(groundedPaneer.leaveOut, ["paneer"]);

  const oats = apply("swap the oats");
  assert.deepEqual(oats.excludedSkus, ["oats"]);
  assert.deepEqual(oats.applied, ["Left out Oats"]);
  assert.equal(oats.budget, 4000, "nothing else moved");
});

test("a day of the week is answered honestly, not silently widened", () => {
  const r = apply("no rice on monday");
  assert.deepEqual(r.excludedSkus.sort(), ["basmati", "brown"]);
  assert.ok(r.notApplied.some((n) => /whole period/.test(n)));
});

test("an allergen is an avoid, for the people named or everyone", () => {
  const kids = apply("no nuts for the kids");
  assert.deepEqual(kids.excludedSkus, [], "nuts is an avoid, not a product word");
  const byLabel = Object.fromEntries(kids.members.map((m) => [m.label, m]));
  assert.ok(byLabel["Kid 1"].avoidFlags.includes("tree_nut") && byLabel["Kid 2"].avoidFlags.includes("tree_nut"));
  assert.equal(byLabel["Adult 1"].avoidFlags.length, 0);
  assert.equal(household[2].avoidFlags.length, 0, "the plan's own members are not mutated");
});

test("a target changes only at a number written, for the person named", () => {
  const r = apply("45 g protein for Kid 1");
  assert.equal(r.members.find((m) => m.label === "Kid 1").targets.protein, 45);
  assert.deepEqual(r.householdChanges, [{ memberId: "Kid 1", label: "Kid 1", targets: { target_protein_g: 45 }, addAvoidKeys: [] }], "offered for saving, not saved");
  assert.deepEqual(apply("cheaper").householdChanges, [], "a budget belongs to the plan, not a person");
  assert.equal(r.members.find((m) => m.label === "Kid 2").targets.protein, 30);
  const vague = apply("more protein for the kids");
  assert.ok(vague.members.every((m, i) => m.targets.protein === household[i].targets.protein), "no number, no change");
});

test("budget and days: set, removed, or left alone", () => {
  assert.equal(apply("keep it under ₹3,000").budget, 3000);
  assert.equal(apply("don't worry about the budget").budget, null);
  assert.equal(apply("plan for 10 days").days, 10);
  assert.equal(apply("no oats this week").days, 7, "mentioning a week is not asking for one");
  assert.equal(apply("not too expensive").applied.join(), "Budget ₹3,570, 10% under this plan's ₹3,976");
});

test("people and products are matched by what the shopper wrote", () => {
  assert.deepEqual(membersNamed("the kids", household).map((m) => m.label), ["Kid 1", "Kid 2"]);
  assert.deepEqual(membersNamed("Adult 2", household).map((m) => m.label), ["Adult 2"]);
  assert.equal(membersNamed(null, household).length, 4);
  assert.deepEqual(productsNamed("rice", catalogue).map((p) => p.skuId), ["basmati", "brown"]);
  assert.deepEqual(productsNamed("oat", catalogue).map((p) => p.skuId), ["oats"]);
});

const blankModel = (patch = {}) => ({ budget: { change: "none", rupees: null }, days: null, leaveOut: [], avoid: [], targets: [], unresolved: [], ...patch });

test("a model's follow-up is held to the sentence", () => {
  const text = "swap the oats and make it cheaper";
  const g = groundFollowUp(blankModel({
    budget: { change: "set", rupees: 3000 },
    days: 7,
    leaveOut: ["oats", "rice"],
    targets: [{ who: null, nutrient: "protein", perDay: 80 }],
  }), text);
  assert.equal(g.budget.change, "none", "3000 was not written");
  assert.equal(g.days, null);
  assert.deepEqual(g.leaveOut, ["oats"], "rice was not written");
  assert.deepEqual(g.targets, []);

  const loosen = groundFollowUp(blankModel({ budget: { change: "remove", rupees: null } }), "swap the oats");
  assert.equal(loosen.budget.change, "none", "a budget is removed only when the message talks about money");
  assert.equal(groundFollowUp({ nonsense: true }, text), null);

  const merged = mergeFollowUps(readFollowUp(text), groundFollowUp(blankModel({ budget: { change: "cheaper", rupees: null }, leaveOut: ["oats"] }), text));
  assert.equal(merged.budget.change, "cheaper");
  assert.deepEqual(merged.leaveOut, ["oats"]);
});

test("someone can leave the week: \"replan without my wife\"", () => {
  // Live: both of these came back "Nothing KOI can plan with is called wife".
  const members = [
    { id: "me", label: "Me", targets: { protein: 144 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] },
    { id: "wife", label: "Wife", targets: { protein: 50 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] },
  ];
  const plan = { members, days: 7, budget: 4000, excludedSkus: [], includedSkus: [], cost: 2856 };

  for (const said of ["replan without my wife", "remove wife"]) {
    const change = applyFollowUp(plan, readFollowUp(said), SHOP);
    assert.deepEqual(change.applied, ["Planned without Wife"], said);
    assert.deepEqual(change.members.map((m) => m.id), ["me"], "and she is not in the plan that follows");
    assert.deepEqual(change.notApplied, [], said);
  }

  // A food is still a food: a person is only tried where nothing matched.
  const food = applyFollowUp(plan, readFollowUp("no rice"), SHOP);
  assert.equal(food.members.length, 2, "nobody left the week");

  // And a plan needs somebody to eat it.
  const alone = { ...plan, members: [members[1]] };
  const empty = applyFollowUp(alone, readFollowUp("remove wife"), SHOP);
  assert.deepEqual(empty.applied, []);
  assert.match(empty.notApplied[0], /needs someone to eat it/);
});

test("the model is given the lists, and its ids are held to them", () => {
  const context = {
    members: [{ id: "m-1", label: "Me" }, { id: "m-2", label: "Wife" }],
    categories: [{ key: "nuts_seeds.dried_fruit", label: "Dried fruit" }, { key: "staples.pulses", label: "Dals & pulses" }],
  };
  const told = contextInstructions(context);
  assert.match(told, /m-2 — Wife/, "it cannot resolve a person it has never been shown");
  assert.match(told, /nuts_seeds\.dried_fruit — Dried fruit/);
  assert.equal(contextInstructions({}), "", "nothing to say when there is nothing to tell it");

  const reading = (raw) => groundFollowUp({
    budget: { change: "none", rupees: null }, days: null,
    leaveOut: [], include: [], swaps: [], avoid: [], targets: [], unresolved: [],
    ...raw,
  }, "replan without my wife and put another dry fruit in", context);

  // The shopper typed "my wife", never "m-2". A verbatim check could never have
  // let this through, which is exactly why ids exist.
  assert.deepEqual(reading({ dropMembers: ["m-2"] }).dropMembers, ["m-2"]);
  assert.deepEqual(reading({ includeCategories: ["nuts_seeds.dried_fruit"] }).includeCategories, ["nuts_seeds.dried_fruit"]);

  // An id that is not on the list is dropped just as firmly as an invented word.
  assert.deepEqual(reading({ dropMembers: ["m-9"] }).dropMembers, []);
  assert.deepEqual(reading({ leaveOutCategories: ["sweets.cake"] }).leaveOutCategories, []);
  assert.deepEqual(reading({ dropMembers: ["m-2", "m-2"] }).dropMembers, ["m-2"], "and said once");
});

test("a change that came back as an id needs no word to match", () => {
  const members = [
    { id: "m-1", label: "Me", targets: { protein: 144 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] },
    { id: "m-2", label: "Wife", targets: { protein: 50 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] },
  ];
  const plan = { members, days: 7, budget: 4000, excludedSkus: [], includedSkus: [], cost: 2856 };
  const reading = { ...readFollowUp("do that thing"), dropMembers: ["m-2"], leaveOutCategories: ["staples.rice"], includeCategories: ["staples.breakfast_cereals"] };

  const change = applyFollowUp(plan, reading, SHOP);
  assert.ok(change.applied.includes("Planned without Wife"));
  assert.deepEqual(change.members.map((m) => m.id), ["m-1"]);
  // Every rice in the shop, by its shelf rather than by its name.
  assert.deepEqual([...change.excludedSkus].sort(), ["brown", "poha", "rice"]);
  assert.ok(change.includedSkus.includes("oats"), "and one product from the shelf asked for");
});

test("somebody just added is not called missing in the same breath", () => {
  // Live: the model resolved "my wife" to an id and added her, then the word
  // loop — seeing her no longer absent — answered "KOI has nothing called
  // wife to add". Both were in the same reply.
  const me = { id: "me", label: "Me", targets: { protein: 144 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] };
  const wife = { id: "wife", label: "Wife", targets: { protein: 50 }, avoidFlags: [], softAvoidFlags: [], dietExcludes: [] };
  const plan = { members: [me], days: 7, budget: 4000, excludedSkus: [], includedSkus: [], cost: 2560, roster: [me, wife] };

  const both = applyFollowUp(plan, { ...readFollowUp("can you plan for my wife too"), addMembers: ["wife"] }, SHOP);
  assert.deepEqual(both.applied, ["Planned for Wife as well"], "said once");
  assert.deepEqual(both.notApplied, [], "and not contradicted");
  assert.deepEqual(both.members.map((m) => m.id), ["me", "wife"]);

  // The rules alone still add her when the model is not configured.
  const rulesOnly = applyFollowUp(plan, readFollowUp("add wife"), SHOP);
  assert.deepEqual(rulesOnly.applied, ["Planned for Wife as well"]);

  // And a word that names nobody is still an honest miss.
  const nobody = applyFollowUp(plan, readFollowUp("add quinoa"), SHOP);
  assert.match(nobody.notApplied[0], /nothing called "quinoa" to add/);

  // Asking for somebody who is already eating says so. "Nothing in that could
  // be applied" told a shopper who asked for his wife precisely nothing.
  const already = applyFollowUp({ ...plan, members: [me, wife] }, readFollowUp("add wife"), SHOP);
  assert.deepEqual(already.applied, []);
  assert.deepEqual(already.notApplied, ["Wife is already eating this plan"]);
});
