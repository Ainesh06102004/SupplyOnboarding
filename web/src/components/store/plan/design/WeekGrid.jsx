"use client";

// The design's "This week" grid, with dishes (Phase 2).
//
// Each cell is a meal from lib/plan/schedule.js: a shared dish cooked once for
// everyone who can have it, anyone's own dish when they can't, and the active
// person's additions — the basket items no dish uses — as the design's blue
// "goal addition" chips. Tap a cell to swap its meal for another that suits
// everyone at the table; drag one cell onto another to swap them. The amounts
// on the plates are the planner's own shares, spread over the meals.

import { useEffect, useMemo, useState } from "react";
import { alternativesFor, productsFor, SLOT_LABELS } from "@/lib/plan/schedule";
import { peopleOf } from "@/lib/plan/planView";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { C, font, cardStyle, initialsOf, inr } from "./tokens";
import { MonoLabel } from "./bits";

const SWAPPABLE = { breakfast: ["breakfast"], lunch: ["lunch", "dinner"], dinner: ["lunch", "dinner"], snack: ["snack"], drinks: ["drinks"] };
const amount = (a) => (a && a.amount ? `${a.amount}${a.unit ? ` ${a.unit}` : ""}` : null);

function Chip({ tone, children, title }) {
  const tones = {
    goal: { color: C.blue, background: C.blueBg },
    shared: { color: C.primary, background: C.tint },
    cut: { color: C.redText, background: C.redBg },
    warn: { color: C.warnText, background: C.warnBg },
  };
  return <span title={title} style={{ font: font(600, 9), borderRadius: 5, padding: "2px 5px", ...tones[tone] }}>{children}</span>;
}

