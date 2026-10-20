"use client";

// Track — the person's own weigh-ins against the plan's arithmetic. Its own
// page (/store/track) since 20 Oct 2026: it was step 6 of the Plan, but the
// Plan is the week's chapters (Define → Cart) and Track is the person's weeks,
// so it stands apart and links back to the Plan where it needs to.
//
// Decided with the user (24 Sep 2026, 00077): weight only; kept until deleted
// (from /store/profile/data); KOI may propose a new calorie target from the
// trend and nothing changes until the person accepts it. Only the account
// holder tracks, for themselves, and only as an adult (DPDP s.9). Every figure
// here is lib/plan/track.js's arithmetic, shown with its assumption — never a
// forecast, never odds. The coach is KOI.
//
// Cinematic storefront (Oct 2026): the weigh-ins drawn as one line against
// the plan's dashed arithmetic; KOI's dot sits in the coach card as its face,
// and when it has a suggestion it goes to it and waits (a heartbeat) — the
// target changes only when the person says so.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { trackRead, TRACK_RULES } from "@/lib/plan/track";
import { goalsAllowed } from "@/lib/planner/goals";
import { useCheckins } from "./useCheckins";
import { inr } from "./tokens";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const signed = (n, unit = "kg") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} ${unit}`;
const perWeek = (n) => `${n > 0 ? "gaining" : n < 0 ? "losing" : "holding"}${n ? ` ${Math.abs(n)} kg` : ""} a week`;
const card = "flex flex-col gap-3 rounded-[28px] border border-koi-forest/10 bg-white p-6";

/** The weigh-ins and the plan's line, over the same days. */
function Chart({ read }) {
  const ref = useRef(null);
  const pts = read.checkins;
  const plan = read.planLine;
  const sig = pts.map((p) => `${p.date}:${p.kg}`).join("|");
  useGSAP(() => {
    if (!pts.length || prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.fromTo(ref.current.querySelector("[data-weigh-line]"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 1.3, ease: E.dolly, delay: 0.2 });
    gsap.from(ref.current.querySelectorAll("[data-dot]"), { scale: 0, transformOrigin: "50% 50%", duration: 0.4, stagger: 0.06, ease: "back.out(3)", delay: 0.4 });
    const planLine = ref.current.querySelector("[data-plan-line]");
    if (planLine) gsap.from(planLine, { autoAlpha: 0, duration: 0.8, delay: 1.1 });
  }, { scope: ref, dependencies: [sig] });
  if (!pts.length) return <div className="grid h-[200px] place-items-center text-[13.5px] font-medium text-koi-muted">Your first weigh-in starts the line.</div>;
  const days = [...pts.map((p) => p.day), ...plan.map((p) => Math.round(new Date(`${p.date}T00:00:00Z`).getTime() / 86400000))];
  const kgs = [...pts.map((p) => p.kg), ...plan.map((p) => p.kg)];
  const [d0, d1] = [Math.min(...days), Math.max(...days, pts[0].day + 7)];
  const [k0, k1] = [Math.floor(Math.min(...kgs) - 0.5), Math.ceil(Math.max(...kgs) + 0.5)];
  const x = (d) => 44 + ((d - d0) / Math.max(1, d1 - d0)) * 576;
  const y = (k) => 16 + ((k1 - k) / Math.max(0.5, k1 - k0)) * 142;
  const planPts = plan.map((p) => [x(Math.round(new Date(`${p.date}T00:00:00Z`).getTime() / 86400000)), y(p.kg)]);
  const weigh = pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  return (
    <svg ref={ref} viewBox="0 0 640 200" className="h-[200px] w-full overflow-visible" role="img" aria-label={`Your weigh-ins${plan.length ? " against the plan's arithmetic" : ""}`}>
      <line x1="44" y1="16" x2="44" y2="158" stroke="#ebe8df" /><line x1="44" y1="158" x2="620" y2="158" stroke="#ebe8df" />
      <text x="4" y="26" fontFamily="IBM Plex Mono" fontSize="11" fill="#4a4d44">{k1}</text>
      <text x="4" y="158" fontFamily="IBM Plex Mono" fontSize="11" fill="#4a4d44">{k0}</text>
      {planPts.length === 2 && <path data-plan-line d={`M${planPts[0][0]},${planPts[0][1]} L${planPts[1][0]},${planPts[1][1]}`} fill="none" stroke="#b07d2b" strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" />}
      <path data-weigh-line d={weigh} fill="none" stroke="#1f5c3a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p) => <circle key={p.date} data-dot cx={x(p.day)} cy={y(p.kg)} r="4" fill="#1f5c3a"><title>{`${p.date}: ${p.kg} kg`}</title></circle>)}
      <text x={x(pts[0].day)} y="184" textAnchor="start" fontFamily="Space Grotesk" fontSize="11" fontWeight="600" fill="#3d4a43">{pts[0].date}</text>
      {pts.length > 1 && <text x={x(pts.at(-1).day)} y="184" textAnchor="end" fontFamily="Space Grotesk" fontSize="11" fontWeight="600" fill="#3d4a43">{pts.at(-1).date}</text>}
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

/** The page's own head: Track is a place, not a step. */
function TrackHead() {
  const ref = useRef(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(ref.current.querySelectorAll("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal });
    gsap.from(ref.current.querySelectorAll("[data-rise]"), { autoAlpha: 0, y: 12, duration: 0.7, stagger: 0.08, ease: E.reveal, delay: 0.1, clearProps: "opacity,visibility,transform" });
  }, { scope: ref });
  return (
    <header ref={ref} className="mb-7 flex flex-col gap-2">
      <span data-rise className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">Track · just you</span>
      <h1 className="koi-condensed m-0 font-koi-display text-[clamp(40px,5vw,68px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
        <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Your weigh-ins against the plan</span></span>
      </h1>
      <p data-rise className="m-0 max-w-[720px] text-[15.5px] leading-relaxed text-koi-ink2">One weight a week is enough. KOI sets it against the plan&apos;s arithmetic, and only ever suggests.</p>
    </header>
  );
}

export default function TrackView({ s }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((v) => v.say);
  const me = s.profiles.find((p) => p.is_account_holder && p.memberId) ?? null;
  const adult = Boolean(me && goalsAllowed(me.age_band));
  const { rows, loading, error, save } = useCheckins(adult ? me.memberId : null);
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const read = useMemo(() => (me ? trackRead(me, rows) : null), [me, rows]);
  const proposal = read?.proposal && dismissed !== `${read.proposal.from}>${read.proposal.kcal}` ? read.proposal : null;
  const proposalKey = proposal ? `${proposal.from}>${proposal.kcal}` : null;

  useGSAP(() => {
    if (!read || prefersReducedMotion()) return;
    setupMotion().from(root.current.querySelectorAll("[data-card]"), { autoAlpha: 0, y: 30, duration: 0.85, stagger: 0.08, ease: E.dolly, delay: 0.15, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [Boolean(read)] });

  // KOI sits in the coach card; with a suggestion it goes to it and waits.
  useEffect(() => {
    if (!read || loading) return undefined;
    const t = setTimeout(() => {
      const offer = root.current?.querySelector("[data-proposal]");
      const face = root.current?.querySelector("[data-mslot]");
      if (offer) {
        say("I have a suggestion for your daily target. Nothing changes unless you say so.");
        ember.go(offer, ember.perch(offer, 6), () => ember.heartbeat(true));
      } else if (face) {
        say(read.status === "too_few" ? "One weight a week is enough. I’ll read the trend once there are a few." : "Here’s your trend against the plan’s arithmetic.");
        ember.go(face, { ax: 0.5, ay: 0.5 });
      }
    }, 900);
    return () => clearTimeout(t);
  }, [read, loading, proposalKey, ember, say]);
  useEffect(() => () => ember.rest(), [ember]);

  // Where Track hands back to the Plan: your targets, and the week they feed.
  const back = (
    <nav aria-label="Related" className="mt-7 flex flex-wrap items-center gap-3">
      {adult && <Link href="/store/plan?step=you" className="flex h-14 items-center rounded-2xl border border-koi-forest/15 bg-white px-6 text-[15px] font-semibold text-koi-forest no-underline transition-colors hover:border-koi-forest/40">Your targets in You</Link>}
      <Link href="/store/plan?step=plan" className="flex h-14 items-center rounded-2xl px-5 text-sm font-semibold text-koi-ink2 no-underline transition-colors hover:bg-white">This week&apos;s plan →</Link>
    </nav>
  );
  const head = <TrackHead />;

  if (!s.session) return <div className="font-koi-sans">{head}<div className={card}><p className="m-0 text-sm font-medium">Sign in to track your own weigh-ins.</p></div>{back}</div>;
  if (!me || !adult) {
    return (
      <div className="font-koi-sans text-koi-ink">
        {head}
        <div className={card}>
          <p className="m-0 text-[15px] font-semibold">{!me ? "Track is for you, the account holder." : "Track is for adults."}</p>
          <p className="m-0 text-[13.5px] text-koi-ink2">
            {!me
              ? "Add yourself to the household (the person marked \"me\") and your weigh-ins can start. Everyone tracks for themselves, from their own account — nobody weighs in for someone else."
              : "Tracking starts at 19. KOI keeps no weight history for anyone younger (DPDP Act 2023, s.9)."}
          </p>
        </div>
        {back}
      </div>
    );
  }

  const valid = Number(kg) >= 30 && Number(kg) <= 250;
  const log = async (e) => {
    e?.preventDefault?.();
    if (!valid) return;
    setBusy(true);
    const ok = await save(Math.round(Number(kg) * 10) / 10, date);
    setBusy(false);
    if (!ok) return;
    setKg("");
    s.notify("Weigh-in saved.", "info");
    say("Saved. It’s on the line now.");
    const latest = root.current?.querySelector("[data-latest]");
    if (latest) ember.go(latest, ember.perch(latest, 6), () => ember.done());
  };
  const accept = () => {
    ember.heartbeat(false);
    s.editProfile(s.keyOf(me), { target_kcal: String(proposal.kcal), target_source: "stated" });
    s.notify(`Your daily target is now ${inr(proposal.kcal)} kcal. Change it any time in You.`, "info");
    say("Done. Your new target is set; change it any time in You.");
    setDismissed(`${proposal.from}>${proposal.kcal}`);
    ember.done(() => ember.home());
  };
  const notNow = () => {
    ember.heartbeat(false);
    setDismissed(`${proposal.from}>${proposal.kcal}`);
    say("No change. Your target stays as it is.");
    ember.home();
  };

  return (
    <div ref={root} className="font-koi-sans text-koi-ink">
      {head}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <article data-card aria-label="Weigh-ins vs the plan’s arithmetic" className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">Weigh-ins vs the plan’s arithmetic</span>
                <span className="text-[13px] text-koi-muted">{read.checkins.length ? `${read.checkins.length} weigh-in${read.checkins.length === 1 ? "" : "s"} since ${read.checkins[0].date}` : loading ? "Loading…" : "No weigh-ins yet"}</span>
              </span>
              {read.latest && (
                <span className="flex flex-col items-end gap-1">
                  <span className="flex items-baseline gap-1.5"><span data-latest className="font-koi-num text-[44px] font-semibold leading-none text-koi-forest">{read.latest.kg}</span><span className="text-sm text-koi-muted">kg</span></span>
                  {read.change !== null && read.checkins.length > 1 && <span className="rounded-full bg-koi-tint px-2.5 py-1 text-[11.5px] font-semibold text-koi-primary">{signed(read.change)} since you started</span>}
                </span>
              )}
            </div>
            <Chart read={read} />
            <div className="flex flex-wrap gap-5 border-t border-koi-forest/10 pt-3 text-[12.5px] font-semibold">
              <span className="flex items-center gap-2 text-koi-primary"><span aria-hidden="true" className="h-[3px] w-5 rounded-full bg-koi-primary" />Your weigh-ins</span>
              {read.planLine.length > 0 && <span className="flex items-center gap-2 text-koi-amber-ink"><span aria-hidden="true" className="w-5 border-t-2 border-dashed border-koi-amber" />The plan’s arithmetic ({perWeek(read.planned)})</span>}
            </div>
          </article>

          <article data-card aria-label="Log a weigh-in" className={card}>
            <span className="flex flex-col gap-1"><span className="text-base font-bold">Log a weigh-in</span><span className="text-[13px] text-koi-muted">Same scale, same time of day, once a week. A second weigh-in on the same day replaces the first.</span></span>
            <form onSubmit={log} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted">Weight (kg)</span>
                <input type="number" inputMode="decimal" min={30} max={250} step={0.1} value={kg} onChange={(e) => setKg(e.target.value)} placeholder={read.latest ? String(read.latest.kg) : "e.g. 72.5"} aria-label="Weight in kg" className="h-14 w-36 rounded-2xl border border-koi-forest/15 bg-koi-paper px-4 font-koi-num text-[22px] font-semibold outline-none placeholder:text-koi-muted focus:border-koi-forest focus:bg-white" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted">Date</span>
                <input type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} aria-label="Date of the weigh-in" className="h-14 rounded-2xl border border-koi-forest/15 bg-koi-paper px-4 font-koi-num text-[15px] font-semibold outline-none focus:border-koi-forest focus:bg-white" />
              </label>
              <button type="submit" disabled={busy || !valid} className="h-14 rounded-2xl bg-koi-forest px-6 text-[15px] font-bold text-koi-lime disabled:opacity-40">{busy ? "Saving…" : "Log weigh-in"}</button>
            </form>
            {error && <p role="alert" className="m-0 text-xs font-medium text-koi-red">{error}</p>}
            <p className="m-0 text-[12.5px] text-koi-muted">Kept until you delete them — <Link href="/store/profile/data" className="font-semibold text-koi-primary underline-offset-4 hover:underline">your data</Link> removes every weigh-in at once.</p>
          </article>
        </div>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--koi-header-h)+84px)]">
          <article data-card aria-label="KOI’s read" className="flex flex-col gap-4 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
            <span className="flex items-center gap-3">
              <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-koi-bg/10"><span data-mslot className="size-[10px] rounded-full" /></span>
              <span className="flex flex-col"><span className="font-koi-display text-lg font-extrabold leading-none">KOI</span><span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/65">your read</span></span>
            </span>
            <p className="m-0 text-balance text-[17px] font-medium leading-snug">{readingOf(read)}</p>
            {proposal && (
              <div data-proposal className="flex flex-col gap-3 rounded-2xl bg-koi-bg p-5 text-koi-ink">
                <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">A suggestion — yours to take or leave</span>
                <span className="font-koi-num text-[30px] font-semibold leading-none text-koi-forest">{inr(proposal.from)} → {inr(proposal.kcal)} kcal</span>
                <p className="m-0 text-[13px] leading-normal text-koi-ink2">By the same arithmetic, the difference is about {inr(Math.abs(proposal.gapKcal))} kcal a day. KOI moves a target at most {TRACK_RULES.maxStepKcal} kcal at a time, and never below a safe floor.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={accept} className="h-11 rounded-full bg-koi-forest px-5 text-sm font-bold text-koi-lime">Use {inr(proposal.kcal)} kcal</button>
                  <button type="button" onClick={notNow} className="h-11 rounded-full px-4 text-sm font-semibold text-koi-ink2 transition-colors hover:bg-koi-paper">Not now</button>
                </div>
              </div>
            )}
            {read.toTarget && (
              <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-koi-bg/10 px-4 py-3">
                <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">At this pace</span>
                <span className="text-[15px] font-bold">{me.target_weight_kg} kg in about {read.toTarget.weeks} week{read.toTarget.weeks === 1 ? "" : "s"}</span>
              </div>
            )}
            <p className="m-0 text-[12px] leading-normal text-koi-bg/70">{read.assumption}</p>
          </article>
          <p className="m-0 px-2 text-[12.5px] leading-normal text-koi-muted">Track is for you, the account holder, as an adult. KOI keeps no weight history for anyone under 19.</p>
        </aside>
      </section>
      {back}
    </div>
  );
}
