"use client";

// ============================================================================
// KOI — Connect your Swiggy account
//
// The one control that turns availability from a guess into an answer.
//
// WHAT IT PROMISES IS EXACTLY WHAT IT DOES. Connecting lets KOI ask Swiggy two
// things on the shopper's behalf — is this in stock near you, and what does it
// cost — and, when they choose to, put a basket into their Swiggy cart. It does
// not let KOI order anything or pay for anything: the shopper confirms and pays
// on Swiggy, because KOI is not merchant of record.
//
// FOUR STATES, AND NONE OF THEM IS DECORATIVE:
//   unavailable  KOI has no Swiggy client credentials. No button, because one
//                that cannot work is worse than none.
//   disconnected the normal starting point.
//   connected    with an address KOI can query.
//   connected without an address — a real state, not an edge case. The token
//                works and every lookup still answers `unknown`, so it says so
//                rather than showing a green tick over nothing.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Link2, Link2Off, Loader2, AlertTriangle, Check } from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";

/**
 * @param {object} props
 * @param {string} [props.next] where to return after the round trip
 * @param {boolean} [props.compact] inline variant for the checkout column
 */
export default function ConnectSwiggy({ next = "/store/shop", compact = false }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal) => {
    try {
      const res = await fetch("/api/marketplace/connect", { signal });
      // 401 means signed out, not "not connected". Showing a Connect button to
      // someone with no KOI session would send them into a flow that cannot
      // finish.
      if (!res.ok) return setStatus({ available: false, connected: false, signedOut: res.status === 401 });
      setStatus(await res.json());
    } catch {
      /* aborted or offline — leave the previous state rather than flicker */
    }
  }, []);

  useEffect(() => {
    const c = new AbortController();
    // Deferred by a tick, the convention this codebase already uses for
    // react-hooks/set-state-in-effect: the first state write lands after the
    // effect has returned rather than cascading a second render out of the
    // first one.
    const t = setTimeout(() => load(c.signal), 0);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [load]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/marketplace/connect", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Nothing is known yet. Render nothing rather than guess at a state.
  if (!status) return null;
  if (status.signedOut || !status.available) return null;

  const href = `/api/marketplace/connect/swiggy?next=${encodeURIComponent(next)}`;

  if (status.connected) {
    return (
      <div className={`rounded-xl border border-[#E2E8D8] bg-white ${compact ? "p-3.5" : "p-5"}`}>
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.forest }} strokeWidth={3} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13.5px] font-bold text-[#0E4032]" style={HEADING}>
              Swiggy connected
            </h3>
            {status.hasAddress ? (
              <p className="mt-0.5 text-[12px] leading-relaxed text-[#5A6B5A]" style={BODY}>
                KOI can check what&apos;s in stock near you and hand your basket over when you&apos;re ready.
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] leading-relaxed" style={{ ...BODY, color: "#B8860B" }}>
                Connected, but Swiggy hasn&apos;t given us a delivery address yet — add one on Swiggy and
                reconnect, or stock will keep showing as unknown.
              </p>
            )}
            <button
              onClick={disconnect}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5A6B5A] underline underline-offset-2 hover:text-[#0E4032] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[#E2E8D8] bg-white ${compact ? "p-3.5" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.orange }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold text-[#0E4032]" style={HEADING}>
            Connect Swiggy to see what&apos;s in stock
          </h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#5A6B5A]" style={BODY}>
            Until you do, KOI can show you what it has screened but not whether it can be delivered
            to you right now. Connecting lets us check stock and prices at your address, and put a
            basket into your Swiggy cart when you ask. You still confirm and pay on Swiggy.
          </p>
          <a
            href={href}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#0E4032] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#0E4032]/90"
          >
            <Link2 className="h-3.5 w-3.5 text-[#C8F23E]" />
            Connect Swiggy
          </a>
        </div>
      </div>
    </div>
  );
}
