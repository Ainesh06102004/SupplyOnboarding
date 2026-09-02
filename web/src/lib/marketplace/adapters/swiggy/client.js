// ============================================================================
// KOI — Swiggy MCP transport
//
// SERVER ONLY. Calls the Instamart MCP server at POST mcp.swiggy.com/im.
//
// UNVERIFIED AGAINST THE LIVE SERVER. KOI has no Swiggy credentials, so none
// of this has made a real request. What IS grounded in the docs:
//   · the endpoint (docs/reference/instamart/index.md)
//   · the tool names and their argument shapes (docs/reference/instamart/*)
//   · the rate-limit headers and 429 semantics (docs/operate/rate-limits.md)
//   · bearer auth from an OAuth 2.1 + PKCE access token (docs/start/authenticate)
//
// What is NOT documented and is therefore a guess, isolated here so it is
// cheap to correct: THE TRANSPORT FRAMING. The docs give an endpoint and say
// "MCP server" without stating stdio / SSE / streamable HTTP, and give no REST
// or JSON-RPC equivalent. This implements JSON-RPC 2.0 `tools/call` over HTTP
// POST, which is what an MCP streamable-HTTP server accepts, and keeps every
// assumption in `callTool` so the blast radius of being wrong is one function.
//
// FIRST TASK ON GETTING STAGING ACCESS: call one read-only tool and confirm the
// framing before trusting anything above it. `get_addresses` is the right
// probe — no arguments, no writes, and its response shape is documented.
// ============================================================================

import "server-only";

import { BUDGET } from "../../config";
import { RateLimitError, UpstreamError, AuthExpiredError, NotConfiguredError } from "../../errors";

const ENDPOINT = process.env.SWIGGY_MCP_URL || "https://mcp.swiggy.com/im";

/** Write tools spend the tighter 30/min budget. Everything else is a read. */
const WRITE_TOOLS = new Set([
  "update_cart", "clear_cart", "apply_coupon", "checkout", "confirm_order",
  "create_address", "delete_address", "report_error",
]);

export const isWriteTool = (name) => WRITE_TOOLS.has(name);

let requestId = 0;

/**
 * Rate-limit headers, when the server sends them.
 *
 * ship-to-production.md says enforcement is not live in v1.0 while
 * rate-limits.md documents 429s — so these may simply be absent. Absent is
 * treated as "no information", never as "plenty of headroom".
 */
function readRateHeaders(res) {
  const n = (h) => {
    const v = res.headers.get(h);
    return v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
  };
  return {
    limit: n("X-RateLimit-Limit"),
    remaining: n("X-RateLimit-Remaining"),
    resetAt: n("X-RateLimit-Reset"),
    retryAfterMs: n("Retry-After") === null ? null : n("Retry-After") * 1000,
  };
}

/**
 * Call one MCP tool.
 *
 * @param {object} params
 * @param {string} params.tool        e.g. 'search_products'
 * @param {object} params.args
 * @param {string} params.accessToken bearer token; never logged
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ data: object, rate: object }>}
 */
export async function callTool({ tool, args = {}, accessToken, signal }) {
  if (!accessToken) {
    // No token is a configuration state, not a request failure. The caller
    // degrades to `unknown` rather than showing an error to a shopper.
    throw new NotConfiguredError("No Swiggy access token available");
  }

  // ── THE ASSUMPTION ────────────────────────────────────────────────────────
  // JSON-RPC 2.0 envelope, MCP `tools/call` method. Correct this one block
  // against staging before trusting the adapter.
  const body = {
    jsonrpc: "2.0",
    id: ++requestId,
    method: "tools/call",
    params: { name: tool, arguments: args },
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Streamable HTTP servers may answer either way; accept both.
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new UpstreamError(`Swiggy MCP unreachable: ${err.message}`);
  }

  const rate = readRateHeaders(res);

  if (res.status === 429) {
    // "stop retrying immediately, apply backoff" — the error carries the
    // server's own Retry-After so the caller never invents a delay.
    throw new RateLimitError("Swiggy rate limit reached", rate.retryAfterMs ?? 30_000);
  }
  if (res.status === 401 || res.status === 403) {
    // 5-day tokens with NO refresh grant in v1.0, so this is not recoverable
    // in-process: the shopper has to re-authorise.
    throw new AuthExpiredError("Swiggy authorisation expired or rejected");
  }
  if (!res.ok) {
    throw new UpstreamError(`Swiggy MCP responded ${res.status}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new UpstreamError("Swiggy MCP returned a non-JSON body");
  }

  // JSON-RPC transport-level error.
  if (payload?.error) {
    const code = payload.error?.code;
    const message = payload.error?.message || "Swiggy MCP error";
    if (String(message).toUpperCase().includes("RATE_LIMITED")) {
      throw new RateLimitError(message, rate.retryAfterMs ?? 30_000);
    }
    throw new UpstreamError(`${message}${code ? ` (${code})` : ""}`);
  }

  // MCP tool results arrive under result.content; a tool that failed sets
  // result.isError rather than a transport error, so it must be checked
  // separately or a failure reads as an empty success.
  const result = payload?.result;
  if (result?.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((c) => c?.text).filter(Boolean).join(" ")
      : "Tool reported an error";
    if (text.toUpperCase().includes("RATE_LIMITED")) {
      throw new RateLimitError(text, rate.retryAfterMs ?? 30_000);
    }
    throw new UpstreamError(text);
  }

  return { data: unwrapToolResult(result), rate };
}

/**
 * Pull the tool's payload out of an MCP result envelope.
 *
 * MCP returns `content: [{ type: 'text', text: '<json>' }]`. The docs describe
 * the tools' `data` object, so both `structuredContent` (when present) and a
 * JSON-encoded text block are accepted, and the `data` wrapper is unwrapped
 * once so callers see what the reference documents.
 */
export function unwrapToolResult(result) {
  if (!result) return null;

  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent.data ?? result.structuredContent;
  }

  const block = Array.isArray(result.content)
    ? result.content.find((c) => c?.type === "text" && typeof c.text === "string")
    : null;
  if (!block) return null;

  try {
    const parsed = JSON.parse(block.text);
    return parsed?.data ?? parsed;
  } catch {
    // A tool that answered in prose rather than JSON is not something to
    // guess at. Callers treat null as `unknown`.
    return null;
  }
}

/** The documented ceiling for a tool, for the caller's own accounting. */
export const budgetFor = (tool) =>
  isWriteTool(tool) ? BUDGET.writeRequestsPerMinute : BUDGET.houseRequestsPerMinute;

export const SWIGGY_ENDPOINT = ENDPOINT;
