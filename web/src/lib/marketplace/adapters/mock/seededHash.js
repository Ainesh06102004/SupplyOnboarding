// ============================================================================
// KOI — Deterministic hashing for the mock adapter
//
// No Math.random() anywhere. A mock that varies run to run makes a bug
// impossible to reproduce and a screenshot impossible to trust — and an
// out-of-stock state you cannot reproduce is one you cannot design for.
//
// Same seed, same answer, always. FNV-1a: small, fast, well-distributed enough
// for choosing fixtures. Not cryptographic and not used as if it were.
// ============================================================================

/**
 * @param {string} str
 * @returns {number} unsigned 32-bit
 */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic float in [0, 1). */
export const hashFloat = (str) => hash32(str) / 0x100000000;

/** Deterministic integer in [0, max). */
export const hashInt = (str, max) => (max <= 0 ? 0 : hash32(str) % max);

/** Deterministic pick from a list. */
export const hashPick = (str, list) => (list.length ? list[hashInt(str, list.length)] : null);
