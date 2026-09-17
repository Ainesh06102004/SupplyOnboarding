// ============================================================================
// KOI PLANNER — tests for drafting a household from a brief (Phase 4.2)
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { readBrief, groundModelDraft, draftFrom, dietsNamed, BRIEF_JSON_SCHEMA, AGE_BAND_KEYS } from "@/lib/planner/brief.js";

const draft = (text, model = null) => draftFrom(readBrief(text), model);

test("the founder's example drafts four people and asks what it was not told", () => {
  const d = draft("We're four, two adults and two kids, 120 g protein each for the adults");
  assert.deepEqual(d.members.map((m) => m.label), ["Adult 1", "Adult 2", "Kid 1", "Kid 2"]);
  assert.deepEqual(d.members.map((m) => m.target_protein_g), [120, 120, "", ""], "only the adults were given a target");
  assert.deepEqual(d.members.map((m) => m.age_band), ["adult_19_59", "adult_19_59", "", ""], "a kid's age is asked, not guessed");
  assert.ok(d.members.every((m) => m.diet_type === ""), "no diet was named, so none is assumed");
  assert.equal(d.source, "rules");
  assert.ok(d.notes.some((n) => /age group/.test(n)));
  assert.ok(d.notes.some((n) => /diet/.test(n)));
});

test("targets, diet, budget and days are read where the shopper wrote them", () => {
  const d = draft("Me and my wife, both vegetarian, 60 g protein and 2000 kcal each, budget ₹3,000 for a week");
  assert.deepEqual(d.members.map((m) => m.label), ["Me", "Wife"]);
  assert.ok(d.members.every((m) => m.diet_type === "vegetarian" && m.target_protein_g === 60 && m.target_kcal === 2000));
  assert.equal(d.budget, 3000);
  assert.equal(d.days, 7);
});

test("an age and an allergy stick to the person they were said about", () => {
  const d = draft("family of four: my grandma, two adults and a son aged 8 who is allergic to peanuts");
  assert.deepEqual(d.members.map((m) => m.label), ["Grandma", "Adult 1", "Adult 2", "Son"]);
  const byLabel = Object.fromEntries(d.members.map((m) => [m.label, m]));
  assert.equal(byLabel.Grandma.age_band, "senior_60_plus");
  assert.equal(byLabel.Son.age_band, "child_7_9");
  assert.equal(byLabel["Adult 1"].age_band, "adult_19_59");
  assert.deepEqual(byLabel.Son.avoidKeys, ["peanuts"]);
  assert.ok(d.members.filter((m) => m.label !== "Son").every((m) => m.avoidKeys.length === 0), "nobody else's plan loses peanuts");
});

test("a kid's allergy and a wife's gluten-free diet are not put on me", () => {
  const d = draft("Me, my wife and my son. My son is allergic to peanuts and my wife is gluten free");
  assert.deepEqual(d.members.map((m) => m.label), ["Me", "Wife", "Son"], "the son named twice is one son");
  const byLabel = Object.fromEntries(d.members.map((m) => [m.label, m]));
  assert.deepEqual(byLabel.Me.avoidKeys, []);
  assert.deepEqual(byLabel.Wife.avoidKeys, ["gluten"]);
  assert.deepEqual(byLabel.Son.avoidKeys, ["peanuts"]);
  assert.ok(!d.notes.some((n) => /not said about anyone/.test(n)));
});

test("an avoid said about no one in particular is on everyone, and the draft says so", () => {
  const d = draft("two adults and two kids, no peanuts");
  assert.ok(d.members.every((m) => m.avoidKeys.includes("peanuts")));
  assert.ok(d.notes.some((n) => /Peanuts was not said about anyone in particular/.test(n)));
});

test("a medical condition is reported, never turned into a diet or a target", () => {
  const d = draft("two adults, my dad is diabetic");
  assert.ok(d.unresolved.some((w) => /diabet/.test(w)));
  assert.ok(d.members.every((m) => m.target_protein_g === "" && m.target_kcal === "" && m.diet_type === ""));
});

