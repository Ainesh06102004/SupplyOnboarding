// ============================================================================
// KOI ENGINE — Agreement instead of authority
//
// A reading of a photograph is one opinion, whoever holds it. Two readings that
// differ are not evidence. Several independent readers reaching the SAME answer
// is evidence, and it is a better test than one person glancing once — which is
// what "route it to a human" amounted to in practice.
//
// So: where a question is a question OF FACT that can be checked against the
// same evidence by anyone, KOI asks again until enough readers agree, and acts
// on what they agree about. Where they never agree, nobody is overruled — the
// item stays open and says why.
//
// WHERE THIS IS *NOT* ALLOWED, and the distinction is the whole point:
//
//   fact       "what does this label say?" — checkable against the photo.
//              Consensus is valid, and is what this module is for.
//   judgement  "is a 20% deficit safe for an unsupervised adult?", "whose
//              consent covers a wife's weight?" — §15 items 17-19. Agreement
//              between readers of the same rulebook is not evidence about the
//              world, and there is nobody accountable for the answer. Those
//              want a nutritionist and a lawyer, and this module must never be
//              pointed at them.
//
// Pure. The readings are supplied; asking for one more is the caller's job.
// ============================================================================

import { allergensIn, allergensInStatement } from "@/lib/food/allergens";
import { splitStatement } from "./proposals";

/** How many independent readings must agree before KOI acts on an answer. */
export const CONSENSUS = Object.freeze({
  // Two is the bar. A third reading is asked for only when the first two
  // disagree, so the common case costs nothing extra.
  need: 2,
  // Never ask forever. Beyond this KOI has established only that the label is
  // hard to read, which is itself the useful answer.
  mostReadings: 4,
});

/** How deep a reading is compared before it is taken as the same shape. */
const MOST_DEPTH = 50;

/**
 * A number the way both readers meant it.
 *
 * One reader writes 5, another "5.0", and a third arrives at 0.30000000000000004
 * where the second wrote 0.3. None of those is a disagreement about a label, and
 * treating them as one sends a settled fact to a human for ever.
 */
function sameNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Twelve significant digits is far past any printed panel and short of where
  // binary floating point starts inventing differences.
  return String(Number(n.toPrecision(12)));
}

/**
 * A stable string for an answer, so two readings can be compared exactly.
 *
 * Guarded against what a model can actually hand back: a structure that points
 * at itself, and one nested past any sane depth. Neither is worth crashing the
 * protocol that decides whether an allergen is absent.
 */
export function canonical(value, seen = new WeakSet(), depth = 0) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (depth > MOST_DEPTH) return "…";
  if (typeof value === "object") {
    if (seen.has(value)) return "<cycle>";
    seen.add(value);
    const out = Array.isArray(value)
      ? `[${value.map((v) => canonical(v, seen, depth + 1)).sort().join(",")}]`
      : `{${Object.keys(value).sort().map((k) => `${k}:${canonical(value[k], seen, depth + 1)}`).join(",")}}`;
    seen.delete(value);
    return out;
  }
  if (typeof value === "number") return sameNumber(value) ?? String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    // A numeric string is the number it spells; everything else is its words.
    const asNumber = trimmed === "" ? null : sameNumber(trimmed);
    return asNumber ?? trimmed.toLowerCase();
  }
  return String(value);
}

/**
 * What a set of independent readings agrees on.
 *
 * The answer is the one the most readers gave, and it counts only if at least
 * `need` of them gave it. A tie between two answers is NOT consensus, however
 * many readers there are: two against two is the disagreement it started as.
 *
 * @param {Array<unknown>} readings one answer per reader, in any order
 * @param {{need?: number, of?: (r) => unknown, by?: (r) => string}} [options]
 *   `of` picks the part being agreed on, so the same readings can be asked
 *   about their allergens and their nutrition separately. `by` names the reader
 *   — see ONE READER, ONE VOTE below.
 * @returns {{agreed, answer, agreement, readings, why}}
 */
