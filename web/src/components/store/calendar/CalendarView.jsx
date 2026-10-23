"use client";

// ============================================================================
// /store/calendar — the household's weeks, planned around their life.
//
// A week board (Monday to Sunday): each day's events as chips, the days the
// current plan covers marked, a "+" on every day. An event opens its sheet
// (EventSheet). Beside it, KOI's suggestions — a habit in the meal log (lunch
// out three Tuesdays running) offered as a weekly meal out, never added unasked
// — and the subscription address for Google or Apple Calendar, with a .ics
// download. A sentence said to KOI (?add=…) opens the sheet already filled in
// (lib/calendar/words.js).
// ============================================================================

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { occurrences, eventTitle, repeatWords, addDays, weekdayOf, KIND, toICS, WEEKDAY_NAMES } from "@/lib/calendar/events";
import { readScheduleSentence } from "@/lib/calendar/words";
import { eatOutPatterns } from "@/lib/plan/patterns";
import { mealDishFor, SETTINGS } from "@/lib/food/estimate";
import { getSupabaseClient } from "@/lib/supabase/client";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import EventSheet from "./EventSheet";
import { useAutoplan } from "./useAutoplan";
import { AutoPlanCard, AutoPlanSheet } from "./AutoPlan";

const TONE = Object.freeze({
  out: { chip: "bg-koi-warm-bg text-koi-warm-ink", dot: "bg-koi-ember" },
  training: { chip: "bg-koi-tint text-koi-primary", dot: "bg-koi-green" },
  travel: { chip: "bg-koi-amber-bg text-koi-amber-ink", dot: "bg-koi-amber" },
  prep: { chip: "bg-koi-lime-soft text-koi-forest", dot: "bg-koi-forest" },
  shop: { chip: "border border-koi-forest/15 bg-white text-koi-ink", dot: "bg-koi-primary" },
  plan: { chip: "bg-koi-forest text-koi-lime", dot: "bg-koi-lime" },
  auto: { chip: "bg-koi-forest text-koi-lime", dot: "bg-koi-lime" },
  remind: { chip: "bg-koi-paper text-koi-ink2", dot: "bg-koi-ink2" },
});
const card = "flex flex-col gap-4 rounded-[28px] border border-koi-forest/10 bg-white p-6";
const DISMISSED_KEY = "koi_pattern_dismissed_v1";
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (iso) => addDays(iso, -((weekdayOf(iso) + 6) % 7));
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const readDismissed = () => {
  try { return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]"); } catch { return []; }
};

/** A sentence said to KOI, as the start of an event. */
function eventFromWords(text, { people, me, today }) {
  const r = readScheduleSentence(text, { labels: people.map((p) => p.label), today });
  if (!r.kind) return { starts_on: today };
  const who = people.find((p) => p.label === r.member) ?? me;
  return {
    kind: r.kind,
    member_id: KIND[r.kind]?.person ? who?.memberId ?? null : null,
    slot: r.slot,
    starts_on: r.startsOn ?? today,
    ends_on: r.endsOn,
    repeat_days: r.repeatDays,
    at_time: r.atTime,
    title: r.title,
    source: "koi",
  };
}

