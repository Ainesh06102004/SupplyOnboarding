"use client";

// ============================================================================
// Add or change a Calendar event: what it is, who, when, once or weekly.
//
// Each kind asks only what it needs: a meal out asks who and which meal (and
// roughly how much, so the rest of the day is planned around it); travel asks
// the days; a reminder asks what to remind. The problems are
// lib/calendar/events.js's, in words, before anything is saved.
// ============================================================================

import { useState } from "react";
import Sheet from "@/components/store/system/Sheet";
import { EVENT_KINDS, KIND, MEAL_SLOTS, WEEKDAY_NAMES, eventProblems, weekdayOf } from "@/lib/calendar/events";
import { GENERIC_MEALS, PORTIONS, SETTINGS } from "@/lib/food/estimate";
import { inr } from "@/components/store/plan/design/tokens";

const pill = (on) => `h-10 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ${on ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-white text-koi-ink hover:border-koi-forest/40"}`;
const label = "font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted";
const input = "h-11 rounded-2xl border border-koi-forest/15 bg-white px-3.5 text-[14.5px] outline-none focus:border-koi-forest";
const SLOT_NAME = Object.freeze({ breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" });

/**
 * @param {object} props
 * @param {object} props.s the plan session (people, calendar)
 * @param {object} props.initial the event to change, or the start of a new one ({ starts_on } at least)
 * @param {() => void} props.onClose
 */
export default function EventSheet({ s, initial, onClose }) {
  const people = s.saved ?? [];
  const me = people.find((p) => p.is_account_holder) ?? people[0] ?? null;
  const editing = Boolean(initial?.id && s.calendar.rows.some((e) => e.id === initial.id));
  const [kind, setKind] = useState(initial?.kind ?? "out");
  const [memberId, setMemberId] = useState(initial?.member_id ?? me?.memberId ?? null);
  const [slot, setSlot] = useState(initial?.slot ?? "lunch");
  const [startsOn, setStartsOn] = useState(initial?.starts_on);
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? "");
  const [weekly, setWeekly] = useState(Boolean(initial?.repeat_days?.length));
  const [days, setDays] = useState(initial?.repeat_days?.length ? initial.repeat_days.map(Number) : [weekdayOf(initial?.starts_on)]);
  const [until, setUntil] = useState(initial?.until ?? "");
  const [atTime, setAtTime] = useState(initial?.at_time ? String(initial.at_time).slice(0, 5) : "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [setting, setSetting] = useState(initial?.plan_effect?.setting ?? "canteen");
  const [size, setSize] = useState(initial?.plan_effect?.size ?? "usual");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const k = KIND[kind];
  const kcal = Math.round((GENERIC_MEALS[slot]?.kcal ?? 0) * (PORTIONS.find((p) => p.key === size)?.factor ?? 1));
  const row = {
    ...(initial?.id ? { id: initial.id } : {}),
    kind,
    member_id: k?.person ? memberId : null,
    slot: kind === "out" ? slot : null,
    starts_on: startsOn,
    ends_on: k?.range && endsOn ? endsOn : null,
    repeat_days: weekly && !k?.range ? [...new Set(days)].sort() : null,
    until: weekly && until ? until : null,
    at_time: !k?.person && atTime ? atTime : null,
    title: title.trim() || null,
    plan_effect: kind === "out" ? { setting, size, kcal } : {},
    source: initial?.source ?? "user",
  };
  const problems = [...eventProblems(row), ...(kind === "remind" && !row.title ? ["Say what to remind you about."] : []), ...(weekly && !days.length ? ["Pick the days it repeats on."] : [])];

  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    const saved = await s.calendar.save(row);
    setBusy(false);
    if (!saved.ok) return;
    s.notify(saved.pending ? "Added on this device; it saves when KOI can reach your account." : editing ? "Changed." : "Added to your calendar.", saved.pending ? "warn" : "info");
    onClose();
  };
  const remove = async () => {
    setBusy(true);
    await s.calendar.remove(initial.id);
    setBusy(false);
    s.notify("Taken off your calendar.", "info");
    onClose();
  };

  return (
    <Sheet open onClose={onClose} label={editing ? "Change this calendar event" : "Add to your calendar"}>
      <div className="flex min-h-0 flex-1 flex-col bg-koi-bg font-koi-sans text-koi-ink">
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
          <span className="flex flex-col gap-1">
            <span className={label}>Calendar</span>
            <span className="font-koi-display text-2xl font-extrabold leading-tight text-koi-forest">{editing ? "Change it" : "Add to your calendar"}</span>
            {k?.hint && <span className="text-[13px] text-koi-ink2">{k.hint}</span>}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={`${label} mb-2`}>What</legend>
            <div role="radiogroup" aria-label="What it is" className="flex flex-wrap gap-1.5">
              {EVENT_KINDS.filter((x) => x.key !== "auto" || kind === "auto").map((x) => (
                <button key={x.key} type="button" role="radio" aria-checked={kind === x.key} onClick={() => setKind(x.key)} className={pill(kind === x.key)}>{x.label}</button>
              ))}
            </div>
          </fieldset>

          {k?.person && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className={`${label} mb-2`}>Who</legend>
              <div role="radiogroup" aria-label="Who" className="flex flex-wrap gap-1.5">
                {people.map((p) => <button key={p.memberId} type="button" role="radio" aria-checked={String(memberId) === String(p.memberId)} onClick={() => setMemberId(p.memberId)} className={pill(String(memberId) === String(p.memberId))}>{p.label}</button>)}
              </div>
            </fieldset>
          )}

          {kind === "out" && (
            <>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className={`${label} mb-2`}>Which meal</legend>
                <div role="radiogroup" aria-label="Which meal" className="flex flex-wrap gap-1.5">
                  {MEAL_SLOTS.map((m) => <button key={m} type="button" role="radio" aria-checked={slot === m} onClick={() => setSlot(m)} className={pill(slot === m)}>{SLOT_NAME[m]}</button>)}
                </div>
              </fieldset>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className={`${label} mb-2`}>Where, and about how much</legend>
                <div role="radiogroup" aria-label="Where" className="flex flex-wrap gap-1.5">
                  {Object.values(SETTINGS).filter((x) => x.key !== "home").map((x) => <button key={x.key} type="button" role="radio" aria-checked={setting === x.key} onClick={() => setSetting(x.key)} className={pill(setting === x.key)}>{x.label}</button>)}
                </div>
                <div role="radiogroup" aria-label="About how much" className="flex flex-wrap gap-1.5">
                  {PORTIONS.slice(0, 3).map((p) => <button key={p.key} type="button" role="radio" aria-checked={size === p.key} onClick={() => setSize(p.key)} className={pill(size === p.key)}>{p.label}</button>)}
                </div>
                <span className="text-[12.5px] text-koi-ink2">KOI keeps about {inr(kcal)} kcal for it and plans the rest of the day around that. Log what it really was on Track.</span>
              </fieldset>
            </>
          )}

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={`${label} mb-2`}>When</legend>
            {!k?.range && (
              <div role="radiogroup" aria-label="How often" className="flex gap-1.5">
                <button type="button" role="radio" aria-checked={!weekly} onClick={() => setWeekly(false)} className={pill(!weekly)}>Once</button>
                <button type="button" role="radio" aria-checked={weekly} onClick={() => setWeekly(true)} className={pill(weekly)}>Every week</button>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-koi-ink2">{weekly ? "From" : k?.range ? "From" : "On"}</span>
                <input type="date" value={startsOn ?? ""} onChange={(e) => setStartsOn(e.target.value)} className={input} />
              </label>
              {k?.range && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-koi-ink2">To</span>
                  <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={input} />
                </label>
              )}
              {weekly && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-koi-ink2">Until (optional)</span>
                  <input type="date" value={until} min={startsOn} onChange={(e) => setUntil(e.target.value)} className={input} />
                </label>
              )}
              {!k?.person && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-koi-ink2">Time (optional)</span>
                  <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} className={input} />
                </label>
              )}
            </div>
            {weekly && (
              <div role="group" aria-label="Repeats on" className="flex flex-wrap gap-1.5">
                {WEEKDAY_NAMES.map((name, d) => {
                  const on = days.includes(d);
                  return <button key={name} type="button" aria-pressed={on} onClick={() => setDays((all) => (on ? all.filter((x) => x !== d) : [...all, d]))} className={`h-10 min-w-12 rounded-full px-3 text-[13px] font-semibold ${on ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-white"}`}>{name.slice(0, 3)}</button>;
                })}
              </div>
            )}
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className={label}>{kind === "remind" ? "Remind me to" : "A note (optional)"}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === "remind" ? "Order atta" : KIND[kind]?.label} className={input} />
          </label>

          {tried && problems.length > 0 && (
            <ul role="alert" className="m-0 flex list-none flex-col gap-1 rounded-2xl bg-koi-red-bg p-3.5 text-[13px] font-semibold text-koi-red">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-koi-forest/10 bg-koi-bg px-6 pb-6 pt-3">
          {editing ? (
            <button type="button" onClick={remove} disabled={busy} className="h-14 rounded-2xl px-5 text-[15px] font-semibold text-koi-red hover:bg-koi-red-bg">Delete</button>
          ) : (
            <button type="button" onClick={onClose} className="h-14 rounded-2xl px-5 text-[15px] font-semibold text-koi-ink2 hover:bg-white">Cancel</button>
          )}
          <button type="button" onClick={save} disabled={busy} className="h-14 flex-1 rounded-2xl bg-koi-forest text-[15px] font-bold text-koi-lime disabled:opacity-40">
            {busy ? "Saving…" : editing ? "Save" : "Add it"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
