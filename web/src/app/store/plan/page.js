"use client";

// ============================================================================
// /store/plan — plan the week for a household
//
// Phase 3. The founder's example, through a form: four people, their targets,
// what each of them avoids, a budget — then a basket, what each member
// actually gets against what was asked, and what the plan had to give up.
//
// Every figure on this page comes from the planner (/api/plan), which computes
// it from declared label figures and the solver's own allocation. Nothing here
// invents a number, and nothing here calls a food good or bad: a plan is a
// basket that meets stated targets without feeding anyone what they avoid.
//
// Members are described by the person filling this in: a label they choose, an
// age band, a diet, what to avoid, and targets they state. No names, no dates
// of birth, and nothing is tracked against anyone — see migration 00044.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, ShoppingBasket, TriangleAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";

const AGE_BANDS = [
  { key: "adult_19_59", label: "Adult (19–59)" },
  { key: "senior_60_plus", label: "60 or over" },
  { key: "teen_16_18", label: "Teen (16–18)" },
  { key: "teen_13_15", label: "Teen (13–15)" },
  { key: "child_10_12", label: "Child (10–12)" },
  { key: "child_7_9", label: "Child (7–9)" },
  { key: "child_4_6", label: "Child (4–6)" },
  { key: "child_1_3", label: "Child (1–3)" },
];

const HARD_AVOIDS = FOODS_AVOID.filter((a) => a.mode === "hard");
const SOFT_AVOIDS = FOODS_AVOID.filter((a) => a.mode === "soft");

