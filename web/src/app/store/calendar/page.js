"use client";

// ============================================================================
// /store/calendar — the household's Calendar (P6). Runs on the same household
// session as the Plan and Track (usePlanSession), so an event changes the week
// the moment it is saved. ?add=<their words> opens the add sheet filled in from
// a sentence said to KOI (the KOI bar sends scheduling sentences here).
// ============================================================================

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLoginUi } from "@/store/loginUiStore";
import { usePlanSession } from "@/components/store/plan/design/usePlanSession";
import CalendarView from "@/components/store/calendar/CalendarView";
import { Toast } from "@/components/store/plan/design/bits";
import { useAgent, useAgentBridge } from "@/components/agent/AgentProvider";

function Loading() {
  return (
    <div role="status" className="koi-page flex items-center gap-2.5 font-koi-sans text-sm font-medium text-koi-muted">
      <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-koi-track border-t-koi-green" />
      Loading your calendar…
    </div>
  );
}

function Outside({ signedIn }) {
  const openLogin = useLoginUi((st) => st.openLogin);
  return (
    <main className="koi-page font-koi-sans text-koi-ink">
      <section className="flex max-w-[860px] flex-col gap-4">
        <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">Calendar</span>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,6vw,84px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">Your weeks, planned around your life</h1>
        <p className="m-0 max-w-[600px] text-[17px] leading-relaxed text-koi-ink2">
          {signedIn
            ? "Add the people you cook for first. Then meals out, training, travel and batch-cooking days go here, and KOI plans each week around them."
            : "Sign in with your phone, and KOI plans each week around your meals out, training, travel and batch-cooking days."}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {signedIn
            ? <Link href="/store/plan" className="flex h-14 items-center rounded-2xl bg-koi-forest px-7 text-[15px] font-bold text-koi-lime no-underline">Set up your household</Link>
            : <button type="button" onClick={() => openLogin()} className="flex h-14 items-center rounded-2xl bg-koi-forest px-7 text-[15px] font-bold text-koi-lime">Sign in with phone</button>}
        </div>
      </section>
    </main>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Calendar />
    </Suspense>
  );
}

function Calendar() {
  const session = usePlanSession();
  const router = useRouter();
  const search = useSearchParams();
  const ask = search.get("add");
  // KOI Agent Mode: "tell KOI" here goes to the dock, as on the Plan and Track.
  const agent = useAgent();
  const agentSend = agent?.send;
  const s = useMemo(() => (agentSend ? { ...session, command: agentSend } : session), [session, agentSend]);
  useAgentBridge(s.agentBridge);

  if (s.session === undefined) return <Loading />;
  if (!s.session || !s.householdId) return <Outside signedIn={Boolean(s.session)} />;

  return (
    <>
      <main className="koi-page">
        <CalendarView s={s} ask={ask} onAsked={() => router.replace("/store/calendar", { scroll: false })} />
      </main>
      <Toast toast={s.toast} />
    </>
  );
}
