"use client";

// ============================================================================
// KOI SHOP — Goal setup
// GoalCard: an editorial banner in "Explore by intention" that invites the
// shopper to personalise KOI. GoalSetupModal: a 3-step flow (goal → body →
// diet) that derives daily macro targets. Foundation for future AI matching.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  Target, ArrowRight, ArrowLeft, X, Check, Sparkles, Flame, Dumbbell, Scale,
  TrendingDown, Pencil, Utensils, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { Grain } from "@/components/store/landing/primitives";
import { useGoalStore, computeTargets, ACTIVITY, GOAL_DEFS } from "@/store/goalStore";

const GOAL_ICON = { TrendingDown, Dumbbell, Scale, Sparkles };
const DIET_OPTIONS = ["Vegetarian", "Vegan", "Eggetarian", "Non-veg", "Gluten-free", "Keto", "High-protein", "No added sugar", "Dairy-free"];
const SAMPLE = computeTargets({ sex: "male", age: 28, height: 175, weightNow: 72, activity: "moderate", goal: "maintenance" });

// ── Macro donut ─────────────────────────────────────────────────────────────
function MacroRing({ targets, size = 150, dim = false }) {
  const t = targets || SAMPLE;
  const pk = t.protein * 4, ck = t.carbs * 4, fk = t.fat * 9;
  const tot = Math.max(1, pk + ck + fk);
  const segs = [
    { v: pk, c: dim ? "rgba(255,255,255,0.35)" : C.forest },
    { v: ck, c: dim ? "rgba(255,255,255,0.22)" : C.emerald },
    { v: fk, c: dim ? "rgba(255,255,255,0.14)" : C.lime },
  ];
  const stroke = 13;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        {segs.map((s, i) => {
          const frac = s.v / tot;
          const dash = frac * circ;
          const off = -acc * circ;
          acc += frac;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.c}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, dash - 3)} ${circ - Math.max(0, dash - 3)}`}
              strokeDashoffset={off}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)" }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-extrabold leading-none text-white" style={HEADING}>{t.kcal}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">kcal / day</span>
      </div>
    </div>
  );
}

// ── The banner card ─────────────────────────────────────────────────────────
export function GoalCard({ onOpen }) {
  const profile = useGoalStore((s) => s.profile);
  const hydrate = useGoalStore((s) => s.hydrate);
  const clearProfile = useGoalStore((s) => s.clearProfile);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { hydrate(); setMounted(true); }, [hydrate]);

  const active = mounted && profile;
  const t = active ? profile.targets : SAMPLE;
  const goalLabel = active ? (GOAL_DEFS[profile.goal]?.label || "Your goal") : null;

  return (
    <div className="relative mt-8 overflow-hidden rounded-[28px]" style={{ background: `linear-gradient(150deg, ${C.green} 0%, ${C.forest} 60%, ${C.ink} 130%)` }}>
      <Grain opacity={0.06} />
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full" style={{ background: C.emerald, opacity: 0.3, filter: "blur(90px)" }} />

      <div className="relative grid grid-cols-1 items-center gap-8 p-7 sm:p-9 lg:grid-cols-[1.3fr_auto] lg:gap-12 lg:p-11">
        {/* copy */}
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "rgba(221,242,71,0.16)" }}>
              <Target className="h-4 w-4" style={{ color: C.lime }} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DDF247]">
              {active ? "Your KOI plan" : "Personalise KOI"}
            </span>
          </div>

          {active ? (
            <>
              <h3 className="mt-5 font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)" }}>
                {goalLabel}
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <Stat label="Calories" value={`${t.kcal}`} unit="kcal" />
                <Stat label="Protein" value={`${t.protein}`} unit="g" />
                <Stat label="Carbs" value={`${t.carbs}`} unit="g" />
                <Stat label="Fat" value={`${t.fat}`} unit="g" />
              </div>
              {profile.diet?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {profile.diet.map((d) => (
                    <span key={d} className="rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-bold text-white/80">{d}</span>
                  ))}
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={onOpen} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-[#083D2D] transition-transform hover:-translate-y-0.5" style={{ background: C.lime }}>
                  <Pencil className="h-3.5 w-3.5" /> Edit goal
                </button>
                <button onClick={() => { clearProfile(); toast.success("Goal cleared"); }} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white/50 transition-colors hover:text-white/80">
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </button>
                <span className="text-[11px] font-medium text-white/40">Soon: KOI's AI will match products to these targets.</span>
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-5 font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(1.8rem, 3.6vw, 3rem)" }}>
                Shop for your goal,<br />not your cravings.
              </h3>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/65" style={BODY}>
                Tell KOI your goal, body stats and diet. We&apos;ll translate them into daily macro
                targets — and soon, match every product to them automatically.
              </p>
              <button
                onClick={onOpen}
                className="group mt-7 inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[15px] font-bold text-[#083D2D] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(221,242,71,0.35)]"
                style={{ background: C.lime }}
              >
                Set your goal
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </>
          )}
        </div>

        {/* ring */}
        <div className="flex flex-col items-center gap-4">
          <MacroRing targets={active ? t : SAMPLE} dim={!active} />
          <div className="flex items-center gap-3 text-[11px] font-bold">
            <Legend c={active ? C.forest : "rgba(255,255,255,0.4)"} label="Protein" />
            <Legend c={active ? C.emerald : "rgba(255,255,255,0.28)"} label="Carbs" />
            <Legend c={active ? C.lime : "rgba(255,255,255,0.18)"} label="Fat" />
          </div>
          {!active && <span className="text-[11px] font-medium text-white/40">Sample plan — set yours to personalise</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 px-3.5 py-2.5">
      <div className="flex items-baseline gap-1">
        <span className="text-[19px] font-extrabold leading-none text-white" style={HEADING}>{value}</span>
        <span className="text-[11px] font-semibold text-white/50">{unit}</span>
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#DDF247]">{label}</div>
    </div>
  );
}

function Legend({ c, label }) {
  return (
    <span className="flex items-center gap-1.5 text-white/70">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {label}
    </span>
  );
}

// ── The modal ───────────────────────────────────────────────────────────────
const STEPS = ["Your goal", "Your body", "Your diet"];

function Slider({ label, value, min, max, unit, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-bold text-[#083D2D]">{label}</span>
        <span className="rounded-lg bg-[#EAF8F0] px-2.5 py-1 text-[13px] font-extrabold text-[#0C6B4C]" style={HEADING}>{value}{unit}</span>
      </div>
      <input
        type="range"
        className="koi-goal-range h-2 w-full cursor-pointer appearance-none rounded-full"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, ${C.forest} ${pct}%, rgba(8,61,45,0.08) ${pct}%)` }}
      />
    </div>
  );
}

