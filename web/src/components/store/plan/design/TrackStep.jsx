"use client";

// Step 6 · Track — the person's own weigh-ins against the plan's arithmetic.
//
// Decided with the user (24 Sep 2026, 00077): weight only; kept until deleted
// (from /store/profile/data); KOI may propose a new calorie target from the
// trend and nothing changes until the person accepts it. Only the account
// holder tracks, for themselves, and only as an adult (DPDP s.9). Every figure
// here is lib/plan/track.js's arithmetic, shown with its assumption — never a
// forecast, never odds. The coach is KOI.

import { useMemo, useState } from "react";
import Link from "next/link";
import { trackRead, TRACK_RULES } from "@/lib/plan/track";
import { goalsAllowed } from "@/lib/planner/goals";
import { useCheckins } from "./useCheckins";
import { C, font, cardStyle, tileStyle, inr } from "./tokens";

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const signed = (n, unit = "kg") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} ${unit}`;
const perWeek = (n) => `${n > 0 ? "gaining" : n < 0 ? "losing" : "holding"}${n ? ` ${Math.abs(n)} kg` : ""} a week`;

/** The weigh-ins and the plan's line, over the same days. */
function Chart({ read }) {
  const pts = read.checkins;
  const plan = read.planLine;
  if (!pts.length) return <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", font: font(500, 13), color: C.muted }}>Your first weigh-in starts the line.</div>;
  const days = [...pts.map((p) => p.day), ...plan.map((p) => Math.round(new Date(`${p.date}T00:00:00Z`).getTime() / 86400000))];
  const kgs = [...pts.map((p) => p.kg), ...plan.map((p) => p.kg)];
  const [d0, d1] = [Math.min(...days), Math.max(...days, pts[0].day + 7)];
  const [k0, k1] = [Math.floor(Math.min(...kgs) - 0.5), Math.ceil(Math.max(...kgs) + 0.5)];
  const x = (d) => 40 + ((d - d0) / Math.max(1, d1 - d0)) * 560;
  const y = (k) => 16 + ((k1 - k) / Math.max(0.5, k1 - k0)) * 126;
  const planPts = plan.map((p) => [x(Math.round(new Date(`${p.date}T00:00:00Z`).getTime() / 86400000)), y(p.kg)]);
  return (
    <svg width="100%" height="180" viewBox="0 0 620 180" preserveAspectRatio="none" role="img" aria-label={`Your weigh-ins${plan.length ? " against the plan's arithmetic" : ""}`}>
      <line x1="40" y1="16" x2="40" y2="142" stroke={C.track} /><line x1="40" y1="142" x2="600" y2="142" stroke={C.track} />
      <text x="4" y="24" fontFamily="IBM Plex Mono" fontSize="10" fill={C.fainter}>{k1}</text>
      <text x="4" y="142" fontFamily="IBM Plex Mono" fontSize="10" fill={C.fainter}>{k0}</text>
      {planPts.length === 2 && <path d={`M${planPts[0][0]},${planPts[0][1]} L${planPts[1][0]},${planPts[1][1]}`} fill="none" stroke={C.primary} strokeWidth="1.6" strokeDasharray="3 4" opacity="0.5" />}
      <polyline points={pts.map((p) => `${x(p.day)},${y(p.kg)}`).join(" ")} fill="none" stroke={C.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p) => <circle key={p.date} cx={x(p.day)} cy={y(p.kg)} r="3.5" fill={C.accent}><title>{`${p.date}: ${p.kg} kg`}</title></circle>)}
    </svg>
  );
}

/** What the trend says, in KOI's words: templates over track.js's figures. */
function readingOf(read) {
  const need = Math.max(0, TRACK_RULES.minCheckins - read.checkins.length);
  if (read.status === "too_few") {
    return need > 0
      ? `Log ${need} more weigh-in${need === 1 ? "" : "s"}, over at least two weeks, and KOI will read your trend.`
      : "Keep going: KOI reads a trend once your weigh-ins span two weeks.";
  }
  if (read.status === "no_plan") return `You're ${perWeek(read.trend.kgPerWeek)}. Add your age, height and weight in You and KOI can set this against your plan.`;
  if (read.status === "on_track") return `You're ${perWeek(read.trend.kgPerWeek)}, and the plan's arithmetic expects ${perWeek(read.planned).replace(/^\w+ /, "")}. On track.`;
  return `You're ${perWeek(read.trend.kgPerWeek)}; the plan's arithmetic expected ${perWeek(read.planned)}.`;
}

