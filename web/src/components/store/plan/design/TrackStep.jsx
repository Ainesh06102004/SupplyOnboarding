"use client";

// Step 6 · Track — the founder's screen, ported as designed and marked as a
// preview. The numbers are the design's sample numbers, not anyone's: nothing
// here is read from or written to KOI, the inputs do nothing, and the coach is
// KOI, not a named person. The real tracker waits on a decision (plan doc,
// Phase 5): what it keeps, for whom (adults only — DPDP s.9(3)), and never a
// success probability.

import { C, font, cardStyle, tileStyle } from "./tokens";

export default function TrackStep({ onBack }) {
  return (
    <div>
      <div role="note" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 14, padding: "12px 16px", font: font(600, 13), color: C.warnText }}>
        <span style={{ font: font(700, 10, "mono"), letterSpacing: ".1em", background: "#fff", borderRadius: 999, padding: "3px 8px" }}>PREVIEW</span>
        Sample numbers — tracking isn&apos;t live yet. Nothing on this screen is yours, and nothing you do here is saved.
      </div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ font: font(700, 30), letterSpacing: "-.02em", margin: "0 0 5px" }}>We own the outcome with you</h2>
        <p style={{ font: font(400, 15), color: C.ink2, margin: 0 }}>Week 4 — your real numbers against the plan, once tracking is live.</p>
      </div>
      <div className="koi-track-layout" aria-disabled="true">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div><div style={{ font: font(700, 16) }}>Forecast vs reality</div><div style={{ font: font(400, 12), color: C.muted }}>Week 4 of 24 · sample</div></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ font: font(700, 30, "num"), color: C.ink, lineHeight: 1 }}>89.9 kg</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.tint, color: C.primary, font: font(600, 11), padding: "4px 9px", borderRadius: 999, marginTop: 5 }}>● 0.2 kg ahead of plan</span>
              </div>
            </div>
            <svg width="100%" height="180" viewBox="0 0 620 180" preserveAspectRatio="none" aria-hidden="true">
              <line x1="34" y1="16" x2="34" y2="142" stroke={C.track} /><line x1="34" y1="142" x2="600" y2="142" stroke={C.track} />
              <text x="6" y="30" fontFamily="IBM Plex Mono" fontSize="10" fill={C.fainter}>92</text><text x="6" y="142" fontFamily="IBM Plex Mono" fontSize="10" fill={C.fainter}>76</text>
              <path d="M60,30 L588,128" fill="none" stroke={C.primary} strokeWidth="1.6" strokeDasharray="3 4" opacity="0.45" />
              <polyline points="60,30 150,46 240,58 330,68" fill="none" stroke={C.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M330,68 L588,124" fill="none" stroke={C.accent} strokeWidth="2.4" strokeDasharray="2 5" strokeLinecap="round" />
              <g fill={C.accent}><circle cx="60" cy="30" r="3.5" /><circle cx="150" cy="46" r="3.5" /><circle cx="240" cy="58" r="3.5" /></g>
              <circle cx="330" cy="68" r="5.5" fill={C.accent} stroke="#fff" strokeWidth="2.5" />
              <circle cx="588" cy="124" r="4.5" fill="none" stroke={C.primary} strokeWidth="2" />
              <text x="346" y="66" fontFamily="Plus Jakarta Sans" fontSize="11" fontWeight="600" fill={C.primary}>you · 89.9</text>
              <text x="520" y="116" fontFamily="IBM Plex Mono" fontSize="10" fill={C.primary}>target 78</text>
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", font: font(500, 9, "mono"), color: C.fainter, padding: "0 6px 0 34px" }}><span>NOW</span><span>WK4</span><span>WK12</span><span>WK24</span></div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${C.divider}` }}>
              <span style={{ font: font(500, 11), color: C.accent }}>— Actual</span>
              <span style={{ font: font(500, 11), color: C.stepOff }}>--- Plan arithmetic</span>
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ font: font(700, 16), marginBottom: 4 }}>Log this week&apos;s check-in</div>
            <div style={{ font: font(400, 12), color: C.muted, marginBottom: 14 }}>Four numbers keep the arithmetic honest.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {[["WEIGHT", "89.9", " kg"], ["WAIST", "92", " cm"], ["ENERGY", "Good", ""], ["SLEEP", "7.5", " hrs"]].map(([label, value, unit]) => (
                <div key={label} style={tileStyle}><div style={{ font: font(500, 10, "mono"), color: C.muted }}>{label}</div><div style={{ font: font(700, 22, "num"), marginTop: 3 }}>{value}<span style={{ fontSize: 12, color: C.muted }}>{unit}</span></div></div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1 }} />
              <button type="button" disabled title="Tracking isn't live yet" style={{ background: C.disabled, border: "none", borderRadius: 12, padding: "13px 24px", font: font(600, 14), color: "#fff", cursor: "not-allowed" }}>Log check-in</button>
            </div>
          </div>
        </div>

        <div style={{ background: C.deep, borderRadius: 22, padding: 22, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accent}, ${C.mint})`, display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 14, "num"), color: C.deep }}>K</div>
            <div><div style={{ font: font(600, 14) }}>KOI</div><div style={{ font: font(500, 11, "mono"), color: C.mintMuted }}>preview · week 4</div></div>
          </div>
          <div style={{ font: font(500, 11, "mono"), letterSpacing: ".1em", color: C.mintMuted, textTransform: "uppercase", marginBottom: 8 }}>Your read this week</div>
          <p style={{ font: font(700, 21, "sans", 1.25), margin: "0 0 18px", textWrap: "balance" }}>You&apos;re 2.3 kg down and 0.2 ahead of the arithmetic. The protein swaps are doing the heavy lifting.</p>
          <div style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 15, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
              <span style={{ font: font(500, 10, "mono"), letterSpacing: ".1em", color: "rgba(255,255,255,.55)", textTransform: "uppercase" }}>Adherence</span>
              <span style={{ font: font(700, 15, "num"), color: C.mint }}>26 / 28 days</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 1, 1, 1, 0].map((on, i) => <div key={i} style={{ flex: 1, height: 24, borderRadius: 5, background: on ? C.accent : "rgba(255,255,255,.16)" }} />)}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 15, marginBottom: 16 }}>
            <div style={{ font: font(500, 10, "mono"), letterSpacing: ".1em", color: "rgba(255,255,255,.55)", textTransform: "uppercase", marginBottom: 8 }}>If you hold this pace</div>
            <div style={{ font: font(700, 20, "num"), marginBottom: 8 }}>78 kg by Nov 11 — early</div>
            <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(255,255,255,.14)" }}><div style={{ position: "absolute", left: 0, height: 8, width: "21%", borderRadius: 4, background: C.mint }} /></div>
            <div style={{ font: font(400, 12), color: "rgba(255,255,255,.7)", marginTop: 8 }}>2.3 of 14 kg · by the energy-balance arithmetic, not a prediction</div>
          </div>
          <button type="button" disabled title="Tracking isn't live yet" style={{ width: "100%", background: C.mint, color: C.deep, borderRadius: 13, padding: 14, textAlign: "center", font: font(600, 14), border: "none", opacity: 0.6, cursor: "not-allowed" }}>See recommendations →</button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 24 }}>
        <button type="button" onClick={onBack} style={{ cursor: "pointer", background: "none", border: "none", font: font(600, 14), color: C.muted, padding: "13px 22px" }}>← Back</button>
      </div>
    </div>
  );
}
