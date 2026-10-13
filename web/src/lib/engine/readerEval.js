// ============================================================================
// KOI ENGINE — Is a new reader as good as the two we have?
//
// The yardstick is the 249 Amazon label photos both OpenAI readers have
// already read (amazon_products.label_reading): gpt-5.4-mini (A) and
// gpt-4.1-mini (B). A candidate (C) reads the same photos and is compared part
// by part — nutrition, ingredients, allergens — with compareReadings, the very
// rule that decides what KOI publishes. So "agrees" here means what it means in
// production, not a looser score invented for the test.
//
// There is no hand-checked truth for these photos, so each question is asked
// against the best stand-in for it:
//
//   As reader 2.   Paired with A, does C agree as often as B does, on the same
//                  photos? This is the job C would take, and B is the
//                  baseline it has to match.
//   Where A and B agreed.   Two different models reading the same thing is
//                  the closest KOI has to truth. How often does C read it too?
//   Where they disagreed.   Does C side with one of them — would it settle the
//                  disagreement as KOI_LABEL_THIRD_MODEL?
//   Allergens.     Where A and B agreed a product DECLARES an allergen, does
//                  C drop it, or demote it to "may contain"? Over-reporting
//                  costs a shopper a product; under-reporting can cost them
//                  more, so the two are counted apart.
//   Two open readers.   If both readers were open models, how often would
//                  they agree with each other — and when they do, how often
//                  on something other than what A and B agreed on? That last
//                  number is the dangerous one: agreement is what publishes.
//
// Pure.
// ============================================================================

import { compareReadings } from "./autopublish";
import { proposeAllergens } from "./proposals";

export const PARTS = Object.freeze(["nutrition", "ingredients", "allergens"]);

// A part is in play on a photo when a reader saw it there.
const SEES = Object.freeze({
  nutrition: (r) => r.visible.nutrition_table,
  ingredients: (r) => r.visible.ingredients,
  allergens: (r) => r.visible.allergen_statement || r.visible.ingredients,
});

const agrees = (cmp, part) => (part === "nutrition" ? Boolean(cmp.nutrition.ok && cmp.nutrition.values) : cmp[part].ok);

// What labels.mjs counts as a photo with an agreed result.
const photoAgreed = (cmp) => agrees(cmp, "nutrition") || cmp.ingredients.ok;

/**
 * One photo, three readings.
 * @param {object} a  gpt-5.4-mini's reading (LabelReading)
 * @param {object} b  gpt-4.1-mini's reading
 * @param {object|null} c the candidate's reading; null when it gave no valid one
 */
export function scorePhoto(a, b, c) {
  const ab = compareReadings(a, b);
  if (!c) return { valid: false, ab: Object.fromEntries(PARTS.map((p) => [p, agrees(ab, p)])), photoAB: photoAgreed(ab) };

  const ac = compareReadings(a, c);
  const bc = compareReadings(b, c);
  const parts = {};
  for (const p of PARTS) {
    parts[p] = {
      applies: Boolean(SEES[p](a) || SEES[p](b)),
      ab: agrees(ab, p),
      ac: agrees(ac, p),
      bc: agrees(bc, p),
      // A panel only the candidate saw: either it is sharper, or it is making
      // one up. Counted, not judged.
      phantom: Boolean(SEES[p](c) && !SEES[p](a) && !SEES[p](b)),
    };
  }

  // Allergens A and B agree the label declares.
  let declared = [], missed = [], demoted = [];
  if (parts.allergens.applies && parts.allergens.ab) {
    declared = proposeAllergens(a).contains;
    const mine = proposeAllergens(c);
    missed = declared.filter((f) => !mine.contains.includes(f) && !mine.may_contain.includes(f));
    demoted = declared.filter((f) => !mine.contains.includes(f) && mine.may_contain.includes(f));
  }

  return {
    valid: true,
    parts,
    photoAB: photoAgreed(ab),
    photoAC: photoAgreed(ac),
    allergens: { declared, missed, demoted },
  };
}

const rate = (k, n) => ({ k, n, pct: n ? Math.round((1000 * k) / n) / 10 : null });

const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/**
 * One candidate over every photo it was asked about.
 * @param {Array<{ score: object, costUsd?: number|null, latencyMs?: number|null, error?: string }>} rows
 */
