"use client";

// ============================================================================
// "Something else", asked in the KOI bar: a meal that wasn't the plan.
//
// The bar becomes the question (<KoiAsk>): "What did you have instead of …?"
// The person says it how they'd say it ("2 idli and a vada at the office"),
// or taps Skipped it / Had some of it / a meal they had out before. KOI reads
// the words (lib/food/mealWords.js) and answers in the bar: what it heard,
// one question on how much, where, its estimate as a range with what it
// assumed (lib/food/estimate.js), and the Take 2 (lib/plan/rebalance.js) for
// the planned meal and the rest of the day. KOI recommends; the person picks;
// "Log it" saves the meal and only what they picked. Every figure is an
// engine's; KOI's own words never carry one.
// ============================================================================

import { useCallback, useMemo, useState } from "react";
import KoiAsk from "@/components/store/shell/KoiAsk";
import { estimateMeal, searchDishes, mealDishFor, SETTINGS, PORTIONS, MAX_PIECES } from "@/lib/food/estimate";
import { readMealSentence } from "@/lib/food/mealWords";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { inr } from "@/components/store/plan/design/tokens";

const chip = (on) => `h-10 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${on ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-koi-paper text-koi-ink hover:border-koi-forest/40"}`;
const label = "font-koi-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-koi-muted";

/** A meal item from a dish key (a sentence's dish, or one KOI logged), or the person's own words. */
export const itemOf = ({ dishKey, text, portion, count }) => {
  const d = dishKey ? mealDishFor(dishKey) : null;
  if (!d) return { text, name: text, unit: "plate", portion: portion ?? "usual", count: 1 };
  return { dishKey, name: d.name, unit: d.unit, noun: d.noun, portion: portion ?? "usual", count: count ?? 1 };
};

/** What the person's words say: the dishes KOI is sure of, and what it should ask about. */
function hear(words) {
  const read = readMealSentence(words);
  const items = read.items.map((i) => itemOf({ dishKey: i.dishKey, portion: i.portion, count: i.count }));
  const unsure = read.ambiguous[0]?.options ?? [];
  // Nothing KOI knows by name: the closest dishes to pick from, else their words as a typical meal.
  const closest = !items.length && !unsure.length ? searchDishes(words, { limit: 4 }) : [];
  return {
    mode: read.status === "skipped" || read.status === "partial" ? read.status : "other",
    items,
    options: unsure.length ? unsure : closest,
    setting: read.setting ?? null,
  };
}

