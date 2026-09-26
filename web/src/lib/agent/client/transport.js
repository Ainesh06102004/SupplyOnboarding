// ============================================================================
// Agent Mode, in the browser: one request to /api/agent, streamed; and the
// page described as KOI may see it (kinds and ids, never text).
// ============================================================================

import { readNdjson } from "@/lib/plan/stream";

/**
 * @param {{ request: object, memory: object|null, page: object, signal: AbortSignal, onEvent: (e: object) => void }} input
 */
export async function postSegment({ request, memory, page, signal, onEvent }) {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, memory, page }),
    signal,
  });
  await readNdjson(response, onEvent);
}

const STEPS = ["define", "you", "plan", "pantry", "shop", "track"];

/** Where the dock is: /store/plan?step=pantry → { route: "plan", step: "pantry" }. */
export function pageFrom(pathname, searchParams, { planId = null, cartCount = 0 } = {}) {
  const path = String(pathname ?? "");
  const step = searchParams?.get?.("step");
  const product = path.match(/^\/store\/product\/([^/?#]+)/)?.[1] ?? null;
  const route = path.startsWith("/store/plan") ? "plan"
    : product ? "product"
      : path.startsWith("/store/shop") ? "shop"
        : path.startsWith("/store/cart") ? "cart"
          : path.startsWith("/store/household") ? "household"
            : path === "/store" || path === "/store/" ? "home"
              : "other";
  return {
    route,
    step: route === "plan" && STEPS.includes(step) ? step : route === "plan" ? "define" : null,
    productId: product ? decodeURIComponent(product) : null,
    planId,
    cartCount,
  };
}
