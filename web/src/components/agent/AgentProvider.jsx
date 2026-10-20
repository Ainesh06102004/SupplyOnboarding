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
import { getCatalogue, putPlanInCart } from "@/lib/cart/client";
import { agentReducer, initialAgentState, persistable } from "@/lib/agent/client/reducer";
import { postSegment, pageFrom } from "@/lib/agent/client/transport";
import { useKoiVoice } from "@/store/koiVoiceStore";

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
  // AuthContext's user is KOI's shape (contexts/AuthContext.jsx toKoiUser): the id is `uid`.
  const uid = user?.uid ?? null;
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
  const say = useKoiVoice((v) => v.say);
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

  const page = useCallback(() => {
    const bridge = bridgeRef.current?.current;
    return pageFrom(pathname, searchParams(), { planId: bridge?.planId ?? null, cartCount, week: bridge?.weekSummary?.() ?? null });
  }, [pathname, cartCount]);

  // ── What a run asks of the page ───────────────────────────────────────────
  const shine = useCallback((highlight) => {
    if (!highlight) return;
    const until = Date.now() + GLOW_MS;
    setGlow((g) => {
      const next = { ...g };
      for (const m of highlight.members ?? []) next[`member:${m}`] = until;
      for (const s of highlight.skus ?? []) next[`sku:${s}`] = until;
      for (const c of highlight.cells ?? []) next[`cell:${c}`] = until;
      return next;
    });
    setTimeout(() => setGlow((g) => Object.fromEntries(Object.entries(g).filter(([, t]) => t > Date.now()))), GLOW_MS + 50);
  }, []);

  const pendingMenuRef = useRef(null);
  const runMenu = useCallback((bridge, menu) => {
    // The plan and its week may still be settling after a navigation or a change: give the page a moment, a few times.
    const attempt = (tries) => setTimeout(() => {
      const live = bridgeRef.current?.current ?? bridge;
      const result = live?.menu?.(menu);
      if ((!result || result.notReady) && tries < 6) {
        attempt(tries + 1);
        return;
      }
      dispatch({ type: "local", entry: { kind: "notice", tone: result?.changed ? "info" : "warn", text: result?.text ?? "The week's dishes couldn't be changed." } });
      if (result?.cells?.length) shine({ cells: result.cells });
    }, tries ? 900 : 600);
    attempt(0);
  }, [shine]);

  const onUi = useCallback((e) => {
    const bridge = bridgeRef.current?.current;
    if (e.householdChanged) bridge?.reload?.();
    if (e.highlight) shine(e.highlight);
    if (e.explain) {
      const lines = bridge?.explainLines?.() ?? null;
      dispatch({ type: "local", entry: { kind: "result", data: { kind: "explain", lines: lines ?? [{ text: "Open your plan to see how KOI made it." }] } } });
    }
    // Asked for ("show me the plan") always happens; following along only while Follow is on.
    if (e.navigate?.href && (e.navigate.explicit || stateRef.current.follow)) {
      const here = `${window.location.pathname}${window.location.search}`;
      if (here !== e.navigate.href) router.push(e.navigate.href, { scroll: true });
    }
    // The week's dishes change on the Plan page; if it isn't open yet, as soon as it is.
    if (e.menu) {
      if (bridge?.menu) runMenu(bridge, e.menu);
      else pendingMenuRef.current = e.menu;
    }
  }, [router, shine, runMenu]);

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
    // Signed out, the conversation does not open beside the page (20 Oct 2026:
    // it read as an empty side window). KOI keeps the message, says so in its
    // subtitle, and asks for sign-in; the message goes once the shopper is in.
    if (!uid) {
      heldRef.current = text;
      say("Sign in with your phone and I’ll take it from there.");
      setSignIn(true);
      return;
    }
    if (stateRef.current.status === "running") {
      dispatch({ type: "queue", text });
      return;
    }
    dispatch({ type: "user", text });
    run({ kind: "message", text });
  }, [uid, run, say]);

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
    if (allow && pending?.card?.kind === "cart_edit") {
      // Exactly the approved changes, in this browser's one cart. These are the
      // shopper's own packs: "set" and "remove" change the line; "add" adds.
      try {
        await hydrateCart();
        const all = await getCatalogue();
        const bySku = new Map(all.map((p) => [String(p.skuId), p]));
        const cart = useCartStore.getState();
        for (const line of pending.card.lines ?? []) {
          const product = bySku.get(String(line.skuId));
          if (!product) continue;
          const inCart = cart.items.some((i) => String(i.skuId) === String(product.skuId));
          if (line.mode === "remove") cart.setQty(String(product.skuId), 0);
          else if (line.mode === "set" && inCart) cart.setQty(String(product.skuId), line.packs);
          else cart.add(product, line.packs);
        }
      } catch (err) {
        dispatch({ type: "error", text: err?.message ?? "The cart couldn't be changed." });
        return;
      }
    }
    if (allow && pending?.card?.kind === "cart") {
      // The whole plan, through the one bridge: it replaces the plan's share of
      // the cart (never doubles) and keeps what the shopper marked at home.
      try {
        await putPlanInCart({
          planId: pending.card.planId ?? null,
          basket: pending.card.lines ?? [],
          atHome: useCartStore.getState().plan?.atHome ?? [],
        });
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
    // A menu change asked for before the Plan page was open.
    if (pendingMenuRef.current && ref.current?.menu) {
      const menu = pendingMenuRef.current;
      pendingMenuRef.current = null;
      setTimeout(() => { if (bridgeRef.current === ref) runMenu(ref.current, menu); }, 900);
    }
    return () => {
      if (bridgeRef.current === ref) bridgeRef.current = null;
    };
  }, [runMenu]);

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
    // Signed out there is no conversation to open: the K asks for sign-in.
    open: () => (uid ? dispatch({ type: "open" }) : setSignIn(true)),
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