const blankMember = () => ({
  key: crypto.randomUUID(),
  label: "",
  age_band: "adult_19_59",
  diet_type: "vegetarian",
  target_kcal: "",
  target_protein_g: "",
  avoidKeys: [],
});

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function PlanPage() {
  const [session, setSession] = useState(undefined);
  const [members, setMembers] = useState([blankMember()]);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  // skuId -> { busy, result, error }: "what if I can't get this?"
  const [without, setWithout] = useState({});

  async function seeWithout(skuId) {
    setWithout((w) => ({ ...w, [skuId]: { busy: true } }));
    try {
      const response = await fetch("/api/plan/without", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, skuId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be re-solved.");
      setWithout((w) => ({ ...w, [skuId]: { result: body } }));
    } catch (err) {
      setWithout((w) => ({ ...w, [skuId]: { error: err?.message ?? "Something went wrong." } }));
    }
  }

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setSession(data?.user ?? null));
  }, []);

  const ready = useMemo(
    () => members.length > 0 && members.every((m) => m.label.trim() && (num(m.target_protein_g) || num(m.target_kcal))),
    [members],
  );

  const update = (key, patch) => setMembers((list) => list.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const toggleAvoid = (key, avoidKey) => update(key, {
    avoidKeys: members.find((m) => m.key === key).avoidKeys.includes(avoidKey)
      ? members.find((m) => m.key === key).avoidKeys.filter((k) => k !== avoidKey)
      : [...members.find((m) => m.key === key).avoidKeys, avoidKey],
  });

  async function makePlan() {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const supabase = getSupabaseClient();
      // The household and its members are written as the signed-in shopper;
      // row-level security ties them to this account (migration 00044).
      const { data: household, error: householdError } = await supabase
        .from("household")
        .insert({ label: "My household" })
        .select("id")
        .single();
      if (householdError) throw householdError;

      const { data: saved, error: memberError } = await supabase
        .from("household_member")
        .insert(members.map((m) => ({
          household_id: household.id,
          label: m.label.trim(),
          age_band: m.age_band,
          diet_type: m.diet_type,
          target_kcal: num(m.target_kcal),
          target_protein_g: num(m.target_protein_g),
        })))
        .select("id");
      if (memberError) throw memberError;

      const avoidRows = members.flatMap((m, i) => m.avoidKeys.map((avoid_key) => ({ member_id: saved[i].id, avoid_key })));
      if (avoidRows.length) {
        const { error: avoidError } = await supabase.from("household_member_avoid").insert(avoidRows);
        if (avoidError) throw avoidError;
      }

      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: household.id, days: Number(days), budget: num(budget) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be built.");
      setPlan(body);
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-[#5A6B5A]">Loading…</main>;
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-2xl font-bold text-[#0E4032]">Plan the week</h1>
        <p className="mt-2 text-[13px] text-[#5A6B5A]">
          Sign in to plan for a household. Your household and its targets are yours alone — nobody else can read them.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Plan the week</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[#5A6B5A]">
        Who is eating, what each of them is aiming at, and what to avoid. KOI plans whole packs from its own screened
        catalogue: nobody is given something they avoid, and you are told exactly what the plan could not manage.
      </p>

      <section className="mt-8 space-y-4">
        {members.map((m, i) => (
          <div key={m.key} className="rounded-2xl border border-[#083D2D]/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">Person {i + 1}</span>
              {members.length > 1 && (
                <button type="button" onClick={() => setMembers((l) => l.filter((x) => x.key !== m.key))}
                        className="text-[#5A6B5A] hover:text-[#0E4032]" aria-label={`Remove person ${i + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-semibold text-[#0E4032]">What to call them</span>
                <input value={m.label} onChange={(e) => update(m.key, { label: e.target.value })}
                       placeholder="Me, Partner, Kid 1"
                       className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
                <span className="mt-1 block text-[11px] text-[#5A6B5A]">A label, not a name. KOI stores no names.</span>
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-[#0E4032]">Age</span>
                <select value={m.age_band} onChange={(e) => update(m.key, { age_band: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]">
                  {AGE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-[#0E4032]">Diet</span>
                <select value={m.diet_type} onChange={(e) => update(m.key, { diet_type: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]">
                  {DIET_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-[#0E4032]">Protein a day</span>
                  <input value={m.target_protein_g} onChange={(e) => update(m.key, { target_protein_g: e.target.value })}
                         inputMode="numeric" placeholder="g"
                         className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-[#0E4032]">Energy a day</span>
                  <input value={m.target_kcal} onChange={(e) => update(m.key, { target_kcal: e.target.value })}
                         inputMode="numeric" placeholder="kcal"
                         className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
                </label>
              </div>
            </div>

            <fieldset className="mt-3">
              <legend className="text-[12px] font-semibold text-[#0E4032]">Never give them</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {HARD_AVOIDS.map((a) => (
                  <button key={a.key} type="button" onClick={() => toggleAvoid(m.key, a.key)}
                          className={`rounded-full border px-2.5 py-1 text-[11.5px] ${m.avoidKeys.includes(a.key) ? "border-[#0E4032] bg-[#0E4032] text-white" : "border-[#083D2D]/15 bg-white text-[#0E4032]"}`}>
                    {a.emoji} {a.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SOFT_AVOIDS.map((a) => (
                  <button key={a.key} type="button" onClick={() => toggleAvoid(m.key, a.key)}
                          className={`rounded-full border px-2.5 py-1 text-[11.5px] ${m.avoidKeys.includes(a.key) ? "border-[#16A06E] bg-[#16A06E]/10 text-[#0E4032]" : "border-[#083D2D]/10 bg-white text-[#5A6B5A]"}`}>
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[#5A6B5A]">
                The first row is never traded away. The second is a preference: KOI records it and will not starve the
                plan for it.
              </p>
            </fieldset>
          </div>
        ))}

        <button type="button" onClick={() => setMembers((l) => [...l, blankMember()])}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#083D2D]/15 px-3 py-2 text-[12.5px] font-semibold text-[#0E4032]">
          <Plus className="h-4 w-4" /> Add someone
        </button>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-[12px] font-semibold text-[#0E4032]">Days</span>
          <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric"
                 className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
        </label>
        <label className="block md:col-span-2">
          <span className="text-[12px] font-semibold text-[#0E4032]">Budget (₹, optional)</span>
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" placeholder="No limit"
                 className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
        </label>
      </section>

      <button type="button" onClick={makePlan} disabled={!ready || busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0E4032] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBasket className="h-4 w-4" />}
        {busy ? "Working it out…" : "Plan it"}
      </button>
      {!ready && <p className="mt-2 text-[11.5px] text-[#5A6B5A]">Give everyone a label and at least one target.</p>}
      {error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{error}</p>}

      {plan && (
        <section className="mt-10 space-y-6">
          <div className="rounded-2xl border border-[#083D2D]/10 p-5">
            <h2 className="text-lg font-bold text-[#0E4032]">
              {plan.report.summary.products > 0 ? "The basket" : "No basket KOI can stand behind"}
            </h2>
            <p className="mt-1 text-[12px] text-[#5A6B5A]">
              {plan.report.summary.packs} packs over {plan.days} days · ₹{plan.report.cost}
              {plan.report.withinBudget === false && " · over your budget"}
              {" · "}solved in {plan.solver.ms} ms by {plan.solver.name} {plan.solver.version}
            </p>
            <ul className="mt-3 space-y-1.5">
              {plan.report.basket.map((line) => {
                const w = without[line.skuId];
                const d = w?.result?.diff;
                return (
                  <li key={line.skuId} className="text-[13px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[#0E4032]">{line.packs} × {line.name} <span className="text-[#5A6B5A]">({line.packSize})</span></span>
                      <span className="font-semibold text-[#0E4032]">₹{line.cost}</span>
                    </div>
                    {!w && (
                      <button type="button" onClick={() => seeWithout(line.skuId)}
                              className="text-[11.5px] font-semibold text-[#16A06E] hover:underline">
                        Can&apos;t get this?
                      </button>
                    )}
                    {w?.busy && <p className="text-[11.5px] text-[#5A6B5A]">Re-planning without it…</p>}
                    {w?.error && <p className="text-[11.5px] text-[#B4453C]">{w.error}</p>}
                    {d && (
                      <div className="mt-1 rounded-lg bg-[#083D2D]/[0.04] px-3 py-2 text-[12px] text-[#5A6B5A]">
                        {w.result.status !== "solved" && <p>No plan fits without it.</p>}
                        {d.substitutes.map((s) => (
                          <p key={s.skuId}><span className="font-semibold text-[#0E4032]">Instead: {s.packs} × {s.name}</span> — {s.why.join(" · ")}</p>
                        ))}
                        {d.added.map((s) => <p key={s.skuId}>Adds {s.packs} × {s.name}</p>)}
                        {d.changed.map((c) => <p key={c.skuId}>{c.name}: {c.from} → {c.to} packs</p>)}
                        {d.dropped.map((s) => <p key={s.skuId}>No longer needs {s.name}</p>)}
                        <p>
                          New total ₹{w.result.report.cost}
                          {w.result.report.unmet.length > 0
                            ? ` · short: ${w.result.report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}`
                            : " · every target still met"}
                        </p>
                        {w.result.budget_blocked && (
                          <p>Meeting the targets without it would take about ₹{w.result.budget_blocked.cost} (₹{w.result.budget_blocked.extra} over budget).</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#083D2D]/10 p-5">
            <h2 className="text-lg font-bold text-[#0E4032]">Achieved against asked</h2>
            <div className="mt-3 space-y-3">
              {plan.report.perMember.map((m) => (
                <div key={m.id} className="text-[12.5px]">
                  <div className="font-bold text-[#0E4032]">{m.label}</div>
                  {Object.keys(m.asked).length === 0 && <div className="text-[#5A6B5A]">No target set.</div>}
                  {Object.entries(m.asked).map(([nutrient, asked]) => (
                    <div key={nutrient} className="flex items-baseline justify-between gap-3">
                      <span className="text-[#5A6B5A]">{nutrient}</span>
                      <span className="text-[#0E4032]">
                        {m.achieved[nutrient] ?? 0} of {asked}
                        {m.shortfall[nutrient] ? ` · ${m.shortfall[nutrient]} short` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#B8860B]/30 bg-[#B8860B]/[0.06] p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#0E4032]">
              <TriangleAlert className="h-4 w-4" style={{ color: "#B8860B" }} /> What this plan could not do
            </h2>
            <ul className="mt-2 space-y-1 text-[12.5px] text-[#5A6B5A]">
              <li>Reached: {plan.explanation.reached.replace(/_/g, " ")}{plan.explanation.gave_up ? ` — gave up ${plan.explanation.gave_up}` : " — nothing was given up"}</li>
              <li>Never relaxed: {plan.explanation.never_relaxed.join(" and ")}</li>
              {plan.explanation.products_refused.length > 0 && (
                <li>{plan.explanation.products_refused.length} products left out because someone avoids what is in them</li>
              )}
              {plan.explanation.products_not_plannable.length > 0 && (
                <li>{plan.explanation.products_not_plannable.length} products KOI cannot plan with yet (no price, or a pack it cannot measure)</li>
              )}
              {plan.explanation.unmet.length > 0 && (
                <li>Short: {plan.explanation.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}</li>
              )}
              {plan.explanation.budget_blocked && (
                <li>
                  Your budget is what stands in the way: meeting the targets would take about ₹{plan.explanation.budget_blocked.cost}
                  {" "}(₹{plan.explanation.budget_blocked.extra} more)
                  {plan.explanation.budget_blocked.unmet.length > 0 && ", and even then some targets stay short"}.
                </li>
              )}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
