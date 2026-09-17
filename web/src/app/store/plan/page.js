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
//
// ONE HOUSEHOLD. The shopper's latest saved household opens in the form, and
// "Plan it" saves changes to that same household before planning: members
// are updated, added or removed, and avoids replaced. It used to insert a new
// household on every click, so each retry left another copy behind.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Loader2, ShoppingBasket, TriangleAlert } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { isTestSku } from "@/lib/data/testCatalogue";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { AGE_BANDS, MAX_BRIEF_CHARS } from "@/lib/planner/brief";

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
const dayCount = (days) => `${days} ${Number(days) === 1 ? "day" : "days"}`;

/** Stored members as form rows, in the order they were added. */
const membersFrom = (rows) => [...rows]
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.label).localeCompare(String(b.label)))
  .map((row) => ({
    key: row.id,
    memberId: row.id,
    label: row.label ?? "",
    age_band: row.age_band ?? "adult_19_59",
    diet_type: row.diet_type ?? "vegetarian",
    target_kcal: row.target_kcal ?? "",
    target_protein_g: row.target_protein_g ?? "",
    avoidKeys: (row.household_member_avoid ?? []).map((a) => a.avoid_key),
  }));

/** "Rice (Me 180 g, Partner 162 g)" — what the portion ceiling held, a day. */
const describeLimit = (limit) =>
  `${limit.name ?? "A product"} (${limit.members.map((m) => `${m.label ?? "someone"} ${m.perDay ?? "?"} ${m.unit ?? ""}`.trim()).join(", ")})`;

/**
 * Save the form to the shopper's household, creating it only if there is none.
 * Row-level security ties every row to this account (migration 00044).
 * @returns {Promise<{ householdId: string, saved: Array<{ key, memberId }> }>}
 */
async function saveHousehold(supabase, householdId, members) {
  let id = householdId;
  if (!id) {
    const { data, error } = await supabase.from("household").insert({ label: "My household" }).select("id").single();
    if (error) throw error;
    id = data.id;
  }

  const { data: stored, error: readError } = await supabase.from("household_member").select("id").eq("household_id", id);
  if (readError) throw readError;
  const storedIds = new Set((stored ?? []).map((r) => r.id));
  const kept = new Set(members.map((m) => m.memberId).filter(Boolean));
  const gone = [...storedIds].filter((memberId) => !kept.has(memberId));
  if (gone.length) {
    // Their avoids go with them (ON DELETE CASCADE). Past plans keep their own snapshot.
    const { error } = await supabase.from("household_member").delete().in("id", gone);
    if (error) throw error;
  }

  const saved = [];
  // One at a time, so each new member's created_at keeps the form's order.
  for (const m of members) {
    const row = {
      label: m.label.trim(),
      age_band: m.age_band,
      diet_type: m.diet_type,
      target_kcal: num(m.target_kcal),
      target_protein_g: num(m.target_protein_g),
    };
    if (m.memberId && storedIds.has(m.memberId)) {
      const { error } = await supabase.from("household_member").update(row).eq("id", m.memberId);
      if (error) throw error;
      saved.push({ key: m.key, memberId: m.memberId });
    } else {
      const { data, error } = await supabase.from("household_member").insert({ ...row, household_id: id }).select("id").single();
      if (error) throw error;
      saved.push({ key: m.key, memberId: data.id });
    }
  }

  // Avoids are replaced outright: the form is what the shopper means now.
  const memberIds = saved.map((s) => s.memberId);
  const { error: clearError } = await supabase.from("household_member_avoid").delete().in("member_id", memberIds);
  if (clearError) throw clearError;
  const avoidRows = members.flatMap((m, i) => m.avoidKeys.map((avoid_key) => ({ member_id: saved[i].memberId, avoid_key })));
  if (avoidRows.length) {
    const { error } = await supabase.from("household_member_avoid").insert(avoidRows);
    if (error) throw error;
  }
  return { householdId: id, saved };
}

