"use client";
// ============================================================================
// KOI Agent Mode: the dock's brain, on every store page.
//
// Holds the conversation (sessionStorage, per shopper, cleared on sign-out —
// never sent to KOI's database), runs /api/agent segments, and does what the
// run asks of the page: follow along to the step being worked on, glow what
// changed, put approved lines in the cart, and — on the Plan page — hand each
// plan to the page through its bridge (usePlanSession's agentBridge), so the
// board, undo and "Undo all of this" work exactly as they do for the page's
// own changes.
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { agentReducer, initialAgentState, persistable } from "@/lib/agent/client/reducer";
import { postSegment, pageFrom } from "@/lib/agent/client/transport";

const AgentContext = createContext(null);
const GlowContext = createContext({ glowing: () => false });

const STORE_KEY = "koi_agent_v1";
const MAX_CONTINUES = 3;
const GLOW_MS = 2400;

export function useAgent() {
  return useContext(AgentContext);
}

/** "koi-glow" while KOI has just changed this thing (a member, a product), else "". */
export function useGlow(kind, key) {
  const { glowing } = useContext(GlowContext);
  return glowing(kind, key) ? "koi-glow" : "";
}

/** For lists: glowing(kind, key) → whether KOI has just changed that one. */
export function useGlowing() {
  return useContext(GlowContext).glowing;
}

/** The Plan page registers its bridge; the dock reaches the page through it. */
export function useAgentBridge(bridge) {
  const agent = useContext(AgentContext);
  const register = agent?.registerBridge;
  const ref = useRef(bridge);
  useEffect(() => { ref.current = bridge; }, [bridge]);
  useEffect(() => {
    if (!register) return undefined;
    return register(ref);
  }, [register]);
}

