// ============================================================================
// KOI FOOD — How processed a food is, read from its ingredient list (NOVA)
//
// Phase 2.4. Answers from food.processing_term and food.processing_names,
// compiled into ./processingData.js by scripts/buildProcessing.mjs.
//
// NOVA (Monteiro CA et al., Public Health Nutrition 22(5), 2019):
//   4  ultra-processed: any cosmetic additive (flavour, colour, emulsifier,
//      non-sugar sweetener, thickener...) or substance of no or rare culinary
//      use (maltodextrin, glucose syrup, casein, protein isolate...)
//   3  processed: foods with salt, sugar, oil or another culinary ingredient
//      added, or an additive that preserves them
//   2  processed culinary ingredients alone: honey, oil, ghee, salt, sugar
//   1  foods alone
//
// Each piece of the list between separators is read. Names that signal a role
// are counted by role; any other word ("almond", "poha", "moringa") makes the
// piece a food. An INS code KOI does not know is an additive of unknown class:
// it counts as processing, never as a food, and is reported.
//
// Only a complete ingredient list can be read this way. A partial list, a name
// or a category is not evidence of how a food was made, and gets no group.
//
// Pure.
// ============================================================================

import { words } from "./normalise";
import { buildIndex, scan, SEPARATORS } from "./phrases";
import { NAMES, PROCESSING_VERSION } from "./processingData";

export { PROCESSING_VERSION };

const INDEX = buildIndex(NAMES.map(([name, role]) => [name, { role, name }]));

// Words that join or qualify a list without naming anything in it.
const FILLER = new Set(["and", "or", "with", "of", "in", "from", "the", "an", "for", "as", "to", "added", "permitted", "ii", "iii", "iv", "contain"]);

const sorted = (set) => [...set].sort();

/**
 * @param {string} text a complete ingredient list
 * @returns {{ group: 1|2|3|4|null, markers: string[], culinary: string[], processed: string[],
 *   unclassifiedAdditives: string[], foods: number, version: string }}
 */
export function processingOf(text) {
  const markers = new Set();
  const culinary = new Set();
  const processed = new Set();
  const unclassified = new Set();
  let foods = 0;

  for (const part of String(text ?? "").split(SEPARATORS)) {
    const covered = new Set();
    for (const hit of scan(part, INDEX)) {
      for (let i = hit.start; i < hit.end; i += 1) covered.add(i);
      if (hit.role === "ultra_processed") markers.add(hit.name);
      else if (hit.role === "culinary") culinary.add(hit.name);
      else if (hit.role === "processed") processed.add(hit.name);
    }
    let food = false;
    words(part).forEach((token, i) => {
      if (covered.has(i) || FILLER.has(token) || !/[a-z]{2}/.test(token)) return;
      if (/^ins\d/.test(token)) unclassified.add(token);
      else food = true;
    });
    if (food) foods += 1;
  }

  const processing = culinary.size + processed.size + unclassified.size > 0;
  const group = markers.size ? 4
    : foods === 0 ? (processing ? 2 : null)
    : processing ? 3 : 1;

  return {
    group,
    markers: sorted(markers),
    culinary: sorted(culinary),
    processed: sorted(processed),
    unclassifiedAdditives: sorted(unclassified),
    foods,
    version: PROCESSING_VERSION,
  };
}
