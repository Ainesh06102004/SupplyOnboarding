"use client";

// ============================================================================
// /store/track — Track
//
// The account holder's own weigh-ins against the plan's arithmetic, and KOI's
// suggestion for a new daily target (taken only when they say so). It was the
// Plan's sixth step until 20 Oct 2026; it is its own page now, because the Plan
// is this week's chapters and Track is the person's weeks. /store/plan?step=track
// still lands here.
//
// It runs on the same household session as the Plan (usePlanSession: loading
// the household is all it does on arrival — no plan is run), so editing the
// target here is the same save the You step makes, and the dock reaches it
// through the same bridge.
// ============================================================================

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLoginUi } from "@/store/loginUiStore";
import { usePlanSession } from "@/components/store/plan/design/usePlanSession";
import TrackView from "@/components/store/plan/design/TrackView";
import { Toast } from "@/components/store/plan/design/bits";
import { useAgent, useAgentBridge } from "@/components/agent/AgentProvider";

function Loading() {
  return (
    <div role="status" className="koi-page flex items-center gap-2.5 font-koi-sans text-sm font-medium text-koi-muted">
      <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-koi-track border-t-koi-green" />
      Loading Track…
    </div>
  );
}

function SignedOut() {
  const openLogin = useLoginUi((st) => st.openLogin);
  return (
    <main className="koi-page font-koi-sans text-koi-ink">
      <section className="flex max-w-[860px] flex-col gap-4">
        <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">Track</span>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,6vw,84px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">Your meals and weigh-ins, against the plan</h1>
        <p className="m-0 max-w-[600px] text-[17px] leading-relaxed text-koi-ink2">
          Sign in with your phone to track your own meals and weight. They are yours alone, kept until you delete them, and KOI only ever suggests.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" onClick={() => openLogin()} className="flex h-14 items-center rounded-2xl bg-koi-forest px-7 text-[15px] font-bold text-koi-lime">Sign in with phone</button>
          <Link href="/store/plan" className="flex h-14 items-center rounded-2xl border border-koi-forest/20 bg-white px-6 text-[15px] font-semibold text-koi-forest no-underline">See the Plan</Link>
        </div>
      </section>
    </main>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Track />
    </Suspense>
  );
}

function Track() {
  const session = usePlanSession();
  const router = useRouter();
  // A meal said to KOI opens Track on it: ?meal=<their words> from the KOI bar,
  // ?take2=<date>:<slot> after KOI's agent logged it.
  const search = useSearchParams();
  const ask = useMemo(() => ({ meal: search.get("meal"), take2: search.get("take2") }), [search]);
  // KOI Agent Mode: "tell KOI" on this page goes to the dock, as on the Plan.
  const agent = useAgent();
  const agentSend = agent?.send;
  const s = useMemo(() => (agentSend ? { ...session, command: agentSend } : session), [session, agentSend]);
  useAgentBridge(s.agentBridge);

  // An agent run that wants a Plan step from here goes to the Plan.
  const { nav, setNav } = s;
  useEffect(() => {
    if (!nav) return;
    router.push(nav === "track" ? "/store/track" : `/store/plan?step=${nav}`);
    setNav(null);
  }, [nav, router, setNav]);

  if (s.session === undefined) return <Loading />;
  if (!s.session) return <SignedOut />;

  return (
    <>
      <main className="koi-page">
        {s.error && (
          <div role="alert" className="mb-4 flex justify-between gap-2.5 rounded-2xl border border-koi-red/20 bg-koi-red-bg px-4 py-2.5 font-koi-sans text-[13px] font-semibold text-koi-red">
            <span>{s.error}</span>
            <button type="button" onClick={() => s.setError(null)} aria-label="Dismiss" className="text-sm font-bold">×</button>
          </div>
        )}
        <TrackView s={s} ask={ask} onAsked={() => router.replace("/store/track", { scroll: false })} />
      </main>
      <Toast toast={s.toast} />
    </>
  );
}