export default function TrackStep({ s, onBack }) {
  const me = s.profiles.find((p) => p.is_account_holder && p.memberId) ?? null;
  const adult = Boolean(me && goalsAllowed(me.age_band));
  const { rows, loading, error, save } = useCheckins(adult ? me.memberId : null);
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const read = useMemo(() => (me ? trackRead(me, rows) : null), [me, rows]);

  const header = (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ font: font(700, 30), letterSpacing: "-.02em", margin: "0 0 5px" }}>Your weigh-ins against the plan</h2>
      <p style={{ font: font(400, 15), color: C.ink2, margin: 0 }}>One weight a week is enough. KOI sets it against the plan&apos;s arithmetic, and only ever suggests.</p>
    </div>
  );
  const back = (
    <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 24 }}>
      <button type="button" onClick={onBack} style={{ cursor: "pointer", background: "none", border: "none", font: font(600, 14), color: C.muted, padding: "13px 22px" }}>← Back</button>
    </div>
  );

  if (!s.session) return <div>{header}<div style={cardStyle}><p style={{ font: font(500, 14), margin: 0 }}>Sign in to track your own weigh-ins.</p></div>{back}</div>;
  if (!me || !adult) {
    return (
      <div>
        {header}
        <div style={cardStyle}>
          <p style={{ font: font(600, 15), margin: "0 0 6px" }}>{!me ? "Track is for you, the account holder." : "Track is for adults."}</p>
          <p style={{ font: font(400, 13), color: C.ink2, margin: 0 }}>
            {!me
              ? "Add yourself to the household (the person marked \"me\") and your weigh-ins can start. Everyone tracks for themselves, from their own account — nobody weighs in for someone else."
              : "Tracking starts at 19. KOI keeps no weight history for anyone younger (DPDP Act 2023, s.9)."}
          </p>
        </div>
        {back}
      </div>
    );
  }

  const log = async () => {
    const n = Number(kg);
    if (!(n >= 30 && n <= 250)) return;
    setBusy(true);
    const ok = await save(Math.round(n * 10) / 10, date);
    setBusy(false);
    if (ok) { setKg(""); s.notify("Weigh-in saved.", "info"); }
  };
  const proposal = read.proposal && dismissed !== `${read.proposal.from}>${read.proposal.kcal}` ? read.proposal : null;
  const accept = () => {
    s.editProfile(s.keyOf(me), { target_kcal: String(proposal.kcal), target_source: "stated" });
    s.notify(`Your daily target is now ${inr(proposal.kcal)} kcal. Change it any time in You.`, "info");
    setDismissed(`${proposal.from}>${proposal.kcal}`);
  };

  return (
    <div>
      {header}
      <div className="koi-track-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
              <div>
                <div style={{ font: font(700, 16) }}>Weigh-ins vs the plan&apos;s arithmetic</div>
                <div style={{ font: font(400, 12), color: C.muted }}>{read.checkins.length ? `${read.checkins.length} weigh-in${read.checkins.length === 1 ? "" : "s"} since ${read.checkins[0].date}` : loading ? "Loading…" : "No weigh-ins yet"}</div>
              </div>
              {read.latest && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ font: font(700, 30, "num"), color: C.ink, lineHeight: 1 }}>{read.latest.kg} kg</div>
                  {read.change !== null && read.checkins.length > 1 && <span style={{ display: "inline-flex", background: C.tint, color: C.primary, font: font(600, 11), padding: "4px 9px", borderRadius: 999, marginTop: 5 }}>{signed(read.change)} since you started</span>}
                </div>
              )}
            </div>
            <Chart read={read} />
            <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 12, borderTop: `1px solid ${C.divider}`, flexWrap: "wrap" }}>
              <span style={{ font: font(500, 11), color: C.accent }}>— Your weigh-ins</span>
              {read.planLine.length > 0 && <span style={{ font: font(500, 11), color: C.stepOff }}>--- Plan arithmetic ({perWeek(read.planned)})</span>}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ font: font(700, 16), marginBottom: 4 }}>Log a weigh-in</div>
            <div style={{ font: font(400, 12), color: C.muted, marginBottom: 14 }}>Same scale, same time of day, once a week. A second weigh-in on the same day replaces the first.</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ ...tileStyle, display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
                <span style={{ font: font(500, 10, "mono"), color: C.muted }}>WEIGHT (KG)</span>
                <input type="number" inputMode="decimal" min={30} max={250} step={0.1} value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") log(); }} placeholder={read.latest ? String(read.latest.kg) : "e.g. 72.5"} aria-label="Weight in kg" style={{ border: "none", background: "transparent", font: font(700, 22, "num"), width: 110, color: C.ink }} />
              </label>
              <label style={{ ...tileStyle, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ font: font(500, 10, "mono"), color: C.muted }}>DATE</span>
                <input type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} aria-label="Date of the weigh-in" style={{ border: "none", background: "transparent", font: font(600, 14), color: C.ink }} />
              </label>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={log} disabled={busy || !(Number(kg) >= 30 && Number(kg) <= 250)} style={{ background: C.primary, border: "none", borderRadius: 12, padding: "13px 24px", font: font(600, 14), color: "#fff", cursor: busy ? "wait" : "pointer", opacity: busy || !(Number(kg) >= 30 && Number(kg) <= 250) ? 0.6 : 1 }}>
                {busy ? "Saving…" : "Log weigh-in"}
              </button>
            </div>
            {error && <p role="alert" style={{ font: font(500, 12), color: C.redText, margin: "10px 0 0" }}>{error}</p>}
            <p style={{ font: font(400, 11), color: C.faint, margin: "12px 0 0" }}>
              Kept until you delete them — <Link href="/store/profile/data" style={{ color: C.primary }}>your data</Link> removes every weigh-in at once.
            </p>
          </div>
        </div>

        <div style={{ background: C.deep, borderRadius: 22, padding: 22, color: "#fff", alignSelf: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accent}, ${C.mint})`, display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 14, "num"), color: C.deep }}>K</div>
            <div><div style={{ font: font(600, 14) }}>KOI</div><div style={{ font: font(500, 11, "mono"), color: C.mintMuted }}>your read</div></div>
          </div>
          <p style={{ font: font(700, 19, "sans", 1.3), margin: "0 0 16px", textWrap: "balance" }}>{readingOf(read)}</p>

          {proposal && (
            <div style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 15, marginBottom: 12 }}>
              <div style={{ font: font(500, 10, "mono"), letterSpacing: ".1em", color: "rgba(255,255,255,.55)", textTransform: "uppercase", marginBottom: 8 }}>A suggestion — yours to take or leave</div>
              <div style={{ font: font(700, 20, "num"), marginBottom: 6 }}>{inr(proposal.from)} → {inr(proposal.kcal)} kcal a day</div>
              <p style={{ font: font(400, 12), color: "rgba(255,255,255,.75)", margin: "0 0 12px" }}>
                By the same arithmetic, the difference is about {inr(Math.abs(proposal.gapKcal))} kcal a day. KOI moves a target at most {TRACK_RULES.maxStepKcal} kcal at a time, and never below a safe floor.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={accept} style={{ cursor: "pointer", background: C.mint, color: C.deep, border: "none", borderRadius: 11, padding: "10px 16px", font: font(600, 13) }}>Use {inr(proposal.kcal)} kcal</button>
                <button type="button" onClick={() => setDismissed(`${proposal.from}>${proposal.kcal}`)} style={{ cursor: "pointer", background: "none", color: "rgba(255,255,255,.75)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 11, padding: "10px 16px", font: font(600, 13) }}>Not now</button>
              </div>
            </div>
          )}

          {read.toTarget && (
            <div style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 15, marginBottom: 12 }}>
              <div style={{ font: font(500, 10, "mono"), letterSpacing: ".1em", color: "rgba(255,255,255,.55)", textTransform: "uppercase", marginBottom: 8 }}>At this pace</div>
              <div style={{ font: font(700, 18, "num") }}>{me.target_weight_kg} kg in about {read.toTarget.weeks} week{read.toTarget.weeks === 1 ? "" : "s"}</div>
            </div>
          )}
          <p style={{ font: font(400, 11), color: "rgba(255,255,255,.55)", margin: 0 }}>{read.assumption}</p>
        </div>
      </div>
      {back}
    </div>
  );
}