export default function WeekGrid({ s }) {
  const week = s.week;
  const [menu, setMenu] = useState(null); // { key, x, y }
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const busy = Boolean(s.run && !s.run.done);
  const me = s.active?.memberId ? String(s.active.memberId) : null;
  const names = useMemo(() => new Map(s.lines.map((l) => [String(l.skuId), l.name])), [s.lines]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menu]);

  if (!week) return null;
  const cols = `96px repeat(${week.days.length}, minmax(120px, 1fr))`;
  const minWidth = 96 + week.days.length * 127;
  const openCell = menu ? week.cells[menu.key] : null;
  const alternatives = openCell ? alternativesFor(openCell, s.eating) : [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const range = `${week.days[0].dayOfMonth} ${MONTHS[week.days[0].month]} – ${week.days.at(-1).dayOfMonth} ${MONTHS[week.days.at(-1).month]}`;

  return (
    <div style={{ ...cardStyle, marginBottom: 18, opacity: busy ? 0.72 : 1, transition: "opacity .2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ font: font(700, 17) }}>This week</span>
          <span style={{ font: font(500, 12), color: C.faint }}>{range}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(s.picks).length > 0 && (
            <button type="button" onClick={s.clearPicks} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "8px 12px", font: font(600, 12), color: C.ink2, cursor: "pointer" }}>Undo my swaps</button>
          )}
          <button type="button" disabled={busy || !s.picked.length} onClick={() => s.makePlan().catch((e) => s.setError(e?.message))} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "8px 12px", font: font(600, 12), color: C.ink2, cursor: busy ? "wait" : "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke={C.ink2} strokeWidth="2" strokeLinecap="round" /></svg>
            Re-plan week
          </button>
          <button type="button" disabled={busy} onClick={() => s.command("cheaper")} style={{ display: "flex", alignItems: "center", gap: 6, background: C.tint2, border: `1px solid ${C.tintBorder}`, borderRadius: 10, padding: "8px 12px", font: font(600, 12), color: C.primary, cursor: busy ? "wait" : "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Make it cheaper
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, padding: "10px 14px", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 12, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.tint, border: "1px solid #b6d9c3" }} /><span style={{ font: font(500, 11), color: C.ink2 }}>Base dish <span style={{ color: C.faint }}>— same for everyone, cooked once</span></span></span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.blueBg, border: `1px solid ${C.blueBorder}` }} /><span style={{ font: font(500, 11), color: C.ink2 }}>{s.active?.label === "Me" ? "Your" : `${s.active?.label ?? "Their"}'s`} addition <span style={{ color: C.faint }}>— on that plate only</span></span></span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.redBg, border: "1px solid #e8bfb8" }} /><span style={{ font: font(500, 11), color: C.ink2 }}>Left out for them</span></span>
      </div>

      {s.menuNeeds.stocked.some((n) => n.anchor) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, padding: "12px 14px", background: C.warmBg, border: "1px solid #f0d2bf", borderRadius: 12, flexWrap: "wrap" }}>
          <span style={{ font: font(500, 13), color: C.ink }}>
            Your menu needs <strong>{s.menuNeeds.stocked.filter((n) => n.anchor).map((n) => n.ingredient.toLowerCase()).join(", ")}</strong> — KOI stocks it, and this plan didn&apos;t buy it.
          </span>
          <button type="button" disabled={busy} onClick={() => s.buyForMenu(s.menuNeeds.stocked.filter((n) => n.anchor)).catch((e) => s.setError(e?.message))} style={{ cursor: busy ? "wait" : "pointer", background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", font: font(600, 12) }}>
            Add it to the plan
          </button>
        </div>
      )}
      {s.menuNeeds.notStocked.some((n) => n.anchor) && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: C.note, borderRadius: 12, font: font(500, 12), color: C.ink2 }}>
          Your menu needs <strong>{s.menuNeeds.notStocked.filter((n) => n.anchor).map((n) => n.ingredient.toLowerCase()).join(", ")}</strong>, which KOI doesn&apos;t stock yet — buy it where you shop for fresh things, or swap the dish.
        </div>
      )}

      <div className="koi-plan-grid-wrap">
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 7, minWidth, marginBottom: 7 }}>
          <div />
          {week.days.map((d) => (
            <div key={d.index} style={{ textAlign: "center", padding: "6px 0", borderRadius: 8, font: font(600, 12), background: d.today ? C.primary : "transparent", color: d.today ? "#fff" : C.ink2 }}>
              {d.label} <span style={{ font: font(500, 11, "mono"), opacity: 0.75 }}>{d.dayOfMonth}</span>
            </div>
          ))}
        </div>
        {week.slots.map((slot) => (
          <div key={slot} style={{ display: "grid", gridTemplateColumns: cols, gap: 7, minWidth, marginBottom: 7, alignItems: "stretch" }}>
            <div style={{ display: "flex", alignItems: "center", font: font(600, 12), color: C.ink2 }}>{SLOT_LABELS[slot]}</div>
            {week.days.map((d) => {
              const key = `${d.index}:${slot}`;
              const cell = week.cells[key];
              const mine = me ? cell.own[me] : null;
              const notMine = me ? cell.none[me] : null;
              const notes = me ? cell.notes[me] : null;
              const adds = me ? (week.additions[me] ?? []).filter((a) => a.slot === slot) : [];
              const others = Object.entries(cell.own).filter(([id]) => id !== me);
              const dropOk = drag && drag !== key && SWAPPABLE[week.cells[drag]?.slot]?.includes(slot);
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  draggable={Boolean(cell.shared)}
                  onDragStart={(e) => { setDrag(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); }}
                  onDragOver={(e) => { if (dropOk) { e.preventDefault(); setOver(key); } }}
                  onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={(e) => { e.preventDefault(); if (dropOk) s.swapCells(drag, key); setDrag(null); setOver(null); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={(e) => {
                    if (!cell.shared) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu((m) => (m?.key === key ? null : { key, x: Math.min(r.left, window.innerWidth - 200), y: r.bottom + 4 }));
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && cell.shared) { const r = e.currentTarget.getBoundingClientRect(); setMenu({ key, x: Math.min(r.left, window.innerWidth - 200), y: r.bottom + 4 }); } }}
                  style={{
                    position: "relative", cursor: cell.shared ? "pointer" : "default", borderRadius: 11, padding: 8, minHeight: 64,
                    background: over === key ? C.mintChip : d.today ? C.today : C.surface2,
                    border: `1px solid ${menu?.key === key ? C.accent : C.line2}`,
                    boxShadow: over === key ? `0 0 0 2px ${C.primary}` : menu?.key === key ? "0 14px 28px -10px rgba(0,0,0,.22)" : "none",
                    transition: "box-shadow .1s, border-color .1s", display: "flex", flexDirection: "column", gap: 4,
                  }}
                >
                  {cell.shared ? (
                    <div style={{ font: font(600, 11, "sans", 1.3), color: C.ink }}>
                      {cell.shared.dishes.map((x) => x.name).join(" + ")}
                      {cell.shared.chosen && <span style={{ font: font(500, 9, "mono"), color: C.accent }}> · your pick</span>}
                    </div>
                  ) : (
                    <div style={{ font: font(500, 11), color: C.fainter }}>—</div>
                  )}
                  {(mine || notMine || adds.length > 0 || notes?.leaveOut?.length > 0 || notes?.notVerifiedFor?.length > 0 || others.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {mine && <Chip tone="goal">{s.active.label}: {mine.dishes.map((x) => x.name).join(" + ")}</Chip>}
                      {notMine && <Chip tone="cut" title={notMine}>Not for {s.active.label}</Chip>}
                      {notes?.leaveOut?.map((i) => <Chip key={i} tone="cut">−{i.toLowerCase()}</Chip>)}
                      {adds.map((a) => <Chip key={a.skuId} tone="goal">+{a.asDish ? `${a.asDish.name} (${a.name}` : a.name}{a.perDay ? ` ${a.perDay}${a.unit ? ` ${a.unit}` : ""}` : ""}{a.asDish ? ")" : ""}</Chip>)}
                      {notes?.notVerifiedFor?.length > 0 && <Chip tone="warn" title="A spice blend can hide anything">Check for {notes.notVerifiedFor.join(", ")}</Chip>}
                      {others.map(([id, o]) => <Chip key={id} tone="shared">{s.eating.find((p) => String(p.memberId) === id)?.label}: {o.dishes.map((x) => x.name).join(" + ")}</Chip>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {openCell && (
        <div role="menu" style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 80, width: 196, background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 12, boxShadow: "0 18px 34px -10px rgba(0,0,0,.28)", padding: 4, maxHeight: 320, overflowY: "auto" }}>
          <MonoLabel style={{ padding: "6px 10px 2px" }}>Swap meal</MonoLabel>
          {alternatives.length === 0 && <div style={{ padding: "7px 10px", font: font(500, 12), color: C.muted }}>Nothing else suits everyone here.</div>}
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
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "7px 10px", font: font(500, 12), color: C.ink, borderRadius: 8 }}
            >
              {alt.name} <span style={{ font: font(500, 10, "mono"), color: C.faint }}>{alt.kind === "base" ? "base" : alt.kind === "main" ? "main" : ""}</span>
              {(() => {
                const missing = week.staplesMissing(alt.key);
                if (!missing.length) return null;
                const stocked = productsFor(missing, s.products).every((f) => f.product);
                return (
                  <span style={{ display: "block", font: font(500, 10), color: C.warm }}>
                    needs {missing.map((m) => m.ingredient.toLowerCase()).join(", ")} — {stocked ? "KOI can add it" : "KOI doesn't stock it yet"}
                  </span>
                );
              })()}
            </button>
          ))}
          {s.picks[openCell.key] && (
            <button type="button" onClick={() => { s.pickDishes(openCell.key, []); setMenu(null); }} style={{ all: "unset", cursor: "pointer", display: "block", padding: "7px 10px", font: font(600, 12), color: C.accent }}>Back to KOI&apos;s pick</button>
          )}
          <button type="button" onClick={() => setMenu(null)} style={{ all: "unset", cursor: "pointer", display: "block", padding: "7px 10px", font: font(500, 11), color: C.muted }}>Close</button>
        </div>
      )}

      <p style={{ font: font(400, 11), color: C.faint, margin: "10px 0 0" }}>
        Typical home recipes, cooked your way. What a dish contains is read from its usual ingredients — check your own recipe for allergens. Drag a meal onto another to swap them.
      </p>

      <TodayPlates s={s} names={names} />
    </div>
  );
}

/** Each person's plate today: their meals, with the planner's amounts per serving. */
function TodayPlates({ s, names }) {
  const week = s.week;
  const people = peopleOf(s.plan.report, s.plan.days).sort((a, b) => s.orderOf(a.id) - s.orderOf(b.id));
  return (
    <div style={{ marginTop: 14, padding: "13px 14px", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <div style={{ font: font(600, 11, "mono"), letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Each person&apos;s plate · today</div>
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
          <div key={id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.divider}` }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 10, "num"), color: "#fff", flex: "none", background: s.colourFor(id) }}>{initialsOf(p.label)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ font: font(600, 12), color: C.ink }}>{p.label}</span>
                <span style={{ font: font(500, 10, "mono"), color: C.muted }}>{profile ? goalShortLabel(profile) : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                {meals.map((m) => (
                  <span key={m.slot} style={{ font: font(500, 10), background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 6, padding: "3px 7px", color: C.ink }}>
                    {m.text}{m.bits.length ? <span style={{ color: C.muted }}> · {m.bits.join(" · ")}</span> : null}
                  </span>
                ))}
                {adds.map((a) => (
                  <span key={a.skuId} style={{ font: font(600, 10), background: C.blueBg, borderRadius: 6, padding: "3px 7px", color: C.blue }}>+ {a.asDish ? `${a.asDish.name}: ` : ""}{a.name}{a.perDay ? ` ${a.perDay}${a.unit ? ` ${a.unit}` : ""}` : ""}</span>
                ))}
                <span style={{ font: font(600, 10), background: p.met ? C.tint : C.warnBg, borderRadius: 6, padding: "3px 7px", color: p.met ? C.primary : C.warnText }}>
                  {p.met ? "Every target met" : `Short ${p.short.map((x) => (x.nutrient === "kcal" ? `${x.perDay} kcal` : `${x.perDay} g ${x.nutrient}`)).join(", ")} a day`}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ font: font(700, 13, "num"), color: C.ink }}>{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"}</div>
              <div style={{ font: font(500, 9, "mono"), color: C.muted }}>{p.target.kcal ? `kcal / ${inr(p.target.kcal)}` : "kcal a day"}</div>
            </div>
          </div>
        );
      })}
      <p style={{ font: font(400, 10), color: C.faint, margin: "8px 0 0" }}>Amounts are each person&apos;s share of the basket from the plan, spread over the meals it&apos;s cooked in. Calories are the plan&apos;s daily average.</p>
    </div>
  );
}
