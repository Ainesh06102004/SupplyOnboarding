"use client";

// Step 2 · You — where this person stands, and what the numbers work out to.
//
// The design's "Protein now" and "Body fat" are not shown: KOI has no record
// of either. Its "probability of success" is not shown: nobody can know it.
// What is shown is goals.js's cited maintenance and targets, and the energy-
// balance arithmetic of lib/plan/projection.js, with its assumption beside it.

import { useState } from "react";
import { AGE_BANDS } from "@/lib/planner/brief";
import { goalsAllowed } from "@/lib/planner/goals";
import { cardFor } from "@/lib/plan/goalCards";
import { dailyFigures, projection } from "@/lib/plan/projection";
import { ACTIVITY_PILLS, DIET_PILLS, SEX_PILLS, RESTRICTION_CHIPS, chipOn, toggleChip, cyclePill, avoidLabel } from "@/lib/plan/restrictions";
import { peopleOf } from "@/lib/plan/planView";
import { C, font, cardStyle, tileStyle, inr } from "./tokens";
import { StepHead, Footer, Chip, RemovableChip, Ring } from "./bits";

const inputStyle = (w) => ({ width: w, textAlign: "right", border: `1px solid ${C.inputBorder}`, borderRadius: 7, background: C.surface2, font: font(600, 14), color: C.ink, padding: "4px 6px" });
const pill = { cursor: "pointer", font: font(600, 13), color: C.primary, background: C.tint2, padding: "5px 11px", borderRadius: 999, border: "none" };
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const labelStyle = { font: font(500, 13), color: C.ink2 };

function NumberRow({ label, hint, value, unit, width = 60, onChange, min, max }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label} {hint && <span style={{ color: C.fainter, fontSize: 11 }}>{hint}</span>}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input type="number" inputMode="decimal" min={min} max={max} value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={label} style={inputStyle(width)} />
        <span style={{ font: font(500, 13), color: C.muted }}>{unit}</span>
      </span>
    </div>
  );
}

/** The design's journey chart, drawn from projection() points. */
function Journey({ p }) {
  const kgs = p.points.map((pt) => pt.kg);
  const top = Math.ceil(Math.max(...kgs) + 1);
  const bottom = Math.floor(Math.min(...kgs) - 1);
  const xs = [60, 150, 240, 330, 420, 510, 588];
  const y = (kg) => 32 + ((top - kg) / Math.max(1, top - bottom)) * 102;
  const points = p.points.map((pt, i) => `${xs[i]},${y(pt.kg).toFixed(1)}`).join(" ");
  return (
    <>
      <svg width="100%" height="190" viewBox="0 0 620 190" preserveAspectRatio="none" role="img" aria-label="Weight at this plan's energy balance">
        <line x1="34" y1="20" x2="34" y2="150" stroke={C.track} />
        <line x1="34" y1="150" x2="600" y2="150" stroke={C.track} />
        <text x="6" y="34" fontFamily="IBM Plex Mono" fontSize="10" fill={C.fainter}>{top}</text>
        <text x="6" y="150" fontFamily="IBM Plex Mono" fontSize="10" fill={C.fainter}>{bottom}</text>
        <polyline key={points} points={points} fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" style={{ animation: "koiDraw 1.3s ease .2s both" }} />
        <g fill={C.accent}>{p.points.map((pt, i) => <circle key={i} cx={xs[i]} cy={y(pt.kg)} r="3.5" />)}</g>
        <g fontFamily="Space Grotesk" fontSize="10" fontWeight="600" fill={C.icon}>
          {p.points.map((pt, i) => <text key={i} x={xs[i] - 20} y={y(pt.kg) - 9}>{pt.kg}</text>)}
        </g>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", font: font(500, 9, "mono"), color: C.fainter, padding: "0 6px 0 34px" }}>
        {p.points.map((pt, i) => <span key={i}>WK{pt.week}</span>)}
      </div>
    </>
  );
}

