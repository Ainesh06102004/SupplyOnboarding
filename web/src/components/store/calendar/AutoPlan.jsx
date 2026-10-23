"use client";

// ============================================================================
// Auto-plan: "every Sunday at 6 pm, KOI drafts next week's plan".
//
// The card says what is set and what happened last; the sheet sets the day
// and time, the plan's days, when it starts, a budget and who is eating, and
// how KOI says it's ready. In the app now; WhatsApp is shown as coming, opt-in
// only. KOI drafts and tells; the household approves; nothing is ordered.
// ============================================================================

import { useState } from "react";
import Sheet from "@/components/store/system/Sheet";
import { AUTOPLAN_DAYS, AUTOPLAN_STARTS, AUTOPLAN_DEFAULTS, jobWords, rulesOf } from "@/lib/plan/autoplan";
import { WEEKDAY_NAMES } from "@/lib/calendar/events";

const pill = (on) => `h-10 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ${on ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-white text-koi-ink hover:border-koi-forest/40"}`;
const label = "font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted";
const TIMES = Array.from({ length: 33 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const timeWords = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`; };
const when = (iso) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The sheet: set it up, change it, or turn it off. */
export function AutoPlanSheet({ s, auto, onClose }) {
  const job = auto.job;
  const rules = rulesOf(job ?? AUTOPLAN_DEFAULTS);
  const people = s.saved ?? [];
  const [weekday, setWeekday] = useState(job?.weekday ?? AUTOPLAN_DEFAULTS.weekday);
  const [time, setTime] = useState(String(job?.local_time ?? AUTOPLAN_DEFAULTS.local_time).slice(0, 5));
  const [days, setDays] = useState(rules.days);
  const [start, setStart] = useState(rules.start);
  const [budget, setBudget] = useState(rules.budget ? String(rules.budget) : "");
  const [who, setWho] = useState(rules.memberIds ?? people.map((p) => String(p.memberId)));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await auto.save({
      weekday, local_time: time, paused: false, channels: ["in_app"],
      rules: { days, start, budget: Number(budget) > 0 ? Math.round(Number(budget)) : null, member_ids: who.length && who.length < people.length ? who : null },
    });
    setBusy(false);
    if (!ok) return;
    s.notify(`Auto-plan is on: ${jobWords({ weekday, local_time: time }).toLowerCase()}. You approve every plan.`, "info");
    onClose();
  };
  const off = async () => {
    setBusy(true);
    const ok = await auto.remove();
    setBusy(false);
    if (ok) { s.notify("Auto-plan is off.", "info"); onClose(); }
  };

  return (
    <Sheet open onClose={onClose} label="Auto-plan">
      <div className="flex min-h-0 flex-1 flex-col bg-koi-bg font-koi-sans text-koi-ink">
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
          <span className="flex flex-col gap-1">
            <span className={label}>Auto-plan</span>
            <span className="font-koi-display text-2xl font-extrabold leading-tight text-koi-forest">KOI drafts your next plan</span>
            <span className="text-[13px] text-koi-ink2">On the day and time you pick, KOI plans the next week from your household and your calendar, and tells you it&apos;s ready. You approve it; nothing goes in your cart until you do.</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={`${label} mb-2`}>When KOI drafts it</legend>
            <div role="radiogroup" aria-label="Day" className="flex flex-wrap gap-1.5">
              {WEEKDAY_NAMES.map((name, d) => <button key={name} type="button" role="radio" aria-checked={weekday === d} onClick={() => setWeekday(d)} className={pill(weekday === d)}>{name.slice(0, 3)}</button>)}
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-semibold text-koi-ink2">
              at
              <select value={time} onChange={(e) => setTime(e.target.value)} className="h-11 rounded-2xl border border-koi-forest/15 bg-white px-3 text-[14.5px] outline-none focus:border-koi-forest">
                {TIMES.map((t) => <option key={t} value={t}>{timeWords(t)}</option>)}
              </select>
            </label>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={`${label} mb-2`}>The plan</legend>
            <div role="radiogroup" aria-label="How many days" className="flex flex-wrap gap-1.5">
              {AUTOPLAN_DAYS.map((n) => <button key={n} type="button" role="radio" aria-checked={days === n} onClick={() => setDays(n)} className={pill(days === n)}>{n} days</button>)}
            </div>
            <div role="radiogroup" aria-label="Starting" className="flex flex-wrap gap-1.5">
              {AUTOPLAN_STARTS.map((x) => <button key={x.key} type="button" role="radio" aria-checked={start === x.key} onClick={() => setStart(x.key)} className={pill(start === x.key)}>Starts {x.label.toLowerCase()}</button>)}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-koi-ink2">Budget (optional)</span>
              <input type="number" inputMode="numeric" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="No budget" className="h-11 w-44 rounded-2xl border border-koi-forest/15 bg-white px-3.5 font-koi-num text-[15px] outline-none focus:border-koi-forest" />
            </label>
          </fieldset>
          {people.length > 1 && (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className={`${label} mb-2`}>Who&apos;s eating</legend>
              <div role="group" aria-label="Who's eating" className="flex flex-wrap gap-1.5">
                {people.map((p) => {
                  const id = String(p.memberId);
                  const on = who.includes(id);
                  return <button key={id} type="button" aria-pressed={on} onClick={() => setWho((all) => (on ? all.filter((x) => x !== id) : [...all, id]))} className={pill(on)}>{p.label}</button>;
                })}
              </div>
            </fieldset>
          )}
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className={`${label} mb-2`}>How KOI tells you</legend>
            <label className="flex items-center gap-3 rounded-2xl border border-koi-forest/10 bg-white p-3.5 text-[14px] font-semibold">
              <input type="checkbox" checked readOnly disabled className="size-4 accent-koi-forest" /> In KOI (the bell at the top)
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-dashed border-koi-forest/15 p-3.5 text-[14px] text-koi-muted">
              <input type="checkbox" disabled className="mt-0.5 size-4" />
              <span><span className="font-semibold">WhatsApp, coming soon.</span> KOI will send it to your number only if you say yes, and you can stop it any time.</span>
            </label>
          </fieldset>
          {auto.error && <p role="alert" className="m-0 text-[13px] font-semibold text-koi-red">{auto.error}</p>}
        </div>
        <div className="flex gap-2.5 border-t border-koi-forest/10 bg-koi-bg px-6 pb-6 pt-3">
          {job ? <button type="button" onClick={off} disabled={busy} className="h-14 rounded-2xl px-5 text-[15px] font-semibold text-koi-red hover:bg-koi-red-bg">Turn off</button>
            : <button type="button" onClick={onClose} className="h-14 rounded-2xl px-5 text-[15px] font-semibold text-koi-ink2 hover:bg-white">Cancel</button>}
          <button type="button" onClick={save} disabled={busy || !who.length} className="h-14 flex-1 rounded-2xl bg-koi-forest text-[15px] font-bold text-koi-lime disabled:opacity-40">{busy ? "Saving…" : job ? "Save" : "Turn on auto-plan"}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** The card on the Calendar: what's set, the next run, and the last one. */
export function AutoPlanCard({ s, auto, onOpen }) {
  const job = auto.job;
  const pause = async () => {
    const ok = await auto.save({ paused: !job.paused });
    if (ok) s.notify(job.paused ? "Auto-plan is back on." : "Auto-plan is paused.", "info");
  };
  return (
    <article data-card aria-label="Auto-plan" className="flex flex-col gap-3 rounded-[28px] border border-koi-forest/10 bg-white p-6">
      <span className="flex items-center justify-between gap-2">
        <span className="text-base font-bold">Auto-plan</span>
        {job && <span className={`rounded-full px-2.5 py-1 font-koi-mono text-[10px] font-bold uppercase tracking-[0.1em] ${job.paused ? "bg-koi-paper text-koi-muted" : "bg-koi-lime text-koi-forest"}`}>{job.paused ? "Paused" : "On"}</span>}
      </span>
      {job ? (
        <>
          <p className="m-0 text-[14px] font-semibold">{jobWords(job)}, KOI drafts {rulesOf(job).days} days.</p>
          {!job.paused && job.next_run_at && <p className="m-0 text-[13px] text-koi-ink2">Next: {when(job.next_run_at)}</p>}
          {job.last_run_at && <p className="m-0 text-[12.5px] text-koi-muted">{job.last_error ? `Last time it couldn't plan: ${job.last_error}` : `Last drafted ${when(job.last_run_at)}.`}</p>}
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpen} className="h-10 rounded-full border border-koi-forest/20 px-4 text-[13px] font-semibold text-koi-forest">Change</button>
            <button type="button" onClick={pause} className="h-10 rounded-full px-3 text-[13px] font-semibold text-koi-ink2 hover:bg-koi-paper">{job.paused ? "Resume" : "Pause"}</button>
          </span>
        </>
      ) : (
        <>
          <p className="m-0 text-[13.5px] text-koi-ink2">Let KOI draft next week&apos;s plan on a day you pick, around your calendar. You approve every plan; KOI never orders.</p>
          <button type="button" onClick={onOpen} disabled={auto.loading} className="h-11 self-start rounded-full bg-koi-forest px-5 text-[13.5px] font-bold text-koi-lime disabled:opacity-40">Set it up</button>
        </>
      )}
      {auto.error && !job && <p className="m-0 text-[12.5px] text-koi-red">{auto.error}</p>}
    </article>
  );
}