export function consensusOf(readings = [], { need = CONSENSUS.need, of = (r) => r, by = null } = {}) {
  // A bar of one is not a weaker bar, it is no bar: one reader deciding alone
  // is exactly what this protocol exists to replace.
  if (!(need >= 2)) throw new Error("consensus needs at least two readers to agree");
  // A reader that did not answer is not a reader. `null` IS an answer — two
  // readers both finding no allergen statement agree about the pack.
  const given = readings.filter((r) => r !== undefined);
  if (!given.length) return { agreed: false, answer: null, agreement: 0, readings: 0, why: "nothing was read" };

  // ONE READER, ONE VOTE. Nothing in the values can tell one model asked twice
  // from two models asked once, so a caller that retried a failed call and kept
  // both results would manufacture agreement out of a single opinion — and that
  // agreement is what lets KOI say an allergen is absent. When readers identify
  // themselves, each gets one vote, and a reader that contradicts itself gets
  // none: it has not got an answer to give.
  // A reader that looked and could not read this PART has abstained, and an
  // abstention must never become a vote. It is the whole absence-of-evidence
  // trap: `undefined` reaching a part-picker turns "I could not read the panel"
  // into "there is no panel", which is how a blurred photograph would come to
  // certify that a product contains no allergens.
  const picked = given.map((r) => ({ r, answer: of(r) }));
  const abstained = picked.filter((x) => x.answer === undefined).length;
  const voting = picked.filter((x) => x.answer !== undefined);
  if (!voting.length) {
    return { agreed: false, answer: null, agreement: 0, readings: given.length, why: `all ${given.length} reader(s) abstained` };
  }
  let answers = voting.map((x) => x.answer);
  let sameReader = 0;
  let unverified = 0;
  if (by) {
    const byReader = new Map();
    voting.forEach(({ r }, i) => {
      // A reader that will not name itself cannot be shown to be a DIFFERENT
      // reader from the ones that did, and "cannot tell" must never be read as
      // "independent". It gets no vote: an unverifiable second opinion is not a
      // second opinion.
      const named = by(r);
      if (named === null || named === undefined || String(named).trim() === "") {
        unverified += 1;
        return;
      }
      const who = String(named);
      const said = canonical(answers[i]);
      const seen = byReader.get(who);
      if (!seen) byReader.set(who, { answer: answers[i], said });
      else if (seen.said !== said) seen.conflicted = true;
      else sameReader += 1;
    });
    answers = [...byReader.values()].filter((v) => !v.conflicted).map((v) => v.answer);
    if (!answers.length) {
      return {
        agreed: false,
        answer: null,
        agreement: 0,
        readings: given.length,
        why: unverified
          ? `${unverified} reading(s) came from a reader that did not identify itself, so none can be shown to be independent`
          : "every reader contradicted itself",
      };
    }
  }

  const counts = new Map();
  for (const answer of answers) {
    const key = canonical(answer);
    const seen = counts.get(key) ?? { answer, n: 0 };
    counts.set(key, { answer: seen.answer, n: seen.n + 1 });
  }

  const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
  const top = ranked[0];
  const tied = ranked.length > 1 && ranked[1].n === top.n;

  if (tied) {
    return {
      agreed: false,
      answer: null,
      agreement: top.n,
      readings: answers.length,
      why: `${answers.length} readers and no majority: ${top.n} each for ${ranked.filter((r) => r.n === top.n).length} different answers`,
    };
  }
  if (top.n < need) {
    return {
      agreed: false,
      answer: null,
      agreement: top.n,
      readings: answers.length,
      why: sameReader
        ? `only ${top.n} of ${answers.length} readers agree, and ${need} are needed — the same reader answered ${sameReader} more time(s), which is one opinion`
        : `only ${top.n} of ${answers.length} readings agree, and ${need} are needed`,
    };
  }
  return {
    agreed: true,
    answer: top.answer,
    agreement: top.n,
    readings: answers.length,
    why: abstained
      ? `${top.n} of ${answers.length} readings agree (${abstained} abstained)`
      : `${top.n} of ${answers.length} readings agree`,
  };
}

