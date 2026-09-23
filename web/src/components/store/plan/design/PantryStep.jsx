"use client";

// Step 4 · Pantry — one order, the whole week.
//
// The design compared "your cart before KOI" with "your KOI cart". KOI has no
// record of a cart before it, so the comparison is the one it can make
// honestly: your last plan against this one. Unticking a line means "I have
// this at home": it stays in the plan and is left out of the cart.

import Link from "next/link";
import { useMemo } from "react";
import { proteinSources, peopleOf, rupees } from "@/lib/plan/planView";
import { C, font, cardStyle, inr } from "./tokens";
import { StepHead, Footer, MonoLabel } from "./bits";

function Check({ on, onClick, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} style={{ cursor: "pointer", width: 20, height: 20, borderRadius: 6, flex: "none", border: on ? "none" : `1.5px solid ${C.inputBorder}`, background: on ? C.primary : "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}

export default function PantryStep({ s, onBack, onNext }) {
  const plan = s.plan;
  const lines = s.lines;
  const days = plan?.days ?? 7;
  const people = useMemo(() => (plan ? peopleOf(plan.report, days) : []), [plan, days]);
  const sources = useMemo(() => proteinSources(lines, days), [lines, days]);
  const labelsById = Object.fromEntries((plan?.report?.perMember ?? []).map((m) => [String(m.id), m.label ?? "Someone"]));
  const swappedIn = new Set(s.requests.filter((r) => !r.undone && r.kind === "upgrade").flatMap((r) => (r.basketChange?.added ?? []).map((a) => String(a.skuId))));

  if (!plan) {
    return (
      <div>
        <StepHead title="One order. Whole week handled." sub="Plan the week first — your pantry and cart are built from it." />
        <Footer onBack={onBack} />
      </div>
    );
  }

  const before = s.compareTo;
  const beforeBySku = new Map((before?.basket ?? []).map((l) => [String(l.skuId), l]));
  const nowBySku = new Map(lines.map((l) => [String(l.skuId), l]));
  const gone = (before?.basket ?? []).filter((l) => !nowBySku.has(String(l.skuId)));
  const delta = before && Number.isFinite(Number(before.cost)) ? Number(plan.report.cost) - Number(before.cost) : null;
  const buying = lines.filter((l) => s.packsFor(l) > 0);
  const cartTotal = buying.reduce((sum, l) => sum + (l.price ? l.price * s.packsFor(l) : 0), 0);
  const priceless = buying.filter((l) => !l.price).length;
  const weekly = lines.filter((l) => !swappedIn.has(String(l.skuId)));
  const swapped = lines.filter((l) => swappedIn.has(String(l.skuId)));

  const Row = ({ line }) => {
    const on = !s.have.has(String(line.skuId));
    const whose = Object.keys(line.shares ?? {}).map((id) => labelsById[id]).filter(Boolean);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.divider}`, opacity: on ? 1 : 0.55 }}>
        <Check on={on} onClick={() => s.toggleHave(line.skuId)} label={`Buy ${line.name}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: font(600, 13), color: C.ink, textDecoration: on ? "none" : "line-through" }}>{line.name}</div>
          <div style={{ font: font(400, 11), color: C.muted }}>
            {line.packs} × {line.weight ?? "pack"}{whose.length ? ` · for ${whose.join(", ")}` : ""}{line.estimate ? " · price is an estimate" : ""}
          </div>
          {!on && UUIDish(line.skuId) && (
            <button type="button" onClick={() => s.keepInPantry(line.skuId)} style={{ cursor: "pointer", background: "none", border: "none", padding: 0, marginTop: 3, font: font(600, 11), color: C.accent }}>Keep in my pantry, so later plans skip it</button>
          )}
        </div>
        <div style={{ font: font(700, 14, "num"), color: C.ink, flex: "none" }}>{line.cost !== null ? rupees(line.cost) : "—"}</div>
      </div>
    );
  };

  return (
    <div>
      <StepHead title="One order. Whole week handled." sub="Your last plan against this one — and everything to buy. Untick what's already at home." />

      <div className="koi-two" style={{ marginBottom: 18 }}>
        <div style={{ ...cardStyle, background: C.surface2 }}>
          <MonoLabel color={C.muted} style={{ marginBottom: 10 }}>{before ? before.label : "Before this plan"}</MonoLabel>
          {before?.basket?.length ? (
            <>
              {before.basket.slice(0, 8).map((l) => (
                <div key={l.skuId} style={{ display: "flex", justifyContent: "space-between", font: font(500, 13), color: nowBySku.has(String(l.skuId)) ? C.ink2 : C.muted, padding: "5px 0", textDecoration: nowBySku.has(String(l.skuId)) ? "none" : "line-through" }}>
                  <span>{l.name ?? "A product"}</span><span style={{ font: font(500, 12, "mono") }}>{l.packs} ×</span>
                </div>
              ))}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.divider}`, font: font(600, 13), color: C.ink2 }}>Cost then {rupees(before.cost)}</div>
            </>
          ) : (
            <p style={{ font: font(400, 13), color: C.muted, margin: 0 }}>This is your first plan with KOI. Next time, this side shows it, so you can see what changed.</p>
          )}
        </div>
        <div style={{ ...cardStyle, border: `2px solid ${C.accent}` }}>
          <MonoLabel color={C.accent} style={{ marginBottom: 10 }}>This plan</MonoLabel>
          {lines.slice(0, 8).map((l) => {
            const was = beforeBySku.get(String(l.skuId));
            const tag = !before ? null : !was ? "NEW" : was.packs !== l.packs ? `${was.packs} → ${l.packs}` : null;
            return (
              <div key={l.skuId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", font: font(600, 13), color: C.ink, padding: "5px 0", gap: 8 }}>
                <span>{l.name}</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {tag && <span style={{ font: font(700, 9, "mono"), color: C.primary, background: C.tint, borderRadius: 999, padding: "2px 7px" }}>{tag}</span>}
                  <span style={{ font: font(500, 12, "mono") }}>{l.packs} ×</span>
                </span>
              </div>
            );
          })}
          {gone.length > 0 && <div style={{ font: font(500, 12), color: C.muted, marginTop: 6 }}>No longer: {gone.map((l) => l.name ?? "a product").join(", ")}</div>}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.divider}`, font: font(600, 13), color: C.primary }}>Cost now {rupees(plan.report.cost)}</div>
        </div>
      </div>
      {delta !== null && Math.round(delta) !== 0 && (
        <div style={{ marginBottom: 18, background: C.panel, borderRadius: 16, padding: "14px 16px", font: font(500, 14), color: C.ink2 }}>
          This plan costs <strong style={{ color: delta > 0 ? C.warm : C.accent }}>{rupees(Math.abs(delta))} {delta > 0 ? "more" : "less"}</strong> than your last one.
        </div>
      )}

      <div className="koi-pantry-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {swapped.length > 0 && (
            <div style={{ ...cardStyle, padding: 20, borderRadius: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ font: font(700, 16) }}>Upgraded swaps</span>
                <span style={{ font: font(700, 9, "mono"), color: C.primary, background: C.tint, borderRadius: 999, padding: "3px 8px" }}>SWAPPED IN</span>
              </div>
              <p style={{ font: font(400, 12), color: C.muted, margin: "0 0 8px" }}>What you swapped in on the Plan step, in its place in the trolley.</p>
              {swapped.map((l) => <Row key={l.skuId} line={l} />)}
            </div>
          )}
          <div style={{ ...cardStyle, padding: 20, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ font: font(700, 16) }}>This week&apos;s groceries</span>
              <span style={{ font: font(600, 12), color: C.accent }}>{buying.length} in cart</span>
            </div>
            <p style={{ font: font(400, 12), color: C.muted, margin: "0 0 8px" }}>Everything the plan buys, and who it&apos;s for. Untick anything you already have.</p>
            {weekly.map((l) => <Row key={l.skuId} line={l} />)}
            <p style={{ font: font(400, 11), color: C.faint, margin: "10px 0 0" }}>
              Staples you always keep in go in <Link href="/store/household" style={{ color: C.accent, fontWeight: 600 }}>your household pantry</Link> — plans won&apos;t buy them again.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 124 }}>
          <div style={{ ...cardStyle, padding: 20, borderRadius: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <span style={{ font: font(700, 15) }}>This plan&apos;s nutrition</span>
              <MonoLabel color={C.muted} size={9}>a day, per person</MonoLabel>
            </div>
            {people.map((p) => {
              const pct = p.coverage.protein ?? 0;
              return (
                <div key={p.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", font: font(600, 12), color: C.ink }}>
                    <span>{p.label}</span>
                    <span style={{ font: font(600, 11, "mono"), color: C.ink2 }}>{p.perDay.protein ?? "—"} / {p.target.protein ?? "—"} g protein</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: C.track, marginTop: 5, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: 8, borderRadius: 4, background: pct >= 100 ? C.accent : C.warm, transition: "width .6s ease" }} />
                  </div>
                  <div style={{ font: font(500, 10, "mono"), color: C.muted, marginTop: 3 }}>{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"} of {p.target.kcal ? inr(p.target.kcal) : "—"} kcal</div>
                </div>
              );
            })}
            {sources.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 12, borderTop: `1px solid ${C.divider}` }}>
                <MonoLabel color={C.muted} size={9} style={{ marginBottom: 8 }}>Top protein sources this plan</MonoLabel>
                {sources.map((src) => (
                  <div key={src.skuId} style={{ marginBottom: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", font: font(500, 12), color: C.ink2 }}><span>{src.name}</span><span style={{ font: font(600, 11, "mono") }}>{src.perDay} g/day</span></div>
                    <div style={{ height: 5, borderRadius: 3, background: C.track, marginTop: 3 }}><div style={{ width: `${src.share}%`, height: 5, borderRadius: 3, background: C.accent }} /></div>
                  </div>
                ))}
                <p style={{ font: font(400, 10), color: C.faint, margin: "6px 0 0" }}>From each label&apos;s declared protein. Products without a declared figure aren&apos;t counted.</p>
              </div>
            )}
          </div>

          <div style={{ background: C.deep, borderRadius: 20, padding: 20, color: "#fff" }}>
            <MonoLabel color={C.mintMuted}>Total cart · {buying.length} {buying.length === 1 ? "item" : "items"} selected</MonoLabel>
            <div style={{ font: font(700, 32, "num"), marginTop: 6 }}>{rupees(cartTotal)}</div>
            <div style={{ font: font(500, 12), color: "rgba(255,255,255,.7)", marginTop: 2 }}>
              at MRP{priceless ? ` · ${priceless} without a price` : ""}{s.have.size ? ` · ${s.have.size} you have at home` : ""}
            </div>
            <button type="button" onClick={s.addToCart} disabled={!buying.length || s.cartResult?.busy} style={{ cursor: "pointer", width: "100%", marginTop: 16, background: C.mint, color: C.deep, border: "none", borderRadius: 13, padding: 14, font: font(600, 14) }}>
              {s.cartResult?.busy ? "Adding…" : s.cartResult?.planId === plan.planId && !s.cartResult.error ? "Added ✓ — add again" : "Add all to cart →"}
            </button>
            {s.cartResult?.planId === plan.planId && s.cartResult.packs > 0 && (
              <Link href="/store/cart" style={{ display: "block", textAlign: "center", marginTop: 10, font: font(600, 13), color: C.mint }}>Go to cart</Link>
            )}
            {s.cartResult?.missing?.length > 0 && <p style={{ font: font(500, 11), color: "#f5b8ae", margin: "8px 0 0" }}>Not in the shop right now: {s.cartResult.missing.join(", ")}</p>}
            {s.cartResult?.error && <p style={{ font: font(500, 11), color: "#f5b8ae", margin: "8px 0 0" }}>{s.cartResult.error}</p>}
          </div>
        </div>
      </div>
      <Footer onBack={onBack} next={{ label: "Go to the shop", onClick: onNext }} />
    </div>
  );
}

const UUIDish = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id));
