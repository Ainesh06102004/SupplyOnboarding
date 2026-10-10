"use client";

// ============================================================================
// PlanBar — the Plan's steps and household, under the store's one header.
//
// The founder's design gave the Plan its own sticky header: the KOI mark, the
// six steps, the household. The mark and the account now live in the shared
// StoreHeader, so this keeps only what is the Plan's: the numbered steps and
// whose plan it is. It sticks just under the store header.
//
// Step five was "Shop" and is "Cart" now — it IS the store's cart. Its key stays
// `shop`, because ?step=shop and the agent's tools, router and eval all say so.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { C, font, MEMBER_COLORS, initialsOf, inr } from "./tokens";
import { useGlowing } from "@/components/agent/AgentProvider";

export const STEPS = Object.freeze([
  { key: "define", label: "Define" },
  { key: "you", label: "You" },
  { key: "plan", label: "Plan" },
  { key: "pantry", label: "Pantry" },
  { key: "shop", label: "Cart" },
  { key: "track", label: "Track" },
]);

export default function PlanBar({ step, onStep, profiles, activeKey, onActive, keyOf, onAddMember, saveState, weekLabel }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  // KOI Agent Mode: someone KOI just saved glows for a moment.
  const glowing = useGlowing();
  const index = STEPS.findIndex((s) => s.key === step);
  const active = profiles.find((p) => keyOf(p) === activeKey) ?? profiles[0] ?? null;
  const colourOf = (p) => MEMBER_COLORS[Math.max(0, profiles.indexOf(p)) % MEMBER_COLORS.length];
  const needsDetails = profiles.some((p) => !p.memberId);
  const commit = () => {
    if (!name.trim()) return;
    onAddMember(name);
    setName("");
  };

  return (
    <div className="ks-planbar">
      <div className="ks-planbar-inner">
        <span className="ks-mono ks-planbar-label" style={{ color: C.primary }}>{weekLabel ?? "Plan"}</span>
        <nav className="ks-steps" aria-label="Plan steps">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className="ks-step"
              onClick={() => onStep(s.key)}
              aria-current={i === index ? "step" : undefined}
              data-state={i < index ? "done" : undefined}
            >
              <span className="ks-step-dot">{i < index ? "✓" : i + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="ks-household">
          <button type="button" className="ks-household-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Household: ${profiles.length} ${profiles.length === 1 ? "person" : "people"}`}>
            <span className="ks-avatars" aria-hidden="true">
              {profiles.slice(0, 6).map((p) => (
                <span key={keyOf(p)} className={`ks-avatar ${glowing("member", p.label) ? "koi-glow" : ""}`} style={{ background: colourOf(p) }}>{initialsOf(p.label)}</span>
              ))}
            </span>
            <span className="ks-household-word">Household</span>
            {needsDetails && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: C.warm }} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="ks-household-panel">
          {profiles.map((p) => {
            const on = keyOf(p) === keyOf(active ?? {});
            const status = saveState[keyOf(p)]?.state;
            return (
              <button
                key={keyOf(p)}
                type="button"
                className={glowing("member", p.label) ? "koi-glow" : undefined}
                onClick={() => onActive(keyOf(p))}
                aria-pressed={on}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", borderRadius: 999, border: on ? `1px solid ${C.tintBorder}` : `1px solid ${C.line}`, background: on ? "#fff" : "rgba(255,255,255,.55)", boxShadow: on ? "0 1px 3px rgba(20,22,15,.08)" : "none", flex: "none" }}
              >
                <span style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 10, "num"), color: "#fff", background: colourOf(p) }}>{initialsOf(p.label)}</span>
                <span style={{ lineHeight: 1.1, textAlign: "left" }}>
                  <span style={{ display: "block", font: font(600, 12), color: on ? C.ink : C.ink2 }}>{p.label || "New member"}</span>
                  <span style={{ display: "block", font: font(500, 10, "mono"), color: status === "incomplete" || !p.memberId ? C.warm : C.ink2 }}>
                    {!p.memberId ? (status === "saving" ? "saving…" : "needs details") : `${goalShortLabel(p)} · ${p.target_kcal ? `${inr(p.target_kcal)} kcal` : p.target_protein_g ? `${p.target_protein_g} g protein` : "no target"}`}
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
              style={{ border: "none", background: "transparent", font: font(500, 12), width: 96, color: C.ink, outline: "none" }}
            />
            <button type="button" onClick={commit} aria-label="Add member" style={{ cursor: "pointer", width: 22, height: 22, borderRadius: "50%", background: C.tint, border: "none", display: "flex", alignItems: "center", justifyContent: "center", font: font(600, 15), color: C.primary, padding: 0 }}>+</button>
          </div>
          <Link href="/store/household" style={{ font: font(600, 12), color: C.accent, whiteSpace: "nowrap", marginLeft: 4 }}>Household settings</Link>
        </div>
      )}
    </div>
  );
}
