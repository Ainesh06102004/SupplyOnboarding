"use client";

// ============================================================================
// /store/profile/data — what KOI keeps about you
//
// Phase 4.4, the preference centre. Everything KOI stores against a signed-in
// shopper, read as that shopper (row-level security on koi_uid(), migrations
// 00044–00046), each part deletable after a second, explicit confirmation.
//
// Two parts are shown and not deletable here, and the page says why: the
// account itself (name, phone), which sign-in depends on, and the record of
// orders handed to Swiggy, which has no delete policy because it is the record
// of what was sent.
//
// Saving is confirmed elsewhere: households save when the shopper presses
// "Plan it", a follow-up's change to a person saves only when they press
// "Save it", and the goal profile saves when its form is submitted.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLoginUi } from "@/store/loginUiStore";
import { AGE_BANDS } from "@/lib/planner/brief";
import { ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";
import { DIET_TYPES, FOODS_AVOID, FOODS_LOVE, MEALS, GOAL_PROFILES } from "@/lib/recommendation/config";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { MEAL_LOG_KEY } from "@/components/store/plan/design/useMealLog";

/** Meals this browser is still holding to save (useMealLog): they are yours too, and go with the rest. */
const heldMeals = () => {
  try {
    return Object.values(JSON.parse(window.localStorage.getItem(MEAL_LOG_KEY) ?? "{}") ?? {}).flat().map((r) => ({ ...r, held: true }));
  } catch {
    return [];
  }
};
const forgetHeldMeals = () => {
  try { window.localStorage.removeItem(MEAL_LOG_KEY); } catch { /* nothing held */ }
};

const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const PREFERENCE_TABLES = Object.freeze([
  "user_diet_type", "user_avoided_food", "user_food_preference", "user_meal_preference", "user_cooking_preference", "user_budget_preference",
]);

/** Delete, then "Delete for good?": two presses, and the second names what goes. */
function ConfirmDelete({ what, onConfirm, label = "Delete" }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="h-10 shrink-0 rounded-full border border-koi-forest/20 bg-white px-4 text-[13px] font-semibold text-koi-forest transition-colors hover:border-koi-red/40 hover:text-koi-red">
        {label}
      </button>
    );
  }
  return (
    <span role="group" aria-label={`Delete ${what}`} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-koi-red/30 bg-koi-red-bg px-4 py-3">
      <span className="text-sm font-semibold text-koi-red">Delete {what} for good? This can’t be undone.</span>
      <span className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => setAsking(false)} className="h-10 rounded-full px-4 text-[13px] font-semibold text-koi-ink2 hover:bg-white">Cancel</button>
        <button type="button" disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setFailed(null);
                  try { await onConfirm(); } catch (err) { setFailed(err?.message ?? "It could not be deleted."); setBusy(false); }
                }}
                className="h-10 rounded-full bg-koi-red px-4 text-[13px] font-bold text-white disabled:opacity-50">
          {busy ? "Deleting…" : "Yes, delete"}
        </button>
      </span>
      {failed && <span className="w-full text-[12.5px] text-koi-red">{failed}</span>}
    </span>
  );
}

/** One line of the ledger: a number, what it is, what's in it, and what can be done. */
function Section({ no, title, count = null, kept = false, children, action }) {
  return (
    <li data-row className="rounded-[20px] border border-koi-forest/10 bg-white p-5">
      <div className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[34px_minmax(0,1fr)_auto]">
        <span className="pt-0.5 font-koi-num text-xs font-semibold text-koi-primary">{String(no).padStart(2, "0")}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-bold">
            {title}
            {count && <span className="rounded-full bg-koi-paper px-2 py-0.5 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-koi-muted">{count}</span>}
          </h2>
          <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-koi-ink2">{children}</div>
        </div>
        {kept ? (
          <span className="col-start-2 self-start rounded-full bg-koi-paper px-3 py-1.5 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-koi-muted sm:col-start-auto">Kept</span>
        ) : action ? <div className="col-span-2 flex sm:col-span-1 sm:justify-end [&:has([role=group])]:col-span-full">{action}</div> : null}
      </div>
    </li>
  );
}