/** Meals this person had out before, newest first, for one tap. */
function recentOuts(logsByDate, limit = 2) {
  const seen = new Set();
  const out = [];
  const days = Object.keys(logsByDate ?? {}).sort().reverse();
  for (const d of days) {
    for (const log of logsByDate[d] ?? []) {
      if (log.status !== "other") continue;
      const items = log.other?.items ?? [];
      const name = items.map((x) => (x.dish_key ? mealDishFor(x.dish_key)?.name ?? x.dish_key : x.text)).join(", ");
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, items: items.map((i) => itemOf({ dishKey: i.dish_key, text: i.text, portion: i.portion, count: i.count })), setting: log.other?.setting ?? "restaurant" });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function Choice({ name, option, picked, onPick }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${picked ? "border-koi-forest bg-koi-lime-soft" : "border-koi-forest/10 bg-white hover:border-koi-forest/30"}`}>
      <input type="radio" name={name} checked={picked} onChange={onPick} className="mt-1 size-4 shrink-0 accent-koi-forest" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-bold">
          {option.title}
          {option.recommended && <span className="rounded-md bg-koi-forest px-1.5 py-0.5 font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-koi-lime">KOI suggests</span>}
        </span>
        <span className="text-[12.5px] leading-snug text-koi-ink2">{option.detail}</span>
      </span>
    </label>
  );
}

/**
 * @param {object} props
 * @param {object} props.s the plan session (usePlanSession)
 * @param {string} props.date the day, YYYY-MM-DD
 * @param {string} props.slot breakfast | lunch | snack | dinner | drinks
 * @param {object|null} props.plate the planned plate there (lib/plan/today.js), or null
 * @param {string} [props.dayLabel] "Today", "Tue"
 * @param {{ mode?, items?, query?, portion?, setting?, said? }} [props.initial] what KOI already heard: a
 *   sentence from the bar, or a meal KOI's agent logged. Keyed per opening by the caller.
 * @param {() => void} props.onClose
 */
export default function MealAsk({ s, date, slot, plate, dayLabel = "Today", initial = null, onClose }) {
  const say = useKoiVoice((v) => v.say);
  const heard = Boolean(initial && (initial.items?.length || initial.mode !== "other" || initial.query));
  const [step, setStep] = useState(heard ? "reply" : "ask");
  const [said, setSaid] = useState(initial?.said ?? "");
  const [words, setWords] = useState("");
  const [mode, setMode] = useState(() => initial?.mode ?? "other");
  const [items, setItems] = useState(() => initial?.items ?? []);
  const [options, setOptions] = useState(() => (initial?.query ? searchDishes(initial.query, { limit: 4 }) : []));
  const [query, setQuery] = useState("");
  const [setting, setSetting] = useState(() => initial?.setting ?? "restaurant");
  const [numbersPick, setNumbersPick] = useState(null);
  const [mealPick, setMealPick] = useState(null);
  const [busy, setBusy] = useState(false);

  const planned = plate?.dishes?.length ? plate.dishes.map((d) => d.name).join(" with ") : null;
  const slotName = slot ? slot[0].toUpperCase() + slot.slice(1) : "A meal";
  const recent = useMemo(() => recentOuts(s.logsByDate), [s.logsByDate]);
  const found = useMemo(() => searchDishes(query, { limit: 5 }), [query]);

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

  const addDish = (d) => {
    setItems((all) => (all.some((i) => i.dishKey === d.key) ? all : [...all, itemOf({ dishKey: d.key, portion: initial?.portion })]));
    setOptions([]);
    setQuery("");
  };
  const keepWords = () => {
    setItems((all) => [...all, itemOf({ text: said.slice(0, 80) })]);
    setOptions([]);
  };
  const update = (i, patch) => setItems((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const remove = (i) => setItems((all) => all.filter((_, k) => k !== i));

  const tell = (e) => {
    e.preventDefault();
    const text = words.trim();
    if (!text) return;
    const h = hear(text);
    setSaid(text);
    setWords("");
    setMode(h.mode);
    setItems(h.mode === "other" && !h.items.length && !h.options.length ? [itemOf({ text: text.slice(0, 80) })] : h.items);
    setOptions(h.options);
    if (h.setting) setSetting(h.setting);
    setStep("reply");
  };
  const quick = (m, from = null) => {
    setSaid(from ? from.name : m === "skipped" ? "Skipped it" : "Had some of it");
    setMode(m);
    setItems(from?.items ?? []);
    setOptions([]);
    if (from?.setting) setSetting(from.setting);
    setStep("reply");
  };
  const back = () => { setStep("ask"); setItems([]); setOptions([]); setSaid(""); setMode("other"); setNumbersPick(null); setMealPick(null); };

  const close = useCallback(() => onClose(), [onClose]);

  const log = async () => {
    if (!entry) return;
    setBusy(true);
    const saved = await s.mealLog.save(entry);
    setBusy(false);
    if (!saved.ok) return;
    const applied = s.applyTakeTwo({ entry, numbers: numbersChoice, meal: mealChoice });
    say(`${saved.pending ? "Logged on this device. It saves when I can reach your account." : "Logged."}${applied ? ` ${applied.title}. You can undo it on the Today card.` : ""}`);
    close();
  };

  const question = planned ? `What did you have instead of ${planned}?` : `What did you have for ${slot === "snack" ? "a snack" : slotName.toLowerCase()}?`;

  return (
    <KoiAsk id={`meal:${date}:${slot}`} label={`KOI is asking · ${dayLabel === "Today" ? "" : `${dayLabel} · `}${slotName}`} onCancel={close}>
      <div className="flex flex-col gap-3 font-koi-sans text-koi-ink">
        {step === "ask" ? (
          <>
            <p className="m-0 text-[16.5px] font-semibold leading-snug">{question}</p>
            <div className="flex flex-wrap gap-1.5">
              {planned && <button type="button" onClick={() => quick("skipped")} className={chip(false)}>Skipped it</button>}
              {planned && <button type="button" onClick={() => quick("partial")} className={chip(false)}>Had some of it</button>}
              {recent.map((r) => <button key={r.name} type="button" onClick={() => quick("other", r)} className={chip(false)}>{r.name}</button>)}
            </div>
            <form onSubmit={tell} className="flex h-12 items-center gap-2 rounded-full bg-koi-paper pl-4 pr-1.5">
              <input
                autoFocus value={words} onChange={(e) => setWords(e.target.value.slice(0, 200))} autoComplete="off"
                aria-label={question} placeholder="Say it how you’d say it: 2 idli and a vada at the office"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none placeholder:text-koi-muted"
              />
              <button type="submit" disabled={!words.trim()} className="h-10 shrink-0 rounded-full bg-koi-forest px-4 text-[13.5px] font-bold text-koi-lime disabled:opacity-50">Tell KOI →</button>
            </form>
          </>
        ) : (
          <>
            {said && <span className="max-w-[85%] self-end rounded-[18px_18px_4px_18px] bg-koi-tint px-3.5 py-2 text-[14px]">{said}</span>}
            <p className="m-0 text-[15px] font-semibold leading-snug">
              {mode === "skipped" ? "Okay, nothing for this one. Here’s what that does to the day."
                : mode === "partial" ? "About half, then. Here’s the day as it stands."
                : options.length && !items.length ? "Which one was closest?"
                : "Here’s my read. Fix anything I got wrong."}
            </p>

            {mode === "other" && (
              <>
                {options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Closest dishes">
                    {options.map((d) => <button key={d.key} type="button" onClick={() => addDish(d)} className={chip(false)}>{d.name}</button>)}
                    {said && !items.length && <button type="button" onClick={keepWords} className="h-10 rounded-full px-3 text-[13px] font-semibold text-koi-ink2 hover:bg-koi-paper">None of these</button>}
                  </div>
                )}

                {items.map((it, i) => (
                  <div key={`${it.dishKey ?? it.text}-${i}`} className="flex flex-col gap-2 rounded-2xl bg-koi-paper p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-bold">{it.name}{!it.dishKey && <span className="ml-1.5 font-normal text-koi-muted">(a typical {slot})</span>}</span>
                      <button type="button" onClick={() => remove(i)} aria-label={`Remove ${it.name}`} className="grid size-9 place-items-center rounded-full text-koi-muted hover:bg-white">
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
                      </button>
                    </div>
                    {it.unit === "piece" ? (
                      <div className="flex items-center gap-2" role="group" aria-label={`How many ${it.noun?.[1] ?? "pieces"}`}>
                        <button type="button" aria-label="One fewer" disabled={it.count <= 1} onClick={() => update(i, { count: it.count - 1 })} className="grid size-10 place-items-center rounded-xl border border-koi-forest/15 bg-white text-lg font-semibold disabled:opacity-40">−</button>
                        <span className="min-w-[7ch] text-center font-koi-num text-[14.5px] font-semibold">{it.count} {it.count === 1 ? it.noun?.[0] : it.noun?.[1]}</span>
                        <button type="button" aria-label="One more" disabled={it.count >= MAX_PIECES} onClick={() => update(i, { count: it.count + 1 })} className="grid size-10 place-items-center rounded-xl border border-koi-forest/15 bg-white text-lg font-semibold disabled:opacity-40">+</button>
                      </div>
                    ) : (
                      <div role="radiogroup" aria-label={`How much ${it.name}`} className="flex flex-wrap gap-1.5">
                        {PORTIONS.map((p) => <button key={p.key} type="button" role="radio" aria-checked={it.portion === p.key} onClick={() => update(i, { portion: p.key })} className={`h-9 rounded-full px-3 text-[12.5px] font-semibold transition-colors ${it.portion === p.key ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-white"}`}>{p.label}</button>)}
                      </div>
                    )}
                  </div>
                ))}

                <label className="flex flex-col gap-1.5">
                  <span className={label}>{items.length ? "Anything else with it?" : "Find the dish"}</span>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Biryani, samosa, thali…" autoComplete="off"
                    className="h-11 rounded-2xl border border-koi-forest/15 bg-white px-3.5 text-[14px] outline-none placeholder:text-koi-muted focus:border-koi-forest" />
                </label>
                {found.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {found.map((d) => <button key={d.key} type="button" onClick={() => addDish(d)} className={chip(false)}>{d.name}</button>)}
                  </div>
                )}

                {items.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className={label}>Where</span>
                    <div role="radiogroup" aria-label="Where you ate" className="flex flex-wrap gap-1.5">
                      {Object.values(SETTINGS).map((st) => <button key={st.key} type="button" role="radio" aria-checked={setting === st.key} onClick={() => setSetting(st.key)} className={chip(setting === st.key)}>{st.label}</button>)}
                    </div>
                  </div>
                )}

                {estimate && (
                  <div aria-label="KOI's estimate" className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      <span className="col-span-2 flex flex-col rounded-2xl bg-koi-forest px-3 py-2 text-koi-bg sm:col-span-1">
                        <span className="font-koi-num text-[19px] font-semibold leading-tight">≈ {inr(estimate.point.kcal)}</span>
                        <span className="text-[11px] text-koi-bg/75">kcal · {inr(estimate.low.kcal)}–{inr(estimate.high.kcal)}</span>
                      </span>
                      <span className="flex flex-col rounded-2xl bg-koi-paper px-3 py-2">
                        <span className="font-koi-num text-[19px] font-semibold leading-tight">{estimate.point.protein} g</span>
                        <span className="text-[11px] text-koi-muted">protein</span>
                      </span>
                      <span className="flex flex-col rounded-2xl bg-koi-paper px-3 py-2">
                        <span className="font-koi-num text-[15px] font-semibold leading-tight">{estimate.point.carbs} g C · {estimate.point.fat} g F</span>
                        <span className="text-[11px] text-koi-muted">carbs · fat</span>
                      </span>
                    </div>
                    <span className="text-[11.5px] leading-snug text-koi-muted">{estimate.basis.join(" · ")}</span>
                  </div>
                )}
              </>
            )}

            {take2 && meal.length > 0 && (
              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className={`${label} mb-1.5`}>The {planned?.toLowerCase() ?? "meal"} you didn&apos;t eat</legend>
                {meal.map((o) => <Choice key={o.id} name="take2-meal" option={o} picked={mealChoice?.id === o.id} onPick={() => setMealPick(o.id)} />)}
              </fieldset>
            )}
            {take2 && numbers.length > 0 && (
              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className={`${label} mb-1.5`}>{take2.gap ? `Take 2 · the day is ${inr(Math.abs(take2.gap.kcal))} kcal ${take2.gap.kcal >= 0 ? "over" : "under"} ${take2.against === "target" ? "your numbers" : "the plan"}` : "Take 2 · the day"}</legend>
                {numbers.map((o) => <Choice key={o.id} name="take2-numbers" option={o} picked={numbersChoice?.id === o.id} onPick={() => setNumbersPick(o.id)} />)}
              </fieldset>
            )}

            {s.mealLog.error && <p role="alert" className="m-0 text-xs font-medium text-koi-red">{s.mealLog.error}</p>}

            <div className="sticky bottom-0 -mx-5 -mb-4 flex gap-2 bg-white px-5 pb-4 pt-2">
              <button type="button" onClick={back} className="h-12 rounded-2xl border border-koi-forest/15 px-4 text-[14px] font-semibold text-koi-ink2">Back</button>
              <button type="button" onClick={log} disabled={!entry || busy} className="h-12 flex-1 rounded-2xl bg-koi-forest text-[14.5px] font-bold text-koi-lime disabled:opacity-40">
                {busy ? "Saving…" : (numbersChoice && numbersChoice.id !== "leave") || (mealChoice && mealChoice.id !== "drop") ? "Log it and apply" : "Log it"}
              </button>
            </div>
          </>
        )}
      </div>
    </KoiAsk>
  );
}
