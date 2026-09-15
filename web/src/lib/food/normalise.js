// ============================================================================
// KOI FOOD — One way to turn label text into words
//
// Phase 2.1. The allergen graph's names and the text they are matched against
// are normalised by this one function, so they meet:
//
//   - lowercase, accents dropped ("Crème" -> "creme");
//   - INS and E numbers folded to one form ("INS 322", "E-322", "E322" ->
//     "ins322"; "E160b" -> "ins160b");
//   - punctuation to spaces;
//   - a plural "s" dropped from each word ("groundnuts" -> "groundnut"), but
//     not from "-ss", "-us", "-is" or "-as" ("madras" stays "madras").
//
// Pure.
// ============================================================================

const INS_CODE = /\b(?:ins|e)\s*-?\s*(\d{3,4}[a-z]?)\b/g;

/** @returns {string[]} */
export function words(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(INS_CODE, " ins$1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !/(?:ss|us|is|as)$/.test(w) ? w.slice(0, -1) : w));
}

/** @returns {string} the words joined by single spaces */
export const normalise = (text) => words(text).join(" ");
