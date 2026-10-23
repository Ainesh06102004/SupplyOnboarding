"use client";

// ============================================================================
// Track · Today: the day's meals as the week planned them for the account
// holder, and what they actually ate.
//
// Each meal is the person's own plate (lib/plan/today.js): their sized grams
// on their own numbers, the recipe's serving otherwise, a Take 2's swap or
// smaller plate where one applies. "Ate it" logs it as planned; "Something
// else" marks the row and asks in the KOI bar (MealAsk): a meal out, part of
// it, or none. No sheet: the bar is the one place KOI talks.
// The day's figures are the ledger's: eaten so far, the day as it is going,
// against the person's numbers (or, without them, the plan). The week strip
// (WeekStrip) picks the day, so yesterday can be filled in too.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { platesOfDay, dayLedger, targetFor } from "@/lib/plan/today";
import { plateWords } from "@/lib/plan/portions";
import { SLOT_KEYS, SLOT_LABELS } from "@/lib/plan/schedule";
import { mealDishFor } from "@/lib/food/estimate";
import { inr } from "@/components/store/plan/design/tokens";
import MealAsk, { itemOf } from "./MealAsk";
import { useBarFacts } from "@/components/store/shell/useBarPrompt";

/** What the bar's ask opens with: the sentence's reading, or the meal as KOI's agent logged it. */
function initialFor(opening, log) {
  if (opening?.read) {
    const r = opening.read;
    const items = r.items.map((i) => itemOf({ dishKey: i.dishKey, portion: i.portion, count: i.count }));
    const unnamed = r.status === "other" && !items.length && !r.ambiguous.length;
    return {
      mode: r.status,
      items: unnamed ? [itemOf({ text: opening.sentence.slice(0, 80), portion: r.portion })] : items,
      query: r.ambiguous[0]?.words.join(" ") ?? "",
      // "Full plate" says how much of whichever pizza they pick.
      portion: r.portion ?? "usual",
      setting: r.setting ?? "restaurant",
      said: opening.sentence,
    };
  }
  if (log) {
    return {
      mode: log.status,
      items: (log.other?.items ?? []).map((i) => itemOf({ dishKey: i.dish_key, text: i.text, portion: i.portion, count: i.count })),
      setting: log.other?.setting ?? "restaurant",
    };
  }
  return null;
}

const card = "flex flex-col gap-4 rounded-[28px] border border-koi-forest/10 bg-white p-6";
const STATUS_WORDS = Object.freeze({ ate: "Ate it", partial: "Had some", skipped: "Skipped" });
const quarter = (f) => (f === 0.75 ? "¾" : f === 0.5 ? "½" : f === 1.25 ? "1¼" : `${Math.round(f * 100)}%`);

/** The person's day: plates, log and ledger, as the session has them. */
export function useDay(s, date) {
  return useMemo(() => {
    const me = s.me;
    const id = me ? String(me.memberId) : null;
    const day = s.week?.days?.find((d) => d.date === date) ?? null;
    const sized = id ? s.portions?.[id] ?? null : null;
    const sizedDay = day ? sized?.days?.find((x) => x.index === day.index) ?? null : null;
    const plates = day && id ? platesOfDay({ week: s.week, sized, memberId: id, dayIndex: day.index, swaps: s.myTake2?.swaps ?? [], outs: s.myOuts ?? {} }) : [];
    const logs = s.logsByDate?.[date] ?? [];
    const target = me ? targetFor(me, sizedDay) : null;
    const ledger = dayLedger({ plates, logs, target, tolerancePct: Number(me?.target_tolerance_pct) || 5 });
    return { day, plates, logs, ledger, sized: Boolean(sizedDay), target };
  }, [s.me, s.week, s.portions, s.myTake2, s.myOuts, s.logsByDate, date]);
}

