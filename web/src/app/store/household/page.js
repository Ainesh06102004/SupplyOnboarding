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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import KitchenRules from "@/components/store/household/KitchenRules";
import PhraseLog from "@/components/store/household/PhraseLog";
import { Plus, Loader2, Trash2, Sparkles, UserRound } from "lucide-react";
import { initialsOf } from "@/components/store/system/tokens";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLoginUi } from "@/store/loginUiStore";
import { loadGoalProfile } from "@/lib/supabase/goalProfileService";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { AGE_BANDS } from "@/lib/planner/brief";
import { suggestTargets, goalsAllowed, ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";
import {
  blankProfile, profileFromRow, memberPayload, avoidsPayload, profileProblems, profileSummary,
  severitiesFor, defaultSeverityFor, fromGoalSetup, ACTIVITY_LEVELS, MEALS_FROM_HOME, APPETITES, SPICE_TOLERANCES, SEVERITIES,
} from "@/lib/household/profile";

const INPUT = "mt-1 h-11 w-full rounded-xl border border-koi-forest/15 bg-koi-paper px-3 text-[14px] outline-none focus:border-koi-forest focus:bg-white";
const LABEL = "text-[13px] font-semibold text-koi-ink";
const HINT = "mt-1 block text-[12px] text-koi-muted";
const HARD_ALLERGENS = FOODS_AVOID.filter((a) => a.mode === "hard" && a.kind === "allergen");

const MEMBER_FIELDS = "id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, target_weight_kg, appetite, spice_tolerance, meals_from_home, favourite_categories, target_kcal, target_protein_g, target_source, account_profile_id, version, created_at, updated_at, household_member_avoid(avoid_key, severity)";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Read the shopper's household, its members and when each was last saved. */
async function readHousehold() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, household: null, members: [], versions: {}, error: null };
  const { data: household, error } = await supabase
    .from("household")
    .select(`id, keep_out, refused_brands, preferred_brands, waste_tolerance, repeat_tolerance, priorities, processing_ceiling, shelf_stable_only, cuisine_leaning, log_failed_phrases, followup_miss(id, said, not_applied, created_at), household_pantry(id, label, sku_id), household_member(${MEMBER_FIELDS})`)
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
                className={`rounded-full border px-2.5 py-1 text-[11.5px] ${value === o.key ? "border-koi-forest bg-koi-forest text-white" : "border-koi-forest/15 bg-white text-koi-ink"}`}>
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
    <section data-editor className="rounded-[28px] border border-koi-forest/10 bg-white p-6 shadow-[0_30px_60px_-50px_rgba(8,61,45,.5)]">
      <h2 className="m-0 font-koi-display text-[24px] font-extrabold text-koi-forest">{form.memberId ? `Edit ${form.label || "this person"}` : "Add someone"}</h2>

      {/* Who */}
      <fieldset className="mt-4">
        <legend className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-green">Personal details</legend>
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
            {/* "Age group", not "Age": the exact age below is a different
                question, and two fields with one label is how a form gets
                filled in twice and read wrong. */}
            <span className={LABEL}>Age group</span>
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
          <>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <label className="block">
                <span className={LABEL}>Age in years</span>
                <input id="profile-age-years" value={form.age_years} onChange={(e) => set({ age_years: e.target.value })} inputMode="numeric" placeholder="34" className={INPUT} />
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
              KOI keeps none of it for anyone under 19.
            </p>
          </>
        )}

        {adult && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-[12.5px] text-koi-ink">
              <input id="profile-is-me" type="checkbox" checked={form.is_account_holder} disabled={anotherHolder && !form.is_account_holder}
                     onChange={(e) => set({ is_account_holder: e.target.checked })} />
              This is me
            </label>
            {anotherHolder && !form.is_account_holder && <span className="text-[11px] text-koi-muted">Someone else in the household is already you.</span>}
            {form.is_account_holder && (
              <button type="button" onClick={fillFromGoalSetup} className="inline-flex items-center gap-1.5 rounded-xl border border-koi-forest/15 px-2.5 py-1 text-[11.5px] font-semibold text-koi-ink">
                <UserRound className="h-3.5 w-3.5" /> Fill from my goal setup
              </button>
            )}
            {setupNote && <span className="text-[11px] text-koi-muted">{setupNote}</span>}
          </div>
        )}
      </fieldset>

      {/* Food rules */}
      <fieldset className="mt-5">
        <legend className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-green">Food rules</legend>
        <label className="mt-2 block md:w-1/2">
          <span className={LABEL}>Diet</span>
          <select id="profile-diet" value={form.diet_type} onChange={(e) => set({ diet_type: e.target.value })} className={INPUT}>
            {!form.diet_type && <option value="">Choose a diet</option>}
            {/* Fasting is a diet for one plan, never a saved profile: the column refuses it (00056). */}
            {DIET_TYPES.filter((d) => !d.forOnePlanOnly).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <p className={`${LABEL} mt-3`}>What they avoid</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {FOODS_AVOID.map((a) => {
            const on = form.avoids.some((x) => x.key === a.key);
            return (
              <button key={a.key} type="button" aria-pressed={on} onClick={() => toggleAvoid(a.key)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${on ? "border-koi-forest bg-koi-forest text-white" : "border-koi-forest/15 bg-white text-koi-ink"}`}>
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
                  <span className="min-w-[8rem] font-semibold text-koi-ink">{entry?.label ?? a.key}</span>
                  <Choice name={`How strictly: ${entry?.label ?? a.key}`} options={severitiesFor(a.key)} value={a.severity} onChange={(severity) => setSeverity(a.key, severity)} />
                </div>
              );
            })}
            <p className="text-[11px] text-koi-muted">
              {SEVERITIES.map((s) => `${s.label}: ${s.hint.toLowerCase()}`).join(" · ")}. Anything but a dislike is never given to them.
            </p>
          </div>
        )}
      </fieldset>

      {/* Goal */}
      <fieldset className="mt-5">
        <legend className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-green">Goal</legend>
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
          </>
        ) : (
          <p className="mt-2 text-[12px] text-koi-muted">
            Children and teenagers are planned for their age&apos;s needs (ICMR-NIN 2020). KOI sets no weight goal or diet
            pattern for anyone under 19, and keeps no weight or height for them.
          </p>
        )}
      </fieldset>

      {/* Targets */}
      <fieldset className="mt-5">
        <legend className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-green">Daily targets</legend>
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
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-koi-forest px-3 py-1.5 text-[12px] font-semibold text-koi-ink">
          <Sparkles className="h-3.5 w-3.5" /> Suggest targets
        </button>
        {suggestion && (
          <div className="mt-3 rounded-xl bg-koi-forest/[0.03] p-3 text-[12px] text-koi-muted">
            <p className="font-semibold text-koi-ink">
              {suggestion.kcal.toLocaleString("en-IN")} kcal and {Math.round(suggestion.protein)} g protein a day
              {suggestion.carbsMax !== null ? `, at most ${suggestion.carbsMax} g carbohydrate` : ""}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {suggestion.basis.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="mt-1">A typical person&apos;s needs, not advice for this person. Change them if you know better.</p>
            <button type="button"
                    onClick={() => { set({ target_kcal: String(suggestion.kcal), target_protein_g: String(Math.round(suggestion.protein)), target_source: suggestion.source }); setSuggestion(null); }}
                    className="mt-2 rounded-xl bg-koi-forest px-3 py-1.5 text-[12px] font-bold text-white">
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
        <legend className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-green">How they eat</legend>
        <p className={`${LABEL} mt-2`}>Meals from home</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MEALS_FROM_HOME.map((meal) => {
            const on = form.meals_from_home.includes(meal.key);
            return (
              <button key={meal.key} type="button" aria-pressed={on} onClick={() => toggleMeal(meal.key)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${on ? "border-koi-green bg-koi-green/10 text-koi-ink" : "border-koi-forest/10 bg-white text-koi-muted"}`}>
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
        <ul className="mt-4 space-y-0.5 text-[11.5px] text-koi-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      {error && <p className="mt-3 text-[12.5px] text-koi-red">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || problems.length > 0}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-koi-forest px-5 text-[14px] font-bold text-koi-lime disabled:opacity-40">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] font-semibold text-koi-muted hover:text-koi-ink">Cancel</button>
      </div>
    </section>
  );
}

export default function HouseholdPage() {
  const root = useRef(null);
  const say = useKoiVoice((v) => v.say);
  const [state, setState] = useState({ loading: true });
  const [editing, setEditing] = useState(null);
  const [keepOutBusy, setKeepOutBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const show = useCallback((result) => setState({ loading: false, ...result }), []);
  const reload = useCallback(async () => {
    show(await readHousehold());
    setEditing(null);
  }, [show]);

  // Re-read when the shopper signs in or out here: it used to read once, on
  // opening, so signing in from this page left the signed-out message up.
  const { user: authUser, loading: authLoading } = useAuth();
  const authUid = authLoading ? "loading" : authUser?.uid ?? "signed-out";
  const openLogin = useLoginUi((st) => st.openLogin);
  useEffect(() => {
    if (authUid === "loading") return undefined;
    let live = true;
    readHousehold().then((result) => { if (live) show(result); });
    return () => { live = false; };
  }, [show, authUid]);

  const members = useMemo(() => (state.members ?? []).map(profileFromRow), [state.members]);

  // The cards deal in once the household is read; KOI says what this page is.
  const signedIn = Boolean(!state.loading && state.user);
  useGSAP(() => {
    if (!signedIn) return;
    say("Everyone you shop for. Plans read this and never change it.");
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (sel) => root.current?.querySelectorAll(sel) ?? [];
    gsap.from(q("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal });
    gsap.from(q("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08, ease: E.reveal, delay: 0.1 });
    gsap.from(q("[data-person]"), { autoAlpha: 0, y: 30, rotation: (i) => (i % 2 ? 1.2 : -1.2), duration: 0.85, stagger: 0.07, ease: E.dolly, delay: 0.25, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [signedIn] });
  // The brands on the shelf, so a brand rule can be typed with the shop's own
  // spelling rather than guessed at.
  const [brands, setBrands] = useState([]);
  // How many products KOI has read a full enough ingredient list for to know
  // how processed they are. The processing rule says so rather than implying
  // it reaches the whole shop.
  const [knownProcessing, setKnownProcessing] = useState(null);
  useEffect(() => {
    let live = true;
    getSupabaseClient().from("brands").select("brand_name").order("brand_name").then(({ data }) => {
      if (live) setBrands([...new Set((data ?? []).map((b) => b.brand_name).filter(Boolean))]);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    getSupabaseClient().from("sku_processing").select("sku_id", { count: "exact", head: true }).then(({ count }) => {
      if (live) setKnownProcessing(count ?? null);
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

  // What KOI could not understand, kept only if asked (00055).
  async function togglePhraseLog(on) {
    if (!householdId) return;
    setKeepOutBusy(true);
    const { error } = await getSupabaseClient().from("household").update({ log_failed_phrases: on }).eq("id", householdId);
    setKeepOutBusy(false);
    if (error) show({ ...state, error: "That could not be saved." });
    else await reload();
  }

  async function forgetPhrases(id) {
    setKeepOutBusy(true);
    const query = getSupabaseClient().from("followup_miss").delete();
    const { error } = id ? await query.eq("id", id) : await query.eq("household_id", householdId);
    setKeepOutBusy(false);
    if (error) show({ ...state, error: "That could not be deleted." });
    else await reload();
  }

  async function remove(memberId) {
    const { error } = await getSupabaseClient().from("household_member").delete().eq("id", memberId);
    setRemoving(null);
    if (error) show({ ...state, error: "They could not be removed." });
    else await reload();
  }

  if (state.loading) return <main role="status" className="mx-auto flex w-full max-w-[1440px] items-center gap-2.5 px-[clamp(16px,4vw,52px)] py-16 font-koi-sans text-sm text-koi-muted"><Loader2 className="size-4 animate-spin" /> Loading…</main>;
  if (!state.user) {
    return (
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-[clamp(16px,4vw,52px)] py-16 font-koi-sans text-koi-ink">
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">Your household</h1>
        <p className="m-0 max-w-[620px] text-base text-koi-ink2">Sign in to keep a profile for everyone you shop for. Only you can read it.</p>
        <button type="button" onClick={() => openLogin()} className="h-14 w-fit rounded-2xl bg-koi-forest px-7 text-[15px] font-bold text-koi-lime">Sign in with phone</button>
      </main>
    );
  }

  const holder = members.find((m) => m.is_account_holder);
  const editingNew = Boolean(editing && !editing.memberId);

  return (
    <main ref={root} className="ks-page-pad mx-auto flex w-full max-w-[1440px] flex-col bg-koi-bg px-[clamp(16px,4vw,52px)] pt-8 font-koi-sans text-koi-ink">
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="flex flex-col gap-2.5">
          <div data-rise className="flex items-center gap-3">
            <span className="font-koi-mono text-xs font-semibold text-koi-primary">(10)</span>
            <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Household</span>
          </div>
          <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Your household</span></span>
          </h1>
          <p data-rise className="m-0 max-w-[620px] text-base leading-relaxed text-koi-ink2">Everyone you shop for, and how you shop. Plans read this and never change it. Only you can see it.</p>
        </div>
        <div data-rise className="flex flex-wrap gap-2">
          <Link href="/store/plan" className="flex h-11 items-center gap-2 rounded-full bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline">Plan <span aria-hidden="true">→</span></Link>
          <Link href="/store/profile/data" className="flex h-11 items-center rounded-full border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-white">What KOI keeps</Link>
        </div>
      </section>
      {state.error && <p className="m-0 mt-3 text-[13px] text-koi-red">{state.error}</p>}

      <div className="grid grid-cols-1 items-start gap-6 pb-10 pt-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Everyone in your household" className="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-3">
            {members.map((m, i) => {
              const on = editing?.memberId === m.memberId;
              const saves = state.versions[m.memberId] ?? [];
              return (
                <div key={m.memberId} data-person className={`relative flex min-h-[148px] flex-col justify-between gap-3 rounded-[24px] border p-4 transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-bg" : "border-koi-forest/10 bg-white text-koi-ink hover:border-koi-forest/30"}`}>
                  <button type="button" onClick={() => setEditing(on ? null : m)} aria-pressed={on} aria-label={`Edit ${m.label}`} className="absolute inset-0 rounded-[24px]" />
                  <span className="pointer-events-none flex items-center gap-3">
                    <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full font-koi-num text-[13px] font-bold ${on ? "bg-koi-lime text-koi-forest" : "bg-koi-tint text-koi-forest"}`}>{initialsOf(m.label || `P${i + 1}`)}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="text-[17px] font-bold leading-tight">{m.label}</span>
                      {m.relation && <span className="text-[13px] opacity-70">{m.relation}</span>}
                      {m.is_account_holder && <span className="rounded-full bg-koi-lime px-1.5 py-px font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-koi-forest">You</span>}
                    </span>
                  </span>
                  <span className="pointer-events-none text-[13px] leading-snug opacity-90">{profileSummary(m)}</span>
                  {m.avoids.length > 0 && (
                    <span className={`pointer-events-none text-[12.5px] font-semibold leading-snug ${on ? "text-koi-lime" : "text-koi-warm-ink"}`}>
                      {m.avoids.map((a) => `${FOODS_AVOID.find((x) => x.key === a.key)?.label ?? a.key} (${SEVERITIES.find((s) => s.key === a.severity)?.label.toLowerCase() ?? a.severity})`).join(", ")}
                    </span>
                  )}
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="pointer-events-none font-koi-mono text-[10px] uppercase tracking-[0.1em] opacity-60">
                      {saves.length > 1 ? `Saved ${saves.length} times · ${when(saves[0].changed_at)}` : `Saved ${when(saves[0]?.changed_at)}`}
                    </span>
                    {removing === m.memberId ? (
                      <span className="flex items-center gap-2 text-[12px]">
                        <button type="button" onClick={() => remove(m.memberId)} className="font-semibold text-koi-red">Remove {m.label}</button>
                        <button type="button" onClick={() => setRemoving(null)} className="opacity-70">Keep</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setRemoving(m.memberId)} className="grid size-8 place-items-center rounded-full opacity-60 hover:opacity-100" aria-label={`Remove ${m.label}`}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            <button data-person type="button" onClick={() => setEditing({ ...blankProfile(), label: members.length ? "" : "Me", is_account_holder: !members.length })}
                    className={`flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed p-4 text-sm font-semibold text-koi-forest transition-colors hover:bg-white ${editingNew ? "border-koi-forest bg-white" : "border-koi-forest/25"}`}>
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-koi-tint"><Plus className="size-4" /></span>
              Add someone
            </button>
          </section>

          {editing && (
            <MemberEditor key={editing.memberId ?? "new"} initial={editing} householdId={householdId} ensureHousehold={ensureHousehold} userId={state.user.id}
                          anotherHolder={Boolean(holder && holder.memberId !== editing.memberId)} onCancel={() => setEditing(null)} onSaved={reload} />
          )}

          {householdId && (
            <PhraseLog on={state.household?.log_failed_phrases} busy={keepOutBusy}
                       misses={[...(state.household?.followup_miss ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))}
                       onToggle={togglePhraseLog} onForget={forgetPhrases} />
          )}

          {householdId && (
            <KitchenRules household={state.household} pantry={state.household?.household_pantry ?? []} brands={brands} knownProcessing={knownProcessing} busy={keepOutBusy}
                          onSaveHousehold={saveKitchen} onAddPantry={addPantry} onRemovePantry={removePantry} />
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
          {refusedAllergens.length > 0 ? (
            <section aria-label="Keep out of the house" className="flex flex-col gap-3 rounded-[24px] border border-koi-forest/10 bg-white p-5">
              <span className="text-[17px] font-bold">Keep out of the house</span>
              <p className="m-0 text-[13px] leading-normal text-koi-ink2">
                Normally a product one person can’t eat is still bought for the others. For a serious allergy, switch it on
                and nothing containing it is bought for anyone.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {refusedAllergens.map(({ entry, who }) => {
                  const on = keepOut.includes(entry.key);
                  return (
                    <button key={entry.key} type="button" aria-pressed={on} disabled={keepOutBusy} onClick={() => toggleKeepOut(entry.key)}
                            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${on ? "border-koi-red bg-koi-red text-white" : "border-koi-forest/15 bg-white text-koi-ink"}`}>
                      {entry.emoji} {entry.label} <span className={on ? "text-white/80" : "text-koi-muted"}>({who.join(", ")})</span>{on ? " · kept out" : ""}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-2 rounded-[24px] border border-koi-forest/10 bg-white p-5">
              <span className="text-[17px] font-bold">Keep out of the house</span>
              <p className="m-0 text-[13px] leading-normal text-koi-ink2">When someone here has a serious allergy, you can keep it out of every basket, not only theirs. Mark the allergy on their profile first.</p>
            </section>
          )}
          <section className="flex flex-col gap-3 rounded-[24px] bg-koi-forest p-5 text-koi-bg">
            <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-lime">Only you can see this</span>
            <p className="m-0 text-[13.5px] leading-relaxed text-koi-bg/85">Labels, never names. No weight or height for anyone under 19. Plans read your household and never change it.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
