// ============================================================================
// Agent Mode: the shopper's answer to a question the model asked. Pure.
// What the model is told, and which words join the evidence: a typed "Other",
// or the label of KOI's own option the shopper chose ("7 days" is theirs now).
// ============================================================================

/**
 * @param {{ questions: Array }} card
 * @param {Record<string, { option?: string, options?: string[], other?: string }>} answers
 * @returns {{ forModel: string, typed: string[] }}
 */
export function answerWords(card, answers) {
  const parts = [];
  const typed = [];
  for (const q of card?.questions ?? []) {
    const a = answers?.[q.id];
    if (!a) continue;
    if (a.other) {
      const words = String(a.other).slice(0, 200);
      typed.push(words);
      parts.push(`${q.header}: "${words}"`);
      continue;
    }
    const picked = (q.options ?? []).filter((o) => o.key === a.option || (a.options ?? []).includes(o.key)).map((o) => o.label);
    if (!picked.length) continue;
    parts.push(`${q.header}: ${picked.join(", ")}`);
    typed.push(picked.join(", "));
  }
  return { forModel: parts.length ? `The shopper answered. ${parts.join("; ")}.` : "The shopper skipped the question.", typed };
}
