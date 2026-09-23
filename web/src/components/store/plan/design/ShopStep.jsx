"use client";

// Step 5 · Shop — one cart for the household, pre-filled from the plan.
//
// Prices are the catalogue's MRP. The design's "you save vs MRP" and "plan
// match" need live marketplace prices and a measure KOI does not have, so
// they are not shown until they are real.

import { useMemo, useState } from "react";
import Link from "next/link";
import { aislesOf, peopleOf, rupees } from "@/lib/plan/planView";
import { C, font, initialsOf, inr } from "./tokens";
import { MonoLabel } from "./bits";

const AISLE_COLOURS = ["#c8dfc0", "#b8d4f0", "#f0c8c0", "#e8e0b8", "#b8e8d0", "#e0cfe8", "#f3d9b8", "#cfe0e8", "#e6e2d6"];

export default function ShopStep({ s, onBack, onNext }) {
  const [filter, setFilter] = useState("all");
  const plan = s.plan;
  const days = plan?.days ?? 7;
  const aisles = useMemo(() => aislesOf(s.lines), [s.lines]);
  const { orderOf, colourFor } = s;
  const people = useMemo(() => (plan ? peopleOf(plan.report, days).sort((a, b) => orderOf(a.id) - orderOf(b.id)) : []), [plan, days, orderOf]);
  const colourOf = (key) => AISLE_COLOURS[Math.max(0, aisles.findIndex((a) => a.key === key)) % AISLE_COLOURS.length];

  if (!plan) {
    return (
      <div>
        <h2 style={{ font: font(700, 22), margin: "0 0 6px" }}>Household nutrition shop</h2>
        <p style={{ font: font(400, 13), color: C.ink2 }}>Plan the week first — the shop is filled from it.</p>
        <button type="button" onClick={onBack} style={{ cursor: "pointer", marginTop: 16, padding: "14px 24px", borderRadius: 14, font: font(600, 15), color: C.ink2, background: "#fff", border: "1px solid rgba(20,22,15,.1)" }}>← Back</button>
      </div>
    );
  }

  const buying = s.lines.filter((l) => s.packsFor(l) > 0);
  const total = buying.reduce((sum, l) => sum + (l.price ? l.price * s.packsFor(l) : 0), 0);
  const met = people.filter((p) => p.met).length;
  const household = people.reduce((t, p) => ({ kcal: t.kcal + (p.perDay.kcal ?? 0), protein: t.protein + (p.perDay.protein ?? 0) }), { kcal: 0, protein: 0 });
  const shown = filter === "all" ? aisles : aisles.filter((a) => a.key === filter);

  return (
    <div>
      <div style={{ position: "sticky", top: 110, zIndex: 15, background: C.surface2, borderBottom: `1px solid ${C.line2}`, padding: "14px 0 10px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div>
            <h2 style={{ font: font(700, 22), letterSpacing: "-.02em", margin: "0 0 1px" }}>Household nutrition shop</h2>
            <p style={{ font: font(400, 12), color: C.ink2, margin: 0 }}>One cart · {people.length} {people.length === 1 ? "person" : "people"} · pre-filled from your plan. Tap to add or remove.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 12, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ font: font(700, 18, "num"), color: C.ink }}>{rupees(plan.report.cost)}</div>
              <div style={{ font: font(500, 9, "mono"), color: C.muted }}>{plan.report.budget ? (plan.report.withinBudget ? `PLAN · WITHIN ${rupees(plan.report.budget)}` : `PLAN · OVER ${rupees(plan.report.budget)}`) : "PLAN COST"}</div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 12, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ font: font(700, 18, "num"), color: C.primary }}>{met} / {people.length}</div>
              <div style={{ font: font(500, 9, "mono"), color: C.muted }}>TARGETS MET</div>
            </div>
            <button type="button" onClick={s.addToCart} disabled={!buying.length || s.cartResult?.busy} style={{ cursor: "pointer", background: C.primary, border: "none", borderRadius: 12, padding: "8px 18px", textAlign: "center" }}>
              <div style={{ font: font(700, 15), color: "#fff" }}>{rupees(total)}</div>
              <div style={{ font: font(500, 9, "mono"), color: C.mint }}>{s.cartResult?.busy ? "ADDING…" : `${buying.length} ITEMS · ADD TO CART`}</div>
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {people.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "7px 12px" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 9, "num"), color: "#fff", flex: "none", background: colourFor(p.id) }}>{initialsOf(p.label)}</span>
              <div>
                <div style={{ font: font(600, 12), color: C.ink }}>{p.label}</div>
                <div style={{ font: font(500, 10, "mono"), color: C.muted }}>{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"} kcal · {p.perDay.protein ?? "—"}g protein / day</div>
              </div>
            </div>
          ))}
          {people.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.deep, borderRadius: 10, padding: "7px 14px" }}>
              <div>
                <div style={{ font: font(600, 12), color: "#fff" }}>Household total</div>
                <div style={{ font: font(500, 10, "mono"), color: C.mint }}>{inr(household.kcal)} kcal · {inr(household.protein)}g protein / day</div>
              </div>
            </div>
          )}
        </div>
        {s.cartResult?.planId === plan.planId && s.cartResult.packs > 0 && (
          <p style={{ font: font(600, 12), color: C.primary, margin: "8px 0 0" }}>Added {s.cartResult.packs} packs. <Link href="/store/cart" style={{ color: C.accent }}>Go to cart →</Link></p>
        )}
      </div>

      <div className="koi-shop-layout">
        <div className="koi-shop-aisle-nav">
          <div style={{ font: font(600, 10, "mono"), letterSpacing: ".14em", color: C.faint, textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>Aisles</div>
          <div className="koi-shop-cats">
            {[{ key: "all", label: "All" }, ...aisles].map((a) => (
              <button key={a.key} type="button" onClick={() => setFilter(a.key)} style={{ cursor: "pointer", textAlign: "left", border: "none", borderRadius: 10, padding: "8px 12px", font: font(600, 13), background: filter === a.key ? "#fff" : "transparent", color: filter === a.key ? C.primary : C.ink2, boxShadow: filter === a.key ? "0 1px 3px rgba(20,22,15,.08)" : "none" }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="koi-shop-products" style={{ paddingLeft: 24 }}>
          {shown.map((aisle) => (
            <div key={aisle.key} style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: `2px solid ${colourOf(aisle.key)}` }}>
                <div style={{ width: 10, height: 28, borderRadius: 3, background: colourOf(aisle.key) }} />
                <span style={{ font: font(700, 18), color: C.ink }}>{aisle.label}</span>
                <span style={{ font: font(500, 11, "mono"), color: C.faint }}>{aisle.lines.length}</span>
              </div>
              <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
                {aisle.lines.map((line) => {
                  const packs = s.packsFor(line);
                  const on = packs > 0;
                  const proteinPerDay = Number.isFinite(Number(line.supplies?.protein)) ? Math.round(line.supplies.protein / days) : null;
                  return (
                    <div key={line.skuId} style={{ flex: "none", width: 180, background: "#fff", borderRadius: 18, overflow: "hidden", border: on ? `2px solid ${C.primary}` : `1px solid ${C.line2}`, boxShadow: on ? "0 8px 24px -12px rgba(31,92,58,.35)" : "0 1px 4px rgba(20,22,15,.06)" }}>
                      <button type="button" onClick={() => (on ? s.toggleHave(line.skuId) : s.have.has(String(line.skuId)) ? s.toggleHave(line.skuId) : s.setPacks(line.skuId, line.packs))} aria-pressed={on} aria-label={`${on ? "Remove" : "Add"} ${line.name}`} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                        <div style={{ height: 110, background: colourOf(aisle.key), display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                          {line.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={line.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <div style={{ font: font(700, 36, "num"), color: C.primary, opacity: 0.22, userSelect: "none" }}>{initialsOf(line.name).slice(0, 1)}</div>}
                          {line.estimate && <span style={{ position: "absolute", top: 8, left: 8, font: font(700, 8, "mono"), background: "#fff", color: C.warnText, borderRadius: 999, padding: "3px 6px" }}>TEST · ESTIMATE</span>}
                          <span style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: on ? C.primary : "rgba(255,255,255,.9)", border: on ? "none" : `1.5px solid ${C.inputBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </span>
                        </div>
                      </button>
                      <div style={{ padding: "10px 11px 12px" }}>
                        {line.brand && <div style={{ font: font(500, 9, "mono"), color: C.faint, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 2 }}>{line.brand}</div>}
                        <div style={{ font: font(600, 13, "sans", 1.25), color: C.ink, marginBottom: 1 }}>{line.name}</div>
                        <div style={{ font: font(400, 11), color: C.faint, marginBottom: 7 }}>{line.weight ?? ""}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 7 }}>
                          <span style={{ font: font(700, 16, "num"), color: C.ink }}>{line.price ? rupees(line.price) : "—"}</span>
                          <span style={{ font: font(500, 10, "mono"), color: C.faint }}>{line.price ? "MRP" : "no price"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(20,22,15,.12)", borderRadius: 8, overflow: "hidden" }}>
                            <button type="button" aria-label="One fewer" onClick={() => (packs <= 1 ? s.toggleHave(line.skuId) : s.setPacks(line.skuId, packs - 1))} disabled={!on} style={{ padding: "5px 10px", font: font(700, 15, "num"), color: C.ink2, cursor: "pointer", background: C.surface2, border: "none" }}>−</button>
                            <div style={{ padding: "5px 10px", font: font(600, 12, "mono"), color: C.ink, borderLeft: `1px solid ${C.line2}`, borderRight: `1px solid ${C.line2}`, minWidth: 30, textAlign: "center" }}>{packs}</div>
                            <button type="button" aria-label="One more" onClick={() => { if (s.have.has(String(line.skuId))) s.toggleHave(line.skuId); s.setPacks(line.skuId, packs + 1); }} style={{ padding: "5px 10px", font: font(700, 15, "num"), color: C.primary, cursor: "pointer", background: C.surface2, border: "none" }}>+</button>
                          </div>
                          {proteinPerDay !== null && proteinPerDay > 0 && <span style={{ font: font(600, 10, "mono"), color: C.primary }}>{proteinPerDay}g P/day</span>}
                        </div>
                        <div style={{ font: font(400, 9, "mono"), color: C.fainter }}>Plan says {line.packs} {line.packs === 1 ? "pack" : "packs"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <MonoLabel color={C.faint} size={9}>Prices are MRP from the catalogue. Live prices and delivery come with the marketplace connection.</MonoLabel>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 22, marginTop: 22, borderTop: `1px solid ${C.line}` }}>
        <button type="button" onClick={onBack} style={{ cursor: "pointer", padding: "14px 24px", borderRadius: 14, font: font(600, 15), color: C.ink2, background: "#fff", border: "1px solid rgba(20,22,15,.1)" }}>← Back</button>
        <button type="button" onClick={onNext} style={{ cursor: "pointer", padding: "14px 28px", borderRadius: 14, font: font(600, 15), color: "#fff", background: C.primary, border: "none" }}>Continue to Track →</button>
      </div>
    </div>
  );
}