function Head() {
  const ref = useRef(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(ref.current.querySelectorAll("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal });
    gsap.from(ref.current.querySelectorAll("[data-rise]"), { autoAlpha: 0, y: 12, duration: 0.7, stagger: 0.08, ease: E.reveal, delay: 0.1, clearProps: "opacity,visibility,transform" });
  }, { scope: ref });
  return (
    <header ref={ref} className="mb-7 flex flex-col gap-2">
      <span data-rise className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">Calendar · your household</span>
      <h1 className="koi-condensed m-0 font-koi-display text-[clamp(40px,5vw,68px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
        <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Your weeks, planned around your life</span></span>
      </h1>
      <p data-rise className="m-0 max-w-[760px] text-[15.5px] leading-relaxed text-koi-ink2">Meals out, training, travel and batch-cooking days: KOI plans each week around them. Add one here, or just tell KOI (&ldquo;lunch out every Tuesday&rdquo;, &ldquo;gym Mon Wed Fri&rdquo;, &ldquo;travelling 3 to 5 Nov&rdquo;).</p>
    </header>
  );
}

/** The subscription address and the download. */
function Feed({ s }) {
  const [token, setToken] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const address = token ? `${origin}/api/calendar/feed/${token}` : null;

  const look = async () => {
    const { data, error } = await getSupabaseClient().from("household").select("*").eq("id", s.householdId).maybeSingle();
    setToken(error ? null : data?.calendar_token ?? null);
    if (error) setNote("The calendar address can't be made right now.");
  };
  const turn = async (on) => {
    setBusy(true);
    const next = on ? globalThis.crypto.randomUUID() : null;
    const { error } = await getSupabaseClient().from("household").update({ calendar_token: next }).eq("id", s.householdId);
    setBusy(false);
    if (error) { setNote("That didn't save. Try again in a moment."); return; }
    setToken(next);
    setNote(on ? "Copy the address into Google Calendar (Other calendars → From URL) or Apple Calendar (New Calendar Subscription)." : "The old address no longer works.");
  };
  const download = () => {
    const labelOf = (id) => (s.saved ?? []).find((p) => String(p.memberId) === String(id))?.label ?? null;
    const ics = toICS(s.calendar.rows.map((e) => ({ ...e, member_label: labelOf(e.member_id) })), { name: "KOI · your household" });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "koi-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article data-card aria-label="Your calendar app" className={card}>
      <span className="flex flex-col gap-1">
        <span className="text-base font-bold">In your calendar app</span>
        <span className="text-[13px] text-koi-muted">See these events in Google or Apple Calendar. The address is secret: anyone with it can see the events, so turn it off to retire it.</span>
      </span>
      {token === undefined ? (
        <button type="button" onClick={look} className="h-11 self-start rounded-full border border-koi-forest/20 px-4 text-[13.5px] font-semibold text-koi-forest">Subscribe…</button>
      ) : token ? (
        <div className="flex flex-col gap-2">
          <input readOnly value={address} aria-label="Calendar address" onFocus={(e) => e.target.select()} className="h-11 rounded-2xl border border-koi-forest/15 bg-koi-paper px-3.5 font-koi-mono text-[12px]" />
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(address).then(() => setNote("Copied."))} className="h-10 rounded-full bg-koi-forest px-4 text-[13px] font-bold text-koi-lime">Copy address</button>
            <a href={address.replace(/^https?:/, "webcal:")} className="flex h-10 items-center rounded-full border border-koi-forest/20 px-4 text-[13px] font-semibold text-koi-forest no-underline">Open in calendar app</a>
            <button type="button" disabled={busy} onClick={() => turn(false)} className="h-10 rounded-full px-3 text-[13px] font-semibold text-koi-ink2 hover:bg-koi-paper">Turn off</button>
          </span>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => turn(true)} className="h-11 self-start rounded-full bg-koi-forest px-4 text-[13.5px] font-bold text-koi-lime disabled:opacity-40">Make a subscription address</button>
      )}
      <button type="button" onClick={download} disabled={!s.calendar.rows.length} className="self-start text-[13px] font-semibold text-koi-primary underline-offset-4 hover:underline disabled:opacity-40">Download as a file (.ics)</button>
      {note && <p className="m-0 text-[12.5px] text-koi-ink2">{note}</p>}
    </article>
  );
}