export function summarize(rows) {
  const valid = rows.filter((r) => r.score?.valid);
  const out = {
    photos: rows.length,
    valid: rate(valid.length, rows.length),
    errors: rows.filter((r) => r.error).length,
    asReader2: {},
    whereABAgreed: {},
    whereABDisagreed: {},
    phantomPanels: {},
  };

  for (const p of PARTS) {
    const inPlay = valid.filter((r) => r.score.parts[p].applies);
    const s = (r) => r.score.parts[p];
    out.asReader2[p] = { candidate: rate(inPlay.filter((r) => s(r).ac).length, inPlay.length), baselineB: rate(inPlay.filter((r) => s(r).ab).length, inPlay.length) };
    const agreed = inPlay.filter((r) => s(r).ab);
    out.whereABAgreed[p] = rate(agreed.filter((r) => s(r).ac).length, agreed.length);
    const split = inPlay.filter((r) => !s(r).ab);
    out.whereABDisagreed[p] = {
      settles: rate(split.filter((r) => s(r).ac || s(r).bc).length, split.length),
      sidesWithA: split.filter((r) => s(r).ac && !s(r).bc).length,
      sidesWithB: split.filter((r) => s(r).bc && !s(r).ac).length,
    };
    out.phantomPanels[p] = valid.filter((r) => s(r).phantom).length;
  }

  out.photo = {
    candidate: rate(valid.filter((r) => r.score.photoAC).length, valid.length),
    baselineB: rate(valid.filter((r) => r.score.photoAB).length, valid.length),
  };

  const withDeclared = valid.filter((r) => r.score.allergens.declared.length);
  const declared = withDeclared.reduce((n, r) => n + r.score.allergens.declared.length, 0);
  out.declaredAllergens = {
    photos: withDeclared.length,
    declared,
    missed: withDeclared.reduce((n, r) => n + r.score.allergens.missed.length, 0),
    demoted: withDeclared.reduce((n, r) => n + r.score.allergens.demoted.length, 0),
    photosWithAMiss: withDeclared.filter((r) => r.score.allergens.missed.length).length,
  };

  const costs = rows.map((r) => r.costUsd).filter((x) => Number.isFinite(x));
  const spent = costs.reduce((x, y) => x + y, 0);
  out.cost = { usd: Math.round(spent * 1e6) / 1e6, perPhotoUsd: costs.length ? Math.round((spent / costs.length) * 1e6) / 1e6 : null, priced: costs.length };
  const lat = rows.map((r) => r.latencyMs).filter((x) => Number.isFinite(x));
  out.latencyMs = { p50: quantile(lat, 0.5), p90: quantile(lat, 0.9) };
  return out;
}

/**
 * Two candidates as the pair of readers — the all-open setup.
 * @param {Array<{ a, b, c1, c2 }>} photos parsed readings; c1/c2 may be null
 */
export function summarizePair(photos) {
  const both = photos.filter((x) => x.c1 && x.c2);
  const out = { photos: both.length, parts: {} };
  let pairPhoto = 0, abPhoto = 0;
  for (const x of both) {
    if (photoAgreed(compareReadings(x.c1, x.c2))) pairPhoto++;
    if (photoAgreed(compareReadings(x.a, x.b))) abPhoto++;
  }
  out.photo = { pair: rate(pairPhoto, both.length), openai: rate(abPhoto, both.length) };

  for (const p of PARTS) {
    let inPlay = 0, pair = 0, openai = 0, bothAgreed = 0, differ = 0;
    for (const x of both) {
      if (!(SEES[p](x.a) || SEES[p](x.b) || SEES[p](x.c1) || SEES[p](x.c2))) continue;
      inPlay++;
      const cc = agrees(compareReadings(x.c1, x.c2), p);
      const ab = agrees(compareReadings(x.a, x.b), p);
      if (cc) pair++;
      if (ab) openai++;
      if (cc && ab) {
        bothAgreed++;
        if (!agrees(compareReadings(x.a, x.c1), p)) differ++;
      }
    }
    out.parts[p] = {
      pair: rate(pair, inPlay),
      openai: rate(openai, inPlay),
      // Both pairs agreed, but not on the same thing: an open pair would have
      // published an answer the OpenAI pair did not reach.
      agreedOnSomethingElse: rate(differ, bothAgreed),
    };
  }
  return out;
}
