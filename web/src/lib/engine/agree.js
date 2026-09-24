// ============================================================================
// KOI ENGINE — Reading a label until the readers agree
//
// The pipeline reads every label twice, and where the two differ it used to
// stop and ask a person. Asking a person is slow, and it is not obviously
// better: a third reader settles most disagreements, and several readers
// reaching the same answer is stronger evidence than one glance.
//
// So a disagreement now buys another reading rather than a queue item. Each
// part of the label is settled separately (consensus.js LABEL_PARTS), because a
// reader can see the nutrition panel perfectly and misread the list underneath
// it — and holding the good answer hostage to the bad one is how a queue fills
// with things nobody needs to decide.
//
// ONE READER, ONE VOTE. A reader is a MODEL, not a call: asking the same model
// twice samples the same misreading twice, and consensus.js collapses it to one
// vote on purpose. A third opinion therefore needs a third model, named by
// KOI_LABEL_THIRD_MODEL. Without one, two readings that differ stay a
// disagreement and go to a person, and the reason says exactly that rather
// than pretending a retry was a second opinion.
// ============================================================================

import "server-only";

import { LabelReading } from "./labelSchema";
import { readLabel } from "./providers/openai";
import { CONSENSUS, LABEL_PARTS, consensusOf, worthReadingAgain } from "./consensus";

/** The models KOI will read a label with, in the order it asks them. */
export function readers() {
  return [
    { by: process.env.KOI_LABEL_MODEL, role: "primary" },
    { by: process.env.KOI_LABEL_VERIFIER_MODEL || process.env.KOI_LABEL_MODEL, role: "verifier" },
    { by: process.env.KOI_LABEL_THIRD_MODEL, role: "tiebreak" },
  ].filter((r) => r.by);
}

/**
 * What each part of a label says, once enough readers agree about it.
 *
 * @param {{imageBase64: string, mimeType: string}} image
 * @param {{readings?: Array, need?: number}} [options]
 *   `readings` are ones already taken — the pipeline's first two — each
 *   `{ by, reading }`. Only the missing readers are asked.
 * @returns {Promise<{parts: object, readings: Array, asked: string[]}>}
 *   `parts` is one consensus result per part of the label.
 */
export async function readUntilAgreed(image, { readings = [], need = CONSENSUS.need } = {}) {
  const taken = [...readings];
  const asked = taken.map((r) => r.by);

  const settled = () => Object.fromEntries(
    Object.entries(LABEL_PARTS).map(([part, of]) => [
      part,
      consensusOf(taken, { need, of: (r) => of(r.reading), by: (r) => r.by }),
    ]),
  );

  // Another reader is worth asking only while one could still settle something.
  for (const reader of readers()) {
    if (asked.includes(reader.by)) continue;
    // Only what is still open is worth another reader. Asked per part, because
    // two readings of one label practically never match word for word and
    // comparing them entire would burn a reading on every label.
    const unsettled = Object.entries(LABEL_PARTS).filter(([, of]) =>
      worthReadingAgain(taken, { need, of: (r) => of(r.reading), by: (r) => r.by }));
    if (!unsettled.length) break;

    try {
      const answer = await readLabel({ ...image, model: reader.by });
      const parsed = LabelReading.safeParse(answer.json);
      if (parsed.success) taken.push({ by: reader.by, reading: parsed.data });
      asked.push(reader.by);
    } catch (err) {
      // A reader that cannot answer is not a disagreement; it is one fewer
      // opinion, and the parts below will say so.
      console.error("[agree] a reader failed", reader.by, err?.message ?? err);
      asked.push(reader.by);
    }
  }

  return { parts: settled(), readings: taken, asked };
}

/**
 * Why a part is not settled, in words a queue item can carry.
 *
 * It names the missing third model where that is the reason, because "the two
 * readings differ" is a description of the problem and "there is no third
 * reader configured" is the thing somebody can fix.
 */
export function whyUnsettled(part, result) {
  if (result.agreed) return null;
  const third = process.env.KOI_LABEL_THIRD_MODEL;
  const noTiebreak = !third && result.readings <= 2;
  return noTiebreak
    ? `${part}: ${result.why}, and no third model is configured to break the tie (KOI_LABEL_THIRD_MODEL)`
    : `${part}: ${result.why}`;
}
