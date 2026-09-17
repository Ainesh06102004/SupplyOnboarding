// ============================================================================
// KOI PLANNER — tests for follow-ups (Phase 4.3)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { readFollowUp, groundFollowUp, mergeFollowUps, applyFollowUp, membersNamed, productsNamed, productWordFor, followUpExamples, CHEAPER_SHARE } from "@/lib/planner/followup.js";

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