export function AgentProvider({ children }) {
  const { user, loading: authLoading } = useAuth() ?? {};
  const uid = user?.id ?? null;
  // Signed out means signed out, not "the session hasn't loaded yet".
  const signedOut = !authLoading && !uid;
  const [state, dispatch] = useReducer(agentReducer, initialAgentState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const pathname = usePathname();
  const router = useRouter();
  // Read when needed, not subscribed to: useSearchParams would put the whole store behind a Suspense boundary.
  const searchParams = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search));
  const cartCount = useCartStore((s) => s.items.length);
  const bridgeRef = useRef(null);
  const abortRef = useRef(null);
  const heldRef = useRef(null);
  const runRef = useRef(null);
  const [signIn, setSignIn] = useState(false);
  const [glow, setGlow] = useState({});

  // ── The conversation, kept in this tab for this shopper ────────────────────
  const key = uid ? `${STORE_KEY}:${uid}` : null;
  useEffect(() => {
    if (!key) {
      if (signedOut) dispatch({ type: "reset" });
      return;
    }
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) dispatch({ type: "hydrate", state: JSON.parse(raw) });
    } catch { /* storage unavailable: start fresh */ }
  }, [key, signedOut]);
  useEffect(() => {
    if (!key) return;
    try { sessionStorage.setItem(key, JSON.stringify(persistable(state))); } catch { /* full or blocked */ }
  }, [key, state]);
  // Signed out: every conversation in this tab goes.
  useEffect(() => {
    if (!signedOut) return;
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(STORE_KEY)) sessionStorage.removeItem(k);
      }
    } catch { /* nothing to clear */ }
  }, [signedOut]);

  const page = useCallback(() => pageFrom(pathname, searchParams(), { planId: bridgeRef.current?.current?.planId ?? null, cartCount }), [pathname, cartCount]);

  // ── What a run asks of the page ───────────────────────────────────────────
  const shine = useCallback((highlight) => {
    if (!highlight) return;
    const until = Date.now() + GLOW_MS;
    setGlow((g) => {
      const next = { ...g };
      for (const m of highlight.members ?? []) next[`member:${m}`] = until;
      for (const s of highlight.skus ?? []) next[`sku:${s}`] = until;
      return next;
    });
    setTimeout(() => setGlow((g) => Object.fromEntries(Object.entries(g).filter(([, t]) => t > Date.now()))), GLOW_MS + 50);
  }, []);

  const onUi = useCallback((e) => {
    const bridge = bridgeRef.current?.current;
    if (e.householdChanged) bridge?.reload?.();
    if (e.highlight) shine(e.highlight);
    if (e.explain) {
      const lines = bridge?.explainLines?.() ?? null;
      dispatch({ type: "local", entry: { kind: "result", data: { kind: "explain", lines: lines ?? [{ text: "Open your plan to see how KOI made it." }] } } });
    }
    if (e.navigate?.href && stateRef.current.follow) {
      const here = `${window.location.pathname}${window.location.search}`;
      if (here !== e.navigate.href) router.push(e.navigate.href, { scroll: true });
    }
  }, [router, shine]);

  const onEvent = useCallback((e) => {
    if (e.type === "hello") return;
    dispatch({ type: "event", event: e });
    const bridge = bridgeRef.current?.current;
    if (e.type === "tool_result") bridge?.toolResult?.(e);
    else if (e.type === "ui") onUi(e);
    else if (e.type === "run_finished") bridge?.endRun?.(e);
  }, [onUi]);

  // ── Running a segment ─────────────────────────────────────────────────────
  const run = useCallback(async (request) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const bridge = bridgeRef.current?.current;
    if (request.kind === "message") bridge?.beginRun?.();
    await bridge?.flushAutosaves?.();
    let paused = null;
    try {
      await postSegment({
        request,
        memory: stateRef.current.memory,
        page: page(),
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "run_paused") paused = e.reason;
          onEvent(e);
        },
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      dispatch({ type: "error", text: err?.message ?? "KOI couldn't be reached." });
      return;
    }
    if (controller.signal.aborted) return;
    // A long run carries on by itself, a few times, then asks to be told to go on.
    if (paused === "time" && stateRef.current.continues < MAX_CONTINUES) {
      dispatch({ type: "continued" });
      await runRef.current?.({ kind: "continue" });
    }
  }, [page, onEvent]);
  useEffect(() => { runRef.current = run; }, [run]);

  // Messages typed while KOI works go when it's free.
  useEffect(() => {
    if (state.queue.length && (state.status === "done" || state.status === "stopped" || state.status === "error" || state.status === "idle")) {
      const [next] = state.queue;
      dispatch({ type: "dequeue" });
      dispatch({ type: "user", text: next });
      run({ kind: "message", text: next });
    }
  }, [state.queue, state.status, run]);

  const send = useCallback((raw) => {
    const text = String(raw ?? "").trim().slice(0, 600);
    if (!text) return;
    if (!uid) {
      heldRef.current = text;
      dispatch({ type: "open" });
      setSignIn(true);
      return;
    }
    if (stateRef.current.status === "running") {
      dispatch({ type: "queue", text });
      return;
    }
    dispatch({ type: "user", text });
    run({ kind: "message", text });
  }, [uid, run]);

  // Signed in with a message held: it goes now.
  useEffect(() => {
    if (uid && heldRef.current) {
      const text = heldRef.current;
      heldRef.current = null;
      setSignIn(false);
      dispatch({ type: "user", text });
      run({ kind: "message", text });
    }
  }, [uid, run]);

  const answer = useCallback((answers, summary) => {
    dispatch({ type: "answered", summary });
    run({ kind: "answer", answers });
  }, [run]);

  const decide = useCallback(async (allow) => {
    const pending = stateRef.current.pending;
    if (allow && pending?.card?.kind === "cart") {
      // The cart lives in this browser: add exactly the approved lines, then tell KOI.
      try {
        await hydrateCart();
        const all = await fetchAllProducts();
        const bySku = new Map(all.map((p) => [String(p.skuId), p]));
        const { addToCart } = useCartStore.getState();
        for (const line of pending.card.lines ?? []) {
          const product = bySku.get(String(line.skuId));
          if (!product) continue;
          for (let i = 0; i < line.packs; i++) addToCart(product);
        }
      } catch (err) {
        dispatch({ type: "error", text: err?.message ?? "The cart couldn't be filled." });
        return;
      }
    }
    dispatch({ type: "decided", allow });
    run({ kind: "decision", allow });
  }, [run]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "stopped" });
    bridgeRef.current?.current?.endRun?.({ outcome: "stopped" });
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  const registerBridge = useCallback((ref) => {
    bridgeRef.current = ref;
    return () => {
      if (bridgeRef.current === ref) bridgeRef.current = null;
    };
  }, []);

  const undoRun = useCallback(() => bridgeRef.current?.current?.undoRun?.(), []);

  const value = useMemo(() => ({
    state,
    send,
    answer,
    decide,
    stop,
    newChat,
    undoRun,
    canUndoRun: () => Boolean(bridgeRef.current?.current?.canUndoRun),
    open: () => dispatch({ type: "open" }),
    close: () => dispatch({ type: "close" }),
    toggle: () => dispatch({ type: "toggle" }),
    setFollow: (v) => dispatch({ type: "follow", value: v }),
    registerBridge,
    signIn,
    setSignIn,
    signedIn: Boolean(uid),
    route: pageFrom(pathname, null).route,
  }), [state, send, answer, decide, stop, newChat, undoRun, registerBridge, signIn, uid, pathname]);

  const glowValue = useMemo(() => ({ glowing: (kind, k) => (glow[`${kind}:${k}`] ?? 0) > Date.now() }), [glow]);

  return (
    <AgentContext.Provider value={value}>
      <GlowContext.Provider value={glowValue}>{children}</GlowContext.Provider>
    </AgentContext.Provider>
  );
}
