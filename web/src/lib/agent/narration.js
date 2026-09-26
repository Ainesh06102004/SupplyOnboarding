// ============================================================================
// Agent Mode: KOI's own sentences, held to the truth. Pure.
//
// The model may speak — a line before a tool ("Setting up your household
// first"), a line when it finishes — because that is what makes the dock feel
// like someone working. It may not state anything. So a line:
//   * carries no figure at all: no digit, no ₹, no counting word the shopper
//     did not use. Figures live in cards, from the planner;
//   * names only foods in the evidence, and people only by household label;
//   * passes the claims guard (no "healthy", "boosts", disease words) and the
//     medical-terms list;
//   * is short.
// A line that fails is dropped, and the dock shows the tool's template
// instead. KOI_AGENT_NARRATION=0 turns narration off entirely.
// ============================================================================

import { isClaimSafeText } from "@/lib/nutrition/claims";
import { MEDICAL_TERMS } from "@/lib/ai/intent/deterministic";
import { foodsKnown, wordsOf } from "./evidence";

export const MAX_SAY = 240;
const COUNTING = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "dozen", "half", "twice", "double", "triple", "hundred", "thousand", "lakh", "crore"]);
const FIGURE_WORDS = /\b(kcal|calories?|grams?|kg|kilos?|mg|percent|rupees?|rs)\b/i;
/** Words that talk about people KOI does not have. */
const PERSON_WORDS = /\b(son|daughter|husband|wife|mother|father|mom|dad|mum|papa|mummy|grandma|grandpa|brother|sister|baby|kid|kids|child|children)\b/i;

/**
 * @param {string|null|undefined} say
 * @param {object} evidence evidenceFrom()
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{ ok: boolean, text: string|null, why: string|null }}
 */
export function checkSay(say, evidence, { enabled = process.env.KOI_AGENT_NARRATION !== "0" } = {}) {
  const text = String(say ?? "").replace(/\s+/g, " ").trim();
  const no = (why) => ({ ok: false, text: null, why });
  if (!text) return no("empty");
  if (!enabled) return no("off");
  if (text.length > MAX_SAY) return no("long");
  if (/[\d₹%]/.test(text)) return no("figure");
  if (FIGURE_WORDS.test(text)) return no("figure");
  const words = wordsOf(text);
  if (words.some((w) => COUNTING.has(w) && !evidence.words.has(w))) return no("figure");
  if (!isClaimSafeText(text)) return no("claim");
  const lower = text.toLowerCase();
  if (MEDICAL_TERMS.some((t) => new RegExp(`\\b${String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(lower))) return no("medical");
  if (!foodsKnown(text, evidence)) return no("food");
  // A relationship word is fine when the shopper used it or it is a label ("Wife").
  const labelWords = new Set(evidence.labels.flatMap((l) => wordsOf(l)));
  const person = lower.match(new RegExp(PERSON_WORDS.source, "gi")) ?? [];
  if (person.some((p) => !evidence.words.has(p.toLowerCase()) && !labelWords.has(p.toLowerCase()))) return no("person");
  return { ok: true, text, why: null };
}
