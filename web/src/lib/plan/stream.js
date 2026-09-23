// Read /api/plan/run's NDJSON stream, one message at a time. A refusal before
// the stream starts (401, 400) arrives as ordinary JSON and is thrown.

/**
 * @param {Response} response from fetch("/api/plan/run")
 * @param {(message: object) => void} onMessage
 */
export async function readNdjson(response, onMessage) {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? "KOI could not start planning.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (line) => {
    const text = line.trim();
    if (!text) return;
    try {
      onMessage(JSON.parse(text));
    } catch {
      /* a torn line is dropped, never guessed at */
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      flush(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  }
  flush(buffer + decoder.decode());
}
