"use client";

// The design's sticky header: the KOI mark, the six steps, whose plan is open,
// and the household — one pill per person, with their goal and daily target.

import { useState } from "react";
import Link from "next/link";
import AccountButton from "@/components/auth/AccountButton";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { C, font, MEMBER_COLORS, initialsOf, inr } from "./tokens";

export const STEPS = Object.freeze([
  { key: "define", label: "Define" },
  { key: "you", label: "You" },
  { key: "plan", label: "Plan" },
  { key: "pantry", label: "Pantry" },
  { key: "shop", label: "Shop" },
  { key: "track", label: "Track" },
]);

export default function Header({ step, onStep, profiles, activeKey, onActive, keyOf, onAddMember, saveState }) {
  const [name, setName] = useState("");
  const index = STEPS.findIndex((s) => s.key === step);
  const active = profiles.find((p) => keyOf(p) === activeKey) ?? profiles[0] ?? null;
  const colourOf = (p) => MEMBER_COLORS[Math.max(0, profiles.indexOf(p)) % MEMBER_COLORS.length];
  const commit = () => {
    if (!name.trim()) return;
    onAddMember(name);
    setName("");
  };

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(246,245,241,.88)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid rgba(20,22,15,.06)" }}>
      <div className="koi-nav-inner">
        <Link href="/store" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }} aria-label="KOI store">
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: C.logoDot }} />
          <span style={{ font: font(700, 22, "num"), letterSpacing: "-.01em", color: C.primary }}>KOI</span>
        </Link>
        <nav className="koi-steps" aria-label="Plan steps">
          {STEPS.map((s, i) => {
            const on = i === index;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onStep(s.key)}
                aria-current={on ? "step" : undefined}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, border: "none", background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 3px rgba(20,22,15,.07)" : "none" }}
              >
                <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: font(600, 11, "mono"), background: i <= index ? C.primary : "#e3e1d8", color: i <= index ? "#fff" : C.stepOff }}>{i + 1}</span>
                <span className="koi-step-label" style={{ font: font(600, 13), color: on ? C.ink : C.stepOff }}>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {active && <div className="koi-step-label" style={{ font: font(600, 13), color: C.ink2 }}>{active.label}</div>}
          <AccountButton />
        </div>
      </div>

      <div className="koi-household">
        <span style={{ font: font(500, 10, "mono"), letterSpacing: ".12em", textTransform: "uppercase", color: C.faint }}>Household</span>
        <div className="koi-members-row">
          {profiles.map((p) => {
            const on = keyOf(p) === keyOf(active ?? {});
            const status = saveState[keyOf(p)]?.state;
            return (
              <button
                key={keyOf(p)}
                type="button"
                onClick={() => onActive(keyOf(p))}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", borderRadius: 999, border: "none", background: on ? "#fff" : "rgba(255,255,255,.4)", boxShadow: on ? "0 1px 3px rgba(20,22,15,.08)" : "none", flex: "none" }}
              >
                <span style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 10, "num"), color: "#fff", background: colourOf(p) }}>{initialsOf(p.label)}</span>
                <span style={{ lineHeight: 1.1, textAlign: "left" }}>
                  <span style={{ display: "block", font: font(600, 12), color: on ? C.ink : C.ink2 }}>{p.label || "New member"}</span>
                  <span style={{ display: "block", font: font(500, 10, "mono"), color: status === "incomplete" || !p.memberId ? C.warm : C.faint }}>
                    {!p.memberId ? (status === "saving" ? "saving…" : "needs details") : `${goalShortLabel(p)} · ${p.target_kcal ? inr(p.target_kcal) : "—"}`}
                  </span>
                </span>
              </button>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", background: "#fff", border: `1px dashed ${C.dashed}`, borderRadius: 999, padding: "5px 8px 5px 12px", gap: 6, flex: "none" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
              placeholder="Add member…"
              aria-label="Add a member"
              maxLength={40}
              style={{ border: "none", background: "transparent", font: font(500, 12), width: 90, color: C.ink }}
            />
            <button type="button" onClick={commit} aria-label="Add member" style={{ cursor: "pointer", width: 22, height: 22, borderRadius: "50%", background: C.tint, border: "none", display: "flex", alignItems: "center", justifyContent: "center", font: font(600, 15), color: C.primary, padding: 0 }}>+</button>
          </div>
          <Link href="/store/household" style={{ font: font(600, 11), color: C.accent, whiteSpace: "nowrap", marginLeft: 4 }}>Household settings</Link>
        </div>
      </div>
    </div>
  );
}