/**
 * Is another reading worth asking for, or has KOI learnt what it is going to?
 *
 * It must be asked about the same PART as the consensus it is chasing: whole
 * readings of a label practically never match word for word, so comparing them
 * entire would say "ask again" for ever and burn a reading on every label.
 */
export const worthReadingAgain = (readings = [], { need = CONSENSUS.need, most = CONSENSUS.mostReadings, of, by } = {}) =>
  readings.length < most && !consensusOf(readings, { need, ...(of ? { of } : {}), ...(by ? { by } : {}) }).agreed;

/**
 * The parts of a label KOI asks for agreement on, separately.
 *
 * Separately, because a reader may see the nutrition panel perfectly and
 * misread the ingredients underneath it — and holding the good answer hostage
 * to the bad one is how a queue fills up with things nobody needs to decide.
 *
 * The fields are the ones a reader actually returns (labelSchema.js), and
 * allergens are compared as the FLAGS the statements raise rather than as their
 * wording: "Allergens Information: Contains Milk Solid" and "Contains Milk
 * Solids." are the same fact about the pack, and a protocol that called them a
 * disagreement would send every label to a human over punctuation.
 */
/**
 * An ingredient list, compared as a LIST rather than as a sentence.
 *
 * The live run is the argument for this. Two readers transcribed the Madras
 * Mixture panel character for character identically — except one of them also
 * typed the word "Ingredients" printed above it. Compared as one string that is
 * a disagreement, so the queue held a product both readers had read the same
 * way, and because ingredients and allergens publish together, nothing about
 * that product could publish at all.
 *
 * What is dropped is only what is not the food: the panel's own heading, the
 * separators, the trailing full stop, and the CAPS most panels are printed in.
 * What is kept is every ingredient, its wording and its order — so one reader
 * writing "Uddi flour" where another read "Ludit flour" is still a
 * disagreement, which is exactly what it is.
 */
function ingredientSequence(text) {
  const body = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^ingredients?(\s+list)?\s*[:.\-–—]?\s*/i, "");
  return body
    .split(",")
    .map((part) => part.toLowerCase().replace(/[.\s]+$/, "").trim())
    .filter(Boolean)
    .join(",");
}

export const LABEL_PARTS = Object.freeze({
  // A statement and a list are two halves of one answer. The live Ragi
  // disagreement — one reader saying the ingredients named gluten — lived
  // entirely in the list, so comparing statements alone would have called it
  // agreement on half the evidence. A reader that gave neither has abstained.
  allergens: (r) => {
    if (r?.allergen_statement === undefined && r?.ingredients_text === undefined) return undefined;
    // One statement can hold both halves — "CONTAINS WHEAT AND NUTS. MAY
    // CONTAIN MILK." — and the readers must be compared on the same split the
    // publisher uses, or they would agree about something KOI never writes.
    const whole = splitStatement(r?.allergen_statement ?? "");
    const said = allergensInStatement(whole.declared);
    const may = [
      ...allergensInStatement(whole.precautionary),
      ...allergensInStatement(r?.may_contain_statement ?? ""),
    ];
    const inList = allergensIn(r?.ingredients_text ?? "");
    const contains = [...new Set([...said, ...inList.contains])].sort();
    return {
      contains,
      may_contain: [...new Set([...may, ...inList.mayContain])].filter((f) => !contains.includes(f)).sort(),
    };
  },
  ingredients: (r) => (r?.ingredients_text === undefined ? undefined : ingredientSequence(r?.ingredients_text)),
  nutrition: (r) => (r?.nutrition === undefined ? undefined : (r?.nutrition ?? null)),
  identity: (r) => (r?.product_name === undefined ? undefined : (r?.product_name ?? null)),
});
