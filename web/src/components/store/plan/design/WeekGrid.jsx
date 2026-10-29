"use client";

// The design's "This week" grid, with dishes (Phase 2).
//
// Each cell is a meal from lib/plan/schedule.js: a shared dish cooked once for
// everyone who can have it, anyone's own dish when they can't, and the active
// person's additions — the basket items no dish uses — as the design's blue
// "goal addition" chips. Tap a cell to swap its meal for another that suits
// everyone at the table; drag one cell onto another to swap them. The amounts
// on the plates are the planner's own shares, spread over the meals.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { alternativesFor, productsFor, SLOT_LABELS } from "@/lib/plan/schedule";
import { peopleOf } from "@/lib/plan/planView";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { initialsOf, inr } from "./tokens";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useGlowing } from "@/components/agent/AgentProvider";
import { plateWords } from "@/lib/plan/portions";

/** One cell of a portioned week, for one person: the plates in grams and what they carry. */
function plateFor(sized, dayIndex, cellKey) {
  const day = sized?.days?.find((d) => d.index === dayIndex);
  const items = (day?.items ?? []).filter((i) => i.kind === "dish" && i.cellKey === cellKey);
  if (!items.length) return null;
  return {
    words: items.map((i) => plateWords(i, { max: 2 })).filter(Boolean).join(" · "),
    kcal: Math.round(items.reduce((a, i) => a + i.nutrition.kcal, 0)),
    protein: Math.round(items.reduce((a, i) => a + i.nutrition.protein, 0)),
  };
}

const SWAPPABLE = { breakfast: ["breakfast"], lunch: ["lunch", "dinner"], dinner: ["lunch", "dinner"], snack: ["snack"], drinks: ["drinks"] };
const amount = (a) => (a && a.amount ? `${a.amount}${a.unit ? ` ${a.unit}` : ""}` : null);

