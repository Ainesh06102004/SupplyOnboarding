// What counts as a protein bar, and small parsers for listing text.

export const NODE = "11364590031"; // amazon.in › Nutrition Bars › Protein Bars

const NOT_A_BAR = /\b(powder|shaker|bottle|mass gainer|gainer|capsules?|tablets?|peanut butter|spread|muesli|granola(?! bar)|oats(?! bar)|cookies?|drink|shake|gummies|pre[- ]?workout|creatine|isolate|concentrate|multivitamin|chips|puffs?|wafers?)\b/i;

// A listing is a protein bar if Amazon files it under the Protein Bars node,
// or its title says protein + bar — and it is not obviously something else.
export function proteinBarVerdict({ title = "", categoryPath = [], inNode = false }) {
  const t = title.toLowerCase();
  const node = inNode || categoryPath.some((c) => /protein bars?/i.test(c));
  const words = /\bprotein\b/.test(t) && /\bbars?\b/.test(t);
  const other = NOT_A_BAR.exec(t);
  if (other && !/\bbars?\b/.test(t)) return { ok: false, reason: `title says "${other[0]}"` };
  if (node) return { ok: true, reason: "Amazon files it under Protein Bars" };
  if (words) return { ok: true, reason: 'title says "protein" and "bar"' };
  return { ok: false, reason: "not filed under Protein Bars and the title does not say protein bar" };
}

// "Pack of 6", "12 Bars", "Box of 10", "(6 x 60g)" → count of bars.
export function packCount(...texts) {
  for (const s of texts.filter(Boolean)) {
    const m =
      /\b(?:pack|box|set|combo) of (\d{1,3})\b/i.exec(s) ||
      /\b(\d{1,3})\s*(?:x|×)\s*\d+(?:\.\d+)?\s*g\b/i.exec(s) ||
      /\b(\d{1,3})\s*(?:bars|pcs|pieces|units|count)\b/i.exec(s);
    if (m) {
      const n = Number(m[1]);
      if (n > 0 && n <= 200) return n;
    }
  }
  return null;
}

// "600.0 Grams", "300 g", "1.2 kg" → grams.
export function grams(s) {
  if (!s) return null;
  const m = /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|gm|gms)\b/i.exec(String(s));
  if (!m) return null;
  const n = Number(m[1]) * (/^k/i.test(m[2]) ? 1000 : 1);
  return n > 0 && n < 100000 ? n : null;
}
