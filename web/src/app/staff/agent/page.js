import { getReviewer } from "@/lib/auth/reviewer";
import { agentSummary, PRICE } from "@/lib/agent/ops";
import { StaffGate, StaffHeader, StaffStage, StaffTitle } from "@/components/staff/StaffChrome";

export const metadata = { title: "Agent · KOI staff" };
export const dynamic = "force-dynamic";

const pct = (x) => `${Math.round(x * 100)}%`;
const usd = (x) => (x === null ? "—" : `$${x < 0.1 ? x.toFixed(4) : x.toFixed(2)}`);

// One colour per outcome, in the order they arrive; the bar and the legend share it.
const OUTCOME_TONES = ["bg-koi-lime", "bg-koi-mint", "bg-koi-green", "bg-koi-amber", "bg-koi-ember", "bg-koi-red", "bg-koi-bg/60", "bg-koi-primary"];

function Stat({ label, value, note }) {
  return (
    <article data-section className="flex flex-col gap-1.5 rounded-[22px] bg-white/5 p-5">
      <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-bg/60">{label}</span>
      <span className="font-koi-num text-[38px] font-semibold leading-none">{value}</span>
      {note && <span className="text-[12.5px] text-koi-bg/60">{note}</span>}
    </article>
  );
}

export default async function AgentStaffPage() {
  const reviewer = await getReviewer();
  if (!reviewer) return <StaffGate title="Agent runs are for KOI staff" />;

  const s = await agentSummary(7);
  const tokensK = (n) => `${Math.round(n / 1000).toLocaleString("en-IN")}k`;
  const outcomes = Object.entries(s.outcomes);
  const outcomeTotal = outcomes.reduce((sum, [, v]) => sum + v, 0) || 1;
  const rate = (a) => (a.allow + a.decline ? a.allow / (a.allow + a.decline) : null);
  // The card shoppers allow least, if it is allowed less than half the time.
  const weakest = s.approvals
    .filter((a) => rate(a) !== null)
    .sort((a, b) => rate(a) - rate(b))[0];
  const flag = weakest && rate(weakest) < 0.5 ? weakest : null;

  return (
    <StaffStage className="pb-10">
      <StaffHeader who={reviewer.email} />
      <StaffTitle title={`Agent Mode, last ${s.days} days`}>
        From plan_run: tools, outcomes, decisions and cost per request segment. No shopper&apos;s words are kept anywhere.
      </StaffTitle>

      <section aria-label="Summary" className="relative z-10 grid grid-cols-2 gap-4 px-5 pt-6 md:px-8 xl:grid-cols-4">
        <Stat label="Runs" value={s.runs.toLocaleString("en-IN")} note={`${s.segments} segments · ${s.households} households`} />
        <Stat label="Model cost" value={usd(s.costUsd)} note={`${usd(s.costPerRunUsd)} a run · ${tokensK(s.tokensIn)} in / ${tokensK(s.tokensOut)} out`} />
        <Stat label="Errors" value={pct(s.errorShare)} note="segments that failed" />
        <Stat label="Rules took over" value={pct(s.rulesShare)} note="model unavailable or refused twice" />
      </section>
      <p data-rise className="relative z-10 m-0 px-5 pt-3 text-[12.5px] text-koi-bg/55 md:px-8">
        Cost at {PRICE.model} list prices (${PRICE.inPerM}/M in, ${PRICE.outPerM}/M out), before cached-input discounts. Median segment {s.medianMs === null ? "—" : `${(s.medianMs / 1000).toFixed(1)} s`}.
      </p>

      <section data-section aria-label="How segments ended" className="relative z-10 mx-5 mt-6 flex flex-col gap-3 rounded-[24px] bg-white/5 p-6 md:mx-8">
        <h2 className="m-0 font-koi-display text-[22px] font-extrabold">How segments ended</h2>
        {outcomes.length === 0 ? (
          <p className="m-0 text-[13.5px] text-koi-bg/60">No segments in this window.</p>
        ) : (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-koi-bg/10">
              {outcomes.map(([k, v], i) => (
                <span key={k} data-bar data-w={(v / outcomeTotal) * 100} className={`block h-full w-0 ${OUTCOME_TONES[i % OUTCOME_TONES.length]}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {outcomes.map(([k, v], i) => (
                <span key={k} className="flex items-center gap-2 text-[13.5px]">
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${OUTCOME_TONES[i % OUTCOME_TONES.length]}`} />
                  <strong className="font-koi-num">{v}</strong> {k.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="relative z-10 grid grid-cols-1 gap-5 px-5 py-6 md:px-8 xl:grid-cols-2">
        <section data-section aria-label="Tools" className="flex flex-col gap-3 rounded-[24px] bg-white/5 p-6">
          <h2 className="m-0 font-koi-display text-[22px] font-extrabold">Tools</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-koi-bg/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-bg/55">
                  <th scope="col" className="py-2.5 font-medium">Tool</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Runs</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Refused or failed</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Median</th>
                </tr>
              </thead>
              <tbody>
                {s.tools.map((t) => (
                  <tr key={t.tool} className="border-b border-koi-bg/10 last:border-b-0">
                    <td className="py-2.5 font-koi-mono text-[13px]">{t.tool}</td>
                    <td className="py-2.5 text-right font-koi-num">{t.runs}</td>
                    <td className={`py-2.5 text-right font-koi-num ${t.failed ? "text-koi-ember" : "text-koi-bg/70"}`}>{t.failed} ({pct(t.runs ? t.failed / t.runs : 0)})</td>
                    <td className="py-2.5 text-right font-koi-num text-koi-bg/80">{t.medianMs === null ? "—" : `${(t.medianMs / 1000).toFixed(1)} s`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section data-section aria-label="Approvals" className="flex flex-col gap-3 rounded-[24px] bg-white/5 p-6">
          <h2 className="m-0 font-koi-display text-[22px] font-extrabold">Approvals</h2>
          <p className="m-0 text-[13.5px] text-koi-bg/65">How often shoppers allow what KOI asks to save. A low allow rate is a card asking for the wrong thing.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-koi-bg/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-bg/55">
                  <th scope="col" className="py-2.5 font-medium">Card</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Allowed</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Not now</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Allow rate</th>
                </tr>
              </thead>
              <tbody>
                {s.approvals.map((a) => {
                  const r = rate(a) ?? 0;
                  return (
                    <tr key={a.tool} className="border-b border-koi-bg/10 last:border-b-0">
                      <td className="py-3 font-koi-mono text-[13px]">{a.tool}</td>
                      <td className="py-3 text-right font-koi-num">{a.allow}</td>
                      <td className="py-3 text-right font-koi-num">{a.decline}</td>
                      <td className="py-3 text-right">
                        <span className={`rounded-full px-2.5 py-0.5 font-koi-num text-[12.5px] font-semibold ${r < 0.5 ? "bg-koi-ember/20 text-koi-ember" : "bg-koi-lime/15 text-koi-lime"}`}>{pct(r)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {flag && (
            <p className="m-0 rounded-2xl bg-koi-lime/10 px-4 py-3 text-[13px] leading-relaxed text-koi-bg/80">
              <span className="font-koi-mono">{flag.tool}</span> is allowed less than half the time — it is the card to look at first.
            </p>
          )}
        </section>
      </div>
    </StaffStage>
  );
}
