"use client";

// ============================================================================
// /store/plan — Plan
//
// The founder's Nutrition Planner design (KOI - Nutrition Planner.html) on
// KOI's own backend: Define → You → Plan → Pantry → Cart → Track. The step is
// in the address (?step=), so Back works. Step five's key is still `shop`
// (links, the agent's tools and its eval use it); it is labelled Cart, because
// it is the store's one cart, not a second one.
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

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginSheet from "@/components/auth/LoginSheet";
import { usePlanSession } from "@/components/store/plan/design/usePlanSession";
import PlanBar, { STEPS } from "@/components/store/plan/design/PlanBar";
import DefineStep from "@/components/store/plan/design/DefineStep";
import YouStep from "@/components/store/plan/design/YouStep";
import PlanStep from "@/components/store/plan/design/PlanStep";
import PantryStep from "@/components/store/plan/design/PantryStep";
import ShopStep from "@/components/store/plan/design/ShopStep";
import TrackStep from "@/components/store/plan/design/TrackStep";
import { Toast } from "@/components/store/plan/design/bits";
import { C, font } from "@/components/store/plan/design/tokens";
import { Button, MonoLabel } from "@/components/store/system/primitives";
import { useAgent, useAgentBridge } from "@/components/agent/AgentProvider";
import { useCartUi } from "@/store/cartUiStore";
import { peopleOf } from "@/lib/plan/planView";

export default function PlanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Plan />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="koi-page" style={{ font: font(500, 14), color: C.muted }}>
      <span aria-hidden="true" style={{ display: "inline-block", width: 12, height: 12, marginRight: 8, border: `2px solid ${C.track}`, borderTopColor: C.accent, borderRadius: "50%", animation: "koiSpin .8s linear infinite", verticalAlign: "-2px" }} />
      Loading your household…
    </div>
  );
}

function SignedOut() {
  const [open, setOpen] = useState(false);
  return (
    <main className="koi-page" style={{ maxWidth: 720 }}>
      <section className="ks-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 12, animation: "koiUp .4s ease" }}>
        <MonoLabel tone="green">Plan</MonoLabel>
        <h1 style={{ margin: 0, font: font(800, 30, "sans", 1.15), letterSpacing: "-.025em" }}>A week of groceries, planned around everyone at home</h1>
        <p style={{ margin: 0, font: font(400, 15, "sans", 1.55), color: C.ink2, maxWidth: 560 }}>
          Sign in with your phone to save your household. Its people and their targets are yours alone — nobody else can read them. Your cart already works signed out.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          <Button onClick={() => setOpen(true)}>Sign in with phone</Button>
          <Button href="/store/shop" variant="secondary">Browse the shop</Button>
        </div>
      </section>
      <LoginSheet open={open} onOpenChange={setOpen} next="/store/plan" />
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
  const step = STEPS.some((x) => x.key === asked) ? asked : "define";

  // push, not replace: each step is a place in history, so Back goes back.
  const go = useCallback((key) => {
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
          <div role="alert" style={{ marginBottom: 16, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.redText, borderRadius: 12, padding: "10px 14px", font: font(600, 13), display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>{s.error}</span>
            <button type="button" onClick={() => s.setError(null)} aria-label="Dismiss" style={{ cursor: "pointer", background: "none", border: "none", color: C.redText, font: font(700, 14) }}>×</button>
          </div>
        )}
        {step === "define" && <DefineStep s={s} onNext={next} onPlan={() => go("plan")} />}
        {step === "you" && <YouStep s={s} onBack={back} onNext={next} />}
        {step === "plan" && <PlanStep s={s} onBack={back} onNext={next} />}
        {step === "pantry" && <PantryStep s={s} onBack={back} onNext={() => go("shop")} />}
        {step === "shop" && <ShopStep s={s} onBack={back} onNext={next} />}
        {step === "track" && <TrackStep s={s} onBack={back} />}
      </main>
      <Toast toast={s.toast} />
    </>
  );
}
