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

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { AGE_BANDS } from "@/lib/planner/brief";
import { DIET_TYPES, FOODS_AVOID, FOODS_LOVE, MEALS, GOAL_PROFILES } from "@/lib/recommendation/config";

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
      <button type="button" onClick={() => setAsking(true)} className="text-[11.5px] font-semibold text-[#B4453C] hover:underline">
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[11.5px]">
      <span className="text-[#0E4032]">Delete {what} for good?</span>
      <button type="button" disabled={busy}
              onClick={async () => {
                setBusy(true);
                setFailed(null);
                try { await onConfirm(); } catch (err) { setFailed(err?.message ?? "It could not be deleted."); setBusy(false); }
              }}
              className="rounded-md bg-[#B4453C] px-2 py-0.5 font-semibold text-white disabled:opacity-40">
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className="font-semibold text-[#5A6B5A] hover:underline">Cancel</button>
      {failed && <span className="text-[#B4453C]">{failed}</span>}
    </span>
  );
}

function Section({ title, children, action }) {
  return (
    <section className="rounded-2xl border border-[#083D2D]/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#0E4032]">{title}</h2>
        {action}
      </div>
      <div className="mt-2 space-y-1.5 text-[12.5px] text-[#5A6B5A]">{children}</div>
    </section>
  );
}

