"use client";

// ============================================================================
// "Something else": a meal that wasn't the plan, told to KOI.
//
// One sheet, top to bottom: what it was (KOI's dishes, home and eaten-out, or
// the person's own words), how much (one question: a plate's size, or how many
// pieces), where (home, canteen, restaurant, a stall), KOI's estimate as a
// range with what it assumed (lib/food/estimate.js), and then the Take 2
// (lib/plan/rebalance.js): what happens to the planned meal that wasn't eaten,
// and to the rest of the day. KOI recommends; the person picks; "Log it" saves
// the meal and only the options they picked. Every figure is an engine's.
// ============================================================================

import { useMemo, useState } from "react";
import Sheet from "@/components/store/system/Sheet";
import { estimateMeal, searchDishes, SETTINGS, PORTIONS, MAX_PIECES } from "@/lib/food/estimate";
import { inr } from "@/components/store/plan/design/tokens";

const MODES = Object.freeze([
  { key: "other", label: "Something else" },
  { key: "partial", label: "Had some of it" },
  { key: "skipped", label: "Skipped it" },
]);
const pill = (on) => `h-11 rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-white text-koi-ink hover:border-koi-forest/40"}`;
const label = "font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted";

function Choice({ name, option, picked, onPick }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${picked ? "border-koi-forest bg-koi-lime-soft" : "border-koi-forest/10 bg-white hover:border-koi-forest/30"}`}>
      <input type="radio" name={name} checked={picked} onChange={onPick} className="mt-1 size-4 shrink-0 accent-koi-forest" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold">
          {option.title}
          {option.recommended && <span className="rounded-md bg-koi-forest px-1.5 py-0.5 font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-koi-lime">KOI suggests</span>}
        </span>
        <span className="text-[13px] leading-snug text-koi-ink2">{option.detail}</span>
      </span>
    </label>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object} props.s the plan session (usePlanSession)
 * @param {string} props.date the day, YYYY-MM-DD
 * @param {string} props.slot breakfast | lunch | snack | dinner | drinks
 * @param {object|null} props.plate the planned plate there (lib/plan/today.js), or null
 * @param {string} [props.dayLabel] "Today", "Tue"
 * @param {{ mode?, items?, query?, portion?, setting? }} [props.initial] what the sheet opens with: a sentence
 *   read by lib/food/mealWords.js, or a meal KOI's agent already logged. The sheet is keyed per opening.
 */
export default function MealOutSheet({ open, onClose, s, date, slot, plate, dayLabel = "Today", initial = null }) {
  const [mode, setMode] = useState(() => initial?.mode ?? "other");
  const [items, setItems] = useState(() => initial?.items ?? []);
  const [query, setQuery] = useState(() => initial?.query ?? "");
  const [words, setWords] = useState("");
  const [setting, setSetting] = useState(() => initial?.setting ?? "restaurant");
  const [numbersPick, setNumbersPick] = useState(null);
  const [mealPick, setMealPick] = useState(null);
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => searchDishes(query, { limit: 6 }), [query]);
  const estimate = useMemo(() => (mode === "other" && items.length ? estimateMeal({ items, setting, slot }) : null), [mode, items, setting, slot]);
  const entry = useMemo(() => {
    if (mode === "other" && !estimate) return null;
    return {
      eaten_on: date,
      slot,
      status: mode,
      planned: plate?.cellKey ? { cell: plate.cellKey, dishes: plate.dishes.map((d) => d.key), nutrition: plate.nutrition } : null,
      other: mode === "other" ? { items: items.map(({ dishKey, text, portion, count }) => ({ ...(dishKey ? { dish_key: dishKey } : { text }), portion, count })), setting } : mode === "partial" ? { share: 0.5 } : null,
      estimate: mode === "other" ? { point: estimate.point, low: estimate.low, high: estimate.high, basis: estimate.basis } : null,
      source: "track",
    };
  }, [mode, estimate, date, slot, plate, items, setting]);
  const takeTwoFor = s.takeTwoFor;
  const take2 = useMemo(() => (entry ? takeTwoFor(entry) : null), [entry, takeTwoFor]);
  const numbers = take2?.numbers ?? [];
  const meal = take2?.meal?.options ?? [];
  const numbersChoice = numbers.find((o) => o.id === numbersPick) ?? numbers.find((o) => o.recommended) ?? null;
  const mealChoice = meal.find((o) => o.id === mealPick) ?? meal.find((o) => o.recommended) ?? null;

  const add = (d) => {
    setItems((all) => (all.some((i) => i.dishKey === d.key) ? all : [...all, { dishKey: d.key, name: d.name, unit: d.unit, noun: d.noun, portion: initial?.portion ?? "usual", count: 1 }]));
    setQuery("");
  };
  const addWords = () => {
    const text = words.trim();
    if (!text) return;
    setItems((all) => [...all, { text, name: text, unit: "plate", portion: "usual", count: 1 }]);
    setWords("");
  };
  const update = (i, patch) => setItems((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const remove = (i) => setItems((all) => all.filter((_, k) => k !== i));

  const close = () => onClose();

  const log = async () => {
    if (!entry) return;
    setBusy(true);
    const saved = await s.mealLog.save(entry);
    setBusy(false);
    if (!saved.ok) return;
    const applied = s.applyTakeTwo({ entry, numbers: numbersChoice, meal: mealChoice });
    s.notify(
      `${saved.pending ? "Logged on this device; it saves when KOI can reach your account." : "Logged."}${applied ? ` ${applied.title}. Undo it on Track.` : ""}`,
      saved.pending ? "warn" : "info",
    );
    close();
  };

  const planned = plate?.dishes?.length ? plate.dishes.map((d) => d.name).join(" with ") : null;
  const slotName = slot ? slot[0].toUpperCase() + slot.slice(1) : "A meal";

  return (
    <Sheet open={open} onClose={close} label={`${slotName}, ${dayLabel}: tell KOI what you had`}>
      <div className="flex min-h-0 flex-1 flex-col bg-koi-bg font-koi-sans text-koi-ink">
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
          <span className="flex flex-col gap-1">
            <span className={label}>{dayLabel} · {slotName}</span>
            <span className="font-koi-display text-2xl font-extrabold leading-tight text-koi-forest">What did you have?</span>
            {planned && <span className="text-[13px] text-koi-ink2">Planned: {planned} · {inr(Math.round(plate.nutrition.kcal))} kcal</span>}
          </span>
          <button type="button" onClick={close} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
          {planned && (
            <div role="radiogroup" aria-label="What happened" className="flex flex-wrap gap-2">
              {MODES.map((m) => <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)} className={pill(mode === m.key)}>{m.label}</button>)}
            </div>
          )}

          {mode === "other" && (
            <>
              <section className="flex flex-col gap-2.5" aria-label="The food">
                <label className="flex flex-col gap-1.5">
                  <span className={label}>Find a dish</span>
                  <input
                    type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Biryani, samosa, thali…" autoComplete="off"
                    className="h-12 rounded-2xl border border-koi-forest/15 bg-white px-4 text-[15px] outline-none placeholder:text-koi-muted focus:border-koi-forest"
                  />
                </label>
                {results.length > 0 && (
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Dishes">
                    {results.map((d) => (
                      <li key={d.key}><button type="button" onClick={() => add(d)} className="h-10 rounded-full border border-koi-forest/15 bg-white px-3.5 text-[13.5px] font-semibold hover:border-koi-forest/40">{d.name}</button></li>
                    ))}
                  </ul>
                )}
                {query.length >= 2 && !results.length && <p className="m-0 text-[13px] text-koi-muted">KOI doesn&apos;t know that one yet. Describe it below.</p>}

                {items.map((it, i) => (
                  <div key={`${it.dishKey ?? it.text}-${i}`} className="flex flex-col gap-2.5 rounded-2xl bg-white p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-bold">{it.name}{!it.dishKey && <span className="ml-1.5 font-normal text-koi-muted">(a typical meal)</span>}</span>
                      <button type="button" onClick={() => remove(i)} aria-label={`Remove ${it.name}`} className="grid size-9 place-items-center rounded-full text-koi-muted hover:bg-koi-paper">
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
                      </button>
                    </div>
                    {it.unit === "piece" ? (
                      <div className="flex items-center gap-2" role="group" aria-label={`How many ${it.noun?.[1] ?? "pieces"}`}>
                        <button type="button" aria-label="One fewer" disabled={it.count <= 1} onClick={() => update(i, { count: it.count - 1 })} className="grid size-10 place-items-center rounded-xl border border-koi-forest/15 text-lg font-semibold disabled:opacity-40">−</button>
                        <span className="min-w-[7ch] text-center font-koi-num text-[15px] font-semibold">{it.count} {it.count === 1 ? it.noun?.[0] : it.noun?.[1]}</span>
                        <button type="button" aria-label="One more" disabled={it.count >= MAX_PIECES} onClick={() => update(i, { count: it.count + 1 })} className="grid size-10 place-items-center rounded-xl border border-koi-forest/15 text-lg font-semibold disabled:opacity-40">+</button>
                      </div>
                    ) : (
                      <div role="radiogroup" aria-label={`How much ${it.name}`} className="flex flex-wrap gap-1.5">
                        {PORTIONS.map((p) => <button key={p.key} type="button" role="radio" aria-checked={it.portion === p.key} onClick={() => update(i, { portion: p.key })} className={`h-9 rounded-full px-3 text-[13px] font-semibold transition-colors ${it.portion === p.key ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-koi-paper"}`}>{p.label}</button>)}
                      </div>
                    )}
                  </div>
                ))}

                <form onSubmit={(e) => { e.preventDefault(); addWords(); }} className="flex gap-2">
                  <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="Or in your words: dinner at a friend's" aria-label="Describe what you had"
                    className="h-11 min-w-0 flex-1 rounded-2xl border border-koi-forest/15 bg-white px-3.5 text-sm outline-none placeholder:text-koi-muted focus:border-koi-forest" />
                  <button type="submit" disabled={!words.trim()} className="h-11 rounded-2xl border border-koi-forest/20 px-4 text-sm font-semibold text-koi-forest disabled:opacity-40">Add</button>
                </form>
              </section>

              <section className="flex flex-col gap-2" aria-label="Where">
                <span className={label}>Where</span>
                <div role="radiogroup" aria-label="Where you ate" className="flex flex-wrap gap-1.5">
                  {Object.values(SETTINGS).map((st) => <button key={st.key} type="button" role="radio" aria-checked={setting === st.key} onClick={() => setSetting(st.key)} className={pill(setting === st.key)}>{st.label}</button>)}
                </div>
              </section>

              {estimate && (
                <section aria-label="KOI's estimate" className="flex flex-col gap-2.5 rounded-[22px] bg-koi-forest p-5 text-koi-bg">
                  <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">KOI&apos;s estimate</span>
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-koi-num text-[34px] font-semibold leading-none">≈ {inr(estimate.point.kcal)} kcal</span>
                    <span className="text-[13px] text-koi-bg/75">{inr(estimate.low.kcal)}–{inr(estimate.high.kcal)}</span>
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 font-koi-num text-[13.5px] font-semibold">
                    <span>{estimate.point.protein} g protein</span><span>{estimate.point.carbs} g carbs</span><span>{estimate.point.fat} g fat</span>
                  </span>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12px] leading-snug text-koi-bg/75">
                    {estimate.basis.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </section>
              )}
            </>
          )}

          {take2 && meal.length > 0 && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className={`${label} mb-2`}>The {planned?.toLowerCase() ?? "meal"} you didn&apos;t eat</legend>
              {meal.map((o) => <Choice key={o.id} name="take2-meal" option={o} picked={mealChoice?.id === o.id} onPick={() => setMealPick(o.id)} />)}
            </fieldset>
          )}
          {take2 && numbers.length > 0 && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className={`${label} mb-2`}>{take2.gap ? `The day: ${inr(Math.abs(take2.gap.kcal))} kcal ${take2.gap.kcal >= 0 ? "over" : "under"} ${take2.against === "target" ? "your numbers" : "the plan"}` : "The day"}</legend>
              {numbers.map((o) => <Choice key={o.id} name="take2-numbers" option={o} picked={numbersChoice?.id === o.id} onPick={() => setNumbersPick(o.id)} />)}
            </fieldset>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-koi-forest/10 bg-koi-bg px-6 pb-6 pt-3">
          <button type="button" onClick={close} className="h-14 rounded-2xl px-5 text-[15px] font-semibold text-koi-ink2 hover:bg-white">Cancel</button>
          <button type="button" onClick={log} disabled={!entry || busy} className="h-14 flex-1 rounded-2xl bg-koi-forest text-[15px] font-bold text-koi-lime disabled:opacity-40">
            {busy ? "Saving…" : (numbersChoice && numbersChoice.id !== "leave") || (mealChoice && mealChoice.id !== "drop") ? "Log it and apply" : "Log it"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