const Empty = () => <p className="m-0">Nothing stored.</p>;
/** Everything stored for the signed-in shopper, read as them. Sets no state. */
async function readEverything() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const signedIn = auth?.user ?? null;
  if (!signedIn) return { user: null, data: null, error: null };
  const rows = async (query) => {
    const { data: result, error: queryError } = await query;
    if (queryError) throw queryError;
    return result;
  };
  // A table newer than this page's database (00091 before it runs) is read as empty, not as a failure.
  const maybeRows = async (query) => {
    const { data: result, error: queryError } = await query;
    return queryError ? [] : result ?? [];
  };
  try {
    const [account, health, diet, avoided, loved, meals, cooking, budget, households, plans, addresses, orders, swiggy, checkins, mealLog] = await Promise.all([
        rows(supabase.from("customer_profiles").select("display_name, email, phone, city, pincode, created_at").maybeSingle()),
        rows(supabase.from("user_health_profile").select("*").maybeSingle()),
        rows(supabase.from("user_diet_type").select("diet_type").maybeSingle()),
        rows(supabase.from("user_avoided_food").select("avoid_key")),
        rows(supabase.from("user_food_preference").select("food_key")),
        rows(supabase.from("user_meal_preference").select("meal_key")),
        rows(supabase.from("user_cooking_preference").select("cooking").maybeSingle()),
        rows(supabase.from("user_budget_preference").select("budget").maybeSingle()),
        rows(supabase.from("household").select("id, label, keep_out, created_at, household_member(id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, appetite, meals_from_home, target_kcal, target_protein_g, account_profile_id, household_member_avoid(avoid_key, severity), household_member_version(version))").order("created_at")),
        rows(supabase.from("plan").select("id, household_id, days, budget_rupees, created_at, cost:achieved->cost").order("created_at", { ascending: false }).limit(100)),
        rows(supabase.from("delivery_addresses").select("id, label, city, pincode, is_default")),
        rows(supabase.from("fulfilment_intents").select("id, state, marketplace, item_count, created_at").order("created_at", { ascending: false }).limit(20)),
        fetch("/api/marketplace/connect").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        // Track (00077): your own weigh-ins, and nobody else's (RLS).
        rows(supabase.from("member_checkin").select("member_id, checked_on, weight_kg").order("checked_on", { ascending: false }).limit(400)),
        // Track (00091): your own meals, and nobody else's (RLS).
        maybeRows(supabase.from("member_meal_log").select("member_id, eaten_on, slot, status").order("eaten_on", { ascending: false }).limit(2000)),
      ]);
    return { user: signedIn, data: { account, health, diet, avoided, loved, meals, cooking, budget, households, plans, addresses, orders, swiggy, checkins, mealLog: [...mealLog, ...heldMeals()].sort((a, b) => String(b.eaten_on).localeCompare(String(a.eaten_on))) }, error: null };
  } catch (err) {
    return { user: signedIn, data: null, error: err?.message ?? "What KOI keeps could not be loaded." };
  }
}

