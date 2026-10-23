"use client";

// ============================================================================
// /store/plan — Plan
//
// The founder's Nutrition Planner design (KOI - Nutrition Planner.html) on
// KOI's own backend: Define → You → Plan → Pantry → Cart. The step is in the
// address (?step=), so Back works. Track was step six; since 20 Oct 2026 it is
// its own page (/store/track), and ?step=track is sent there. Step five's key
// is still `shop` (links, the agent's tools and its eval use it); it is
// labelled Cart, because it is the store's one cart, not a second one. It is
// the last step, so its footer goes on to checkout.
//
// The page sits inside the store's shell: the shared StoreHeader above, the
// PlanBar (steps + household) under it. Signed out, it keeps the shell and
// offers sign-in in one card, instead of a bare page with its own logo.
//
// Every figure on these screens comes from the planner (/api/plan/run), a
// label, or goals.js's cited suggestion. Where the design showed a number KOI
// cannot back — a success probability, body fat, a "you save" — the screen
// shows what KOI does know instead, or nothing.
// ============================================================================

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLoginUi } from "@/store/loginUiStore";
import { usePlanSession } from "@/components/store/plan/design/usePlanSession";
import PlanBar, { STEPS } from "@/components/store/plan/design/PlanBar";
import DefineStep from "@/components/store/plan/design/DefineStep";
import YouStep from "@/components/store/plan/design/YouStep";
import PlanStep from "@/components/store/plan/design/PlanStep";
import PantryStep from "@/components/store/plan/design/PantryStep";
import ShopStep from "@/components/store/plan/design/ShopStep";
import DraftBanner from "@/components/store/plan/design/DraftBanner";
import { Toast } from "@/components/store/plan/design/bits";
import Link from "next/link";
import { useAgent, useAgentBridge } from "@/components/agent/AgentProvider";
import { useCartUi } from "@/store/cartUiStore";
import { peopleOf } from "@/lib/plan/planView";
import { useBarFacts } from "@/components/store/shell/useBarPrompt";

export default function PlanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Plan />
    </Suspense>
  );
}

function Loading() {
  return (
    <div role="status" className="koi-page flex items-center gap-2.5 font-koi-sans text-sm font-medium text-koi-muted">
      <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-koi-track border-t-koi-green" />
      Loading your household…
    </div>
  );
}

function SignedOut() {
  const openLogin = useLoginUi((st) => st.openLogin);
  return (
    <main className="koi-page font-koi-sans text-koi-ink">
      <section className="flex max-w-[860px] flex-col gap-4">
        <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">Plan</span>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,6vw,84px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">A week of groceries, planned around everyone at home</h1>
        <p className="m-0 max-w-[600px] text-[17px] leading-relaxed text-koi-ink2">
          Sign in with your phone to save your household. Its people and their targets are yours alone — nobody else can read them. Your cart already works signed out.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" onClick={() => openLogin()} className="flex h-14 items-center rounded-2xl bg-koi-forest px-7 text-[15px] font-bold text-koi-lime">Sign in with phone</button>
          <Link href="/store/shop" className="flex h-14 items-center rounded-2xl border border-koi-forest/20 bg-white px-6 text-[15px] font-semibold text-koi-forest no-underline">Browse the shop</Link>
        </div>
      </section>
    </main>
  );
}

function Plan() {
  const session = usePlanSession();
  // KOI Agent Mode: every "tell KOI" on this page (a chip, "no X", "add oats")
  // goes to the dock, so there is one conversation, not two.
  const agent = useAgent();
  const agentSend = agent?.send;
  const s = useMemo(() => (agentSend ? { ...session, command: agentSend } : session), [session, agentSend]);
  const params = useSearchParams();
  const router = useRouter();
  const asked = params.get("step");
  // Old links and bookmarks to the Track step land on the Track page.
  useEffect(() => {
    if (asked === "track") router.replace("/store/track");
  }, [asked, router]);
  const step = STEPS.some((x) => x.key === asked) ? asked : "define";
  // The KOI bar suggests for this step, for the person open (lib/koi/barWords.js).
  useBarFacts({ step, person: s.active?.label ?? null, planned: Boolean(s.plan) });

  // An auto-plan draft opens from its notification (?review=<plan id>), once the
  // household has loaded, on the week of dishes.
  const review = params.get("review");
  const reviewed = useRef(null);
  const { householdId, reviewDraft } = session;
  useEffect(() => {
    if (!review || !householdId || reviewed.current === review) return;
    reviewed.current = review;
    reviewDraft(review).then(() => router.replace("/store/plan?step=plan", { scroll: false }));
  }, [review, householdId, reviewDraft, router]);

  // push, not replace: each step is a place in history, so Back goes back.
  const go = useCallback((key) => {
    if (key === "track") { router.push("/store/track"); return; }
    router.push(`/store/plan?step=${key}`, { scroll: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [router]);
  // KOI Agent Mode: the dock reaches this page through its bridge.
  useAgentBridge(s.agentBridge);
  // The agent's "show me the shop": go there once its run is over.
  const { nav, setNav } = s;
  useEffect(() => {
    if (nav) {
      go(nav);
      setNav(null);
    }
  }, [nav, go, setNav]);

  // The plan on screen is the freshest there is: every cart surface compares
  // the basket it was filled from against this one.
  const setLatestPlan = useCartUi((st) => st.setLatestPlan);
  const people = useMemo(() => (s.plan?.report ? peopleOf(s.plan.report, s.plan.days ?? 7).length : 0), [s.plan]);
  useEffect(() => {
    if (s.session === undefined) return;
    setLatestPlan(s.plan?.report ? { planId: s.plan.planId ?? null, basket: s.plan.report.basket ?? [], members: people } : null);
  }, [s.session, s.plan, people, setLatestPlan]);

  const at = STEPS.findIndex((x) => x.key === step);
  const next = () => go(STEPS[Math.min(STEPS.length - 1, at + 1)].key);
  const back = () => go(STEPS[Math.max(0, at - 1)].key);

  if (s.session === undefined) return <Loading />;
  if (!s.session) return <SignedOut />;

  const household = s.profiles.length;
  const weekLabel = household ? `Plan · for ${household}` : "Plan";

  return (
    <>
      <PlanBar
        step={step}
        onStep={go}
        profiles={s.profiles}
        activeKey={s.activeKey}
        onActive={s.setActiveKey}
        keyOf={s.keyOf}
        onAddMember={s.addMember}
        saveState={s.saveState}
        weekLabel={weekLabel}
      />
      <main className="koi-page">
        {s.error && (
          <div role="alert" className="mb-4 flex justify-between gap-2.5 rounded-2xl border border-koi-red/20 bg-koi-red-bg px-4 py-2.5 font-koi-sans text-[13px] font-semibold text-koi-red">
            <span>{s.error}</span>
            <button type="button" onClick={() => s.setError(null)} aria-label="Dismiss" className="text-sm font-bold">×</button>
          </div>
        )}
        {s.plan?.draft && <DraftBanner s={s} />}
        {step === "define" && <DefineStep s={s} onNext={next} onPlan={() => go("plan")} />}
        {step === "you" && <YouStep s={s} onBack={back} onNext={next} />}
        {step === "plan" && <PlanStep s={s} onBack={back} onNext={next} />}
        {step === "pantry" && <PantryStep s={s} onBack={back} onNext={() => go("shop")} />}
        {step === "shop" && <ShopStep s={s} onBack={back} onNext={() => router.push("/store/checkout?from=plan")} />}
      </main>
      <Toast toast={s.toast} />
    </>
  );
}
