"use client";

// ============================================================================
// /store/plan — plan the week for the people who are eating it
//
// Phase 3, reworked at §9.10.2: this page no longer edits people. Everyone
// comes from their saved profile (/store/household), shown as it stands, and
// the only things editable here are the ones that belong to this week:
//
//   * who is eating (a profile can sit this one out);
//   * the diet they want for this plan alone;
//   * what they feel like eating, and what to leave out for them;
//   * how many days, and the budget.
//
// Nothing typed here changes a profile. A follow-up in the copilot changes the
// plan; it reaches a profile only when the shopper says so.
//
// Every figure comes from the planner (/api/plan), computed from declared label
// figures and the solver's own allocation. Nothing here invents a number, and
// nothing calls a food good or bad.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingBasket, TriangleAlert, UserRoundPlus, Pencil } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { isTestSku } from "@/lib/data/testCatalogue";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { nodeInfo } from "@/lib/food/taxonomy";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { AGE_BANDS, MAX_BRIEF_CHARS } from "@/lib/planner/brief";
import { followUpExamples } from "@/lib/planner/followup";
import { goalsAllowed, ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";
import { profileFromRow, profileSummary, memberPayload, avoidsPayload, SEVERITIES } from "@/lib/household/profile";
import PlanCopilot from "@/components/store/plan/PlanCopilot";

const MEMBER_FIELDS = "id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, appetite, meals_from_home, target_kcal, target_protein_g, target_source, account_profile_id, version, created_at, household_member_avoid(avoid_key, severity)";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const dayCount = (days) => `${days} ${Number(days) === 1 ? "day" : "days"}`;
const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;

/** A person's share of a product: "1.4 kg", "350 g", or packs when KOI cannot measure the pack. */
const shareOf = ({ amount, unit, packs }) => {
  if (amount === null || amount === undefined || !unit) return `${packs} ${packs === 1 ? "pack" : "packs"}`;
  const big = { g: "kg", ml: "L" }[unit];
  return big && amount >= 1000 ? `${Math.round(amount / 100) / 10} ${big}` : `${amount} ${unit}`;
};

/** "Rice (Me 180 g, Partner 162 g)" — what the portion ceiling held, a day. */
const describeLimit = (limit) =>
  `${limit.name ?? "A product"} (${limit.members.map((m) => `${m.label ?? "someone"} ${m.perDay ?? "?"} ${m.unit ?? ""}`.trim()).join(", ")})`;

/** The kinds of food KOI actually stocks, as things a person can feel like eating. */
function categoriesFrom(products) {
  const byKey = new Map();
  for (const product of products) {
    const key = product?.categoryKey;
    if (!key || byKey.has(key)) continue;
    const info = nodeInfo(key);
    const label = info?.subcategory ?? info?.label ?? key;
    byKey.set(key, { key, label: String(label) });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Goals in words: "Lose weight, high protein", or null when there is no goal. */
const goalWords = (profile) => {
  if (!goalsAllowed(profile.age_band)) return null;
  const words = [
    profile.energy_goal !== "maintain" ? labelOf(ENERGY_GOALS, profile.energy_goal) : null,
    profile.eating_pattern !== "balanced" ? labelOf(EATING_PATTERNS, profile.eating_pattern).toLowerCase() : null,
  ].filter(Boolean);
  return words.length ? words.join(", ") : null;
};

/** Everything a plan needs to know about this shopper's household. */
async function readHousehold() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, household: null, profiles: [] };
  const { data: household, error } = await supabase
    .from("household")
    .select(`id, keep_out, household_member(${MEMBER_FIELDS})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { user, household: null, profiles: [], error: "Your household could not be loaded." };
  const profiles = [...(household?.household_member ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(profileFromRow);
  return { user, household: household ?? null, profiles };
}

export default function PlanPage() {
  const [session, setSession] = useState(undefined);
  const [householdId, setHouseholdId] = useState(null);
  const [keepOut, setKeepOut] = useState([]);
  const [profiles, setProfiles] = useState([]);
  // This week: who is eating, and what each of them chose for this plan alone.
  const [picked, setPicked] = useState([]);
  const [thisWeek, setThisWeek] = useState({});
  const [categories, setCategories] = useState([]);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  // skuId -> { busy, result, error }: "what if I can't get this?"
  const [without, setWithout] = useState({});
  const [cartResult, setCartResult] = useState(null);

  const load = useCallback(async () => {
    const { user, household, profiles: saved, error: loadError } = await readHousehold();
    setSession(user);
    if (loadError) setError(loadError);
    setHouseholdId(household?.id ?? null);
    setKeepOut(household?.keep_out ?? []);
    setProfiles(saved);
    setPicked(saved.map((p) => p.memberId));
    return saved;
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      await load();
      const products = await fetchAllProducts().catch(() => []);
      if (live) setCategories(categoriesFrom(products));
    })();
    return () => { live = false; };
  }, [load]);

  const chosen = useMemo(() => profiles.filter((p) => picked.includes(p.memberId)), [profiles, picked]);
  const ready = chosen.length > 0;

  const choiceFor = (memberId) => thisWeek[memberId] ?? { dietType: null, prefer: [], skip: [] };
  const setChoice = (memberId, patch) => setThisWeek((all) => ({ ...all, [memberId]: { ...choiceFor(memberId), ...patch } }));
  const toggleCategory = (memberId, field, key) => {
    const choice = choiceFor(memberId);
    const other = field === "prefer" ? "skip" : "prefer";
    setChoice(memberId, {
      [field]: choice[field].includes(key) ? choice[field].filter((k) => k !== key) : [...choice[field], key],
      // A person cannot both feel like something and skip it.
      [other]: choice[other].filter((k) => k !== key),
    });
  };

  async function makePlan() {
    setBusy(true);
    setError(null);
    setPlan(null);
    setWithout({});
    setConversation([]);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          days: Number(days),
          budget: num(budget),
          memberIds: picked,
          thisWeek: Object.fromEntries(picked.map((id) => [id, choiceFor(id)])),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be built.");
      setPlan(body);
      setCopilotOpen(true);
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function addPlanToCart() {
    const planId = plan.planId;
    setCartResult({ planId, busy: true });
    try {
      // Restore the saved cart first: adding before it loads would write an
      // empty cart over it (see store/cartStore.js).
      await hydrateCart();
      const products = await fetchAllProducts();
      const bySku = new Map(products.map((p) => [String(p.skuId), p]));
      const { addToCart } = useCartStore.getState();
      let packs = 0;
      const missing = [];
      for (const line of plan.report.basket) {
        const product = bySku.get(String(line.skuId));
        if (!product) {
          missing.push(line.name ?? "a product");
          continue;
        }
        for (let i = 0; i < line.packs; i++) addToCart(product);
        packs += line.packs;
      }
      setCartResult({ planId, packs, products: plan.report.basket.length - missing.length, missing });
    } catch (err) {
      setCartResult({ planId, error: err?.message ?? "The basket could not be added to the cart." });
    }
  }

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

  // ── The copilot: follow-ups on the plan on screen (Phase 4.3) ─────────────
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [followText, setFollowText] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [conversation, setConversation] = useState([]);

  async function followUp() {
    const text = followText.trim();
    if (!text || !plan?.planId) return;
    setFollowBusy(true);
    try {
      const response = await fetch("/api/plan/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, text }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be changed.");
      if (body.changed) {
        setPlan(body);
        setWithout({});
      }
      setConversation((turns) => [...turns, { text, ...body }]);
      setFollowText("");
    } catch (err) {
      setConversation((turns) => [...turns, { text, changed: false, applied: [], notApplied: [err?.message ?? "Something went wrong."] }]);
    } finally {
      setFollowBusy(false);
    }
  }

  // Phase 4.4: a follow-up that changes a person changes this plan only. It
  // reaches their saved profile when the shopper says so, as a new version.
  async function saveToHousehold(turnIndex) {
    const turn = conversation[turnIndex];
    if (!turn?.householdChanges?.length) return;
    const mark = (patch) => setConversation((turns) => turns.map((t, i) => (i === turnIndex ? { ...t, ...patch } : t)));
    mark({ saving: true, saveError: null });
    try {
      const supabase = getSupabaseClient();
      for (const change of turn.householdChanges) {
        const held = profiles.find((p) => p.memberId === change.memberId)?.avoids ?? [];
        const { error: saveError } = await supabase.rpc("save_household_member", {
          p_household_id: householdId,
          p_member: {
            id: change.memberId,
            ...Object.fromEntries(Object.entries(change.targets).map(([k, v]) => [k, v === null ? null : String(Math.round(Number(v)))])),
          },
          p_avoids: change.addAvoidKeys.length
            ? [...held.map((a) => ({ key: a.key, severity: a.severity })), ...change.addAvoidKeys.filter((key) => !held.some((a) => a.key === key)).map((key) => ({ key }))]
            : null,
        });
        if (saveError) throw saveError;
      }
      await load();
      mark({ saving: false, saved: true });
    } catch (err) {
      mark({ saving: false, saveError: err?.message ?? "It could not be saved." });
    }
  }

  // ── First run: a household in words becomes profiles, once confirmed ──────
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);

  async function draftFromBrief() {
    setDrafting(true);
    setError(null);
    try {
      const response = await fetch("/api/plan/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: brief }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The description could not be read.");
      setDrafted(body.draft);
      if (body.draft.days) setDays(body.draft.days);
      if (body.draft.budget) setBudget(String(body.draft.budget));
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setDrafting(false);
    }
  }

  /** Save the drafted people as profiles. Nothing is saved until this. */
  async function saveDraftedPeople() {
    if (!drafted?.members?.length) return;
    setSavingDraft(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      let id = householdId;
      if (!id) {
        const { data, error: createError } = await supabase.from("household").insert({ label: "My household" }).select("id").single();
        if (createError) throw createError;
        id = data.id;
        setHouseholdId(id);
      }
      for (const member of drafted.members) {
        const form = {
          memberId: null,
          label: member.label,
          relation: "",
          age_band: member.age_band,
          sex: "",
          activity_level: "",
          diet_type: member.diet_type,
          energy_goal: "maintain",
          eating_pattern: "balanced",
          age_years: "",
          weight_kg: "",
          height_cm: "",
          appetite: "",
          meals_from_home: [],
          target_kcal: member.target_kcal ?? "",
          target_protein_g: member.target_protein_g ?? "",
          target_source: "stated",
          is_account_holder: false,
          avoids: (member.avoidKeys ?? []).map((key) => ({ key, severity: null })),
        };
        const { error: saveError } = await supabase.rpc("save_household_member", {
          p_household_id: id,
          p_member: memberPayload(form),
          p_avoids: avoidsPayload(form),
        });
        if (saveError) throw saveError;
      }
      setDrafted(null);
      setBrief("");
      await load();
    } catch (err) {
      setError(err?.message ?? "They could not be saved.");
    } finally {
      setSavingDraft(false);
    }
  }

  if (session === undefined) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-[#5A6B5A]"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</main>;
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
    <main className="mx-auto max-w-3xl px-5 py-12 pb-28">
      <h1 className="text-2xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Plan the week</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[#5A6B5A]">
        Everyone comes from their saved profile. Choose who is eating this week and what they feel like, and KOI plans
        whole packs from its own screened catalogue: nobody is given something they avoid or something unsafe at their
        age, nobody is planned more of one food than a realistic day&apos;s servings, and you are told what the plan
        could not manage.
      </p>
      <p className="mt-2 text-[12px]">
        <Link href="/store/household" className="font-semibold text-[#16A06E] hover:underline">Your household</Link>
        <span className="text-[#5A6B5A]"> · </span>
        <Link href="/store/profile/data" className="font-semibold text-[#16A06E] hover:underline">See or delete what KOI keeps</Link>
        {keepOut.length > 0 && (
          <span className="text-[#5A6B5A]"> · kept out of the house: {keepOut.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}</span>
        )}
      </p>
      {error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{error}</p>}

      {profiles.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[#083D2D]/10 bg-[#083D2D]/[0.02] p-4">
          <h2 className="text-[15px] font-bold text-[#0E4032]">Who are you shopping for?</h2>
          <p className="mt-1 text-[12px] text-[#5A6B5A]">
            Describe your household and KOI drafts a profile for each person, for you to check and keep. Or{" "}
            <Link href="/store/household" className="font-semibold text-[#16A06E] underline">add them one at a time</Link>.
          </p>
          <textarea id="household-brief" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={MAX_BRIEF_CHARS} rows={2}
                    placeholder="We're four, two adults and two kids, 120 g protein each for the adults, ₹4,000 for a week"
                    className="mt-2 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={draftFromBrief} disabled={!brief.trim() || drafting}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#0E4032] px-3 py-1.5 text-[12.5px] font-semibold text-[#0E4032] disabled:opacity-40">
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {drafting ? "Reading it…" : "Draft their profiles"}
            </button>
            <span className="text-[11px] text-[#5A6B5A]">Nothing is saved until you keep them.</span>
          </div>
          {drafted && (
            <div className="mt-3 space-y-2 text-[12px] text-[#5A6B5A]">
              {drafted.members.map((m, i) => (
                <p key={`${m.label}-${i}`} className="text-[#0E4032]">
                  <span className="font-semibold">{m.label}</span>: {labelOf(AGE_BANDS, m.age_band)} · {labelOf(DIET_TYPES, m.diet_type)}
                  {m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}{m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}
                  {(m.avoidKeys ?? []).length ? ` · avoids ${m.avoidKeys.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}` : ""}
                </p>
              ))}
              {drafted.notes.map((note) => <p key={note}>{note}</p>)}
              {drafted.unresolved.length > 0 && <p>Not applied: {drafted.unresolved.join(", ")}.</p>}
              {drafted.members.length > 0 && (
                <button type="button" onClick={saveDraftedPeople} disabled={savingDraft}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E4032] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">
                  {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRoundPlus className="h-3.5 w-3.5" />}
                  {savingDraft ? "Saving…" : `Keep ${drafted.members.length === 1 ? "this profile" : "these profiles"}`}
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold text-[#0E4032]">Who&apos;s eating this week</h2>
            <Link href="/store/household" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#16A06E] hover:underline">
              <Pencil className="h-3.5 w-3.5" /> Edit profiles
            </Link>
          </div>
          <div className="mt-3 space-y-3">
            {profiles.map((profile) => {
              const on = picked.includes(profile.memberId);
              const choice = choiceFor(profile.memberId);
              return (
                <div key={profile.memberId} className={`rounded-2xl border p-4 ${on ? "border-[#083D2D]/15" : "border-[#083D2D]/8 bg-[#083D2D]/[0.02]"}`}>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={on} className="mt-1"
                           onChange={() => setPicked((list) => (on ? list.filter((id) => id !== profile.memberId) : [...list, profile.memberId]))} />
                    <span>
                      <span className="text-[14px] font-bold text-[#0E4032]">
                        {profile.label}
                        {profile.relation ? <span className="font-normal text-[#5A6B5A]"> · {profile.relation}</span> : null}
                        {profile.is_account_holder && <span className="ml-2 rounded-full bg-[#16A06E]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#16A06E]">You</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-[#5A6B5A]">{profileSummary(profile)}</span>
                      {profile.avoids.length > 0 && (
                        <span className="mt-0.5 block text-[12px] text-[#5A6B5A]">
                          {profile.avoids.map((a) => `${labelOf(FOODS_AVOID, a.key)} (${(SEVERITIES.find((s) => s.key === a.severity)?.label ?? a.severity).toLowerCase()})`).join(", ")}
                        </span>
                      )}
                    </span>
                  </label>

                  {on && (
                    <div className="mt-3 space-y-3 border-t border-[#083D2D]/8 pt-3">
                      <label className="block md:w-1/2">
                        <span className="text-[12px] font-semibold text-[#0E4032]">Diet, this week only</span>
                        <select value={choice.dietType ?? ""} onChange={(e) => setChoice(profile.memberId, { dietType: e.target.value || null })}
                                className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]">
                          <option value="">As on their profile ({labelOf(DIET_TYPES, profile.diet_type)})</option>
                          {DIET_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label} for this plan</option>)}
                        </select>
                      </label>

                      {categories.length > 0 && (
                        <>
                          <div>
                            <span className="text-[12px] font-semibold text-[#0E4032]">Feels like</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {categories.map((c) => (
                                <button key={c.key} type="button" aria-pressed={choice.prefer.includes(c.key)}
                                        onClick={() => toggleCategory(profile.memberId, "prefer", c.key)}
                                        className={`rounded-full border px-2.5 py-1 text-[11.5px] ${choice.prefer.includes(c.key) ? "border-[#16A06E] bg-[#16A06E] text-white" : "border-[#083D2D]/15 bg-white text-[#0E4032]"}`}>
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-[12px] font-semibold text-[#0E4032]">Not this week</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {categories.map((c) => (
                                <button key={c.key} type="button" aria-pressed={choice.skip.includes(c.key)}
                                        onClick={() => toggleCategory(profile.memberId, "skip", c.key)}
                                        className={`rounded-full border px-2.5 py-1 text-[11.5px] ${choice.skip.includes(c.key) ? "border-[#B4453C] bg-[#B4453C] text-white" : "border-[#083D2D]/10 bg-white text-[#5A6B5A]"}`}>
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-[11px] text-[#5A6B5A]">
                            What they feel like is a nudge between products that are otherwise close, never a reason to
                            miss a target. What they skip is left out for them, and still bought for anyone else who
                            wants it.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {profiles.length > 0 && (
        <>
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
            {busy ? "Working it out…" : `Plan it for ${chosen.length || "nobody"}`}
          </button>
          {!ready && <p className="mt-2 text-[11.5px] text-[#5A6B5A]">Choose at least one person.</p>}
        </>
      )}

      {plan && (
        <section className="mt-10 space-y-6">
          <div className="rounded-2xl border border-[#083D2D]/10 p-5">
            <h2 className="text-lg font-bold text-[#0E4032]">
              {plan.report.summary.products > 0 ? "The basket" : "No basket KOI can stand behind"}
            </h2>
            <p className="mt-1 text-[12px] text-[#5A6B5A]">
              {plan.report.summary.packs} packs over {dayCount(plan.days)} · ₹{plan.report.cost}
              {plan.report.withinBudget === false && " · over your budget"}
              {" · "}solved in {plan.solver.ms} ms by {plan.solver.name} {plan.solver.version}
            </p>
            {plan.report.basket.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                <button type="button" onClick={addPlanToCart} disabled={cartResult?.planId === plan.planId && (cartResult.busy || cartResult.packs > 0)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#0E4032] px-3 py-1.5 font-semibold text-[#0E4032] disabled:opacity-40">
                  {cartResult?.planId === plan.planId && cartResult.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBasket className="h-3.5 w-3.5" />}
                  Add all to cart
                </button>
                {cartResult?.planId === plan.planId && cartResult.packs > 0 && (
                  <span className="text-[#16A06E]">
                    Added {cartResult.packs} packs of {cartResult.products} products. What was already in your cart stays.{" "}
                    <Link href="/store/cart" className="font-semibold underline">Go to cart</Link>
                  </span>
                )}
                {cartResult?.planId === plan.planId && cartResult.missing?.length > 0 && (
                  <span className="text-[#8A6508]">Not in the store right now: {cartResult.missing.join(", ")}.</span>
                )}
                {cartResult?.planId === plan.planId && cartResult.error && <span className="text-[#B4453C]">{cartResult.error}</span>}
              </div>
            )}
            <ul className="mt-3 space-y-1.5">
              {plan.report.basket.map((line) => {
                const w = without[line.skuId];
                const d = w?.result?.diff;
                return (
                  <li key={line.skuId} className="text-[13px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[#0E4032]">
                        {line.packs} × {line.name} <span className="text-[#5A6B5A]">({line.packSize})</span>
                        {isTestSku(line.skuId) && (
                          <span className="ml-1.5 rounded-full border border-[#B8860B]/40 px-1.5 py-px text-[10px] font-semibold text-[#8A6508]"
                                title="From the local Open Food Facts test catalogue; the price is an estimate">
                            test
                          </span>
                        )}
                      </span>
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
                  {m.carbsLimit && (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[#5A6B5A]">carbs</span>
                      <span className="text-[#0E4032]">{m.achieved.carbs ?? 0} of at most {m.carbsLimit}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(plan.report.whoEatsWhat ?? []).length > 0 && (
            <div className="rounded-2xl border border-[#083D2D]/10 p-5">
              <h2 className="text-lg font-bold text-[#0E4032]">Who eats what</h2>
              <p className="mt-1 text-[12px] text-[#5A6B5A]">
                Each person&apos;s share of this basket over {dayCount(plan.days)}. Something one person cannot eat is still
                bought for the others, so it is listed here as not for them.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {plan.report.whoEatsWhat.map((person) => {
                  const planned = person.allowed.filter((a) => a.packs > 0);
                  const alsoFine = person.allowed.filter((a) => !(a.packs > 0));
                  return (
                    <div key={person.member} className="rounded-xl bg-[#083D2D]/[0.03] p-3 text-[12.5px]">
                      <p className="font-bold text-[#0E4032]">{person.label}</p>
                      {planned.length === 0 && <p className="text-[#5A6B5A]">Nothing in this basket is planned for them.</p>}
                      <ul className="mt-1 space-y-0.5">
                        {planned.map((a) => (
                          <li key={a.skuId}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[#0E4032]">{a.name}</span>
                              <span className="text-[#5A6B5A]">{shareOf(a)}</span>
                            </div>
                            {a.notVerifiedFor?.length > 0 && (
                              <p className="text-[11px] text-[#8A6508]">Not verified for {a.notVerifiedFor.join(", ")}: check the pack</p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {alsoFine.length > 0 && (
                        <p className="mt-1 text-[11.5px] text-[#5A6B5A]">
                          Also fine for them: {alsoFine.map((a) => (a.notVerifiedFor?.length ? `${a.name} (not verified for ${a.notVerifiedFor.join(", ")})` : a.name)).join(", ")}
                        </p>
                      )}
                      {person.notForThem.length > 0 && (
                        <p className="mt-1 text-[11.5px] font-semibold text-[#B4453C]">
                          Not for {person.label}: {person.notForThem.map((n) => `${n.name} (${n.because})`).join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#B8860B]/30 bg-[#B8860B]/[0.06] p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-[#0E4032]">
              <TriangleAlert className="h-4 w-4" style={{ color: "#B8860B" }} /> What this plan could not do
            </h2>
            <ul className="mt-2 space-y-1 text-[12.5px] text-[#5A6B5A]">
              <li>Reached: {plan.explanation.reached.replace(/_/g, " ")}{plan.explanation.gave_up ? ` — gave up ${plan.explanation.gave_up}` : " — nothing was given up"}</li>
              <li>Never relaxed: {plan.explanation.never_relaxed.join(" and ")}</li>
              {(plan.explanation.carb_ceilings ?? []).map((c) => (
                <li key={c.member}>
                  {c.label} is on {c.pattern === "keto" ? "keto" : "low carb"}: at most {c.perDay} g of carbohydrate a day
                  {c.undeclared > 0 && `, and ${c.undeclared} ${c.undeclared === 1 ? "product was" : "products were"} left out for them because their carbohydrate isn't declared`}
                </li>
              ))}
              {(plan.explanation.skipped_this_week ?? []).map((s) => (
                <li key={s.member}>{s.label} asked to skip {s.categories.map((key) => nodeInfo(key)?.subcategory ?? nodeInfo(key)?.label ?? key).join(", ")} this week</li>
              ))}
              {plan.explanation.products_refused.length > 0 && (
                <li>{plan.explanation.products_refused.length} products left out because no one in the household can eat them</li>
              )}
              {(plan.explanation.products_kept_out ?? []).length > 0 && (
                <li>
                  Kept out of the house: {plan.explanation.products_kept_out.map((p) => `${p.name ?? "a product"} (${p.because})`).join(", ")}
                </li>
              )}
              {plan.explanation.products_not_plannable.length > 0 && (
                <li>{plan.explanation.products_not_plannable.length} products KOI cannot plan with yet (no price, or a pack it cannot measure)</li>
              )}
              {(plan.explanation.products_priced_out ?? []).length > 0 && (
                <li>
                  Left out because their nutrition costs far more than the rest of the catalogue:{" "}
                  {plan.explanation.products_priced_out.map((p) => p.name ?? "a product").join(", ")}
                </li>
              )}
              {(plan.explanation.products_too_big ?? []).length > 0 && (
                <li>
                  Packs too big to finish in {dayCount(plan.days)}:{" "}
                  {plan.explanation.products_too_big.map((p) => p.name ?? "a product").join(", ")}
                </li>
              )}
              {(plan.explanation.portion_limited ?? []).length > 0 && (
                <li>
                  Held to a day&apos;s portions: {plan.explanation.portion_limited.map(describeLimit).join("; ")}
                </li>
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

      {/* There from the moment there is a household to plan for, so nobody has
          to finish a plan to discover it. */}
      {profiles.length > 0 && (
        <PlanCopilot open={copilotOpen} onOpenChange={setCopilotOpen} hasPlan={Boolean(plan)} conversation={conversation}
                     text={followText} onText={setFollowText} onSend={followUp} busy={followBusy}
                     examples={plan ? followUpExamples({ basket: plan.report.basket, days: plan.days }) : []}
                     onSaveToHousehold={saveToHousehold} />
      )}
    </main>
  );
}