export default function YouStep({ s, onBack, onNext }) {
  const person = s.active;
  const [avoidWords, setAvoidWords] = useState("");
  if (!person) {
    return (
      <div>
        <StepHead title="Your baseline & the promise" sub="Add someone to the household to start — type a name in “Add member…” above." />
      </div>
    );
  }
  const key = s.keyOf(person);
  const edit = (patch) => s.editProfile(key, patch);
  const adult = goalsAllowed(person.age_band);
  const figures = dailyFigures(person);
  const journey = projection(person);
  const goal = cardFor(person).card;
  const saving = s.saveState[key];
  const planned = s.plan ? peopleOf(s.plan.report, s.plan.days).find((m) => String(m.id) === String(person.memberId)) : null;
  const activity = cyclePill(ACTIVITY_PILLS, person.activity_level || "sedentary");
  const diet = cyclePill(DIET_PILLS, person.diet_type || "vegetarian");
  const sex = cyclePill(SEX_PILLS, person.sex || "unspecified");
  const avoids = (person.avoids ?? []).filter((a) => !RESTRICTION_CHIPS.some((c) => c.avoids?.some((x) => x.key === a.key)));

  const setBand = (band) => edit(goalsAllowed(band)
    ? { age_band: band }
    : { age_band: band, age_years: "", weight_kg: "", height_cm: "", target_weight_kg: "", energy_goal: "maintain", eating_pattern: "balanced" });
  const addAvoid = () => {
    if (!avoidWords.trim()) return;
    s.addAvoidWords(avoidWords, key);
    setAvoidWords("");
  };

  return (
    <div>
      <StepHead title="Your baseline & the promise" sub={`Where ${person.label} stands today — and what the plan's numbers work out to.`} />
      <div className="koi-you-layout">
        <div className="koi-you-sidebar" style={{ ...cardStyle, animation: "koiUp .5s ease both" }}>
          <div style={{ ...rowStyle, marginBottom: 16 }}>
            <span style={{ font: font(700, 16) }}>About {person.label === "Me" ? "You" : person.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, font: font(600, 11), color: saving?.state === "error" ? C.red : C.accent }}>
              {saving?.state === "saving" ? "saving…" : saving?.state === "saved" ? "saved ✓" : saving?.state === "error" ? "not saved" : saving?.state === "incomplete" ? "needs details" : "tap to edit"}
            </span>
          </div>
          {saving?.state === "error" && <p style={{ font: font(500, 11), color: C.red, margin: "-8px 0 10px" }}>{saving.message}</p>}
          {saving?.state === "incomplete" && <p style={{ font: font(500, 11), color: C.warm, margin: "-8px 0 10px" }}>{saving.problems.join(" ")}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={rowStyle}>
              <span style={labelStyle}>Name</span>
              <input value={person.label} onChange={(e) => edit({ label: e.target.value.slice(0, 40) })} aria-label="Name" style={{ ...inputStyle(130), textAlign: "left" }} />
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Age group</span>
              <select value={person.age_band} onChange={(e) => setBand(e.target.value)} aria-label="Age group" style={{ ...inputStyle(150), textAlign: "left" }}>
                {AGE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
            {adult && (
              <>
                <NumberRow label="Age" hint={person.age_band === "senior_60_plus" ? "60–120" : "19–59"} value={person.age_years} unit="yrs" width={52} onChange={(v) => edit({ age_years: v })} min={19} max={120} />
                <NumberRow label="Height" hint="100–250" value={person.height_cm} unit="cm" onChange={(v) => edit({ height_cm: v })} min={100} max={250} />
                <NumberRow label="Weight" hint="25–300" value={person.weight_kg} unit="kg" onChange={(v) => edit({ weight_kg: v })} min={25} max={300} />
                <div style={rowStyle}>
                  <span style={labelStyle}>Target weight</span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <input type="number" inputMode="decimal" min={25} max={300} value={person.target_weight_kg ?? ""} onChange={(e) => edit({ target_weight_kg: e.target.value })} aria-label="Target weight" style={inputStyle(60)} />
                      <span style={{ font: font(500, 13), color: C.muted }}>kg</span>
                    </span>
                    {journey && <span style={{ font: font(400, 11), color: C.accent }}>{journey.kgPerWeek !== 0 ? `about ${Math.abs(journey.kgPerWeek)} kg/wk at this target` : "your target is maintenance"}</span>}
                  </span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Sex <span style={{ color: C.fainter, fontSize: 11 }}>for the maintenance formula</span></span>
                  <button type="button" onClick={() => edit({ sex: sex.next })} style={pill}>{sex.label} ⇅</button>
                </div>
              </>
            )}
            <div style={rowStyle}>
              <span style={labelStyle}>Activity</span>
              <button type="button" onClick={() => edit({ activity_level: activity.next })} style={pill}>{activity.label} ⇅</button>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Diet</span>
              <button type="button" onClick={() => edit({ diet_type: diet.next })} style={pill}>{diet.label} ⇅</button>
            </div>

            <div style={{ paddingTop: 11, borderTop: `1px solid ${C.divider}` }}>
              <div style={{ ...labelStyle, marginBottom: 9 }}>Dietary restrictions</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {RESTRICTION_CHIPS.map((chip) => (
                  <Chip key={chip.key} on={chipOn(chip, person)} onClick={() => edit(toggleChip(chip, person))}>{chip.label}</Chip>
                ))}
              </div>
              <div style={{ font: font(400, 11), color: C.faint, marginTop: 8 }}>KOI keeps these out of the plan and your cart, and says “not verified” wherever a label doesn&apos;t let it check.</div>
            </div>

            <div style={{ paddingTop: 11, borderTop: `1px solid ${C.divider}` }}>
              <div style={{ ...labelStyle, marginBottom: 9 }}>Ingredients to avoid</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                <input
                  value={avoidWords}
                  onChange={(e) => setAvoidWords(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addAvoid(); }}
                  placeholder="e.g. peanuts, soya, coffee…"
                  aria-label="Ingredients to avoid"
                  maxLength={120}
                  style={{ flex: 1, minWidth: 0, border: "none", borderBottom: `1px solid ${C.inputBorder}`, background: "transparent", font: font(500, 13), color: C.ink, padding: "4px 0" }}
                />
                <button type="button" onClick={addAvoid} style={{ cursor: "pointer", font: font(600, 12), color: C.primary, background: C.tint2, padding: "5px 10px", borderRadius: 8, border: "none" }}>Remove</button>
              </div>
              {avoids.length > 0 && (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {avoids.map((a) => <RemovableChip key={a.key} tone="red" size={12} label={avoidLabel(a.key)} onRemove={() => s.removeAvoid(a.key, key)} />)}
                </div>
              )}
              <div style={{ font: font(400, 11), color: C.faint, marginTop: 7 }}>
                Type an ingredient and press Enter — KOI keeps it out of {person.label}&apos;s share of the week. An allergy kept out of the house is set in household settings.
              </div>
            </div>
          </div>

          {adult && goal && (
            <div style={{ marginTop: 16, background: C.panel, borderRadius: 14, padding: 15 }}>
              <div style={{ font: font(500, 11, "mono"), color: C.muted, letterSpacing: ".06em", textTransform: "uppercase" }}>Goal · tap step 1 to change</div>
              <div style={{ font: font(700, 19, "num"), color: C.primary, marginTop: 4 }}>{goal.title}</div>
              {person.weight_kg && <div style={{ font: font(500, 12), color: C.ink2 }}>{person.weight_kg} kg{person.target_weight_kg ? ` → ${person.target_weight_kg} kg target` : ""}</div>}
            </div>
          )}
        </div>

        <div className="koi-you-main" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={cardStyle}>
            <div style={{ font: font(700, 16), marginBottom: 16 }}>{person.label === "Me" ? "Your" : `${person.label}'s`} Baseline</div>
            {figures ? (
              <>
                <div className="koi-three">
                  <div style={tileStyle}>
                    <div style={{ font: font(500, 11, "mono"), color: C.muted }}>Maintenance</div>
                    <div style={{ font: font(700, 24, "num"), marginTop: 4 }}>{figures.maintenance ? inr(figures.maintenance) : "—"}</div>
                    <div style={{ font: font(500, 11), color: C.muted }}>kcal/day · {figures.maintenanceSource === "mifflin_st_jeor" ? "Mifflin–St Jeor" : "ICMR-NIN 2020"}</div>
                  </div>
                  <div style={tileStyle}>
                    <div style={{ font: font(500, 11, "mono"), color: C.muted }}>{journey ? "At this target" : "Goal"}</div>
                    <div style={{ font: font(700, 24, "num"), marginTop: 4 }}>{journey ? `${journey.kgPerWeek > 0 ? "−" : journey.kgPerWeek < 0 ? "+" : ""}${Math.abs(journey.kgPerWeek)}` : (adult ? goal?.title?.split(" ")[0] ?? "—" : "Child")}<span style={{ fontSize: 14, color: C.muted }}>{journey ? " kg" : ""}</span></div>
                    <div style={{ font: font(500, 11), color: C.muted }}>{journey ? "a week, by the arithmetic" : adult ? "add age, height, weight" : "planned to their age"}</div>
                  </div>
                  <div style={tileStyle}>
                    <div style={{ font: font(500, 11, "mono"), color: C.muted }}>Latest plan</div>
                    <div style={{ font: font(700, 24, "num"), marginTop: 4 }}>{planned?.coverage?.protein ?? "—"}<span style={{ fontSize: 14, color: C.muted }}>{planned?.coverage?.protein !== null && planned?.coverage?.protein !== undefined ? "%" : ""}</span></div>
                    <div style={{ font: font(500, 11), color: C.muted }}>{planned ? "of the protein target" : "no plan yet"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200, background: C.primary, borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ font: font(500, 11, "mono"), color: "rgba(255,255,255,.6)" }}>TARGET CALORIES</div>
                      <div style={{ font: font(700, 22, "num"), color: "#fff", marginTop: 3 }}>{inr(figures.kcal)} <span style={{ fontSize: 12, color: "rgba(255,255,255,.65)" }}>kcal/day</span></div>
                    </div>
                    {figures.gap !== null && adult && figures.gap !== 0 && (
                      <span style={{ font: font(600, 12), color: C.mint }}>{figures.gap > 0 ? `Deficit ${inr(figures.gap)}` : `Surplus ${inr(-figures.gap)}`}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 200, background: C.tint2, borderRadius: 14, padding: "14px 16px" }}>
                    <div style={{ font: font(500, 11, "mono"), color: C.muted }}>TARGET PROTEIN</div>
                    <div style={{ font: font(700, 22, "num"), color: C.primary, marginTop: 3 }}>{inr(figures.protein)} <span style={{ fontSize: 12, color: C.muted }}>g/day</span></div>
                  </div>
                </div>
                <p style={{ font: font(400, 11, "sans", 1.5), color: C.muted, margin: "10px 0 0" }}>
                  {figures.kcalStated || figures.proteinStated
                    ? <>Targets you set yourself. <button type="button" onClick={() => s.resetToSuggestion(key)} style={{ cursor: "pointer", background: "none", border: "none", padding: 0, font: font(600, 11), color: C.accent }}>Use KOI&apos;s suggestion</button></>
                    : figures.suggested?.basis?.join(" ")}
                </p>
              </>
            ) : (
              <p style={{ font: font(400, 13), color: C.muted, margin: 0 }}>Choose an age group to see the daily figures KOI plans to.</p>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ font: font(700, 16), marginBottom: 6 }}>{person.label === "Me" ? "Your" : `${person.label}'s`} Journey Preview</div>
            {journey ? (
              <>
                <div style={{ font: font(500, 11, "mono"), color: C.muted, marginBottom: 6 }}>Weight (kg)</div>
                <Journey p={journey} />
                <div style={{ display: "flex", gap: 18, marginTop: 12, paddingTop: 14, borderTop: `1px solid ${C.divider}`, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220, background: C.tint2, borderRadius: 14, padding: 14 }}>
                    <div style={{ font: font(500, 12), color: C.ink2 }}>{journey.weeks !== null ? "At this rate, you'd reach" : "At this rate"}</div>
                    <div style={{ font: font(700, 20, "num"), color: C.primary, marginTop: 2 }}>
                      {journey.weeks !== null
                        ? `${journey.goalWeight} kg by ${new Date(journey.reachDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                        : journey.note ?? (journey.direction === "hold" ? "weight holds steady" : `about ${Math.abs(journey.kgPerWeek)} kg a week`)}
                    </div>
                    <div style={{ font: font(400, 12), color: C.muted, marginTop: 3 }}>{journey.assumption}</div>
                  </div>
                  {planned?.coverage?.kcal !== null && planned?.coverage?.kcal !== undefined && (
                    <div style={{ width: 188, background: C.surface2, border: "1px solid rgba(20,22,15,.05)", borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
                      <Ring percent={planned.coverage.kcal} />
                      <div>
                        <div style={{ font: font(500, 11), color: C.muted }}>Latest plan<br />meets calories</div>
                        <div style={{ font: font(700, 22, "num"), marginTop: 2 }}>{planned.coverage.kcal}%</div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ font: font(400, 13, "sans", 1.55), color: C.muted, margin: 0 }}>
                {adult
                  ? "Add age, height and weight above, and a target weight, to see what this target works out to — as arithmetic, never a promise."
                  : "KOI doesn't chart a child's weight. Their week is planned to ICMR-NIN's needs for their age."}
              </p>
            )}
          </div>
        </div>
      </div>
      <Footer onBack={onBack} next={{ label: "Customize my plan", onClick: onNext }} />
    </div>
  );
}
