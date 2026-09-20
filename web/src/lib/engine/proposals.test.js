// What an allergen statement declares, and what it merely warns about.

import test from "node:test";
import assert from "node:assert/strict";

import { proposeAllergens, splitStatement } from "@/lib/engine/proposals.js";

test("one statement can declare and warn at once", () => {
  // The Madras Mixture pack, quoted. Treating the whole statement as
  // precautionary because it says "MAY CONTAIN" filed the DECLARED wheat as a
  // trace, and the label published as "may contain gluten" — which is the
  // wrong direction to be wrong in for anyone who cannot eat wheat.
  const proposed = proposeAllergens({
    ingredients_text: "Gram Flour, Rice Flour, Peanuts, Cashews, Curry Leaves",
    allergen_statement: "ALLERGEN INFORMATION: CONTAINS WHEAT AND NUTS. MAY CONTAIN MILK.",
    may_contain_statement: null,
  });
  assert.ok(proposed.contains.includes("gluten"), "wheat is declared, not a trace");
  assert.ok(proposed.contains.includes("tree_nut"));
  assert.ok(proposed.contains.includes("peanut"), "and the list still counts");
  assert.deepEqual(proposed.may_contain, ["dairy"]);
});

test("a statement that is only about the factory stays a warning", () => {
  // Daily Dry Fruit Mix: both readers filed the factory notice under the
  // allergen statement. Publishing that as an ingredient would say the mix
  // contains every allergen the building handles.
  const proposed = proposeAllergens({
    ingredients_text: "Roasted Almonds, Black Raisins",
    allergen_statement: "Manufactured in a facility that also processes peanut, gluten and soy.",
    may_contain_statement: null,
  });
  assert.equal(proposed.contains.includes("peanut"), false);
  assert.equal(proposed.contains.includes("gluten"), false);
  assert.ok(proposed.contains.includes("tree_nut"), "almonds are in the list, and that is a declaration");
  assert.ok(proposed.may_contain.includes("peanut"));
  assert.ok(proposed.may_contain.includes("soy"));
});

test("the cut falls at the first warning, and nowhere if there is none", () => {
  assert.deepEqual(splitStatement("Contains milk. Manufactured in a facility that processes peanuts."), {
    declared: "Contains milk. ",
    precautionary: "Manufactured in a facility that processes peanuts.",
  });
  assert.deepEqual(splitStatement("Contains milk and soy."), {
    declared: "Contains milk and soy.",
    precautionary: "",
  });
  assert.deepEqual(splitStatement(null), { declared: "", precautionary: "" });
});

test("a declared allergen is never also listed as a trace", () => {
  const proposed = proposeAllergens({
    ingredients_text: "Milk Solids, Sugar",
    allergen_statement: "Contains milk. May contain milk and nuts.",
    may_contain_statement: null,
  });
  assert.ok(proposed.contains.includes("dairy"));
  assert.equal(proposed.may_contain.includes("dairy"), false, "the stronger claim wins");
  assert.ok(proposed.may_contain.includes("tree_nut"));
});