export default function PlanPage() {
  const [session, setSession] = useState(undefined);
  const [householdId, setHouseholdId] = useState(null);
  const [members, setMembers] = useState([blankMember()]);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  // skuId -> { busy, result, error }: "what if I can't get this?"
  const [without, setWithout] = useState({});

  // Phase 4.5: the basket into the storefront cart, whose checkout already hands
  // off to Swiggy. The cart stores references and re-reads prices itself.
  const [cartResult, setCartResult] = useState(null);

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

  useEffect(() => {
    const supabase = getSupabaseClient();
    let live = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (user) {
        // The latest household this shopper saved, so planning again edits it.
        const { data: household, error: loadError } = await supabase
          .from("household")
          .select("id, household_member(id, label, age_band, diet_type, target_kcal, target_protein_g, created_at, household_member_avoid(avoid_key))")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!live) return;
        if (loadError) setError("Your saved household could not be loaded. Planning now will save a new one.");
        if (household) {
          setHouseholdId(household.id);
          if (household.household_member?.length) setMembers(membersFrom(household.household_member));
        }
      }
      if (live) setSession(user);
    })();
    return () => { live = false; };
  }, []);

  // A drafted person can arrive without an age group or a diet; both are chosen
  // by the shopper before anything is planned, because a blank diet excludes nothing.
  const ready = useMemo(
    () => members.length > 0 && members.every((m) =>
      m.label.trim() && m.age_band && m.diet_type && (num(m.target_protein_g) || num(m.target_kcal))),
    [members],
  );

  // Phase 4.3: follow-ups on the plan on screen. The conversation is kept in
  // this page for the session; the server stores only the plans it produces.
  const [followText, setFollowText] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [conversation, setConversation] = useState([]);

  async function followUp() {
    const text = followText.trim();
    if (!text || !plan?.planId) return;
    setFollowBusy(true);
    setError(null);
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

  // Phase 4.4: a follow-up that changes a person (a target, an avoid) changes
  // this plan only. It reaches the saved household when the shopper says so.
  async function saveToHousehold(turnIndex) {
    const turn = conversation[turnIndex];
    if (!turn?.householdChanges?.length) return;
    const mark = (patch) => setConversation((turns) => turns.map((t, i) => (i === turnIndex ? { ...t, ...patch } : t)));
    mark({ saving: true, saveError: null });
    try {
      const supabase = getSupabaseClient();
      for (const change of turn.householdChanges) {
        if (Object.keys(change.targets).length) {
          const { error: updateError } = await supabase.from("household_member").update(change.targets).eq("id", change.memberId);
          if (updateError) throw updateError;
        }
        if (change.addAvoidKeys.length) {
          const { error: avoidError } = await supabase
            .from("household_member_avoid")
            .upsert(change.addAvoidKeys.map((avoid_key) => ({ member_id: change.memberId, avoid_key })), { onConflict: "member_id,avoid_key", ignoreDuplicates: true });
          if (avoidError) throw avoidError;
        }
      }
      // The form shows the saved household, so it follows what was saved.
      setMembers((list) => list.map((m) => {
        const change = turn.householdChanges.find((c) => c.memberId === m.memberId);
        return change ? { ...m, ...change.targets, avoidKeys: [...new Set([...m.avoidKeys, ...change.addAvoidKeys])] } : m;
      }));
      mark({ saving: false, saved: true });
    } catch (err) {
      mark({ saving: false, saveError: err?.message ?? "It could not be saved." });
    }
  }

  // Phase 4.2: a household in words becomes a draft of this form. Nothing is
  // saved or planned until "Plan it", which is the confirmation.
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(null);

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
      const { draft } = body;
      if (draft.members.length) {
        setMembers(draft.members.map((m) => ({ ...m, key: crypto.randomUUID(), memberId: null })));
        setPlan(null);
        setWithout({});
      }
      if (draft.days) setDays(draft.days);
      if (draft.budget) setBudget(String(draft.budget));
      setDrafted(draft);
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setDrafting(false);
    }
  }

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
    setWithout({});
    try {
      const supabase = getSupabaseClient();
      const { householdId: id, saved } = await saveHousehold(supabase, householdId, members);
      setHouseholdId(id);
      // Each form row now knows which stored member it is.
      const idOf = new Map(saved.map((s) => [s.key, s.memberId]));
      setMembers((list) => list.map((m) => (idOf.has(m.key) ? { ...m, memberId: idOf.get(m.key) } : m)));

      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: id, days: Number(days), budget: num(budget) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be built.");
      setPlan(body);
      setConversation([]);
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
        catalogue: nobody is given something they avoid, nobody is planned more of one food than a realistic day&apos;s
        servings, and you are told exactly what the plan could not manage.
      </p>
      {householdId && (
        <p className="mt-2 text-[11.5px] text-[#16A06E]">
          This is your saved household. Changes are saved to it each time you plan.{" "}
          <Link href="/store/profile/data" className="font-semibold underline">See or delete what KOI keeps</Link>
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-[#083D2D]/10 bg-[#083D2D]/[0.02] p-4">
        <label htmlFor="household-brief" className="text-[12px] font-semibold text-[#0E4032]">Or describe your household</label>
        <textarea id="household-brief" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={MAX_BRIEF_CHARS} rows={2}
                  placeholder="We're four, two adults and two kids, 120 g protein each for the adults, ₹4,000 for a week"
                  className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={draftFromBrief} disabled={!brief.trim() || drafting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#0E4032] px-3 py-1.5 text-[12.5px] font-semibold text-[#0E4032] disabled:opacity-40">
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {drafting ? "Reading it…" : "Fill the form from this"}
          </button>
          <span className="text-[11px] text-[#5A6B5A]">Fills the form below for you to check. Nothing is planned until you press Plan it.</span>
        </div>
        {drafted && (
          <div className="mt-3 space-y-1 text-[12px] text-[#5A6B5A]">
            <p className="font-semibold text-[#0E4032]">
              {drafted.members.length
                ? `Drafted ${drafted.members.length} ${drafted.members.length === 1 ? "person" : "people"} from what you wrote${drafted.source === "openai" ? " (read with OpenAI)" : ""}. Check each one.`
                : "Nothing was drafted."}
              {drafted.members.length > 0 && householdId ? " Planning will replace the people saved in your household." : ""}
            </p>
            {drafted.notes.map((note) => <p key={note}>{note}</p>)}
            {drafted.unresolved.length > 0 && <p>Not applied: {drafted.unresolved.join(", ")}.</p>}
          </div>
        )}
      </section>

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
                  {!m.age_band && <option value="">Choose an age group</option>}
                  {AGE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-[#0E4032]">Diet</span>
                <select value={m.diet_type} onChange={(e) => update(m.key, { diet_type: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]">
                  {!m.diet_type && <option value="">Choose a diet</option>}
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
      {!ready && <p className="mt-2 text-[11.5px] text-[#5A6B5A]">Give everyone a label, an age group, a diet and at least one target.</p>}
      {error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{error}</p>}

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

          <div className="rounded-2xl border border-[#083D2D]/10 p-5">
            <h2 className="text-lg font-bold text-[#0E4032]">Change this plan</h2>
            <p className="mt-1 text-[12px] text-[#5A6B5A]">
              Say what to change and KOI plans again. What you type stays on this page; only the new plan is saved.
            </p>
            {conversation.length > 0 && (
              <ol className="mt-3 space-y-3">
                {conversation.map((turn, i) => (
                  <li key={i} className="text-[12.5px]">
                    <p className="font-semibold text-[#0E4032]">&ldquo;{turn.text}&rdquo;</p>
                    {turn.applied?.length > 0 && <p className="text-[#16A06E]">Changed: {turn.applied.join(" · ")}</p>}
                    {turn.changed && turn.basketChange && (
                      <div className="text-[#5A6B5A]">
                        {turn.basketChange.added.map((s) => <p key={`a-${s.skuId}`}>Adds {s.packs} × {s.name}</p>)}
                        {turn.basketChange.changed.map((c) => <p key={`c-${c.skuId}`}>{c.name}: {c.from} → {c.to} packs</p>)}
                        {turn.basketChange.dropped.map((s) => <p key={`d-${s.skuId}`}>No longer {s.name}</p>)}
                        <p>₹{turn.basketChange.costBefore} → ₹{turn.report.cost}
                          {turn.report.unmet.length > 0 ? ` · short: ${turn.report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}` : " · every target met"}
                        </p>
                      </div>
                    )}
                    {turn.notApplied?.map((n) => <p key={n} className="text-[#8A6508]">{n}</p>)}
                    {turn.changed && turn.householdChanges?.length > 0 && !turn.saved && (
                      <p className="text-[#5A6B5A]">
                        This changed the plan, not your saved household.{" "}
                        <button type="button" onClick={() => saveToHousehold(i)} disabled={turn.saving}
                                className="font-semibold text-[#16A06E] hover:underline disabled:opacity-40">
                          {turn.saving ? "Saving…" : `Save it for ${turn.householdChanges.map((c) => c.label).join(", ")}`}
                        </button>
                      </p>
                    )}
                    {turn.saved && <p className="text-[#16A06E]">Saved to your household.</p>}
                    {turn.saveError && <p className="text-[#B4453C]">{turn.saveError}</p>}
                  </li>
                ))}
              </ol>
            )}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); followUp(); }}>
              <input id="plan-followup" value={followText} onChange={(e) => setFollowText(e.target.value)} maxLength={200}
                     placeholder="cheaper · no paneer · swap the oats · 60 g protein for Kid 1"
                     className="min-w-0 flex-1 rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
              <button type="submit" disabled={!followText.trim() || followBusy}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E4032] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-40">
                {followBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {followBusy ? "Planning…" : "Change it"}
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