export default function YourDataPage() {
  const root = useRef(null);
  const say = useKoiVoice((v) => v.say);
  const [user, setUser] = useState(undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const show = useCallback((result) => {
    setUser(result.user);
    setData(result.data);
    setError(result.error);
  }, []);
  const load = useCallback(async () => show(await readEverything()), [show]);

  // Re-read on sign-in or sign-out here, not only on opening.
  const { user: authUser, loading: authLoading } = useAuth();
  const authUid = authLoading ? "loading" : authUser?.uid ?? "signed-out";
  const openLogin = useLoginUi((st) => st.openLogin);
  useEffect(() => {
    if (authUid === "loading") return undefined;
    let live = true;
    readEverything().then((result) => { if (live) show(result); });
    return () => { live = false; };
  }, [show, authUid]);

  // The ledger slides in once it has something to show; KOI says what this is.
  const ready = Boolean(data);
  useGSAP(() => {
    if (!ready) return;
    say("Everything I keep about you, and a way to delete each part. I’ll check before anything goes.");
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (sel) => root.current?.querySelectorAll(sel) ?? [];
    gsap.from(q("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal });
    gsap.from(q("[data-row]"), { autoAlpha: 0, x: 40, duration: 0.8, stagger: 0.06, ease: E.dolly, delay: 0.15, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [ready] });

  /** Run deletes as the shopper, then show what is left. */
  const remove = async (...queries) => {
    for (const query of queries) {
      const { error: deleteError } = await query;
      if (deleteError) throw deleteError;
    }
    await load();
  };

  if (user === undefined || (user && !data && !error)) {
    return <main role="status" className="mx-auto flex w-full max-w-[1440px] items-center gap-2.5 px-[clamp(16px,4vw,52px)] py-16 font-koi-sans text-sm text-koi-muted"><Loader2 className="size-4 animate-spin" /> Loading…</main>;
  }
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-[clamp(16px,4vw,52px)] py-16 font-koi-sans text-koi-ink">
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">What KOI keeps about you</h1>
        <p className="m-0 max-w-[620px] text-base text-koi-ink2">Sign in to see and delete what KOI has stored for your account.</p>
        <button type="button" onClick={() => openLogin()} className="h-14 w-fit rounded-2xl bg-koi-forest px-7 text-[15px] font-bold text-koi-lime">Sign in with phone</button>
      </main>
    );
  }

  const supabase = getSupabaseClient();
  const uid = user.id;
  const d = data ?? {};
  const preferencesStored = Boolean(d.diet || d.avoided?.length || d.loved?.length || d.meals?.length || d.cooking || d.budget);
  const planCount = (householdId) => (d.plans ?? []).filter((p) => p.household_id === householdId).length;
  const households = d.households ?? [];
  const plans = d.plans ?? [];

  return (
    <main ref={root} className="ks-page-pad mx-auto flex w-full max-w-[1440px] flex-col bg-koi-bg px-[clamp(16px,4vw,52px)] pt-8 font-koi-sans text-koi-ink">
      <section className="flex flex-col gap-2.5">
        <div data-rise className="flex items-center gap-3">
          <span className="font-koi-mono text-xs font-semibold text-koi-primary">(09)</span>
          <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Your data</span>
        </div>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">What KOI keeps about you</span></span>
        </h1>
        <p data-rise className="m-0 max-w-[700px] text-base leading-relaxed text-koi-ink2">Everything stored against your account, and a way to delete each part. Only you can read it. Deleting cannot be undone.</p>
        {error && <p className="m-0 text-[13px] text-koi-red">{error}</p>}
      </section>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 pb-10 pt-7 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          <Section no={1} title="Your account" kept>
            {d.account ? (
              <>
                <p className="m-0">{[d.account.display_name, d.account.phone, d.account.email].filter(Boolean).join(" · ") || "No details yet"}</p>
                <p className="m-0">{[d.account.city, d.account.pincode].filter(Boolean).join(" ")}{d.account.created_at ? ` · since ${date(d.account.created_at)}` : ""}</p>
                <p className="m-0 text-[12.5px] text-koi-muted">Signing in depends on this, so it is not deleted here.</p>
              </>
            ) : <Empty />}
          </Section>

          <Section no={2} title="Health profile"
                   action={d.health && <ConfirmDelete what="your health profile" onConfirm={() => remove(supabase.from("user_health_profile").delete().eq("profile_id", uid))} />}>
            {d.health ? (
              <>
                <p className="m-0">{[d.health.gender, d.health.age && `${d.health.age} years`, d.health.height_cm && `${d.health.height_cm} cm`, d.health.weight_kg && `${d.health.weight_kg} kg`, d.health.goal_weight_kg && `goal ${d.health.goal_weight_kg} kg`].filter(Boolean).join(" · ")}</p>
                <p className="m-0">{[d.health.goal && (GOAL_PROFILES[d.health.goal]?.label ?? d.health.goal), d.health.activity_level].filter(Boolean).join(" · ")}</p>
                <p className="m-0">{[d.health.target_kcal && `${d.health.target_kcal} kcal`, d.health.target_protein_g && `${d.health.target_protein_g} g protein`, d.health.target_carbs_g && `${d.health.target_carbs_g} g carbs`, d.health.target_fat_g && `${d.health.target_fat_g} g fat`].filter(Boolean).join(" · ")}{d.health.target_kcal ? " a day" : ""}</p>
              </>
            ) : <Empty />}
          </Section>

          <Section no={3} title="Food preferences"
                   action={preferencesStored && <ConfirmDelete what="your food preferences" onConfirm={() => remove(...PREFERENCE_TABLES.map((t) => supabase.from(t).delete().eq("profile_id", uid)))} />}>
            {preferencesStored ? (
              <>
                {d.diet && <p className="m-0">Diet: {labelOf(DIET_TYPES, d.diet.diet_type)}</p>}
                {d.avoided?.length > 0 && <p className="m-0">Avoid: {d.avoided.map((a) => labelOf(FOODS_AVOID, a.avoid_key)).join(", ")}</p>}
                {d.loved?.length > 0 && <p className="m-0">Like: {d.loved.map((l) => labelOf(FOODS_LOVE, l.food_key)).join(", ")}</p>}
                {d.meals?.length > 0 && <p className="m-0">Meals: {d.meals.map((m) => labelOf(MEALS, m.meal_key)).join(", ")}</p>}
                {d.cooking && <p className="m-0">Cooking: {d.cooking.cooking}</p>}
                {d.budget && <p className="m-0">Budget: {d.budget.budget}</p>}
              </>
            ) : <Empty />}
          </Section>

          <Section no={4} title="Households and plans"
                   count={households.length ? `${households.length} ${households.length === 1 ? "household" : "households"} · ${plans.length} ${plans.length === 1 ? "plan" : "plans"}` : null}
                   action={plans.length > 0 && (
                     <ConfirmDelete label="Delete all plans" what={`all ${plans.length} plans`}
                                    onConfirm={() => remove(supabase.from("plan").delete().in("household_id", households.map((h) => h.id)))} />
                   )}>
            {households.length ? households.map((h) => (
              <div key={h.id} className="mt-1 flex flex-col gap-1 rounded-2xl bg-koi-paper p-4 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 font-semibold text-koi-ink">
                    {h.label || "Household"} · {planCount(h.id)} {planCount(h.id) === 1 ? "plan" : "plans"} · since {date(h.created_at)}
                    {(h.keep_out ?? []).length > 0 && ` · keeps ${h.keep_out.map((k) => labelOf(FOODS_AVOID, k)).join(", ")} out of the house`}
                  </p>
                  <ConfirmDelete what="this household, its people and its plans" onConfirm={() => remove(supabase.from("household").delete().eq("id", h.id))} />
                </div>
                {(h.household_member ?? []).map((m) => (
                  <p key={m.id} className="m-0">
                    {m.label}{m.relation ? ` (${m.relation})` : ""}{m.account_profile_id ? " · you" : ""}: {labelOf(AGE_BANDS, m.age_band)}
                    {m.sex ? ` · ${m.sex}` : ""}{m.diet_type ? ` · ${labelOf(DIET_TYPES, m.diet_type)}` : ""}
                    {m.energy_goal && m.energy_goal !== "maintain" ? ` · ${labelOf(ENERGY_GOALS, m.energy_goal)}` : ""}
                    {m.eating_pattern && m.eating_pattern !== "balanced" ? ` · ${labelOf(EATING_PATTERNS, m.eating_pattern)}` : ""}
                    {m.activity_level ? ` · ${m.activity_level} activity` : ""}
                    {[m.age_years && `${m.age_years} years`, m.weight_kg && `${m.weight_kg} kg`, m.height_cm && `${m.height_cm} cm`].filter(Boolean).map((x) => ` · ${x}`).join("")}
                    {m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}{m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}
                    {(m.household_member_avoid ?? []).length ? ` · avoids ${m.household_member_avoid.map((a) => `${labelOf(FOODS_AVOID, a.avoid_key)}${a.severity ? ` (${a.severity})` : ""}`).join(", ")}` : ""}
                    {(m.meals_from_home ?? []).length ? ` · eats at home: ${m.meals_from_home.join(", ")}` : ""}
                    {m.appetite ? ` · ${m.appetite} appetite` : ""}
                    {(m.household_member_version ?? []).length ? ` · ${m.household_member_version.length} saved ${m.household_member_version.length === 1 ? "version" : "versions"}, deleted with the household` : ""}
                  </p>
                ))}
                {plans.filter((p) => p.household_id === h.id).slice(0, 5).map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                    <span>Plan of {date(p.created_at)} · {p.days} days{p.cost != null ? ` · ₹${p.cost}` : ""}{p.budget_rupees ? ` · budget ₹${p.budget_rupees}` : ""}</span>
                    <ConfirmDelete what="this plan" onConfirm={() => remove(supabase.from("plan").delete().eq("id", p.id))} />
                  </div>
                ))}
              </div>
            )) : <Empty />}
          </Section>

          <Section no={5} title="Weigh-ins" count={(d.checkins ?? []).length ? String(d.checkins.length) : null}
                   action={(d.checkins ?? []).length > 0 && (
                     <ConfirmDelete label="Delete all weigh-ins" what={`all ${d.checkins.length} weigh-ins`}
                                    onConfirm={() => remove(supabase.from("member_checkin").delete().in("member_id", [...new Set(d.checkins.map((c) => c.member_id))]))} />
                   )}>
            {(d.checkins ?? []).length ? (
              <>
                <p className="m-0">{d.checkins.length} weigh-in{d.checkins.length === 1 ? "" : "s"}, from {date(d.checkins.at(-1).checked_on)} to {date(d.checkins[0].checked_on)}; the latest {d.checkins[0].weight_kg} kg.</p>
                <p className="m-0 text-[12.5px] text-koi-muted">Only your weight and the day, which you entered yourself on Track. Kept until you delete them here.</p>
              </>
            ) : <Empty />}
          </Section>

          <Section no={6} title="Meals" count={(d.mealLog ?? []).length ? String(d.mealLog.length) : null}
                   action={(d.mealLog ?? []).length > 0 && (
                     <ConfirmDelete label="Delete all meals" what={`all ${d.mealLog.length} meals`}
                                    onConfirm={async () => {
                                      forgetHeldMeals();
                                      const ids = [...new Set(d.mealLog.filter((m) => !m.held).map((m) => m.member_id))];
                                      if (ids.length) await remove(supabase.from("member_meal_log").delete().in("member_id", ids));
                                      else await load();
                                    }} />
                   )}>
            {(d.mealLog ?? []).length ? (
              <>
                <p className="m-0">
                  {d.mealLog.length} meal{d.mealLog.length === 1 ? "" : "s"} logged on Track, from {date(d.mealLog.at(-1).eaten_on)} to {date(d.mealLog[0].eaten_on)};{" "}
                  {d.mealLog.filter((m) => m.status === "other").length} of them something other than the plan.
                  {d.mealLog.some((m) => m.held) && " Some are still on this device, waiting to be saved."}
                </p>
                <p className="m-0 text-[12.5px] text-koi-muted">What you ate, meal by meal, and KOI&apos;s estimate where it wasn&apos;t the plan. You entered them yourself (or approved KOI&apos;s card). Kept until you delete them here.</p>
              </>
            ) : <Empty />}
          </Section>

          <Section no={7} title="Delivery addresses" count={(d.addresses ?? []).length ? String(d.addresses.length) : null}>
            {(d.addresses ?? []).length ? d.addresses.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{[a.label, a.city, a.pincode].filter(Boolean).join(" · ")}{a.is_default ? " (default)" : ""}</span>
                <ConfirmDelete what="this address" onConfirm={() => remove(supabase.from("delivery_addresses").delete().eq("id", a.id))} />
              </div>
            )) : <Empty />}
          </Section>

          <Section no={8} title="Swiggy"
                   action={d.swiggy?.connected && (
                     <ConfirmDelete label="Disconnect" what="the Swiggy connection"
                                    onConfirm={async () => {
                                      const response = await fetch("/api/marketplace/connect", { method: "DELETE" });
                                      if (!response.ok) throw new Error("It could not be disconnected.");
                                      await load();
                                    }} />
                   )}>
            <p className="m-0">{d.swiggy?.connected ? `Connected${d.swiggy.expiresAt ? `, until ${date(d.swiggy.expiresAt)}` : ""}.` : "Not connected."}</p>
          </Section>

          {(d.orders ?? []).length > 0 && (
            <Section no={9} title="Baskets handed to Swiggy" count={String(d.orders.length)} kept>
              {d.orders.map((o) => <p key={o.id} className="m-0">{date(o.created_at)} · {o.item_count} items · {o.state}</p>)}
              <p className="m-0 text-[12.5px] text-koi-muted">Kept as the record of what was sent, so they are not deleted here.</p>
            </Section>
          )}
        </ol>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
          <section aria-label="What KOI does not keep" className="flex flex-col gap-4 rounded-[26px] bg-koi-forest p-6 text-koi-bg">
            <span className="font-koi-display text-2xl font-extrabold">What KOI does not keep</span>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0 text-sm leading-relaxed">
              <li className="flex gap-3"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-koi-lime" /><span>What you type into search, a household description or a change to a plan. When reading with OpenAI is switched on, that sentence alone is sent to be read, and OpenAI is asked not to store it.</span></li>
              <li className="flex gap-3"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-koi-lime" /><span>Search words KOI could not match are counted without who searched, and only shown to KOI after five separate searches.</span></li>
              <li className="flex gap-3"><span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-koi-lime" /><span>No card or UPI details. You pay on Swiggy.</span></li>
            </ul>
          </section>
          <Link href="/store/plan" className="flex h-12 items-center justify-center gap-2 rounded-full border border-koi-forest/20 bg-white text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-koi-paper"><span aria-hidden="true">←</span> Back to planning</Link>
        </aside>
      </div>
    </main>
  );
}
