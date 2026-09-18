"use client";

// ============================================================================
// /store/household — who the household is, kept
//
// Plan §9.10.2 (A). Every member has a permanent profile the owner edits here:
// who they are (a label, never a name), what they must never be given and how
// strictly, their diet, an adult's goal (maintain, lose, gain; balanced, high
// protein, low carb, keto), daily targets KOI can suggest with its sources,
// and how they eat. The planner reads these and never rewrites them.
//
// Saving goes through public.save_household_member (00050): the member, their
// avoids and a new version, in one transaction, under row-level security.
// Children's profiles hold only what feeding them safely needs: no weight, no
// goal (the database refuses one).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import KitchenRules from "@/components/store/household/KitchenRules";
import { Plus, Loader2, Pencil, Trash2, Sparkles, UserRound } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadGoalProfile } from "@/lib/supabase/goalProfileService";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { AGE_BANDS } from "@/lib/planner/brief";
import { suggestTargets, goalsAllowed, ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";
import {
  blankProfile, profileFromRow, memberPayload, avoidsPayload, profileProblems, profileSummary,
  severitiesFor, defaultSeverityFor, fromGoalSetup, ACTIVITY_LEVELS, MEALS_FROM_HOME, APPETITES, SPICE_TOLERANCES, SEVERITIES,
} from "@/lib/household/profile";

const HEADING = { fontFamily: "var(--font-koi-heading)" };
const INPUT = "mt-1 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]";
const LABEL = "text-[12px] font-semibold text-[#0E4032]";
const HINT = "mt-1 block text-[11px] text-[#5A6B5A]";
const HARD_ALLERGENS = FOODS_AVOID.filter((a) => a.mode === "hard" && a.kind === "allergen");

const MEMBER_FIELDS = "id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, appetite, spice_tolerance, meals_from_home, target_kcal, target_protein_g, target_source, account_profile_id, version, created_at, updated_at, household_member_avoid(avoid_key, severity)";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Read the shopper's household, its members and when each was last saved. */
async function readHousehold() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, household: null, members: [], versions: {}, error: null };
  const { data: household, error } = await supabase
    .from("household")
    .select(`id, keep_out, refused_brands, preferred_brands, waste_tolerance, repeat_tolerance, priorities, household_pantry(id, label, sku_id), household_member(${MEMBER_FIELDS})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { user, household: null, members: [], versions: {}, error: "Your household could not be loaded." };
  const rows = [...(household?.household_member ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const versions = {};
  if (rows.length) {
    const { data: history } = await supabase
      .from("household_member_version")
      .select("member_id, version, changed_at")
      .in("member_id", rows.map((r) => r.id))
      .order("version", { ascending: false });
    for (const v of history ?? []) (versions[v.member_id] ??= []).push(v);
  }
  return { user, household, members: rows, versions, error: null };
}

function Choice({ options, value, onChange, name }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] ${value === o.key ? "border-[#0E4032] bg-[#0E4032] text-white" : "border-[#083D2D]/15 bg-white text-[#0E4032]"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MemberEditor({ initial, onCancel, onSaved, householdId, ensureHousehold, userId, anotherHolder }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [setupNote, setSetupNote] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const adult = goalsAllowed(form.age_band);
  const problems = profileProblems(form);

  const toggleAvoid = (key) => set({
    avoids: form.avoids.some((a) => a.key === key)
      ? form.avoids.filter((a) => a.key !== key)
      : [...form.avoids, { key, severity: defaultSeverityFor(key) }],
  });
  const setSeverity = (key, severity) => set({ avoids: form.avoids.map((a) => (a.key === key ? { ...a, severity } : a)) });
  const toggleMeal = (key) => set({
    meals_from_home: form.meals_from_home.includes(key) ? form.meals_from_home.filter((k) => k !== key) : [...form.meals_from_home, key],
  });

  const suggest = () => setSuggestion(suggestTargets({
    ageBand: form.age_band,
    sex: form.sex || null,
    activity: form.activity_level || null,
    ageYears: adult ? form.age_years || null : null,
    weightKg: adult ? form.weight_kg || null : null,
    heightCm: adult ? form.height_cm || null : null,
    energyGoal: form.energy_goal,
    eatingPattern: form.eating_pattern,
  }));

  async function fillFromGoalSetup() {
    setSetupNote(null);
    try {
      const setup = await loadGoalProfile(userId);
      if (!setup) {
        setSetupNote("You haven't set up your goal yet, so there is nothing to fill from.");
        return;
      }
      setForm((f) => fromGoalSetup(f, setup));
      setSuggestion(null);
      setSetupNote("Filled from your goal setup. Check it, then save.");
    } catch {
      setSetupNote("Your goal setup could not be read.");
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const id = householdId ?? (await ensureHousehold());
      const { error: saveError } = await supabase.rpc("save_household_member", {
        p_household_id: id,
        p_member: memberPayload(form),
        p_avoids: avoidsPayload(form),
      });
      if (saveError) throw saveError;
      await onSaved();
    } catch (err) {
      setError(err?.message ?? "It could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#0E4032]/25 bg-white p-4 md:p-5">
      <h2 className="text-[15px] font-bold text-[#0E4032]" style={HEADING}>{form.memberId ? `Edit ${form.label || "this person"}` : "Add someone"}</h2>

      {/* Who */}
      <fieldset className="mt-4">
        <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">Who</legend>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className={LABEL}>What to call them</span>
            <input id="profile-label" value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="Me, Wife, Kid 1" className={INPUT} />
            <span className={HINT}>A label, not a name. KOI stores no names.</span>
          </label>
          <label className="block">
            <span className={LABEL}>Relation (optional)</span>
            <input id="profile-relation" value={form.relation} onChange={(e) => set({ relation: e.target.value })} placeholder="wife, son, mother" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Age</span>
            <select id="profile-age-band" value={form.age_band} onChange={(e) => set({ age_band: e.target.value })} className={INPUT}>
              {AGE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Sex (optional)</span>
            <select id="profile-sex" value={form.sex} onChange={(e) => set({ sex: e.target.value })} className={INPUT}>
              <option value="">Not given</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="unspecified">Prefer not to say</option>
            </select>
            <span className={HINT}>Only used to estimate daily needs.</span>
          </label>
        </div>
        {adult && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[#0E4032]">
              <input id="profile-is-me" type="checkbox" checked={form.is_account_holder} disabled={anotherHolder && !form.is_account_holder}
                     onChange={(e) => set({ is_account_holder: e.target.checked })} />
              This is me
            </label>
            {anotherHolder && !form.is_account_holder && <span className="text-[11px] text-[#5A6B5A]">Someone else in the household is already you.</span>}
            {form.is_account_holder && (
              <button type="button" onClick={fillFromGoalSetup} className="inline-flex items-center gap-1.5 rounded-xl border border-[#083D2D]/15 px-2.5 py-1 text-[11.5px] font-semibold text-[#0E4032]">
                <UserRound className="h-3.5 w-3.5" /> Fill from my goal setup
              </button>
            )}
            {setupNote && <span className="text-[11px] text-[#5A6B5A]">{setupNote}</span>}
          </div>
        )}
      </fieldset>

      {/* Food rules */}
      <fieldset className="mt-5">
        <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">Food rules</legend>
        <label className="mt-2 block md:w-1/2">
          <span className={LABEL}>Diet</span>
          <select id="profile-diet" value={form.diet_type} onChange={(e) => set({ diet_type: e.target.value })} className={INPUT}>
            {!form.diet_type && <option value="">Choose a diet</option>}
            {DIET_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <p className={`${LABEL} mt-3`}>What they avoid</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {FOODS_AVOID.map((a) => {
            const on = form.avoids.some((x) => x.key === a.key);
            return (
              <button key={a.key} type="button" aria-pressed={on} onClick={() => toggleAvoid(a.key)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${on ? "border-[#0E4032] bg-[#0E4032] text-white" : "border-[#083D2D]/15 bg-white text-[#0E4032]"}`}>
                {a.emoji} {a.label}
              </button>
            );
          })}
        </div>
        {form.avoids.length > 0 && (
          <div className="mt-3 space-y-2">
            {form.avoids.map((a) => {
              const entry = FOODS_AVOID.find((x) => x.key === a.key);
              return (
                <div key={a.key} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="min-w-[8rem] font-semibold text-[#0E4032]">{entry?.label ?? a.key}</span>
                  <Choice name={`How strictly: ${entry?.label ?? a.key}`} options={severitiesFor(a.key)} value={a.severity} onChange={(severity) => setSeverity(a.key, severity)} />
                </div>
              );
            })}
            <p className="text-[11px] text-[#5A6B5A]">
              {SEVERITIES.map((s) => `${s.label}: ${s.hint.toLowerCase()}`).join(" · ")}. Anything but a dislike is never given to them.
            </p>
          </div>
        )}
      </fieldset>

      {/* Goal */}
      <fieldset className="mt-5">
        <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">Goal</legend>
        {adult ? (
          <>
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <span className={LABEL}>Weight</span>
                <Choice name="Weight goal" options={ENERGY_GOALS} value={form.energy_goal} onChange={(energy_goal) => { set({ energy_goal }); setSuggestion(null); }} />
              </div>
              <div>
                <span className={LABEL}>Way of eating</span>
                <Choice name="Way of eating" options={EATING_PATTERNS} value={form.eating_pattern} onChange={(eating_pattern) => { set({ eating_pattern }); setSuggestion(null); }} />
              </div>
            </div>
            <label className="mt-3 block md:w-1/2">
              <span className={LABEL}>How active</span>
              <select id="profile-activity" value={form.activity_level} onChange={(e) => set({ activity_level: e.target.value })} className={INPUT}>
                <option value="">Not given</option>
                {ACTIVITY_LEVELS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <label className="block">
                <span className={LABEL}>Age</span>
                <input id="profile-age-years" value={form.age_years} onChange={(e) => set({ age_years: e.target.value })} inputMode="numeric" placeholder="years" className={INPUT} />
              </label>
              <label className="block">
                <span className={LABEL}>Weight</span>
                <input id="profile-weight" value={form.weight_kg} onChange={(e) => set({ weight_kg: e.target.value })} inputMode="decimal" placeholder="kg" className={INPUT} />
              </label>
              <label className="block">
                <span className={LABEL}>Height</span>
                <input id="profile-height" value={form.height_cm} onChange={(e) => set({ height_cm: e.target.value })} inputMode="decimal" placeholder="cm" className={INPUT} />
              </label>
            </div>
            <p className={HINT}>
              Optional, and only used to estimate their needs. If this is someone else, add these with their agreement.
            </p>
          </>
        ) : (
          <p className="mt-2 text-[12px] text-[#5A6B5A]">
            Children and teenagers are planned for their age&apos;s needs (ICMR-NIN 2020). KOI sets no weight goal or diet
            pattern for anyone under 19, and keeps no weight or height for them.
          </p>
        )}
      </fieldset>

      {/* Targets */}
      <fieldset className="mt-5">
        <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">Daily targets</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 md:w-2/3">
          <label className="block">
            <span className={LABEL}>Energy a day</span>
            <input id="profile-kcal" value={form.target_kcal} onChange={(e) => set({ target_kcal: e.target.value, target_source: "stated" })} inputMode="numeric" placeholder="kcal" className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Protein a day</span>
            <input id="profile-protein" value={form.target_protein_g} onChange={(e) => set({ target_protein_g: e.target.value, target_source: "stated" })} inputMode="numeric" placeholder="g" className={INPUT} />
          </label>
        </div>
        <button type="button" onClick={suggest}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#0E4032] px-3 py-1.5 text-[12px] font-semibold text-[#0E4032]">
          <Sparkles className="h-3.5 w-3.5" /> Suggest targets
        </button>
        {suggestion && (
          <div className="mt-3 rounded-xl bg-[#083D2D]/[0.03] p-3 text-[12px] text-[#5A6B5A]">
            <p className="font-semibold text-[#0E4032]">
              {suggestion.kcal.toLocaleString("en-IN")} kcal and {Math.round(suggestion.protein)} g protein a day
              {suggestion.carbsMax !== null ? `, at most ${suggestion.carbsMax} g carbohydrate` : ""}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {suggestion.basis.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="mt-1">A typical person&apos;s needs, not advice for this person. Change them if you know better.</p>
            <button type="button"
                    onClick={() => { set({ target_kcal: String(suggestion.kcal), target_protein_g: String(Math.round(suggestion.protein)), target_source: suggestion.source }); setSuggestion(null); }}
                    className="mt-2 rounded-xl bg-[#0E4032] px-3 py-1.5 text-[12px] font-bold text-white">
              Use these
            </button>
          </div>
        )}
        {adult && ["keto", "low_carb"].includes(form.eating_pattern) && (
          <p className={HINT}>
            {form.eating_pattern === "keto" ? "Keto" : "Low carb"}: plans keep them under {form.eating_pattern === "keto" ? 50 : 130} g of carbohydrate a day, and leave out anything whose carbohydrate isn&apos;t declared.
          </p>
        )}
      </fieldset>

      {/* How they eat */}
      <fieldset className="mt-5">
        <legend className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#16A06E]">How they eat</legend>
        <p className={`${LABEL} mt-2`}>Meals from home</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MEALS_FROM_HOME.map((meal) => {
            const on = form.meals_from_home.includes(meal.key);
            return (
              <button key={meal.key} type="button" aria-pressed={on} onClick={() => toggleMeal(meal.key)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${on ? "border-[#16A06E] bg-[#16A06E]/10 text-[#0E4032]" : "border-[#083D2D]/10 bg-white text-[#5A6B5A]"}`}>
                {meal.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          <span className={LABEL}>Appetite</span>
          <Choice name="Appetite" options={APPETITES} value={form.appetite} onChange={(appetite) => set({ appetite: form.appetite === appetite ? "" : appetite })} />
        </div>
        <div className="mt-2">
          <span className={LABEL}>Spice</span>
          <Choice name="Spice" options={SPICE_TOLERANCES} value={form.spice_tolerance}
                  onChange={(spice) => set({ spice_tolerance: form.spice_tolerance === spice ? "" : spice })} />
        </div>
        <p className={HINT}>
          Plans use all of this: meals and appetite size the packs, and &ldquo;No spice&rdquo; keeps spicy food off their plate
          while &ldquo;Mild&rdquo; only leaves it for last.
        </p>
      </fieldset>

      {problems.length > 0 && (
        <ul className="mt-4 space-y-0.5 text-[11.5px] text-[#5A6B5A]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      {error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || problems.length > 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0E4032] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] font-semibold text-[#5A6B5A] hover:text-[#0E4032]">Cancel</button>
      </div>
    </div>
  );
}

export default function HouseholdPage() {
  const [state, setState] = useState({ loading: true });
  const [editing, setEditing] = useState(null);
  const [keepOutBusy, setKeepOutBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const show = useCallback((result) => setState({ loading: false, ...result }), []);
  const reload = useCallback(async () => {
    show(await readHousehold());
    setEditing(null);
  }, [show]);

  useEffect(() => {
    let live = true;
    readHousehold().then((result) => { if (live) show(result); });
    return () => { live = false; };
  }, [show]);

  const members = useMemo(() => (state.members ?? []).map(profileFromRow), [state.members]);
  // The brands on the shelf, so a brand rule can be typed with the shop's own
  // spelling rather than guessed at.
  const [brands, setBrands] = useState([]);
  useEffect(() => {
    let live = true;
    getSupabaseClient().from("brands").select("brand_name").order("brand_name").then(({ data }) => {
      if (live) setBrands([...new Set((data ?? []).map((b) => b.brand_name).filter(Boolean))]);
    });
    return () => { live = false; };
  }, []);
  const householdId = state.household?.id ?? null;
  const keepOut = state.household?.keep_out ?? [];

  const ensureHousehold = useCallback(async () => {
    const { data, error } = await getSupabaseClient().from("household").insert({ label: "My household" }).select("id").single();
    if (error) throw error;
    return data.id;
  }, []);

  // The allergens someone refuses, and who: what could be kept out of the house.
  const refusedAllergens = HARD_ALLERGENS
    .map((entry) => ({ entry, who: members.filter((m) => m.avoids.some((a) => a.key === entry.key && a.severity !== "dislike")).map((m) => m.label) }))
    .filter((a) => a.who.length > 0);

  async function toggleKeepOut(key) {
    if (!householdId) return;
    setKeepOutBusy(true);
    const next = keepOut.includes(key) ? keepOut.filter((k) => k !== key) : [...keepOut, key];
    const { error } = await getSupabaseClient().from("household").update({ keep_out: next }).eq("id", householdId);
    setKeepOutBusy(false);
    if (error) show({ ...state, error: "Keeping it out of the house could not be saved." });
    else await reload();
  }

  // The kitchen's own rules (00052). Each change saves on its own.
  async function saveKitchen(patch) {
    if (!householdId) return;
    setKeepOutBusy(true);
    const { error } = await getSupabaseClient().from("household").update(patch).eq("id", householdId);
    setKeepOutBusy(false);
    if (error) show({ ...state, error: "That could not be saved." });
    else await reload();
  }

  async function addPantry(label) {
    if (!householdId) return;
    setKeepOutBusy(true);
    const { error } = await getSupabaseClient().from("household_pantry").insert({ household_id: householdId, label });
    setKeepOutBusy(false);
    if (error) show({ ...state, error: "That could not be added to the cupboard." });
    else await reload();
  }

  async function removePantry(row) {
    setKeepOutBusy(true);
    const { error } = await getSupabaseClient().from("household_pantry").delete().eq("id", row.id);
    setKeepOutBusy(false);
    if (error) show({ ...state, error: "That could not be taken off the list." });
    else await reload();
  }

  async function remove(memberId) {
    const { error } = await getSupabaseClient().from("household_member").delete().eq("id", memberId);
    setRemoving(null);
    if (error) show({ ...state, error: "They could not be removed." });
    else await reload();
  }

  if (state.loading) return <main className="mx-auto max-w-3xl px-5 py-16 text-[#5A6B5A]"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</main>;
  if (!state.user) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-2xl font-bold text-[#0E4032]" style={HEADING}>Your household</h1>
        <p className="mt-2 text-[13px] text-[#5A6B5A]">Sign in to keep a profile for everyone you shop for. Only you can read it.</p>
      </main>
    );
  }

  const holder = members.find((m) => m.is_account_holder);

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[26px] font-bold leading-none tracking-tight text-[#0E4032]" style={HEADING}>Your household</h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-[#5A6B5A]">
            Everyone you shop for, and how you shop. Plans read this and never change it. Only you can see it.
          </p>
        </div>
        <p className="text-[11.5px]">
          <Link href="/store/plan" className="font-semibold text-[#16A06E] hover:underline">Plan the week</Link>
          <span className="text-[#5A6B5A]"> · </span>
          <Link href="/store/profile/data" className="font-semibold text-[#16A06E] hover:underline">What KOI keeps</Link>
        </p>
      </header>
      {state.error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{state.error}</p>}

      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
      <div className="min-w-0">
      <section className="space-y-2.5">
        {members.map((m) => (editing?.memberId === m.memberId ? (
          <MemberEditor key={m.memberId} initial={editing} householdId={householdId} ensureHousehold={ensureHousehold} userId={state.user.id}
                        anotherHolder={Boolean(holder && holder.memberId !== m.memberId)} onCancel={() => setEditing(null)} onSaved={reload} />
        ) : (
          <div key={m.memberId} className="rounded-2xl bg-white/70 p-4 ring-1 ring-inset ring-[#083D2D]/8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[14px] font-bold text-[#0E4032]">
                  {m.label}{m.relation ? <span className="font-normal text-[#5A6B5A]"> · {m.relation}</span> : null}
                  {m.is_account_holder && <span className="ml-2 rounded-full bg-[#16A06E]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#16A06E]">You</span>}
                </p>
                <p className="mt-0.5 text-[12px] text-[#5A6B5A]">{profileSummary(m)}</p>
                {m.avoids.length > 0 && (
                  <p className="mt-0.5 text-[12px] text-[#5A6B5A]">
                    {m.avoids.map((a) => `${FOODS_AVOID.find((x) => x.key === a.key)?.label ?? a.key} (${SEVERITIES.find((s) => s.key === a.severity)?.label.toLowerCase() ?? a.severity})`).join(", ")}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-[#5A6B5A]">
                  {(state.versions[m.memberId] ?? []).length > 1
                    ? `Saved ${(state.versions[m.memberId] ?? []).length} times, last on ${when(state.versions[m.memberId][0].changed_at)}`
                    : `Saved on ${when(state.versions[m.memberId]?.[0]?.changed_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditing(m)} className="inline-flex items-center gap-1 rounded-xl border border-[#083D2D]/15 px-2.5 py-1 text-[12px] font-semibold text-[#0E4032]">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {removing === m.memberId ? (
                  <span className="flex items-center gap-2 text-[12px]">
                    <button type="button" onClick={() => remove(m.memberId)} className="font-semibold text-[#B4453C]">Remove {m.label}</button>
                    <button type="button" onClick={() => setRemoving(null)} className="text-[#5A6B5A]">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setRemoving(m.memberId)} className="text-[#5A6B5A] hover:text-[#0E4032]" aria-label={`Remove ${m.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )))}

        {editing && !editing.memberId ? (
          <MemberEditor initial={editing} householdId={householdId} ensureHousehold={ensureHousehold} userId={state.user.id}
                        anotherHolder={Boolean(holder)} onCancel={() => setEditing(null)} onSaved={reload} />
        ) : (
          <button type="button" onClick={() => setEditing({ ...blankProfile(), label: members.length ? "" : "Me", is_account_holder: !members.length })}
                  className="inline-flex w-fit items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-[#0E4032] ring-1 ring-inset ring-[#083D2D]/15 hover:bg-white/60">
            <Plus className="h-4 w-4" /> Add someone
          </button>
        )}
      </section>

      {householdId && (
        <div className="mt-6">
          <KitchenRules household={state.household} pantry={state.household?.household_pantry ?? []} brands={brands} busy={keepOutBusy}
                        onSaveHousehold={saveKitchen} onAddPantry={addPantry} onRemovePantry={removePantry} />
        </div>
      )}
      </div>

      <div className="min-w-0 space-y-6 lg:sticky lg:top-6">
      {refusedAllergens.length > 0 && (
        <section className="rounded-3xl bg-[#B4453C]/[0.04] p-5 ring-1 ring-inset ring-[#B4453C]/15">
          <p className="text-[12px] font-semibold text-[#0E4032]">Keep out of the house</p>
          <p className="mt-0.5 text-[11.5px] text-[#5A6B5A]">
            Normally a product one person can&apos;t eat is still bought for the others. For a serious allergy, switch it on
            and nothing containing it is bought for anyone.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {refusedAllergens.map(({ entry, who }) => {
              const on = keepOut.includes(entry.key);
              return (
                <button key={entry.key} type="button" aria-pressed={on} disabled={keepOutBusy} onClick={() => toggleKeepOut(entry.key)}
                        className={`rounded-full border px-2.5 py-1 text-[11.5px] disabled:opacity-50 ${on ? "border-[#B4453C] bg-[#B4453C] text-white" : "border-[#083D2D]/15 bg-white text-[#0E4032]"}`}>
                  {entry.emoji} {entry.label} <span className={on ? "text-white/80" : "text-[#5A6B5A]"}>({who.join(", ")})</span>{on ? " · kept out" : ""}
                </button>
              );
            })}
          </div>
        </section>
      )}

      </div>
      </div>
    </main>
  );
}
