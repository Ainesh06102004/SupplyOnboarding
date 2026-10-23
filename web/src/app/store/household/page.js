"use client";

// ============================================================================
// /store/household — who the household is, kept
//
// Plan §9.10.2 (A). Every member has a permanent profile the owner edits here:
// who they are (a label, never a name), what they must never be given and how
// strictly, their diet, an adult's goal and daily numbers, and how they eat.
// The planner reads these and never rewrites them. This page is where the
// WHOLE dietary profile lives; the Plan's You step only changes this week.
//
// Layout (approved canvas, 23 Oct 2026): everyone in a rail on the left, the
// person picked open beside it, in four parts (About · Food · Numbers · How
// they eat), and what holds for the whole house underneath. Numbers come two
// ways: Simple (a goal; KOI suggests calories and protein) or Advanced (their
// own calories, protein, carbs and fat, OwnNumbers). Edits are a draft per
// person until saved, so moving between people loses nothing.
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
import OwnNumbers, { startingNumbers } from "@/components/store/plan/design/OwnNumbers";
import { inr } from "@/components/store/plan/design/tokens";
import { Plus, Loader2, Trash2, UserRound } from "lucide-react";
import { initialsOf } from "@/components/store/system/tokens";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLoginUi } from "@/store/loginUiStore";
import { loadGoalProfile } from "@/lib/supabase/goalProfileService";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { AGE_BANDS } from "@/lib/planner/brief";
import { goalsAllowed, ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";
import { dailyFigures } from "@/lib/plan/projection";
import { withSuggestedTargets } from "@/lib/household/save";
import {
  blankProfile, profileFromRow, memberPayload, avoidsPayload, profileProblems, profileSummary,
  severitiesFor, defaultSeverityFor, fromGoalSetup, ACTIVITY_LEVELS, MEALS_FROM_HOME, APPETITES, SPICE_TOLERANCES, SEVERITIES,
} from "@/lib/household/profile";

const INPUT = "mt-1.5 h-12 w-full rounded-2xl border border-koi-forest/15 bg-koi-paper px-3.5 text-[15px] outline-none focus:border-koi-forest focus:bg-white";
const LABEL = "text-[13px] font-semibold text-koi-ink";
const HINT = "mt-1.5 block text-[12.5px] leading-snug text-koi-muted";
const EYEBROW = "font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-muted";
const HARD_ALLERGENS = FOODS_AVOID.filter((a) => a.mode === "hard" && a.kind === "allergen");
const PARTS = Object.freeze([
  { id: "about", label: "About" },
  { id: "food", label: "Food" },
  { id: "numbers", label: "Numbers" },
  { id: "eating", label: "How they eat" },
]);

// Every member column: a save sends all four targets (exact macros), so a read that
// skipped carbs or fat would write them back as nothing.
const MEMBER_FIELDS = "*, household_member_avoid(avoid_key, severity)";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const isNum = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
const NEW = "new";

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

/** Which fields a draft changed from what was saved. */
const changedFields = (form, saved) => Object.keys(form).filter((k) => JSON.stringify(form[k]) !== JSON.stringify(saved?.[k]));

function Choice({ options, value, onChange, name, tone = "light" }) {
  const off = tone === "dark" ? "border-koi-bg/25 text-koi-bg hover:border-koi-bg/60" : "border-koi-forest/15 bg-white text-koi-ink hover:border-koi-forest/40";
  const on = tone === "dark" ? "border-koi-lime bg-koi-lime text-koi-forest" : "border-koi-forest bg-koi-forest text-koi-lime";
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
                className={`h-10 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors ${value === o.key ? on : off}`}>
          {o.emoji ? `${o.emoji} ` : ""}{o.label}
        </button>
      ))}
    </div>
  );
}