test("non veg is not read as veg", () => {
  assert.deepEqual(dietsNamed("we are non veg"), ["non_vegetarian"]);
  assert.deepEqual(dietsNamed("pure veg family"), ["vegetarian"]);
});

const modelSays = (patch = {}) => ({
  groups: [
    { who: "two adults", role: "adult", count: 2, ageBand: "adult_19_59", dietType: null, avoidKeys: [], proteinG: 120, kcal: null },
    { who: "two kids", role: "child", count: 2, ageBand: null, dietType: null, avoidKeys: [], proteinG: null, kcal: null },
  ],
  days: null,
  budget: null,
  unresolved: [],
  ...patch,
});
const FOUNDER = "We're four, two adults and two kids, 120 g protein each for the adults, for a week";

test("a model's reading is used once it is held to the sentence", () => {
  const grounded = groundModelDraft(modelSays({ days: 7 }), FOUNDER);
  const d = draftFrom(readBrief(FOUNDER), grounded);
  assert.equal(d.source, "openai");
  assert.deepEqual(d.members.map((m) => m.target_protein_g), [120, 120, "", ""]);
  assert.equal(d.days, 7, "a week was written");
});

test("a model cannot add a person, a number, an age, or a diet the shopper did not give", () => {
  const extraKid = modelSays();
  extraKid.groups[1].count = 3;
  assert.equal(groundModelDraft(extraKid, FOUNDER), null, "three kids were not written: the reading is refused");

  const invented = modelSays({ budget: 4000 });
  invented.groups[1] = { ...invented.groups[1], proteinG: 30, kcal: 1400, ageBand: "child_7_9", dietType: "vegetarian" };
  const g = groundModelDraft(invented, FOUNDER);
  assert.equal(g.groups[1].proteinG, null);
  assert.equal(g.groups[1].kcal, null);
  assert.equal(g.groups[1].ageBand, null);
  assert.equal(g.groups[1].dietType, null);
  assert.equal(g.budget, null);

  assert.equal(groundModelDraft({ groups: "four" }, FOUNDER), null, "not the schema: not used");
});

test("a model's avoids stay on the person it gave them to, and only if the message names them", () => {
  const text = "Me, my wife and my son. My son is allergic to peanuts and my wife is gluten free";
  const said = {
    groups: [
      { who: "me", role: "adult", count: 1, ageBand: "adult_19_59", dietType: null, avoidKeys: [], proteinG: null, kcal: null },
      { who: "my wife", role: "adult", count: 1, ageBand: "adult_19_59", dietType: null, avoidKeys: ["gluten", "soy"], proteinG: null, kcal: null },
      { who: "my son", role: "child", count: 1, ageBand: null, dietType: null, avoidKeys: ["peanuts"], proteinG: null, kcal: null },
    ],
    days: null, budget: null, unresolved: [],
  };
  const d = draftFrom(readBrief(text), groundModelDraft(said, text));
  assert.equal(d.source, "openai");
  assert.deepEqual(d.members.map((m) => [m.label, m.avoidKeys]), [["Me", []], ["Wife", ["gluten"]], ["Son", ["peanuts"]]], "soy was never said");

  // The model forgets the son's allergy: the rules placed it, so it is kept — on everyone, never dropped.
  said.groups[2].avoidKeys = [];
  const forgot = draftFrom(readBrief(text), groundModelDraft(said, text));
  assert.ok(forgot.members.every((m) => m.avoidKeys.includes("peanuts")));
});

test("the model's schema offers only KOI's keys, strictly", () => {
  const item = BRIEF_JSON_SCHEMA.properties.groups.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  assert.deepEqual(item.properties.ageBand.enum, [...AGE_BAND_KEYS, null]);
});