/** KOI's suggestions: a habit in the meal log, as a weekly meal out. */
function Suggestions({ s, today }) {
  const me = s.me;
  const [dismissed, setDismissed] = useState(readDismissed);
  const patterns = useMemo(() => {
    if (!s.meTracks || !me) return [];
    const covered = (p) => s.calendar.rows.some((e) => e.kind === "out" && String(e.member_id) === String(me.memberId) && e.slot === p.slot && (e.repeat_days ?? []).map(Number).includes(p.weekday));
    return eatOutPatterns(s.mealLog.rows, { today, dismissed }).filter((p) => !covered(p));
  }, [s.meTracks, me, s.calendar.rows, s.mealLog.rows, today, dismissed]);
  if (!patterns.length) return null;

  const take = async (p) => {
    const saved = await s.calendar.save({
      kind: "out", member_id: me.memberId, slot: p.slot, starts_on: today, repeat_days: [p.weekday], source: "koi",
      plan_effect: { setting: p.setting ?? "restaurant", size: "usual" },
    });
    if (saved.ok) s.notify(`${p.weekdayName} ${p.slot} is planned as out from now on. Change it any time here.`, "info");
  };
  const notNow = (p) => {
    const next = [...dismissed, p.key];
    setDismissed(next);
    try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* remembered for this visit */ }
  };

  return (
    <article data-card aria-label="KOI's suggestions" className="flex flex-col gap-4 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
      <span className="flex flex-col"><span className="font-koi-display text-lg font-extrabold leading-none">KOI noticed</span><span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/65">from your meals on Track</span></span>
      {patterns.map((p) => (
        <div key={p.key} className="flex flex-col gap-3 rounded-2xl bg-koi-bg p-5 text-koi-ink">
          <p className="m-0 text-[15px] font-semibold leading-snug">
            You&apos;ve had {p.slot} out on {p.weekdayName}s {p.weeks} of the last 4 weeks{p.dish ? `, mostly ${mealDishFor(p.dish)?.name.toLowerCase() ?? "the same"}` : ""}{p.setting ? ` (${SETTINGS[p.setting]?.label.toLowerCase()})` : ""}. Plan {p.weekdayName} {p.slot} as out?
          </p>
          <p className="m-0 text-[12.5px] text-koi-ink2">The week then leaves that plate empty instead of cooking a {p.slot} nobody eats{s.me && s.portions?.[String(s.me.memberId)] ? ", and sizes the rest of the day around a typical meal out" : ""}.</p>
          <span className="flex flex-wrap gap-2">
            <button type="button" onClick={() => take(p)} className="h-11 rounded-full bg-koi-forest px-5 text-sm font-bold text-koi-lime">Plan it as out</button>
            <button type="button" onClick={() => notNow(p)} className="h-11 rounded-full px-4 text-sm font-semibold text-koi-ink2 hover:bg-koi-paper">Not now</button>
          </span>
        </div>
      ))}
    </article>
  );
}

/**
 * @param {object} props
 * @param {object} props.s the plan session
 * @param {string|null} [props.ask] a sentence to open the add sheet on
 * @param {() => void} [props.onAsked] the sheet it opened has closed
 */