function Part({ id, title, hint, children }) {
  return (
    <section id={`hh-${id}`} aria-labelledby={`hh-${id}-title`} className="flex scroll-mt-[calc(var(--koi-header-h)+20px)] flex-col gap-4 border-t border-koi-forest/10 pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h3 id={`hh-${id}-title`} className="m-0 font-koi-display text-[22px] font-extrabold leading-tight text-koi-forest">{title}</h3>
        {hint && <p className="m-0 text-[13.5px] leading-snug text-koi-ink2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Numbers: Simple (a goal; KOI suggests) or Advanced (their own four). Adults only. */
function Numbers({ form, set, adult }) {
  const figures = dailyFigures(form);
  const [advanced, setAdvanced] = useState(() => adult && form.target_source === "stated" && (isNum(form.target_carbs_g) || isNum(form.target_fat_g)));
  const stated = form.target_source === "stated";

  const toAdvanced = () => {
    setAdvanced(true);
    if (!isNum(form.target_carbs_g) || !isNum(form.target_fat_g)) {
      const base = figures ?? { kcal: Number(form.target_kcal) || 2000, protein: Number(form.target_protein_g) || 60 };
      set(startingNumbers(stated && isNum(form.target_kcal) ? { kcal: Number(form.target_kcal), protein: Number(form.target_protein_g) || base.protein } : base));
    }
  };
  const toSimple = () => {
    setAdvanced(false);
    // Back to KOI's suggestion: carbs and fat go, calories and protein follow the goal again.
    set(withSuggestedTargets({ ...form, target_source: "suggested_pending" }), true);
  };

  if (!adult) {
    return (
      <div className="flex flex-col gap-3 rounded-[24px] bg-koi-forest p-5 text-koi-bg">
        <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-lime">Planned to their age</span>
        {figures && (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span><span className="font-koi-num text-[30px] font-semibold">{inr(figures.kcal)}</span> <span className="text-[13px] text-koi-bg/75">kcal a day</span></span>
            <span><span className="font-koi-num text-[30px] font-semibold">{inr(figures.protein)}</span> <span className="text-[13px] text-koi-bg/75">g protein</span></span>
          </span>
        )}
        <p className="m-0 text-[13px] leading-relaxed text-koi-bg/80">
          Children and teenagers are planned for their age&apos;s needs (ICMR-NIN 2020). KOI sets no weight goal, diet
          pattern or macros for anyone under 19, and keeps no weight or height for them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="How to set their numbers" className="grid grid-cols-2 gap-1 self-start rounded-full bg-koi-paper p-1 ring-1 ring-inset ring-koi-forest/10">
        <button type="button" role="radio" aria-checked={!advanced} onClick={() => advanced && toSimple()} className={`flex h-11 flex-col items-center justify-center rounded-full px-5 text-[14px] font-bold transition-colors ${advanced ? "text-koi-ink2 hover:text-koi-ink" : "bg-koi-forest text-koi-lime"}`}>Simple</button>
        <button type="button" role="radio" aria-checked={advanced} onClick={() => !advanced && toAdvanced()} className={`flex h-11 flex-col items-center justify-center rounded-full px-5 text-[14px] font-bold transition-colors ${advanced ? "bg-koi-forest text-koi-lime" : "text-koi-ink2 hover:text-koi-ink"}`}>Advanced</button>
      </div>
      <p className="m-0 -mt-1 text-[13px] text-koi-ink2">
        {advanced ? "Their own calories, protein, carbs and fat, from a coach or an app. Every planned day lands within the tolerance." : "Pick a goal and KOI works out calories and protein. Carbs and fat are balanced by the planner."}
      </p>

      {!advanced && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <span className={LABEL}>Goal</span>
              <Choice name="Weight goal" options={ENERGY_GOALS} value={form.energy_goal} onChange={(energy_goal) => set({ energy_goal })} />
            </div>
            <div>
              <span className={LABEL}>Way of eating</span>
              <Choice name="Way of eating" options={EATING_PATTERNS} value={form.eating_pattern} onChange={(eating_pattern) => set({ eating_pattern })} />
            </div>
          </div>
          <div>
            <span className={LABEL}>How active</span>
            <Choice name="How active" options={ACTIVITY_LEVELS} value={form.activity_level} onChange={(activity_level) => set({ activity_level: form.activity_level === activity_level ? "" : activity_level })} />
          </div>
          {["keto", "low_carb"].includes(form.eating_pattern) && (
            <p className="m-0 text-[12.5px] text-koi-muted">
              {form.eating_pattern === "keto" ? "Keto" : "Low carb"}: plans keep them under {form.eating_pattern === "keto" ? 50 : 130} g of carbohydrate a day, and leave out anything whose carbohydrate isn&apos;t declared.
            </p>
          )}
        </>
      )}

      <div className="flex flex-col gap-4 rounded-[24px] bg-koi-forest p-5 text-koi-bg">
        {advanced ? (
          <OwnNumbers person={form} figures={figures} onEdit={set} />
        ) : stated && (isNum(form.target_kcal) || isNum(form.target_protein_g)) ? (
          <>
            <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-lime">Their own calories and protein</span>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 rounded-2xl bg-koi-lime p-4 text-koi-forest">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-forest/75">Calories</span>
                <span className="flex items-baseline gap-1.5"><input type="number" inputMode="numeric" value={form.target_kcal} onChange={(e) => set({ target_kcal: e.target.value.slice(0, 5), target_source: "stated" })} className="w-full min-w-0 border-0 border-b-2 border-koi-forest/35 bg-transparent p-0 font-koi-num text-[30px] font-semibold leading-none outline-none focus:border-koi-forest" /><span className="text-[13px]">kcal</span></span>
              </label>
              <label className="flex flex-col gap-1 rounded-2xl bg-koi-bg/10 p-4">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-bg/70">Protein</span>
                <span className="flex items-baseline gap-1.5"><input type="number" inputMode="numeric" value={form.target_protein_g} onChange={(e) => set({ target_protein_g: e.target.value.slice(0, 4), target_source: "stated" })} className="w-full min-w-0 border-0 border-b-2 border-koi-bg/30 bg-transparent p-0 font-koi-num text-[30px] font-semibold leading-none text-koi-bg outline-none focus:border-koi-lime" /><span className="text-[13px] text-koi-bg/75">g</span></span>
              </label>
            </div>
            {figures?.suggested && (
              <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-koi-bg/80">
                KOI would suggest {inr(figures.suggested.kcal)} kcal and {inr(figures.suggested.protein)} g protein.
                <button type="button" onClick={toSimple} className="h-9 rounded-full bg-koi-bg/10 px-3.5 font-semibold text-koi-lime hover:bg-koi-bg/20">Use KOI&apos;s suggestion</button>
              </p>
            )}
          </>
        ) : figures?.suggested ? (
          <>
            <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-lime">KOI suggests</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <span className="flex flex-col gap-1 rounded-2xl bg-koi-lime p-4 text-koi-forest">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-forest/75">Calories</span>
                <span className="font-koi-num text-[32px] font-semibold leading-none">{inr(figures.suggested.kcal)}</span>
                <span className="text-[12px]">kcal a day</span>
              </span>
              <span className="flex flex-col gap-1 rounded-2xl bg-koi-bg/10 p-4">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-bg/70">Protein</span>
                <span className="font-koi-num text-[32px] font-semibold leading-none">{inr(figures.suggested.protein)}</span>
                <span className="text-[12px] text-koi-bg/70">g a day</span>
              </span>
              <span className="flex flex-col gap-1 rounded-2xl bg-koi-bg/10 p-4">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-bg/70">Maintenance</span>
                <span className="font-koi-num text-[32px] font-semibold leading-none">{figures.maintenance ? inr(figures.maintenance) : "—"}</span>
                <span className="text-[12px] text-koi-bg/70">{figures.gap ? (figures.gap > 0 ? `a ${inr(figures.gap)} kcal deficit` : `a ${inr(-figures.gap)} kcal surplus`) : "kcal a day"}</span>
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {figures.suggested.basis.map((b) => <li key={b} className="flex gap-2 text-[13px] leading-snug text-koi-bg/80"><span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-koi-lime" />{b}</li>)}
            </ul>
            <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-koi-bg/80">
              A typical person&apos;s needs, not advice for this person.
              <button type="button" onClick={() => set({ target_kcal: String(figures.suggested.kcal), target_protein_g: String(Math.round(figures.suggested.protein)), target_source: "stated" })} className="h-9 rounded-full bg-koi-bg/10 px-3.5 font-semibold text-koi-lime hover:bg-koi-bg/20">Set my own calories and protein</button>
            </p>
          </>
        ) : (
          <p className="m-0 text-[13.5px] text-koi-bg/80">Add their age, height and weight in About and KOI can suggest their numbers.</p>
        )}
      </div>
    </div>
  );
}

function MemberEditor({ form, saved, onChange, onDiscard, onSaved, onRemove, householdId, ensureHousehold, userId, anotherHolder, index }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [setupNote, setSetupNote] = useState(null);
  const [removing, setRemoving] = useState(false);
  /** A patch to the draft. `whole` replaces it (a computed form, like going back to KOI's numbers). */
  const set = (patch, whole = false) => onChange(whole ? patch : { ...form, ...patch });
  const adult = goalsAllowed(form.age_band);
  const problems = profileProblems(form.target_source === "stated" ? form : withSuggestedTargets(form));
  const changes = saved ? changedFields(form, saved).length : 1;
  const who = form.label || "this person";

  const toggleAvoid = (key) => set({
    avoids: form.avoids.some((a) => a.key === key)
      ? form.avoids.filter((a) => a.key !== key)
      : [...form.avoids, { key, severity: defaultSeverityFor(key) }],
  });
  const setSeverity = (key, severity) => set({ avoids: form.avoids.map((a) => (a.key === key ? { ...a, severity } : a)) });
  const toggleMeal = (key) => set({
    meals_from_home: form.meals_from_home.includes(key) ? form.meals_from_home.filter((k) => k !== key) : [...form.meals_from_home, key],
  });
  const setBand = (age_band) => set(goalsAllowed(age_band)
    ? { age_band }
    : { age_band, age_years: "", weight_kg: "", height_cm: "", target_weight_kg: "", energy_goal: "maintain", eating_pattern: "balanced", target_carbs_g: "", target_fat_g: "", carb_cycling: false });
  const jump = (id) => document.getElementById(`hh-${id}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

  async function fillFromGoalSetup() {
    setSetupNote(null);
    try {
      const setup = await loadGoalProfile(userId);
      if (!setup) {
        setSetupNote("You haven't set up your goal yet, so there is nothing to fill from.");
        return;
      }
      onChange(fromGoalSetup(form, setup));
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
      // Simple numbers follow the goal: KOI's suggestion is worked out again at the moment of saving.
      const final = form.target_source === "stated" ? form : withSuggestedTargets(form);
      const { error: saveError } = await supabase.rpc("save_household_member", {
        p_household_id: id,
        p_member: memberPayload(final),
        p_avoids: avoidsPayload(final),
      });
      if (saveError) throw saveError;
      await onSaved(form.memberId);
    } catch (err) {
      setError(err?.message ?? "It could not be saved.");
      setSaving(false);
    }
  }

  return (
    <article aria-label={form.memberId ? `${who}'s profile` : "Someone new"} className="flex min-w-0 flex-col rounded-[28px] border border-koi-forest/10 bg-white shadow-[0_30px_60px_-50px_rgba(8,61,45,.5)]">
      <header className="flex flex-col gap-4 border-b border-koi-forest/10 p-6 pb-4">
        <div className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-koi-forest font-koi-num text-[17px] font-bold text-koi-lime">{initialsOf(form.label || `P${index + 1}`)}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 font-koi-display text-[28px] font-extrabold leading-tight text-koi-forest">{form.memberId ? who : "Someone new"}</h2>
              {form.is_account_holder && <span className="rounded-full bg-koi-lime px-2 py-0.5 font-koi-mono text-[10px] font-bold uppercase tracking-[0.08em] text-koi-forest">You</span>}
            </span>
            <span className="text-[13.5px] text-koi-ink2">{profileSummary(form) || "Fill in the parts below."}</span>
          </span>
          {form.memberId && (removing ? (
            <span className="flex items-center gap-2 text-[13px]">
              <button type="button" onClick={() => onRemove(form.memberId)} className="h-10 rounded-full bg-koi-red px-4 font-semibold text-white">Remove {who}</button>
              <button type="button" onClick={() => setRemoving(false)} className="h-10 rounded-full px-3 font-semibold text-koi-ink2">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setRemoving(true)} aria-label={`Remove ${who}`} className="grid size-10 place-items-center rounded-full text-koi-muted hover:bg-koi-paper hover:text-koi-red"><Trash2 className="size-4" /></button>
          ))}
        </div>
        <nav aria-label="Parts of the profile" className="flex flex-wrap gap-1.5">
          {PARTS.map((p) => <button key={p.id} type="button" onClick={() => jump(p.id)} className="h-9 shrink-0 rounded-full bg-koi-paper px-3.5 text-[13px] font-semibold text-koi-ink2 hover:bg-koi-tint hover:text-koi-forest">{p.label}</button>)}
        </nav>
      </header>

      <div className="flex flex-col gap-6 p-6">
        <Part id="about" title="About" hint="A label, never a name: KOI stores no names.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className={LABEL}>What to call them</span>
              <input id="profile-label" value={form.label} onChange={(e) => set({ label: e.target.value.slice(0, 40) })} placeholder="Me, Wife, Kid 1" className={INPUT} />
            </label>
            <label className="block">
              <span className={LABEL}>Relation (optional)</span>
              <input id="profile-relation" value={form.relation} onChange={(e) => set({ relation: e.target.value })} placeholder="wife, son, mother" className={INPUT} />
            </label>
          </div>
          <div>
            {/* "Age group", not "Age": the exact age below is a different question. */}
            <span className={LABEL}>Age group</span>
            <Choice name="Age group" options={AGE_BANDS} value={form.age_band} onChange={setBand} />
          </div>
          <div>
            <span className={LABEL}>Sex (optional, only to estimate needs)</span>
            <Choice name="Sex" options={[{ key: "female", label: "Female" }, { key: "male", label: "Male" }, { key: "unspecified", label: "Prefer not to say" }]} value={form.sex} onChange={(sex) => set({ sex: form.sex === sex ? "" : sex })} />
          </div>
          {adult && (
            <>
              <div className="grid grid-cols-3 gap-3">
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
              <p className="m-0 -mt-2 text-[12.5px] text-koi-muted">Optional, and only used to estimate their needs. If this is someone else, add these with their agreement. KOI keeps none of it for anyone under 19.</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-10 items-center gap-2 text-[14px] font-semibold text-koi-ink">
                  <input id="profile-is-me" type="checkbox" className="size-[18px] accent-koi-forest" checked={form.is_account_holder} disabled={anotherHolder && !form.is_account_holder}
                         onChange={(e) => set({ is_account_holder: e.target.checked })} />
                  This is me
                </label>
                {anotherHolder && !form.is_account_holder && <span className="text-[12px] text-koi-muted">Someone else in the household is already you.</span>}
                {form.is_account_holder && (
                  <button type="button" onClick={fillFromGoalSetup} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-koi-forest/15 px-3.5 text-[13px] font-semibold text-koi-ink">
                    <UserRound className="size-4" /> Fill from my goal setup
                  </button>
                )}
                {setupNote && <span className="text-[12px] text-koi-muted">{setupNote}</span>}
              </div>
            </>
          )}
        </Part>

        <Part id="food" title="Food" hint="What they eat, and what must never reach their plate.">
          <div>
            <span className={LABEL}>Diet</span>
            {/* Fasting is a diet for one plan, never a saved profile: the column refuses it (00056). */}
            <Choice name="Diet" options={DIET_TYPES.filter((d) => !d.forOnePlanOnly)} value={form.diet_type} onChange={(diet_type) => set({ diet_type })} />
          </div>
          <div>
            <span className={LABEL}>What they avoid</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FOODS_AVOID.map((a) => {
                const on = form.avoids.some((x) => x.key === a.key);
                return (
                  <button key={a.key} type="button" aria-pressed={on} onClick={() => toggleAvoid(a.key)}
                          className={`h-10 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors ${on ? "border-koi-warm bg-koi-warm-bg text-koi-warm-ink" : "border-koi-forest/15 bg-white text-koi-ink hover:border-koi-forest/40"}`}>
                    {a.emoji} {a.label}
                  </button>
                );
              })}
            </div>
          </div>
          {form.avoids.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl bg-koi-paper p-4">
              <span className={EYEBROW}>How strictly</span>
              {form.avoids.map((a) => {
                const entry = FOODS_AVOID.find((x) => x.key === a.key);
                return (
                  <div key={a.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-[9rem] text-[14px] font-bold">{entry?.emoji} {entry?.label ?? a.key}</span>
                    <Choice name={`How strictly: ${entry?.label ?? a.key}`} options={severitiesFor(a.key)} value={a.severity} onChange={(severity) => setSeverity(a.key, severity)} />
                  </div>
                );
              })}
              <p className="m-0 text-[12px] text-koi-muted">
                {SEVERITIES.map((s) => `${s.label}: ${s.hint.toLowerCase()}`).join(" · ")}. Anything but a dislike is never given to them.
              </p>
            </div>
          )}
          <div>
            <span className={LABEL}>Spice</span>
            <Choice name="Spice" options={SPICE_TOLERANCES} value={form.spice_tolerance} onChange={(spice) => set({ spice_tolerance: form.spice_tolerance === spice ? "" : spice })} />
            <span className={HINT}>&ldquo;No spice&rdquo; keeps spicy food off their plate; &ldquo;Mild&rdquo; only leaves it for last.</span>
          </div>
        </Part>

        <Part id="numbers" title="Numbers" hint={adult ? "What a day should add up to for them. Plans are portioned to it." : null}>
          <Numbers key={adult ? "adult" : "child"} form={form} set={set} adult={adult} />
        </Part>

        <Part id="eating" title="How they eat" hint="Meals and appetite size the packs.">
          <div>
            <span className={LABEL}>Meals from home</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MEALS_FROM_HOME.map((meal) => {
                const on = form.meals_from_home.includes(meal.key);
                return (
                  <button key={meal.key} type="button" aria-pressed={on} onClick={() => toggleMeal(meal.key)}
                          className={`h-10 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors ${on ? "border-koi-forest bg-koi-tint text-koi-forest" : "border-koi-forest/15 bg-white text-koi-muted hover:border-koi-forest/40"}`}>
                    {on ? "✓ " : ""}{meal.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className={LABEL}>Appetite</span>
            <Choice name="Appetite" options={APPETITES} value={form.appetite} onChange={(appetite) => set({ appetite: form.appetite === appetite ? "" : appetite })} />
          </div>
        </Part>
      </div>

      {/* The save bar stays in view above the KOI bar while there is anything to save. */}
      {changes > 0 && (
        <div className="sticky bottom-[calc(var(--koi-bottom-chrome)+92px)] z-10 mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-koi-forest px-5 py-3 text-koi-bg shadow-[0_18px_40px_-18px_rgba(8,61,45,.7)]">
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-bold">{form.memberId ? `${changes} change${changes === 1 ? "" : "s"} not saved yet` : "Not saved yet"}</span>
            {(problems[0] || error) && <span role={error ? "alert" : undefined} className="text-[12.5px] text-koi-lime">{error ?? problems[0]}</span>}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={onDiscard} className="h-11 rounded-full px-4 text-[14px] font-semibold text-koi-bg/85 hover:text-koi-bg">Discard</button>
            <button type="button" onClick={save} disabled={saving || problems.length > 0}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-koi-lime px-5 text-[14px] font-bold text-koi-forest disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {saving ? "Saving…" : `Save ${form.label ? `${form.label}'s` : "their"} profile`}
            </button>
          </span>
        </div>
      )}
    </article>
  );
}

export default function HouseholdPage() {
  const root = useRef(null);
  const editorRef = useRef(null);
  const say = useKoiVoice((v) => v.say);
  const [state, setState] = useState({ loading: true });
  const [picked, setPicked] = useState(null);
  // Edits per person, until saved or discarded: moving between people keeps them.
  const [drafts, setDrafts] = useState({});
  const [discards, setDiscards] = useState(0);
  const [keepOutBusy, setKeepOutBusy] = useState(false);

  const show = useCallback((result) => setState({ loading: false, ...result }), []);

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
  const holder = members.find((m) => m.is_account_holder);
  // Who is open: the one picked, else you, else the first; with nobody yet, someone new.
  const openId = picked && (picked === NEW || members.some((m) => m.memberId === picked)) ? picked : (holder ?? members[0])?.memberId ?? NEW;
  const savedOf = (id) => (id === NEW ? null : members.find((m) => m.memberId === id) ?? null);
  const blankFor = () => ({ ...blankProfile(), label: members.length ? "" : "Me", is_account_holder: !members.length });
  const form = drafts[openId] ?? savedOf(openId) ?? blankFor();
  const isDirty = (id) => Boolean(drafts[id]) && (id === NEW || changedFields(drafts[id], savedOf(id)).length > 0);

  const reload = useCallback(async () => show(await readHousehold()), [show]);

  // The page deals in once the household is read; KOI says what this page is.
  const signedIn = Boolean(!state.loading && state.user);
  useGSAP(() => {
    if (!signedIn) return;
    say("Everyone you shop for, each with their whole profile. Plans read this and never change it.");
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (sel) => root.current?.querySelectorAll(sel) ?? [];
    gsap.from(q("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal });
    gsap.from(q("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08, ease: E.reveal, delay: 0.1 });
    gsap.from(q("[data-person]"), { autoAlpha: 0, x: -18, duration: 0.7, stagger: 0.06, ease: E.dolly, delay: 0.2, clearProps: "opacity,visibility,transform" });
    gsap.from(q("[data-editor]"), { autoAlpha: 0, y: 26, duration: 0.85, ease: E.dolly, delay: 0.3, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [signedIn] });

  // The brands on the shelf, so a brand rule can be typed with the shop's own spelling.
  const [brands, setBrands] = useState([]);
  // How many products KOI knows the processing of: the processing rule says so.
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

  /** Open someone: on a phone the editor is below the list, so it comes into view. */
  const pick = (id) => {
    setPicked(id);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 64 || top > window.innerHeight * 0.45) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    });
  };

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
    if (error) { show({ ...state, error: "They could not be removed." }); return; }
    setDrafts(({ [memberId]: _gone, ...rest }) => rest);
    setPicked(null);
    await reload();
  }

  const onSaved = async (memberId) => {
    const before = new Set(members.map((m) => m.memberId));
    const result = await readHousehold();
    show(result);
    setDrafts(({ [memberId ?? NEW]: _done, ...rest }) => rest);
    // Someone new opens as themselves once they exist.
    if (!memberId) setPicked(result.members.map((r) => r.id).find((id) => !before.has(id)) ?? null);
    say(`Saved. The next plan reads ${memberId ? "the change" : "them"}.`);
  };

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

  const diets = [...new Set(members.map((m) => DIET_TYPES.find((d) => d.key === m.diet_type)?.label).filter(Boolean))];
  const avoidsAll = [...new Set(members.flatMap((m) => m.avoids.filter((a) => a.severity !== "dislike").map((a) => FOODS_AVOID.find((x) => x.key === a.key)?.label ?? a.key)))];

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
          <p data-rise className="m-0 max-w-[640px] text-base leading-relaxed text-koi-ink2">Everyone you shop for, each with their whole profile: food rules, numbers and how they eat. Plans read this and never change it. Only you can see it.</p>
        </div>
        <div data-rise className="flex flex-wrap gap-2">
          <Link href="/store/plan" className="flex h-11 items-center gap-2 rounded-full bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline">Plan the week <span aria-hidden="true">→</span></Link>
          <Link href="/store/profile/data" className="flex h-11 items-center rounded-full border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-white">What KOI keeps</Link>
        </div>
      </section>
      {state.error && <p role="alert" className="m-0 mt-3 text-[13px] text-koi-red">{state.error}</p>}

      <div className="grid grid-cols-1 items-start gap-6 pt-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside aria-label="Everyone in your household" className="flex min-w-0 flex-col gap-2.5 lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
          <span className={`${EYEBROW} px-1`}>{members.length} {members.length === 1 ? "person" : "people"}</span>
          {members.map((m, i) => {
            const on = openId === m.memberId;
            const shown = drafts[m.memberId] ?? m;
            const saves = state.versions[m.memberId] ?? [];
            return (
              <button key={m.memberId} data-person type="button" onClick={() => pick(m.memberId)} aria-current={on ? "true" : undefined}
                      className={`flex w-full items-start gap-3 rounded-[22px] border p-3.5 text-left transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-bg" : "border-koi-forest/10 bg-white text-koi-ink hover:border-koi-forest/35"}`}>
                <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full font-koi-num text-[13px] font-bold ${on ? "bg-koi-lime text-koi-forest" : "bg-koi-tint text-koi-forest"}`}>{initialsOf(shown.label || `P${i + 1}`)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-[16px] font-bold leading-tight">{shown.label}</span>
                    {shown.relation && <span className="text-[12.5px] opacity-70">{shown.relation}</span>}
                    {shown.is_account_holder && <span className={`rounded-full px-1.5 py-px font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${on ? "bg-koi-lime text-koi-forest" : "bg-koi-lime text-koi-forest"}`}>You</span>}
                    {isDirty(m.memberId) && <span className={`rounded-full px-1.5 py-px font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.08em] ${on ? "bg-koi-bg/15 text-koi-lime" : "bg-koi-warm-bg text-koi-warm-ink"}`}>Unsaved</span>}
                  </span>
                  <span className="text-[12.5px] leading-snug opacity-85">{profileSummary(shown)}</span>
                  {shown.avoids.length > 0 && (
                    <span className={`text-[12px] font-semibold leading-snug ${on ? "text-koi-lime" : "text-koi-warm-ink"}`}>
                      Avoids {shown.avoids.map((a) => FOODS_AVOID.find((x) => x.key === a.key)?.label ?? a.key).join(", ")}
                    </span>
                  )}
                  {saves.length > 0 && <span className="font-koi-mono text-[9.5px] uppercase tracking-[0.1em] opacity-55">Saved {when(saves[0].changed_at)}</span>}
                </span>
              </button>
            );
          })}
          <button data-person type="button" onClick={() => pick(NEW)} aria-current={openId === NEW ? "true" : undefined}
                  className={`flex h-14 items-center justify-center gap-2 rounded-[22px] border-2 border-dashed text-[14px] font-semibold text-koi-forest transition-colors hover:bg-white ${openId === NEW ? "border-koi-forest bg-white" : "border-koi-forest/25"}`}>
            <Plus className="size-4" /> Add someone{isDirty(NEW) ? " · unsaved" : ""}
          </button>
          {members.length > 0 && (
            <a href="#hh-house" className="mt-1 flex flex-col gap-1 rounded-[22px] bg-koi-tint p-4 text-koi-ink no-underline hover:bg-koi-tint-border/60">
              <span className={EYEBROW}>For the whole house</span>
              <span className="text-[13.5px] font-semibold">{diets.join(" · ")}</span>
              <span className="text-[12.5px] text-koi-ink2">{avoidsAll.length ? `Never for whoever avoids it: ${avoidsAll.join(", ")}` : "No allergies or rules yet"}{keepOut.length ? ` · ${keepOut.length} kept out of the house` : ""}</span>
              <span className="text-[12.5px] font-semibold text-koi-primary">Kitchen rules ↓</span>
            </a>
          )}
        </aside>

        <div ref={editorRef} data-editor className="min-w-0 scroll-mt-[calc(var(--koi-header-h)+16px)]">
          <MemberEditor
            key={`${openId}:${discards}`}
            form={form}
            saved={savedOf(openId)}
            index={Math.max(0, members.findIndex((m) => m.memberId === openId))}
            onChange={(next) => setDrafts((d) => ({ ...d, [openId]: next }))}
            // A discard starts the editor again from what was saved (Simple or Advanced included).
            onDiscard={() => { setDrafts(({ [openId]: _gone, ...rest }) => rest); setDiscards((n) => n + 1); }}
            onSaved={onSaved}
            onRemove={remove}
            householdId={householdId}
            ensureHousehold={ensureHousehold}
            userId={state.user.id}
            anotherHolder={Boolean(holder && holder.memberId !== form.memberId)}
          />
        </div>
      </div>

      <section id="hh-house" aria-labelledby="hh-house-title" className="flex scroll-mt-[calc(var(--koi-header-h)+20px)] flex-col gap-5 pb-10 pt-12">
        <div className="flex flex-col gap-1">
          <span className={EYEBROW}>For the whole house</span>
          <h2 id="hh-house-title" className="koi-condensed m-0 font-koi-display text-[clamp(32px,3.4vw,44px)] font-extrabold leading-none tracking-[-0.02em] text-koi-forest">Kitchen rules</h2>
          <p className="m-0 max-w-[640px] text-[14.5px] text-koi-ink2">What holds for everyone: what never comes into the house, brands, the cupboard, and how KOI shops.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
          {refusedAllergens.length > 0 ? (
            <section aria-label="Keep out of the house" className="flex flex-col gap-3 rounded-[24px] border border-koi-forest/10 bg-white p-5">
              <span className="text-[17px] font-bold">Keep out of the house</span>
              <p className="m-0 text-[13.5px] leading-normal text-koi-ink2">
                Normally a product one person can’t eat is still bought for the others. For a serious allergy, switch it on
                and nothing containing it is bought for anyone.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {refusedAllergens.map(({ entry, who }) => {
                  const on = keepOut.includes(entry.key);
                  return (
                    <button key={entry.key} type="button" aria-pressed={on} disabled={keepOutBusy} onClick={() => toggleKeepOut(entry.key)}
                            className={`h-10 rounded-full border px-3.5 text-[13px] font-semibold disabled:opacity-50 ${on ? "border-koi-red bg-koi-red text-white" : "border-koi-forest/15 bg-white text-koi-ink"}`}>
                      {entry.emoji} {entry.label} <span className={on ? "text-white/80" : "text-koi-muted"}>({who.join(", ")})</span>{on ? " · kept out" : ""}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-2 rounded-[24px] border border-koi-forest/10 bg-white p-5">
              <span className="text-[17px] font-bold">Keep out of the house</span>
              <p className="m-0 text-[13.5px] leading-normal text-koi-ink2">When someone here has a serious allergy, you can keep it out of every basket, not only theirs. Mark the allergy in their Food first.</p>
            </section>
          )}
          <section className="flex flex-col gap-3 rounded-[24px] bg-koi-forest p-5 text-koi-bg">
            <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-lime">Only you can see this</span>
            <p className="m-0 text-[13.5px] leading-relaxed text-koi-bg/85">Labels, never names. No weight or height for anyone under 19. Plans read your household and never change it.</p>
          </section>
        </div>
        {householdId && (
          <KitchenRules household={state.household} pantry={state.household?.household_pantry ?? []} brands={brands} knownProcessing={knownProcessing} busy={keepOutBusy}
                        onSaveHousehold={saveKitchen} onAddPantry={addPantry} onRemovePantry={removePantry} />
        )}
        {householdId && (
          <PhraseLog on={state.household?.log_failed_phrases} busy={keepOutBusy}
                     misses={[...(state.household?.followup_miss ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))}
                     onToggle={togglePhraseLog} onForget={forgetPhrases} />
        )}
      </section>
    </main>
  );
}
