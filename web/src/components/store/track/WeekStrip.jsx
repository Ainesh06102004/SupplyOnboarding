"use client";

// Track · the week at a glance: one column a day, a dot a meal (eaten as
// planned, some of it, skipped, something else, or not logged yet), and how the
// day is going against its reference (the person's numbers, or the plan). A day
// is a button: it opens that day in the Today card, so a forgotten lunch can be
// logged the next morning.

import { useMemo } from "react";
import { platesOfDay, dayLedger, targetFor } from "@/lib/plan/today";
import { inr } from "@/components/store/plan/design/tokens";

const DOT = Object.freeze({
  ate: "bg-koi-forest",
  partial: "bg-koi-green",
  skipped: "border border-koi-ink2/40 bg-transparent",
  other: "bg-koi-ember",
  none: "bg-koi-track",
});
const DOT_WORDS = Object.freeze({ ate: "eaten as planned", partial: "some of it", skipped: "skipped", other: "something else", none: "not logged" });

/**
 * @param {object} props
 * @param {object} props.s the plan session
 * @param {string} props.date the day selected
 * @param {string} props.today today's date
 * @param {(date: string) => void} props.onDate
 */
export default function WeekStrip({ s, date, today, onDate }) {
  const days = useMemo(() => {
    if (!s.week || !s.me) return [];
    const id = String(s.me.memberId);
    const sized = s.portions?.[id] ?? null;
    return s.week.days.map((d) => {
      const sizedDay = sized?.days?.find((x) => x.index === d.index) ?? null;
      const plates = platesOfDay({ week: s.week, sized, memberId: id, dayIndex: d.index, swaps: s.myTake2?.swaps ?? [] });
      const ledger = dayLedger({ plates, logs: s.logsByDate?.[d.date] ?? [], target: targetFor(s.me, sizedDay) });
      const ref = sizedDay ? sizedDay.target.kcal : ledger.planned.kcal;
      return { ...d, ledger, ref };
    });
  }, [s.week, s.me, s.portions, s.myTake2, s.logsByDate]);
  if (!days.length) return null;

  return (
    <nav data-card aria-label="This week's meals" className="flex flex-col gap-3 rounded-[28px] border border-koi-forest/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">This week</span>
        <span className="flex flex-wrap gap-3 text-[11.5px] text-koi-ink2">
          {["ate", "other", "skipped", "none"].map((k) => <span key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-2 rounded-full ${DOT[k]}`} />{DOT_WORDS[k]}</span>)}
        </span>
      </div>
      <ol className="m-0 grid list-none grid-cols-7 gap-1.5 p-0">
        {days.map((d) => {
          const on = d.date === date;
          const future = d.date > today;
          const logged = d.ledger.logged > 0;
          const delta = Math.round(d.ledger.expected.kcal - d.ref);
          return (
            <li key={d.index}>
              <button
                type="button"
                onClick={() => onDate(d.date)}
                aria-current={on ? "date" : undefined}
                aria-label={`${d.label} ${d.dayOfMonth}: ${d.ledger.logged} of ${d.ledger.rows.length} meals logged${logged ? `, ${Math.abs(delta)} kcal ${delta >= 0 ? "over" : "under"}` : ""}`}
                className={`flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 transition-colors ${on ? "bg-koi-forest text-koi-lime" : d.date === today ? "bg-koi-lime-soft text-koi-forest" : "text-koi-ink hover:bg-koi-paper"} ${future ? "opacity-70" : ""}`}
              >
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]">{d.label}</span>
                <span className="font-koi-num text-[17px] font-semibold leading-none">{d.dayOfMonth}</span>
                <span className="flex gap-[3px]" aria-hidden="true">
                  {d.ledger.rows.map((r) => <span key={r.slot} className={`size-[7px] rounded-full ${DOT[r.log?.status ?? "none"]}`} />)}
                </span>
                <span className={`font-koi-num text-[10.5px] ${on ? "text-koi-lime/80" : "text-koi-muted"}`}>{logged ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${inr(Math.abs(delta))}` : " "}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
