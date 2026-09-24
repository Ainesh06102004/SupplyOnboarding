// ============================================================================
// Hinglish household words, as the English the brief's rules read. Pure.
//
// "hum do hamare do, sab veg, bacchon ko nuts se allergy hai" drafted no one:
// the rules count "two kids", and the shopper wrote "hamare do" and
// "bacchon". This rewrites the few patterns a household description in
// Roman-script Hindi uses (who is eating, how many, for how long, on what
// budget, what someone is allergic to) into those words, before the rules
// read it. It only ever rewrites into words the rules already know; anything
// else is left as it was, and the English "do" survives because a Hindi number
// is read only before a person word.
// ============================================================================

const NUMBERS = Object.freeze({
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, cheh: 6,
  saat: 7, aath: 8, nau: 9, das: 10,
});
const NUM = Object.keys(NUMBERS).join("|");

/** Person words, Hindi → the English the rules count. */
const PEOPLE = [
  [/\b(?:bacche|bachche|bacchon|bachchon|bachon|bachhe|bacchhe|bachhon)\b/g, "kids"],
  [/\b(?:baccha|bachcha|bacha)\b/g, "kid"],
  [/\b(?:beta|bete)\b/g, "son"],
  [/\b(?:beti|betiyan|betiyaan)\b/g, "daughter"],
  [/\b(?:biwi|bibi|patni|gharwali)\b/g, "wife"],
  [/\b(?:pati|gharwale)\b/g, "husband"],
  [/\b(?:dadi|nani)\s+(?:maa|ji)\b/g, "grandmother"],
  [/\b(?:dada|nana)\s+ji\b/g, "grandfather"],
];
const PERSON = "kids?|people|adults?|sons?|daughters?|seniors?|teens?|grandparents?";

/**
 * @param {string} text the shopper's message
 * @returns {string} the same message, with the Hinglish it recognises in English
 */
export function fromHinglish(text) {
  let t = ` ${String(text ?? "").toLowerCase()} `;
  // "hum do hamare do": us two, and our two (children).
  t = t.replace(new RegExp(`\\bhum (${NUM}),?\\s+(?:hamare|hamara|humare|humara) (${NUM})\\b`, "g"),
    (_, a, b) => ` us ${NUMBERS[a]}, ${NUMBERS[b]} ${NUMBERS[b] === 1 ? "kid" : "kids"} `);
  // "hum paanch (log) hain": we are five.
  t = t.replace(new RegExp(`\\bhum (${NUM}|\\d+)(?: log)?(?: (?:hain|hai|hae))?\\b`, "g"),
    (_, n) => ` we are ${NUMBERS[n] ?? n} `);
  for (const [pattern, english] of PEOPLE) t = t.replace(pattern, english);
  t = t.replace(/\b(?:main|mai|mein)\b(?= aur| ,|,)/g, "me")
    .replace(/\b(?:meri|mera|mere|hamari|hamara|hamare)\b/g, "my")
    .replace(/\baur\b/g, "and")
    .replace(/\b(?:sab|sabhi|sabko|sab log)\b/g, "all");
  t = t.replace(/\b(\d+|\w+) log\b/g, (m, n) => (NUMBERS[n] || /^\d+$/.test(n) ? `${NUMBERS[n] ?? n} people` : m));
  // A Hindi number before a person word: "do bacche" → "2 kids".
  t = t.replace(new RegExp(`\\b(${NUM}) (${PERSON})\\b`, "g"), (_, n, who) => `${NUMBERS[n]} ${who}`);
  // Diets.
  t = t.replace(/\bshakahari\b/g, "vegetarian").replace(/\b(?:maansahari|mansahari|maasahari)\b/g, "non veg");
  // "bacchon ko nuts se allergy hai": the kids are allergic to nuts.
  t = t.replace(/\b([a-z]+) ko ([a-z ]+?) se allergy(?: hai| h)?\b/g, "$1 allergic to $2")
    .replace(/\b([a-z]+) se allergy(?: hai| h)?\b/g, "allergic to $1");
  // "paneer nahi khati": no paneer.
  t = t.replace(/\b([a-z]+) (?:nahi|nahin|nhi) (?:khate|khata|khati|khaate|khaati|chahiye|lete|leti)\b/g, "no $1");
  // Days, weeks and money.
  t = t.replace(new RegExp(`\\b(\\d+|${NUM}) din\\b`, "g"), (_, n) => `${NUMBERS[n] ?? n} days`)
    .replace(new RegExp(`\\b(${NUM}) (?:hafte|hafta|haftey)\\b`, "g"), (_, n) => `${NUMBERS[n]} weeks`)
    .replace(/\b(?:ek )?(?:hafte|hafta|haftey)\b/g, "week")
    .replace(new RegExp(`\\b(\\d+(?:\\.\\d+)?|${NUM}) ?(?:hazaar|hazar|hajar)\\b`, "g"), (_, n) => `${(NUMBERS[n] ?? Number(n)) * 1000}`)
    .replace(/\b(?:rupaye|rupay|rupee|rupees)\b/g, "rs");
  return t.replace(/\s+/g, " ").replace(/ ([,.;])/g, "$1").trim();
}