function Chip({ tone, children, title }) {
  const tones = {
    goal: "bg-koi-lime-soft text-koi-forest",
    shared: "bg-koi-tint text-koi-primary",
    cut: "bg-koi-red-bg text-koi-red",
    warn: "bg-koi-amber-bg text-koi-amber-ink",
  };
  return <span title={title} className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export default function WeekGrid({ s }) {
  const week = s.week;
  // A cell KOI's agent just changed glows for a moment.
  const glowing = useGlowing();
  const [menu, setMenu] = useState(null); // { key, x, y }
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const busy = Boolean(s.run && !s.run.done);
  const me = s.active?.memberId ? String(s.active.memberId) : null;
  // Their own numbers: this person's plates are sized in grams (lib/plan/portions.js).
  const sized = me ? s.portions?.[me] ?? null : null;
  const names = useMemo(() => new Map(s.lines.map((l) => [String(l.skuId), l.name])), [s.lines]);

  // The storyboard deals its panels in once; after that, a panel whose dishes
  // changed (a swap, a pick, a re-plan) flashes lime so the eye finds it.
  const boardRef = useRef(null);
  const seen = useRef(null);
  const dealt = useRef(false);
  const sig = week ? Object.entries(week.cells).map(([k, c]) => `${k}=${c.shared ? c.shared.dishes.map((x) => x.key).join("+") : ""}`).join("|") : "";
  useGSAP(() => {
    const root = boardRef.current;
    if (!root || !week) return;
    const gsap = setupMotion();
    const cells = [...root.querySelectorAll("[data-cell]")];
    const now = new Map(cells.map((el) => [el.dataset.cell, el.dataset.dishes]));
    if (!dealt.current) {
      dealt.current = true;
      if (!prefersReducedMotion()) gsap.from(cells, { autoAlpha: 0, y: 18, duration: 0.6, ease: E.reveal, stagger: { each: 0.018, from: "start" } });
    } else if (seen.current && !prefersReducedMotion()) {
      const changed = cells.filter((el) => seen.current.get(el.dataset.cell) !== el.dataset.dishes);
      if (changed.length && changed.length < cells.length) gsap.fromTo(changed, { backgroundColor: "#f4fbd0" }, { backgroundColor: "", duration: 1.4, ease: "power2.out", clearProps: "backgroundColor" });
    }
    seen.current = now;
  }, { scope: boardRef, dependencies: [sig] });

  // Touch: HTML5 drag and drop never fires on a phone. A long press picks a
  // dish up, a move carries it, lifting drops it; a quick swipe still scrolls
  // the grid and a tap still opens the swap menu. Native listeners, because a
  // drag must be able to stop the page scrolling (React's are passive).
  const gridRef = useRef(null);
  const latest = useRef({ week, swap: s.swapCells });
  useEffect(() => { latest.current = { week, swap: s.swapCells }; });
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    let press = { timer: null, from: null, active: false };
    const cellOf = (node) => node?.closest?.("[data-cell]")?.getAttribute("data-cell") ?? null;
    const cellAt = (t) => cellOf(document.elementFromPoint(t.clientX, t.clientY));
    const canDrop = (from, to) => {
      const cells = latest.current.week?.cells ?? {};
      return Boolean(to && to !== from && SWAPPABLE[cells[from]?.slot]?.includes(cells[to]?.slot));
    };
    const reset = () => { clearTimeout(press.timer); press = { timer: null, from: null, active: false }; };
    const start = (e) => {
      const from = cellOf(e.target);
      if (!from || !latest.current.week?.cells[from]?.shared || e.touches.length > 1) return;
      reset();
      press.from = from;
      press.timer = setTimeout(() => { press.active = true; setDrag(from); navigator.vibrate?.(15); }, 350);
    };
    const move = (e) => {
      if (!press.active) { clearTimeout(press.timer); return; }
      e.preventDefault();
      const to = cellAt(e.touches[0]);
      setOver(canDrop(press.from, to) ? to : null);
    };
    const end = (e) => {
      if (press.active) {
        e.preventDefault(); // no click: the menu stays shut after a drag
        const to = e.changedTouches?.[0] ? cellAt(e.changedTouches[0]) : null;
        if (canDrop(press.from, to)) latest.current.swap(press.from, to);
        setDrag(null);
        setOver(null);
      }
      reset();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", end);
    return () => {
      reset();
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menu]);

  if (!week) return null;
  const cols = `92px repeat(${week.days.length}, minmax(124px, 1fr))`;
  const minWidth = 92 + week.days.length * 134;
  const openCell = menu ? week.cells[menu.key] : null;
  const alternatives = openCell ? alternativesFor(openCell, s.eating) : [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const range = `${week.days[0].dayOfMonth} ${MONTHS[week.days[0].month]} – ${week.days.at(-1).dayOfMonth} ${MONTHS[week.days.at(-1).month]}`;
  const SLOT_LETTER = { breakfast: "B", lunch: "L", dinner: "D", snack: "S", drinks: "R" };

  return (
    <section data-card ref={boardRef} aria-label="This week, as a storyboard" className={`mb-5 rounded-[28px] border border-koi-forest/10 bg-white p-6 ${busy ? "opacity-70" : ""}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">This week</span>
          <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">{range}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(s.picks).length > 0 && (
            <button type="button" onClick={s.clearPicks} className="h-10 rounded-full border border-koi-forest/15 bg-white px-4 text-[13px] font-semibold text-koi-ink2">Undo my swaps</button>
          )}
          <button type="button" disabled={busy || !s.picked.length} onClick={() => s.makePlan().catch((e) => s.setError(e?.message))} className="h-10 rounded-full border border-koi-forest/15 bg-white px-4 text-[13px] font-semibold text-koi-ink2 disabled:opacity-60">Re-plan week</button>
          <button type="button" disabled={busy} onClick={() => s.command("cheaper")} className="h-10 rounded-full bg-koi-tint px-4 text-[13px] font-semibold text-koi-primary disabled:opacity-60">Make it cheaper</button>
        </div>
      </div>

      {sized && (
        <div className={`mb-2.5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ${sized.within ? "bg-koi-tint text-koi-primary" : "bg-koi-amber-bg text-koi-amber-ink"}`}>
          <span className="text-[13px] font-semibold">
            {sized.within
              ? `Sized to ${s.active.label === "Me" ? "your" : `${s.active.label}'s`} own numbers: every day lands within ±${sized.tolerance}%.`
              : `Sized to ${s.active.label === "Me" ? "your" : `${s.active.label}'s`} own numbers: ${sized.days.filter((d) => d.within).length} of ${sized.days.length} days land within ±${sized.tolerance}%.`}
          </span>
          {!sized.within && <span className="text-[12px] font-medium">The rest say what they miss below. Ask KOI for a protein-richer swap, or widen the tolerance in You.</span>}
        </div>
      )}

      {(s.batches ?? []).length > 0 && (
        <div aria-label="Cooking sessions" className="mb-3.5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {s.batches.map((b) => (
            <div key={b.id} className="flex items-center gap-3.5 rounded-2xl border border-koi-forest/10 bg-white px-4 py-3">
              <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-koi-tint font-koi-num text-[17px] font-bold text-koi-primary">{b.id}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">Batch {b.id} · cook on {b.cookLabel ?? "the prep day"} · {b.boxes} boxes</span>
                <span className="text-[14.5px] font-bold leading-snug">{b.dishes.map((x) => x.name).join(" + ")}</span>
                <span className="text-[12.5px] text-koi-ink2">{b.slot === "lunch" ? "Lunch" : "Dinner"}, {b.cells.map((c) => week.days[Number(c.split(":")[0])]?.label).join(", ")}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {b.dishes.map((x) => (
                  <Link key={x.key} href={`/store/plan/dish/${x.key}?batch=${b.id}`} className="text-[12.5px] font-bold text-koi-primary no-underline hover:underline">{b.dishes.length > 1 ? `${x.name} →` : "Recipe →"}</Link>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-4 rounded-xl bg-koi-paper px-3.5 py-2.5 text-[11px] font-medium text-koi-ink2">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-koi-tint ring-1 ring-koi-tint-border" />Base dish <span className="text-koi-muted">— same for everyone, cooked once</span></span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-koi-lime-soft ring-1 ring-koi-lime" />{s.active?.label === "Me" ? "Your" : `${s.active?.label ?? "Their"}'s`} addition <span className="text-koi-muted">— on that plate only</span></span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-koi-red-bg ring-1 ring-koi-red/20" />Left out for them</span>
      </div>

      {s.menuNeeds.stocked.some((n) => n.anchor) && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-koi-warm-border bg-koi-warm-bg px-4 py-3">
          <span className="text-[13px] font-medium">
            Your menu needs <strong>{s.menuNeeds.stocked.filter((n) => n.anchor).map((n) => n.ingredient.toLowerCase()).join(", ")}</strong> — KOI stocks it, and this plan didn’t buy it.
          </span>
          <button type="button" disabled={busy} onClick={() => s.buyForMenu(s.menuNeeds.stocked.filter((n) => n.anchor)).catch((e) => s.setError(e?.message))} className="h-10 rounded-full bg-koi-forest px-4 text-[13px] font-bold text-koi-lime disabled:opacity-60">Add it to the plan</button>
        </div>
      )}
      {s.menuNeeds.notStocked.some((n) => n.anchor) && (
        <div className="mb-3.5 rounded-2xl bg-koi-amber-bg px-4 py-2.5 text-xs font-medium text-koi-ink2">
          Your menu needs <strong>{s.menuNeeds.notStocked.filter((n) => n.anchor).map((n) => n.ingredient.toLowerCase()).join(", ")}</strong>, which KOI doesn’t stock yet — buy it where you shop for fresh things, or swap the dish.
        </div>
      )}

      <div className="koi-plan-grid-wrap" ref={gridRef}>
        <div className="mb-2.5 grid gap-2.5" style={{ gridTemplateColumns: cols, minWidth }}>
          <div />
          {week.days.map((d) => (
            <div key={d.index} data-day className={`rounded-lg px-1 py-1.5 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${d.today ? "bg-koi-forest text-koi-lime" : "text-koi-ink2"}`}>
              {d.label} <span className="opacity-75">{d.dayOfMonth}</span>
            </div>
          ))}
        </div>
        {week.slots.map((slot) => (
          <div key={slot} className="mb-2.5 grid items-stretch gap-2.5" style={{ gridTemplateColumns: cols, minWidth }}>
            <div className="flex items-center font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2">{SLOT_LABELS[slot]}</div>
            {week.days.map((d) => {
              const key = `${d.index}:${slot}`;
              const cell = week.cells[key];
              const mine = me ? cell.own[me] : null;
              const notMine = me ? cell.none[me] : null;
              const notes = me ? cell.notes[me] : null;
              // Out for this meal (the Calendar): no additions on a plate they won't eat.
              const meAway = Boolean(me && cell.away?.some((id) => String(id) === String(me)));
              const adds = me && !meAway ? (week.additions[me] ?? []).filter((a) => a.slot === slot) : [];
              const others = Object.entries(cell.own).filter(([id]) => id !== me);
              const plate = sized ? plateFor(sized, d.index, key) : null;
              // A sized week says what each addition weighs that day, not the week's average,
              // and leaves off one that day's portions don't need (portions.js drops a 0 g addition).
              const sizedDay = sized?.days?.find((x) => x.index === d.index) ?? null;
              const sizedAdd = (a) => sizedDay?.items?.find((i) => i.kind === "addition" && i.skuId === String(a.skuId))?.grams;
              const dropOk = drag && drag !== key && SWAPPABLE[week.cells[drag]?.slot]?.includes(slot);
              const open = menu?.key === key;
              return (
                <div
                  key={key}
                  data-cell={key}
                  data-dishes={cell.shared ? cell.shared.dishes.map((x) => x.key).join("+") : ""}
                  className={`relative flex min-h-[90px] flex-col gap-1.5 rounded-2xl border px-3 pb-[11px] pt-3 transition-[translate,box-shadow] duration-300 ${cell.shared ? "cursor-pointer hover:-translate-y-1" : ""} ${over === key ? "border-koi-forest bg-koi-lime-soft ring-2 ring-koi-forest" : open ? "border-koi-green bg-white shadow-[0_14px_28px_-10px_rgba(0,0,0,.22)]" : d.today ? "border-koi-forest/20 bg-koi-paper" : "border-koi-forest/10 bg-white"} ${glowing("cell", key) ? "koi-glow" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-haspopup={cell.shared ? "menu" : undefined}
                  aria-expanded={cell.shared ? open : undefined}
                  draggable={Boolean(cell.shared)}
                  onDragStart={(e) => { setDrag(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); }}
                  onDragOver={(e) => { if (dropOk) { e.preventDefault(); setOver(key); } }}
                  onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={(e) => { e.preventDefault(); if (dropOk) s.swapCells(drag, key); setDrag(null); setOver(null); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={(e) => {
                    if (!cell.shared) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu((m) => (m?.key === key ? null : { key, x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 4 }));
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && cell.shared) { const r = e.currentTarget.getBoundingClientRect(); setMenu({ key, x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 4 }); } }}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    {cell.shared ? (
                      <span className="font-koi-display text-[14.5px] font-bold leading-tight text-koi-ink">{cell.shared.dishes.map((x) => x.name).join(" + ")}</span>
                    ) : cell.away?.length ? (
                      <span className="text-[12.5px] font-semibold text-koi-warm-ink">Out, from your Calendar</span>
                    ) : (
                      <span className="text-[12px] text-koi-muted/70">—</span>
                    )}
                    <span className="shrink-0 font-koi-mono text-[9.5px] text-koi-muted">{String(d.index + 1).padStart(2, "0")}{SLOT_LETTER[slot] ?? ""}</span>
                  </div>
                  {cell.shared?.chosen && <span className="self-start rounded-md bg-koi-lime px-[7px] py-[3px] font-koi-mono text-[9.5px] font-bold tracking-[0.1em] text-koi-forest">YOUR PICK</span>}
                  {cell.shared?.batch && (() => {
                    const b = (s.batches ?? []).find((x) => x.id === cell.shared.batch);
                    return b ? <span className="self-start rounded-md bg-koi-tint px-[7px] py-[3px] font-koi-mono text-[9.5px] font-bold tracking-[0.1em] text-koi-primary">BATCH {b.id} · {b.cells.indexOf(key) + 1}/{b.boxes}</span> : null;
                  })()}
                  {(mine || notMine || adds.length > 0 || notes?.leaveOut?.length > 0 || notes?.notVerifiedFor?.length > 0 || others.length > 0 || (cell.shared && cell.away?.length > 0)) && (
                    <div className="flex flex-wrap gap-1">
                      {cell.shared && cell.away?.map((id) => <Chip key={`away-${id}`} tone="shared" title="From your Calendar">{s.eating.find((p) => String(p.memberId) === id)?.label ?? "Someone"}: out</Chip>)}
                      {mine && <Chip tone="goal">{s.active.label}: {mine.dishes.map((x) => x.name).join(" + ")}</Chip>}
                      {/* "Not for Me" only beside a dish others have; an empty slot isn't about Me. */}
                      {notMine && cell.shared && <Chip tone="cut" title={notMine}>Not for {s.active.label}</Chip>}
                      {notes?.leaveOut?.map((i) => <Chip key={i} tone="cut">−{i.toLowerCase()}</Chip>)}
                      {adds.map((a) => {
                        const g = sizedAdd(a);
                        if (sizedDay && g === undefined) return null;
                        const amount = g !== undefined ? ` ${g} g` : a.perDay ? ` ${a.perDay}${a.unit ? ` ${a.unit}` : ""}` : "";
                        return <Chip key={a.skuId} tone="goal">+{a.asDish ? `${a.asDish.name} (${a.name}` : a.name}{amount}{a.asDish ? ")" : ""}</Chip>;
                      })}
                      {notes?.notVerifiedFor?.length > 0 && <Chip tone="warn" title="A spice blend can hide anything">Check for {notes.notVerifiedFor.join(", ")}</Chip>}
                      {others.map(([id, o]) => <Chip key={id} tone="shared">{s.eating.find((p) => String(p.memberId) === id)?.label}: {o.dishes.map((x) => x.name).join(" + ")}</Chip>)}
                    </div>
                  )}
                  {plate && (
                    <div className="mt-auto flex flex-col gap-0.5 pt-1">
                      <span className="text-[10.5px] leading-snug text-koi-ink2">{plate.words}</span>
                      <span className="font-koi-num text-[11.5px] font-semibold text-koi-ink">{inr(plate.kcal)} <span className="font-medium text-koi-muted">kcal · P {plate.protein}</span></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {sized && (
          <div className="mb-2.5 grid items-stretch gap-2.5" style={{ gridTemplateColumns: cols, minWidth }}>
            <div className="flex items-center font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-forest">{s.active.label === "Me" ? "Your day" : `${s.active.label}'s day`}</div>
            {week.days.map((d) => {
              const day = sized.days.find((x) => x.index === d.index);
              if (!day) return <div key={d.index} />;
              const worst = Math.max(1, Math.ceil(Math.max(...["kcal", "protein", "carbs", "fat"].map((n) => Math.abs(day.deviation[n])))));
              return (
                <div key={d.index} className="flex flex-col gap-1 rounded-2xl border border-koi-forest/10 bg-koi-paper p-3">
                  <span className="font-koi-num text-[16px] font-semibold text-koi-forest">{inr(day.totals.kcal)} <span className="text-[11px] font-medium text-koi-muted">kcal</span></span>
                  <span className="font-koi-num text-[11.5px] font-medium text-koi-ink2">P {Math.round(day.totals.protein)} · C {Math.round(day.totals.carbs)} · F {Math.round(day.totals.fat)}</span>
                  <span className={`self-start rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${day.within ? "bg-koi-tint text-koi-primary" : "bg-koi-amber-bg text-koi-amber-ink"}`}>{day.within ? `within ${worst}%` : day.gap}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openCell && (
        <div role="menu" className="fixed z-[80] max-h-80 w-[212px] overflow-y-auto rounded-2xl border border-koi-forest/10 bg-white p-1 font-koi-sans shadow-[0_18px_34px_-10px_rgba(0,0,0,.28)]" style={{ left: menu.x, top: menu.y }}>
          <span className="block px-2.5 pb-0.5 pt-1.5 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-koi-muted">Recipe</span>
          {openCell.shared.dishes.map((x) => (
            <Link key={x.key} role="menuitem" href={`/store/plan/dish/${x.key}?cell=${encodeURIComponent(openCell.key)}${openCell.shared.batch ? `&batch=${openCell.shared.batch}` : ""}`} className="block rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-koi-primary no-underline hover:bg-koi-paper">
              {x.name} →
            </Link>
          ))}
          <span className="block px-2.5 pb-0.5 pt-1.5 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-koi-muted">Swap meal</span>
          {alternatives.length === 0 && <div className="px-2.5 py-2 text-xs text-koi-muted">Nothing else suits everyone here.</div>}
          {alternatives.map((alt) => (
            <button
              key={alt.key}
              type="button"
              role="menuitem"
              onClick={() => {
                const dishes = openCell.shared.dishes.some((x) => x.kind === alt.kind)
                  ? openCell.shared.dishes.map((x) => (x.kind === alt.kind ? alt.key : x.key))
                  : [alt.key];
                s.pickDishes(openCell.key, dishes);
                setMenu(null);
              }}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-koi-ink hover:bg-koi-paper"
            >
              {alt.name} <span className="font-koi-mono text-[10px] text-koi-muted">{alt.kind === "base" ? "base" : alt.kind === "main" ? "main" : ""}</span>
              {(() => {
                const missing = week.staplesMissing(alt.key);
                if (!missing.length) return null;
                const stocked = productsFor(missing, s.products).every((f) => f.product);
                return <span className="block text-[10.5px] text-koi-warm">needs {missing.map((m) => m.ingredient.toLowerCase()).join(", ")} — {stocked ? "KOI can add it" : "KOI doesn't stock it yet"}</span>;
              })()}
            </button>
          ))}
          {s.picks[openCell.key] && (
            <button type="button" onClick={() => { s.pickDishes(openCell.key, []); setMenu(null); }} className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-koi-green hover:bg-koi-paper">Back to KOI’s pick</button>
          )}
          <button type="button" onClick={() => setMenu(null)} className="block w-full rounded-lg px-2.5 py-2 text-left text-[11.5px] text-koi-muted hover:bg-koi-paper">Close</button>
        </div>
      )}

      <p className="m-0 mt-2.5 text-[11.5px] text-koi-muted">
        Typical home recipes, cooked your way. What a dish contains is read from its usual ingredients — check your own recipe for allergens. Drag a meal onto another to swap them.
      </p>

      <TodayPlates s={s} names={names} />
    </section>
  );
}

/** Each person's plate today: their meals, with the planner's amounts per serving. */
function TodayPlates({ s, names }) {
  const week = s.week;
  const people = peopleOf(s.plan.report, s.plan.days).sort((a, b) => s.orderOf(a.id) - s.orderOf(b.id));
  return (
    <div className="mt-4 rounded-2xl bg-koi-paper p-4">
      <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-muted">Each person’s plate · today</span>
      {people.map((p) => {
        const id = String(p.id);
        const profile = s.eating.find((x) => String(x.memberId) === id);
        const meals = week.slots.map((slot) => {
          const cell = week.cells[`0:${slot}`];
          const dishes = cell.own[id]?.dishes ?? (cell.shared?.eaters.includes(id) ? cell.shared.dishes : null);
          if (!dishes) return null;
          const used = [...new Set(dishes.flatMap((x) => s.week.usesFor(x.key, id).map((u) => u.skuId)))];
          const bits = used.map((sku) => { const a = amount(week.perServing(id, sku)); return a ? `${names.get(sku) ?? "basket"} ${a}` : null; }).filter(Boolean);
          return { slot, text: `${SLOT_LABELS[slot]}: ${dishes.map((x) => x.name).join(" + ")}`, bits };
        }).filter(Boolean);
        const adds = week.additions[id] ?? [];
        return (
          <div key={id} className="flex items-start gap-2.5 border-b border-koi-forest/10 py-2 last:border-b-0">
            <span className="grid size-7 shrink-0 place-items-center rounded-full font-koi-num text-[10px] font-bold text-white" style={{ background: s.colourFor(id) }}>{initialsOf(p.label)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{p.label}</span>
                <span className="font-koi-mono text-[10px] text-koi-muted">{profile ? goalShortLabel(profile) : ""}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {meals.map((m) => (
                  <span key={m.slot} className="rounded-md border border-koi-forest/10 bg-white px-2 py-0.5 text-[10.5px]">
                    {m.text}{m.bits.length ? <span className="text-koi-muted"> · {m.bits.join(" · ")}</span> : null}
                  </span>
                ))}
                {adds.map((a) => (
                  <span key={a.skuId} className="rounded-md bg-koi-lime-soft px-2 py-0.5 text-[10.5px] font-semibold text-koi-forest">+ {a.asDish ? `${a.asDish.name}: ` : ""}{a.name}{a.perDay ? ` ${a.perDay}${a.unit ? ` ${a.unit}` : ""}` : ""}</span>
                ))}
                <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${p.met ? "bg-koi-tint text-koi-primary" : "bg-koi-amber-bg text-koi-amber-ink"}`}>
                  {p.met ? "Every target met" : `Short ${p.short.map((x) => (x.nutrient === "kcal" ? `${x.perDay} kcal` : `${x.perDay} g ${x.nutrient}`)).join(", ")} a day`}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-koi-num text-[13px] font-semibold">{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"}</div>
              <div className="font-koi-mono text-[9.5px] text-koi-muted">{p.target.kcal ? `kcal / ${inr(p.target.kcal)}` : "kcal a day"}</div>
            </div>
          </div>
        );
      })}
      <p className="m-0 mt-2 text-[10.5px] text-koi-muted">Amounts are each person’s share of the basket from the plan, spread over the meals it’s cooked in. Calories are the plan’s daily average.</p>
    </div>
  );
}
