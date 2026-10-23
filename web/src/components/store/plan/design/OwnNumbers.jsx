"use client";

// ============================================================================
// You · Baseline — "My own numbers" (exact macros).
//
// For someone who already follows calories and macros from a coach or an app:
// they type all four, KOI checks they add up (4/4/9) and offers to fit the
// carbs if not, and the plan is portioned to land within their tolerance every
// day. Nothing here changes a number on its own — "Fit carbs" is a button, and
// going back to KOI's suggestion is the switch above.
//
// Drawn inside the forest Baseline card (YouStep.jsx), in its tokens.
// ============================================================================

import { inr } from "./tokens";
import { macroCheck, carbCycle } from "@/lib/plan/projection";
import { toleranceOf } from "@/lib/household/profile";

const TOLERANCES = [3, 5, 10];
// Until the Calendar says which days are training days, the week has four.
const DEFAULT_TRAINING_DAYS = 4;

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

function Tile({ id, label, value, unit, hint, onChange, lime = false }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-2xl p-4 ${lime ? "bg-koi-lime text-koi-forest" : "bg-koi-bg/10"}`}>
      <label htmlFor={id} className={`font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] ${lime ? "text-koi-forest/75" : "text-koi-bg/70"}`}>{label}</label>
      <span className="flex items-baseline gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.slice(0, 5))}
          className={`w-full min-w-0 border-0 border-b-2 bg-transparent p-0 pb-0.5 font-koi-num text-[32px] font-semibold leading-none outline-none ${lime ? "border-koi-forest/35 text-koi-forest focus:border-koi-forest" : "border-koi-bg/30 text-koi-bg focus:border-koi-lime"}`}
        />
        <span className={`text-[13px] ${lime ? "font-medium" : "text-koi-bg/75"}`}>{unit}</span>
      </span>
      {hint}
    </div>
  );
}

/**
 * @param {{ person: object, figures: object, onEdit: (patch: object) => void }} props
 *   figures from lib/plan/projection.js dailyFigures(person)
 */
export default function OwnNumbers({ person, figures, onEdit }) {
  const kcal = num(person.target_kcal);
  const protein = num(person.target_protein_g);
  const carbs = num(person.target_carbs_g);
  const fat = num(person.target_fat_g);
  const all = [kcal, protein, carbs, fat].every((x) => Number.isFinite(x));
  const check = all ? macroCheck({ kcal, protein, carbs, fat }) : null;
  const weight = num(person.weight_kg);
  const perKg = (g) => (Number.isFinite(g) && weight > 0 ? `${(g / weight).toFixed(1)} g per kg` : null);
  const tolerance = toleranceOf(person);
  const cycle = person.carb_cycling && all ? carbCycle({ kcal, carbs }, DEFAULT_TRAINING_DAYS) : null;
  const gap = figures?.maintenance && Number.isFinite(kcal) ? figures.maintenance - kcal : null;
  const set = (field) => (v) => onEdit({ [field]: v, target_source: "stated" });
  const hint = (text) => (text ? <span className="text-[12px] text-koi-bg/70">{text}</span> : null);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          id="own-kcal" label="Calories" unit="kcal" lime value={person.target_kcal} onChange={set("target_kcal")}
          hint={gap ? <span className="self-start rounded-full bg-koi-forest px-2.5 py-1 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-koi-lime">{gap > 0 ? `Deficit ${inr(gap)}` : `Surplus ${inr(-gap)}`}</span> : null}
        />
        <Tile id="own-protein" label="Protein" unit="g" value={person.target_protein_g} onChange={set("target_protein_g")} hint={hint(perKg(protein))} />
        <Tile id="own-carbs" label="Carbs" unit="g" value={person.target_carbs_g} onChange={set("target_carbs_g")} hint={hint(perKg(carbs))} />
        <Tile id="own-fat" label="Fat" unit="g" value={person.target_fat_g} onChange={set("target_fat_g")} hint={hint(perKg(fat))} />
      </div>

      {check?.adds && (
        <p className="m-0 flex items-start gap-3 rounded-2xl bg-koi-mint/15 px-4 py-3.5 text-sm leading-normal">
          <svg className="mt-0.5 size-[18px] shrink-0 text-koi-mint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          <span>
            <strong>It adds up.</strong> <span className="font-koi-num">{protein} × 4 + {carbs} × 4 + {fat} × 9 = {inr(check.fromMacros)}</span> kcal,
            {" "}{check.diff === 0 ? "exactly" : `${inr(Math.abs(check.diff))} ${check.diff > 0 ? "over" : "under"}`} your {inr(kcal)}.
          </span>
        </p>
      )}
      {check && !check.adds && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-koi-warm-bg px-4 py-3.5 text-koi-warm-ink">
          <p className="m-0 text-sm leading-normal">
            <strong>These don&apos;t add up.</strong> <span className="font-koi-num">{protein} × 4 + {carbs} × 4 + {fat} × 9 = {inr(check.fromMacros)}</span> kcal,
            {" "}{inr(Math.abs(check.diff))} {check.diff > 0 ? "over" : "under"} your {inr(kcal)}.
          </p>
          <button type="button" onClick={() => onEdit({ target_carbs_g: String(check.fitCarbs), target_source: "stated" })} className="h-11 rounded-full bg-koi-forest px-[18px] text-sm font-bold text-koi-lime">
            Fit carbs to the calories
          </button>
        </div>
      )}
      {!all && <p className="m-0 text-[13px] text-koi-bg/75">Fill in all four and KOI plans every day to them.</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-koi-bg/15 pt-3.5">
        <div className="min-w-0">
          <div className="text-[15px] font-bold">More carbs on training days</div>
          <div className="text-[13px] text-koi-bg/75">The same week in total. Four training days until you set yours in the Calendar.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(person.carb_cycling)}
          aria-label="More carbs on training days"
          onClick={() => onEdit({ carb_cycling: !person.carb_cycling })}
          className={`flex h-8 w-14 shrink-0 rounded-full p-[3px] transition-colors ${person.carb_cycling ? "justify-end bg-koi-lime" : "justify-start bg-koi-bg/20"}`}
        >
          <span className={`block size-[26px] rounded-full ${person.carb_cycling ? "bg-koi-forest" : "bg-koi-bg"}`} />
        </button>
      </div>
      {cycle && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-koi-bg/10 px-4 py-3.5">
            <div className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">Training days · {DEFAULT_TRAINING_DAYS} a week</div>
            <div className="font-koi-num text-[22px] font-semibold">{inr(cycle.training.kcal)} kcal · C {cycle.training.carbs} g</div>
          </div>
          <div className="rounded-2xl bg-koi-bg/10 px-4 py-3.5">
            <div className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">Rest days · {7 - DEFAULT_TRAINING_DAYS} a week</div>
            <div className="font-koi-num text-[22px] font-semibold">{inr(cycle.rest.kcal)} kcal · C {cycle.rest.carbs} g</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-koi-bg/15 pt-3.5">
        <div className="min-w-0">
          <div className="text-[15px] font-bold">How close is close enough</div>
          <div className="text-[13px] text-koi-bg/75">Every day lands within this, on calories and each macro. Tighter means more repeats.</div>
        </div>
        <div role="radiogroup" aria-label="How close each day lands" className="flex gap-1.5">
          {TOLERANCES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tolerance === t}
              onClick={() => onEdit({ target_tolerance_pct: String(t) })}
              className={`h-10 min-w-16 rounded-full border px-3 font-koi-num text-sm font-semibold transition-colors ${tolerance === t ? "border-koi-lime bg-koi-lime text-koi-forest" : "border-koi-bg/30 text-koi-bg hover:border-koi-bg/60"}`}
            >
              ± {t}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Starting numbers when someone switches to their own: KOI's calories and
 * protein, fat at a quarter of the calories, carbs the rest — a sensible start
 * they will usually overwrite with their coach's figures.
 * @param {{ kcal: number, protein: number }} figures
 */
export function startingNumbers(figures) {
  const kcal = Math.round(figures.kcal);
  const protein = Math.round(figures.protein);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { target_kcal: String(kcal), target_protein_g: String(protein), target_carbs_g: String(carbs), target_fat_g: String(fat), target_source: "stated" };
}