export default function CalendarView({ s, ask = null, onAsked = null }) {
  const root = useRef(null);
  const today = localDate();
  const people = s.saved ?? [];
  const me = people.find((p) => p.is_account_holder) ?? people[0] ?? null;
  const [from, setFrom] = useState(() => mondayOf(today));
  const [sheet, setSheet] = useState(() => (ask ? { id: "ask", event: eventFromWords(ask, { people, me, today }), asked: true } : null));
  const auto = useAutoplan(s.householdId);
  const [autoOpen, setAutoOpen] = useState(false);
  const to = addDays(from, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  // The auto-plan job is on the board too: a weekly "auto" event that opens its own sheet.
  const rows = useMemo(() => {
    const job = auto.job;
    if (!job || job.paused) return s.calendar.rows;
    const since = String(job.created_at ?? "").slice(0, 10) || today;
    return [...s.calendar.rows, { id: "autoplan", kind: "auto", starts_on: since, repeat_days: [job.weekday], at_time: job.local_time, title: "KOI drafts your next plan" }];
  }, [s.calendar.rows, auto.job, today]);
  const byDate = useMemo(() => occurrences(rows, from, to), [rows, from, to]);
  const labelOf = (id) => people.find((p) => String(p.memberId) === String(id))?.label ?? null;
  const planned = (date) => Boolean(s.weekSpan && date >= s.weekSpan.from && date <= s.weekSpan.to);

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    setupMotion().from(root.current.querySelectorAll("[data-card]"), { autoAlpha: 0, y: 30, duration: 0.85, stagger: 0.08, ease: E.dolly, delay: 0.15, clearProps: "opacity,visibility,transform" });
  }, { scope: root });

  const close = () => {
    if (sheet?.asked) onAsked?.();
    setSheet(null);
  };

  return (
    <div ref={root} className="font-koi-sans text-koi-ink">
      <Head />
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <article data-card aria-label="The week" className={`${card} self-start`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setFrom(addDays(from, -7))} aria-label="The week before" className="grid size-10 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">‹</button>
              <span className="min-w-[10.5rem] text-center text-[15px] font-bold">{from === mondayOf(today) ? "This week" : `${shortDate(from)} – ${shortDate(to)}`}</span>
              <button type="button" onClick={() => setFrom(addDays(from, 7))} aria-label="The week after" className="grid size-10 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">›</button>
              {from !== mondayOf(today) && <button type="button" onClick={() => setFrom(mondayOf(today))} className="h-10 rounded-full px-3 text-[13px] font-semibold text-koi-primary">Today</button>}
            </span>
            <button type="button" onClick={() => setSheet({ id: `new-${today}`, event: { starts_on: today } })} className="h-11 rounded-full bg-koi-forest px-5 text-[14px] font-bold text-koi-lime">+ Add</button>
          </div>
          {s.weekSpan && <p className="m-0 text-[12.5px] text-koi-muted"><span aria-hidden="true" className="mr-1.5 inline-block h-[3px] w-5 rounded-full bg-koi-lime align-middle" />This week&apos;s plan: {shortDate(s.weekSpan.from)} – {shortDate(s.weekSpan.to)}</p>}

          <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-7">
            {days.map((date) => {
              const list = byDate[date] ?? [];
              const isToday = date === today;
              return (
                <li key={date} className={`flex flex-col gap-1.5 rounded-2xl border p-2.5 md:min-h-[120px] ${isToday ? "border-koi-forest/30 bg-koi-lime-soft/60" : "border-koi-forest/10 bg-koi-paper"}`}>
                  <div className={`flex items-center justify-between gap-1 border-t-[3px] pt-1.5 ${planned(date) ? "border-koi-lime" : "border-transparent"}`}>
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-koi-ink2">{WEEKDAY_NAMES[weekdayOf(date)].slice(0, 3)}</span>
                      <span className={`font-koi-num text-[16px] font-semibold ${isToday ? "text-koi-forest" : ""}`}>{Number(date.slice(8))}</span>
                    </span>
                    <button type="button" onClick={() => setSheet({ id: `new-${date}`, event: { starts_on: date } })} aria-label={`Add on ${WEEKDAY_NAMES[weekdayOf(date)]} ${shortDate(date)}`} className="grid size-8 place-items-center rounded-full text-[16px] font-semibold text-koi-primary hover:bg-white">+</button>
                  </div>
                  {list.map((e) => (
                    <button key={`${e.id}-${date}`} type="button" onClick={() => (e.kind === "auto" ? setAutoOpen(true) : setSheet({ id: e.id, event: e }))} className={`flex flex-col items-start gap-0.5 rounded-xl px-2.5 py-2 text-left ${TONE[e.kind]?.chip ?? TONE.remind.chip}`}>
                      <span className="flex items-center gap-1.5 text-[12.5px] font-bold leading-tight">
                        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${TONE[e.kind]?.dot ?? TONE.remind.dot}`} />
                        {eventTitle(e, labelOf(e.member_id))}
                      </span>
                      <span className="text-[11px] opacity-80">{[e.at_time ? String(e.at_time).slice(0, 5) : null, repeatWords(e), e.pending ? "on this device" : null].filter(Boolean).join(" · ") || KIND[e.kind]?.label}</span>
                    </button>
                  ))}
                </li>
              );
            })}
          </ol>
          {s.calendar.error && <p role="alert" className="m-0 text-xs font-medium text-koi-red">{s.calendar.error}</p>}
        </article>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--koi-header-h)+84px)]">
          <Suggestions s={s} today={today} />
          <AutoPlanCard s={s} auto={auto} onOpen={() => setAutoOpen(true)} />
          <article data-card aria-label="How the plan reads it" className={card}>
            <span className="text-base font-bold">How KOI plans around it</span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px] text-koi-ink2">
              {["out", "travel", "training", "prep"].map((kind) => (
                <li key={kind} className="flex gap-2.5"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[kind].dot}`} /><span><span className="font-semibold text-koi-ink">{KIND[kind].label}.</span> {KIND[kind].hint}</span></li>
              ))}
            </ul>
            <Link href="/store/plan?step=plan" className="text-sm font-semibold text-koi-primary no-underline">See this week&apos;s plan →</Link>
          </article>
          <Feed s={s} />
        </aside>
      </section>

      {sheet && <EventSheet key={sheet.id} s={s} initial={sheet.event} onClose={close} />}
      {autoOpen && <AutoPlanSheet s={s} auto={auto} onClose={() => setAutoOpen(false)} />}
    </div>
  );
}