const Empty = () => <p>Nothing stored.</p>;

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
  try {
    const [account, health, diet, avoided, loved, meals, cooking, budget, households, plans, addresses, orders, swiggy] = await Promise.all([
        rows(supabase.from("customer_profiles").select("display_name, email, phone, city, pincode, created_at").maybeSingle()),
        rows(supabase.from("user_health_profile").select("*").maybeSingle()),
        rows(supabase.from("user_diet_type").select("diet_type").maybeSingle()),
        rows(supabase.from("user_avoided_food").select("avoid_key")),
        rows(supabase.from("user_food_preference").select("food_key")),
        rows(supabase.from("user_meal_preference").select("meal_key")),
        rows(supabase.from("user_cooking_preference").select("cooking").maybeSingle()),
        rows(supabase.from("user_budget_preference").select("budget").maybeSingle()),
        rows(supabase.from("household").select("id, label, keep_out, created_at, household_member(id, label, age_band, diet_type, target_kcal, target_protein_g, household_member_avoid(avoid_key))").order("created_at")),
        rows(supabase.from("plan").select("id, household_id, days, budget_rupees, created_at, cost:achieved->cost").order("created_at", { ascending: false }).limit(100)),
        rows(supabase.from("delivery_addresses").select("id, label, city, pincode, is_default")),
        rows(supabase.from("fulfilment_intents").select("id, state, marketplace, item_count, created_at").order("created_at", { ascending: false }).limit(20)),
        fetch("/api/marketplace/connect").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
    return { user: signedIn, data: { account, health, diet, avoided, loved, meals, cooking, budget, households, plans, addresses, orders, swiggy }, error: null };
  } catch (err) {
    return { user: signedIn, data: null, error: err?.message ?? "What KOI keeps could not be loaded." };
  }
}

export default function YourDataPage() {
  const [user, setUser] = useState(undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const show = useCallback((result) => {
    setUser(result.user);
    setData(result.data);
    setError(result.error);
  }, []);
  const load = useCallback(async () => show(await readEverything()), [show]);

  useEffect(() => {
    let live = true;
    readEverything().then((result) => { if (live) show(result); });
    return () => { live = false; };
  }, [show]);

  /** Run deletes as the shopper, then show what is left. */
  const remove = async (...queries) => {
    for (const query of queries) {
      const { error: deleteError } = await query;
      if (deleteError) throw deleteError;
    }
    await load();
  };

  if (user === undefined || (user && !data && !error)) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-[#5A6B5A]"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</main>;
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-2xl font-bold text-[#0E4032]">What KOI keeps about you</h1>
        <p className="mt-2 text-[13px] text-[#5A6B5A]">Sign in to see and delete what KOI has stored for your account.</p>
      </main>
    );
  }

  const supabase = getSupabaseClient();
  const uid = user.id;
  const d = data ?? {};
  const preferencesStored = Boolean(d.diet || d.avoided?.length || d.loved?.length || d.meals?.length || d.cooking || d.budget);
  const planCount = (householdId) => (d.plans ?? []).filter((p) => p.household_id === householdId).length;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-2xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>What KOI keeps about you</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[#5A6B5A]">
        Everything stored against your account, and a way to delete each part. Only you can read it. Deleting cannot be undone.
      </p>
      {error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{error}</p>}

      <div className="mt-8 space-y-4">
        <Section title="Your account">
          {d.account ? (
            <>
              <p>{[d.account.display_name, d.account.phone, d.account.email].filter(Boolean).join(" · ") || "No details yet"}</p>
              <p>{[d.account.city, d.account.pincode].filter(Boolean).join(" ")}{d.account.created_at ? ` · since ${date(d.account.created_at)}` : ""}</p>
              <p className="text-[11.5px]">Signing in depends on this, so it is not deleted here.</p>
            </>
          ) : <Empty />}
        </Section>

        <Section title="Health profile"
                 action={d.health && <ConfirmDelete what="your health profile" onConfirm={() => remove(supabase.from("user_health_profile").delete().eq("profile_id", uid))} />}>
          {d.health ? (
            <>
              <p>{[d.health.gender, d.health.age && `${d.health.age} years`, d.health.height_cm && `${d.health.height_cm} cm`, d.health.weight_kg && `${d.health.weight_kg} kg`, d.health.goal_weight_kg && `goal ${d.health.goal_weight_kg} kg`].filter(Boolean).join(" · ")}</p>
              <p>{[d.health.goal && (GOAL_PROFILES[d.health.goal]?.label ?? d.health.goal), d.health.activity_level].filter(Boolean).join(" · ")}</p>
              <p>{[d.health.target_kcal && `${d.health.target_kcal} kcal`, d.health.target_protein_g && `${d.health.target_protein_g} g protein`, d.health.target_carbs_g && `${d.health.target_carbs_g} g carbs`, d.health.target_fat_g && `${d.health.target_fat_g} g fat`].filter(Boolean).join(" · ")}{d.health.target_kcal ? " a day" : ""}</p>
            </>
          ) : <Empty />}
        </Section>

        <Section title="Food preferences"
                 action={preferencesStored && <ConfirmDelete what="your food preferences" onConfirm={() => remove(...PREFERENCE_TABLES.map((t) => supabase.from(t).delete().eq("profile_id", uid)))} />}>
          {preferencesStored ? (
            <>
              {d.diet && <p>Diet: {labelOf(DIET_TYPES, d.diet.diet_type)}</p>}
              {d.avoided?.length > 0 && <p>Avoid: {d.avoided.map((a) => labelOf(FOODS_AVOID, a.avoid_key)).join(", ")}</p>}
              {d.loved?.length > 0 && <p>Like: {d.loved.map((l) => labelOf(FOODS_LOVE, l.food_key)).join(", ")}</p>}
              {d.meals?.length > 0 && <p>Meals: {d.meals.map((m) => labelOf(MEALS, m.meal_key)).join(", ")}</p>}
              {d.cooking && <p>Cooking: {d.cooking.cooking}</p>}
              {d.budget && <p>Budget: {d.budget.budget}</p>}
            </>
          ) : <Empty />}
        </Section>

        <Section title="Households and plans"
                 action={(d.plans ?? []).length > 0 && (
                   <ConfirmDelete label="Delete all plans" what={`all ${d.plans.length} plans`}
                                  onConfirm={() => remove(supabase.from("plan").delete().in("household_id", (d.households ?? []).map((h) => h.id)))} />
                 )}>
          {(d.households ?? []).length ? d.households.map((h) => (
            <div key={h.id} className="rounded-xl bg-[#083D2D]/[0.03] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-[#0E4032]">
                  {h.label || "Household"} · {planCount(h.id)} {planCount(h.id) === 1 ? "plan" : "plans"} · since {date(h.created_at)}
                  {(h.keep_out ?? []).length > 0 && ` · keeps ${h.keep_out.map((k) => labelOf(FOODS_AVOID, k)).join(", ")} out of the house`}
                </p>
                <ConfirmDelete what="this household, its people and its plans" onConfirm={() => remove(supabase.from("household").delete().eq("id", h.id))} />
              </div>
              {(h.household_member ?? []).map((m) => (
                <p key={m.id}>
                  {m.label}: {labelOf(AGE_BANDS, m.age_band)}{m.diet_type ? ` · ${labelOf(DIET_TYPES, m.diet_type)}` : ""}
                  {m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}{m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}
                  {(m.household_member_avoid ?? []).length ? ` · avoids ${m.household_member_avoid.map((a) => labelOf(FOODS_AVOID, a.avoid_key)).join(", ")}` : ""}
                </p>
              ))}
              {(d.plans ?? []).filter((p) => p.household_id === h.id).slice(0, 5).map((p) => (
                <p key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
                  <span>Plan of {date(p.created_at)} · {p.days} days{p.cost != null ? ` · ₹${p.cost}` : ""}{p.budget_rupees ? ` · budget ₹${p.budget_rupees}` : ""}</span>
                  <ConfirmDelete what="this plan" onConfirm={() => remove(supabase.from("plan").delete().eq("id", p.id))} />
                </p>
              ))}
            </div>
          )) : <Empty />}
        </Section>

        <Section title="Delivery addresses">
          {(d.addresses ?? []).length ? d.addresses.map((a) => (
            <p key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{[a.label, a.city, a.pincode].filter(Boolean).join(" · ")}{a.is_default ? " (default)" : ""}</span>
              <ConfirmDelete what="this address" onConfirm={() => remove(supabase.from("delivery_addresses").delete().eq("id", a.id))} />
            </p>
          )) : <Empty />}
        </Section>

        <Section title="Swiggy"
                 action={d.swiggy?.connected && (
                   <ConfirmDelete label="Disconnect" what="the Swiggy connection"
                                  onConfirm={async () => {
                                    const response = await fetch("/api/marketplace/connect", { method: "DELETE" });
                                    if (!response.ok) throw new Error("It could not be disconnected.");
                                    await load();
                                  }} />
                 )}>
          <p>{d.swiggy?.connected ? `Connected${d.swiggy.expiresAt ? `, until ${date(d.swiggy.expiresAt)}` : ""}.` : "Not connected."}</p>
          {(d.orders ?? []).length > 0 && (
            <>
              <p className="pt-1 font-semibold text-[#0E4032]">Baskets handed to Swiggy</p>
              {d.orders.map((o) => <p key={o.id}>{date(o.created_at)} · {o.item_count} items · {o.state}</p>)}
              <p className="text-[11.5px]">Kept as the record of what was sent, so they are not deleted here.</p>
            </>
          )}
        </Section>

        <Section title="What KOI does not keep">
          <p>What you type into search, a household description or a change to a plan. When reading with OpenAI is switched on, that sentence alone is sent to be read, and OpenAI is asked not to store it.</p>
          <p>Search words KOI could not match are counted without who searched, and only shown to KOI after five separate searches.</p>
        </Section>
      </div>

      <p className="mt-6 text-[12px]"><Link href="/store/plan" className="font-semibold text-[#16A06E] hover:underline">Back to planning</Link></p>
    </main>
  );
}
