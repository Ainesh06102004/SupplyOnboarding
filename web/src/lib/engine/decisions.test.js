// What a set of decided review items is allowed to publish.

import test from "node:test";
import assert from "node:assert/strict";

import { buildPublishPayload } from "@/lib/engine/decisions.js";

const item = (group, proposed, status = "accepted") => ({ field_group: group, proposed, status, decision: null });
const identity = item("identity", { product_name: "Kalanamak Rice" });

test("an agreed ABSENCE of an ingredient list is not a complete list", () => {
  // The live case: the Gorakhpur rice photo is an Equinox Labs test report.
  // All three readers looked, all three found no ingredient list, and they
  // agreed perfectly. Publishing that would have told KOI the rice has no
  // ingredients — and a machine_read list is trusted to say what is ABSENT, so
  // it would have gone on to certify the rice free of every allergen.
  const payload = buildPublishPayload([
    identity,
    item("ingredients", { raw_ingredient_text: null, parsed_ingredients: [] }),
    item("allergens", { contains: [], may_contain: [] }),
  ]);
  assert.equal(payload.ingredients, null);
  assert.match(payload.blockers.join(" "), /carries no ingredient list/);

  // An empty string is the same absence.
  const blank = buildPublishPayload([
    identity,
    item("ingredients", { raw_ingredient_text: "   ", parsed_ingredients: [] }),
    item("allergens", { contains: [], may_contain: [] }),
  ]);
  assert.equal(blank.ingredients, null);
});

test("a real list still publishes with its allergens", () => {
  const payload = buildPublishPayload([
    identity,
    item("ingredients", { raw_ingredient_text: "Saffron", parsed_ingredients: [{ name: "Saffron" }] }),
    item("allergens", { contains: [], may_contain: [] }),
  ]);
  assert.equal(payload.ingredients.raw_ingredient_text, "Saffron");
  assert.deepEqual(payload.ingredients.allergens, []);
  assert.deepEqual(payload.blockers, []);
});

test("nothing publishes until the photo is agreed to be this product", () => {
  const payload = buildPublishPayload([
    item("identity", { product_name: "Something else" }, "pending"),
    item("ingredients", { raw_ingredient_text: "Saffron", parsed_ingredients: [] }),
    item("allergens", { contains: [], may_contain: [] }),
  ]);
  assert.equal(payload.ingredients, null);
  assert.equal(payload.nutrition, null);
  assert.match(payload.blockers.join(" "), /Confirm the photo is this product/);
});

test("ingredients and allergens publish together, or not at all", () => {
  const payload = buildPublishPayload([
    identity,
    item("ingredients", { raw_ingredient_text: "Saffron", parsed_ingredients: [] }),
    item("allergens", { contains: [] }, "pending"),
  ]);
  assert.equal(payload.ingredients, null);
  assert.match(payload.blockers.join(" "), /publish together/);
});