export function GoalSetupModal({ open, onClose }) {
  const profile = useGoalStore((s) => s.profile);
  const setProfile = useGoalStore((s) => s.setProfile);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(null);

  // reset form each time the modal opens
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm({
      goal: profile?.goal || "",
      sex: profile?.sex || "male",
      age: profile?.age || 28,
      height: profile?.height || 172,
      weightNow: profile?.weightNow || 72,
      weightTarget: profile?.weightTarget || 68,
      activity: profile?.activity || "moderate",
      diet: profile?.diet || [],
    });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, profile]);

  const targets = useMemo(() => (form ? computeTargets(form) : null), [form]);

  if (!open || !form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleDiet = (d) => set({ diet: form.diet.includes(d) ? form.diet.filter((x) => x !== d) : [...form.diet, d] });
  const canContinue = step !== 0 || !!form.goal;

  const save = () => {
    setProfile(form);
    toast.success("Your goal is set — KOI is now tuned to you");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-in fade-in duration-200" style={{ background: "rgba(8,29,22,0.55)", backdropFilter: "blur(20px)" }} onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden bg-[#F9F8F4] shadow-[0_40px_120px_rgba(8,29,22,0.5)] duration-300 animate-in slide-in-from-bottom-6 sm:rounded-[28px] sm:zoom-in-95">
        {/* header */}
        <div className="relative shrink-0 px-6 pb-5 pt-6" style={{ background: C.mint }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: C.forest }}>
                <Target className="h-4.5 w-4.5" style={{ color: C.lime }} />
              </span>
              <div>
                <div className="text-[15px] font-extrabold text-[#083D2D]" style={HEADING}>Set your goal</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0C6B4C]">Step {step + 1} of 3 · {STEPS[step]}</div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-[#083D2D] hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#083D2D]/10">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: i <= step ? "100%" : "0%", background: C.forest }} />
              </div>
            ))}
          </div>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(GOAL_DEFS).map(([key, g]) => {
                const Icon = GOAL_ICON[g.icon] || Sparkles;
                const on = form.goal === key;
                return (
                  <button
                    key={key}
                    onClick={() => set({ goal: key })}
                    className="flex flex-col items-start gap-3 rounded-3xl border-2 p-5 text-left transition-all duration-200"
                    style={{ borderColor: on ? C.forest : "rgba(8,61,45,0.1)", background: on ? "#fff" : "#fff", boxShadow: on ? "0 16px 40px rgba(8,61,45,0.12)" : "none" }}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: on ? C.forest : C.mint }}>
                      <Icon className="h-5 w-5" style={{ color: on ? C.lime : C.emerald }} strokeWidth={2.2} />
                    </span>
                    <span>
                      <span className="block text-[16px] font-extrabold text-[#083D2D]" style={HEADING}>{g.label}</span>
                      <span className="mt-0.5 block text-[12.5px] text-[#083D2D]/55" style={BODY}>{g.blurb}</span>
                    </span>
                    {on && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#0C6B4C]"><Check className="h-3.5 w-3.5" strokeWidth={3} /> Selected</span>}
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <span className="mb-2 block text-[13px] font-bold text-[#083D2D]">Sex</span>
                <div className="grid grid-cols-3 gap-2">
                  {[["male", "Male"], ["female", "Female"], ["other", "Other"]].map(([k, l]) => (
                    <button key={k} onClick={() => set({ sex: k })} className="rounded-xl border-2 py-2.5 text-[13px] font-bold transition-all" style={{ borderColor: form.sex === k ? C.forest : "rgba(8,61,45,0.1)", background: form.sex === k ? C.forest : "#fff", color: form.sex === k ? "#fff" : C.forest }}>{l}</button>
                  ))}
                </div>
              </div>
              <Slider label="Age" value={form.age} min={14} max={90} unit=" yrs" onChange={(v) => set({ age: v })} />
              <Slider label="Height" value={form.height} min={130} max={215} unit=" cm" onChange={(v) => set({ height: v })} />
              <Slider label="Current weight" value={form.weightNow} min={35} max={160} unit=" kg" onChange={(v) => set({ weightNow: v })} />
              <Slider label="Goal weight" value={form.weightTarget} min={35} max={160} unit=" kg" onChange={(v) => set({ weightTarget: v })} />
              <div>
                <span className="mb-2 block text-[13px] font-bold text-[#083D2D]">Activity level</span>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(ACTIVITY).map(([k, a]) => (
                    <button key={k} onClick={() => set({ activity: k })} className="flex items-center justify-between rounded-xl border-2 px-4 py-2.5 text-left transition-all" style={{ borderColor: form.activity === k ? C.forest : "rgba(8,61,45,0.1)", background: "#fff" }}>
                      <span className="text-[13.5px] font-bold text-[#083D2D]">{a.label}</span>
                      <span className="text-[12px] text-[#083D2D]/50">{a.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-7">
              <div>
                <span className="mb-3 flex items-center gap-2 text-[13px] font-bold text-[#083D2D]"><Utensils className="h-4 w-4" style={{ color: C.emerald }} /> Dietary preferences</span>
                <div className="flex flex-wrap gap-2">
                  {DIET_OPTIONS.map((d) => {
                    const on = form.diet.includes(d);
                    return (
                      <button key={d} onClick={() => toggleDiet(d)} className="rounded-full border-2 px-3.5 py-1.5 text-[13px] font-bold transition-all" style={{ borderColor: on ? C.forest : "rgba(8,61,45,0.12)", background: on ? C.lime : "#fff", color: C.forest }}>{d}</button>
                    );
                  })}
                </div>
              </div>

              {/* live summary */}
              <div className="overflow-hidden rounded-[24px]" style={{ background: C.forest }}>
                <div className="flex items-center gap-6 p-6">
                  <MacroRing targets={targets} size={128} />
                  <div className="flex-1 space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#DDF247]">Estimated daily targets</div>
                    {[["Protein", targets.protein, C.forest], ["Carbs", targets.carbs, C.emerald], ["Fat", targets.fat, C.lime]].map(([l, v, c]) => (
                      <div key={l} className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                        <span className="flex-1 text-[13px] font-semibold text-white/80">{l}</span>
                        <span className="text-[14px] font-extrabold text-white" style={HEADING}>{v}g</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="border-t border-white/10 px-6 py-3 text-[11.5px] font-medium text-white/50" style={BODY}>
                  Estimates via the Mifflin–St Jeor equation. A starting point, not medical advice.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center gap-3 border-t border-[#083D2D]/8 bg-white px-6 py-4">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1.5 rounded-full border border-[#083D2D]/12 px-5 py-3 text-[14px] font-bold text-[#083D2D] transition-colors hover:bg-[#F2F6EC]">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => canContinue && setStep((s) => s + 1)}
              disabled={!canContinue}
              className="ml-auto inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: C.forest }}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={save} className="ml-auto inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold text-[#083D2D] transition-transform hover:-translate-y-0.5" style={{ background: C.lime }}>
              <Check className="h-4 w-4" strokeWidth={3} /> Save my plan
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        .koi-goal-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px; height: 22px; border-radius: 9999px;
          background: #fff; border: 3px solid ${C.forest};
          box-shadow: 0 2px 8px rgba(8,61,45,0.25); cursor: pointer;
        }
        .koi-goal-range::-moz-range-thumb {
          width: 22px; height: 22px; border-radius: 9999px;
          background: #fff; border: 3px solid ${C.forest};
          box-shadow: 0 2px 8px rgba(8,61,45,0.25); cursor: pointer;
        }
      `}</style>
    </div>
  );
}
