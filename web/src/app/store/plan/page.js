"use client";

// ============================================================================
// /store/plan — Plan
//
// The founder's Nutrition Planner design (KOI - Nutrition Planner.html) on
// KOI's own backend: Define → You → Plan → Pantry → Shop → Track. The step is
// in the address (?step=), so Back works.
//
// Every figure on these screens comes from the planner (/api/plan/run), a
// label, or goals.js's cited suggestion. Where the design showed a number KOI
// cannot back — a success probability, body fat, a "you save" — the screen
// shows what KOI does know instead, or nothing. Track is the design's own
// screen, marked as a preview of sample numbers.
// ============================================================================

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AccountButton from "@/components/auth/AccountButton";
import { usePlanSession } from "@/components/store/plan/design/usePlanSession";
import Header, { STEPS } from "@/components/store/plan/design/Header";
import DefineStep from "@/components/store/plan/design/DefineStep";
import YouStep from "@/components/store/plan/design/YouStep";
import PlanStep from "@/components/store/plan/design/PlanStep";
import PantryStep from "@/components/store/plan/design/PantryStep";
import ShopStep from "@/components/store/plan/design/ShopStep";
import TrackStep from "@/components/store/plan/design/TrackStep";
import { Toast } from "@/components/store/plan/design/bits";
import { C, font } from "@/components/store/plan/design/tokens";

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

function Plan() {
  const s = usePlanSession();
  const params = useSearchParams();
  const router = useRouter();
  const asked = params.get("step");
  const step = STEPS.some((x) => x.key === asked) ? asked : "define";

  const go = useCallback((key) => {
    router.replace(`/store/plan?step=${key}`, { scroll: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [router]);
  const at = STEPS.findIndex((x) => x.key === step);
  const next = () => go(STEPS[Math.min(STEPS.length - 1, at + 1)].key);
  const back = () => go(STEPS[Math.max(0, at - 1)].key);

  if (s.session === undefined) return <Loading />;

  if (!s.session) {
    return (
      <div className="koi-page" style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 28 }}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: C.logoDot }} />
          <span style={{ font: font(700, 22, "num"), color: C.primary }}>KOI</span>
        </div>
        <h1 style={{ font: font(700, 34, "sans", 1.1), letterSpacing: "-.02em", margin: "0 0 10px" }}>Plan</h1>
        <p style={{ font: font(400, 15, "sans", 1.55), color: C.ink2, margin: "0 0 20px" }}>
          Sign in to plan for your household. Your household and its targets are yours alone — nobody else can read them.
        </p>
        <AccountButton />
      </div>
    );
  }

  return (
    <>
      <Header
        step={step}
        onStep={go}
        profiles={s.profiles}
        activeKey={s.activeKey}
        onActive={s.setActiveKey}
        keyOf={s.keyOf}
        onAddMember={s.addMember}
        saveState={s.saveState}
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
        {step === "pantry" && <PantryStep s={s} onBack={back} onNext={next} />}
        {step === "shop" && <ShopStep s={s} onBack={back} onNext={next} />}
        {step === "track" && <TrackStep onBack={back} />}
      </main>
      <Toast toast={s.toast} />
    </>
  );
}