/** Eaten (forest) inside the day as it's going (lime), against the day's reference. */
function Bar({ eaten, expected, of }) {
  const pct = (n) => Math.max(0, Math.min(100, (n / of) * 100));
  return (
    <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
      <rect width="100" height="10" className="fill-koi-track" />
      <rect width={pct(expected)} height="10" className="fill-koi-lime-soft" />
      <rect width={pct(eaten)} height="10" className="fill-koi-forest" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {object} props.s the plan session
 * @param {string} props.date the day shown, YYYY-MM-DD
 * @param {string} props.today today's date
 * @param {object|null} [props.opening] a meal to open on: { date, slot, sentence, read } or { date, slot, fromLog }
 * @param {() => void} [props.onOpened] called when that sheet closes (the page drops it from the address)
 */
export default function TodayCard({ s, date, today, opening = null, onOpened = null }) {
  const { day, ledger, target, sized } = useDay(s, date);
  const [sheet, setSheet] = useState(() => (opening ? { id: "ask", slot: opening.slot, opening } : null));
  const scale = s.myTake2?.scale ?? {};
  const dayLabel = date === today ? "Today" : day ? `${day.label} ${day.dayOfMonth}` : date;
  const ref = target?.kcal > 0 && sized ? target.kcal : ledger.planned.kcal;
  const takes = (s.adjustments ?? []).filter((a) => a.on === date);
  const sizedItems = s.portions?.[String(s.me?.memberId)]?.days?.find((d) => d.date === date)?.items ?? [];
  const plateOf = (cellKey) => sizedItems.find((i) => i.cellKey === cellKey && i.kind === "dish") ?? null;

  const ate = async (row) => {
    const saved = await s.mealLog.save({ eaten_on: date, slot: row.slot, status: "ate", planned: row.cellKey ? { cell: row.cellKey, dishes: row.dishes.map((d) => d.key), nutrition: row.nutrition } : null, other: null, estimate: null, source: "track" });
    if (saved.pending) s.notify("Logged on this device; it saves when KOI can reach your account.", "warn");
  };
  const undo = async (row) => { await s.mealLog.remove(date, row.slot); };
  const freeSlots = SLOT_KEYS.filter((k) => k !== "drinks" && !ledger.rows.some((r) => r.slot === k));
  // Today's next meal still to log: the KOI bar offers it by name ("… instead of Jeera rice").
  const next = date === today ? ledger.rows.find((r) => !r.log && !r.out && r.dishes.length) ?? null : null;
  useBarFacts({ nextMeal: next ? { slot: next.slot, dish: next.dishes.map((d) => d.name).join(" with ") } : null });

  return (
    <article data-card aria-label={`${dayLabel}'s meals`} className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">{dayLabel === "Today" ? "Today" : "Your meals"} · {day ? `${day.label} ${day.dayOfMonth}` : date}</span>
          <span className="text-lg font-bold">{ledger.logged ? `${inr(Math.round(ledger.eaten.kcal))} kcal eaten, ${Math.round(ledger.eaten.protein)} g protein` : "Nothing logged yet"}</span>
        </span>
        {ref > 0 && (
          <span className="text-right text-[13px] text-koi-ink2">
            The day as it&apos;s going: <span className="font-koi-num font-semibold text-koi-ink">{inr(Math.round(ledger.expected.kcal))}</span> of {inr(Math.round(ref))} kcal
            <span className="block text-[12px] text-koi-muted">{sized ? "your numbers" : "the day's plan"}</span>
          </span>
        )}
      </div>
      {ref > 0 && <Bar eaten={ledger.eaten.kcal} expected={ledger.expected.kcal} of={Math.max(ref, ledger.expected.kcal)} />}

      {!day && (
        <p className="m-0 text-[14px] text-koi-ink2">
          No plan covers {dayLabel === "Today" ? "today" : "this day"}. You can still log what you ate; <Link href="/store/plan" className="font-semibold text-koi-primary underline-offset-4 hover:underline">make this week&apos;s plan</Link> and KOI can rebalance it.
        </p>
      )}

      <ul className="m-0 flex list-none flex-col p-0">
        {ledger.rows.map((row) => {
          const f = row.cellKey ? scale[row.cellKey] : null;
          const names = row.dishes.map((d) => d.name).join(" with ");
          const log = row.log;
          // The plan's dish, when something else was eaten (or nothing), is struck through, not counted.
          const notEaten = log && ["other", "skipped"].includes(log.status);
          const outNames = (log?.other?.items ?? []).map((x) => (x.dish_key ? mealDishFor(x.dish_key)?.name ?? x.dish_key : x.text)).join(", ");
          const asking = sheet?.slot === row.slot;
          return (
            <li key={row.slot} className={`flex flex-wrap items-center justify-between gap-3 border-b py-3.5 last:border-b-0 ${asking ? "-mx-3.5 rounded-[18px] border-transparent bg-koi-warm-bg px-3.5 ring-2 ring-koi-ember" : "border-koi-forest/10"}`}>
              <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">{SLOT_LABELS[row.slot] ?? row.slot}</span>
                <span className={`text-[15px] font-bold ${notEaten && names ? "text-koi-muted line-through decoration-koi-muted/50" : ""}`}>{row.out ? "Out, from your Calendar" : names || (row.extras.length ? row.extras.map((x) => x.name).join(", ") : row.unplanned ? "Not on the plan" : "—")}</span>
                <span className={`text-[12.5px] ${notEaten ? "text-koi-muted" : "text-koi-ink2"}`}>
                  {row.out && !log && <>A typical {row.slot} out: about {inr(Math.round(row.nutrition.kcal))} kcal, until you say what it was</>}
                  {!row.out && row.nutrition.kcal > 0 && <>{inr(Math.round(row.nutrition.kcal * (f ?? 1)))} kcal · {Math.round(row.nutrition.protein * (f ?? 1))} g protein</>}
                  {row.sized && plateOf(row.cellKey) && <span className="block text-koi-muted">{plateWords(plateOf(row.cellKey))}</span>}
                  {row.extras.length > 0 && <span className="block text-koi-muted">+ {row.extras.map((x) => `${x.name} ${x.grams} g`).join(", ")}</span>}
                  {row.swap && <span className="block font-semibold text-koi-primary">Take 2: {row.swap === "box" ? "the spare box" : "your packed plate"}</span>}
                  {f && f !== 1 && <span className="block font-semibold text-koi-primary">Take 2: {quarter(f)} of your usual plate</span>}
                  {row.batch && !row.swap && <span className="block text-koi-muted">Batch {row.batch} box</span>}
                  {asking && <span className="block font-semibold text-koi-warm-ink">KOI is asking in the bar below ↓</span>}
                </span>
              </span>
              {log ? (
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${log.status === "other" ? "bg-koi-amber-bg text-koi-amber-ink" : log.status === "ate" ? "bg-koi-tint text-koi-primary" : "bg-koi-paper text-koi-ink2"}`}>
                    {log.status === "other" ? `${outNames || "Something else"} · ≈ ${inr(log.estimate?.point?.kcal ?? 0)} kcal` : STATUS_WORDS[log.status]}
                    {log.pending && " · on this device"}
                  </span>
                  <button type="button" onClick={() => undo(row)} className="h-9 rounded-full px-3 text-[12.5px] font-semibold text-koi-ink2 hover:bg-koi-paper">Undo</button>
                </span>
              ) : (
                <span className="flex gap-2">
                  {(row.cellKey || row.extras.length > 0) && !row.out && <button type="button" onClick={() => ate(row)} className="h-11 rounded-full bg-koi-forest px-4 text-[13.5px] font-bold text-koi-lime">Ate it</button>}
                  <button type="button" aria-pressed={asking} onClick={() => setSheet(asking ? null : { id: `${date}:${row.slot}`, slot: row.slot })} className={`h-11 rounded-full px-4 text-[13.5px] font-semibold ${asking ? "bg-koi-ember font-bold text-white" : row.out ? "bg-koi-forest font-bold text-koi-lime" : "border border-koi-forest/20 text-koi-forest hover:border-koi-forest/40"}`}>{row.out ? "Log what you had" : "Something else"}</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {freeSlots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-koi-ink2">
          <span>Had something {day ? "the plan didn't" : ""}?</span>
          {freeSlots.map((k) => <button key={k} type="button" onClick={() => setSheet({ id: `${date}:${k}`, slot: k })} className="h-9 rounded-full border border-koi-forest/15 px-3 text-[12.5px] font-semibold text-koi-forest">{SLOT_LABELS[k]}</button>)}
        </div>
      )}

      {takes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-koi-paper p-4">
          <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">Take 2 · {dayLabel}</span>
          {takes.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <span className={`text-[13.5px] ${a.undone ? "text-koi-muted line-through" : "font-semibold"}`}>{SLOT_LABELS[a.slot] ?? a.slot}: {a.title}</span>
              {!a.undone && <button type="button" onClick={() => s.undoAdjustment(a.id)} className="h-9 rounded-full px-3 text-[12.5px] font-semibold text-koi-ink2 hover:bg-white">Undo</button>}
            </div>
          ))}
        </div>
      )}

      {s.mealLog.error && <p role="alert" className="m-0 text-xs font-medium text-koi-red">{s.mealLog.error}</p>}

      {sheet && <OpenAsk sheet={sheet} ledger={ledger} s={s} date={date} dayLabel={dayLabel} onClose={() => { setSheet(null); if (sheet.opening) onOpened?.(); }} />}
    </article>
  );
}

/**
 * The bar's ask for one meal. The planned plate is read live (the week can
 * load after the ask opens), and a meal KOI logged reopens with what it logged
 * once the log has loaded: the key changes, so the ask starts again from it.
 */
function OpenAsk({ sheet, ledger, s, date, dayLabel, onClose }) {
  const row = ledger.rows.find((r) => r.slot === sheet.slot) ?? null;
  const logged = sheet.opening?.fromLog ? row?.log ?? null : null;
  const initial = initialFor(sheet.opening, logged);
  return (
    <MealAsk
      key={`${sheet.id}:${initial ? "ready" : "blank"}`}
      onClose={onClose}
      s={s}
      date={date}
      slot={sheet.slot}
      plate={row?.cellKey ? row : null}
      dayLabel={dayLabel}
      initial={initial}
    />
  );
}
