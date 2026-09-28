import Link from "next/link";
import { getReviewer } from "@/lib/auth/reviewer";
import { agentSummary, PRICE } from "@/lib/agent/ops";

export const metadata = { title: "Agent · KOI staff" };
export const dynamic = "force-dynamic";

const pct = (x) => `${Math.round(x * 100)}%`;
const usd = (x) => (x === null ? "—" : `$${x < 0.1 ? x.toFixed(4) : x.toFixed(2)}`);
const H = { fontFamily: "var(--font-koi-heading)" };

function Stat({ label, value, note }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#083D2D]/60">{label}</div>
      <div className="mt-1 text-[26px] font-extrabold text-[#083D2D]" style={H}>{value}</div>
      {note && <div className="mt-1 text-[12px] text-[#101412]/60">{note}</div>}
    </div>
  );
}

export default async function AgentStaffPage() {
  const reviewer = await getReviewer();
  if (!reviewer) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24">
        <h1 className="text-[26px] font-extrabold text-[#083D2D]" style={H}>Agent runs are for KOI staff</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#101412]/70">Sign in with a reviewer account.</p>
        <Link href="/login" className="mt-6 inline-block rounded-full bg-[#083D2D] px-5 py-2.5 text-[14px] font-bold text-white">Sign in</Link>
      </main>
    );
  }

  const s = await agentSummary(7);
  const tokensK = (n) => `${Math.round(n / 1000).toLocaleString("en-IN")}k`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/60">KOI staff</p>
      <h1 className="mt-1 text-[30px] font-extrabold text-[#083D2D]" style={H}>Agent Mode, last {s.days} days</h1>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-[#101412]/70">
        From plan_run: tools, outcomes, decisions and cost per request segment. No shopper&apos;s words are kept anywhere.
      </p>

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs" value={s.runs.toLocaleString("en-IN")} note={`${s.segments} segments · ${s.households} households`} />
        <Stat label="Model cost" value={usd(s.costUsd)} note={`${usd(s.costPerRunUsd)} a run · ${tokensK(s.tokensIn)} in / ${tokensK(s.tokensOut)} out`} />
        <Stat label="Errors" value={pct(s.errorShare)} note="segments that failed" />
        <Stat label="Rules took over" value={pct(s.rulesShare)} note="model unavailable or refused twice" />
      </section>
      <p className="mt-2 text-[12px] text-[#101412]/50">
        Cost at {PRICE.model} list prices (${PRICE.inPerM}/M in, ${PRICE.outPerM}/M out), before cached-input discounts. Median segment {s.medianMs === null ? "—" : `${(s.medianMs / 1000).toFixed(1)} s`}.
      </p>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[#083D2D]" style={H}>How segments ended</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(s.outcomes).map(([k, v]) => (
            <span key={k} className="rounded-full bg-white px-3 py-1.5 text-[13px] shadow-sm"><strong>{v}</strong> {k.replace(/_/g, " ")}</span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[#083D2D]" style={H}>Tools</h2>
        <table className="mt-3 w-full text-left text-[14px]">
          <thead><tr className="text-[12px] uppercase tracking-[0.08em] text-[#083D2D]/60"><th className="py-2">Tool</th><th>Runs</th><th>Refused or failed</th><th>Median</th></tr></thead>
          <tbody>
            {s.tools.map((t) => (
              <tr key={t.tool} className="border-t border-[#083D2D]/10">
                <td className="py-2 font-semibold">{t.tool}</td>
                <td>{t.runs}</td>
                <td>{t.failed} ({pct(t.runs ? t.failed / t.runs : 0)})</td>
                <td>{t.medianMs === null ? "—" : `${(t.medianMs / 1000).toFixed(1)} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="text-[18px] font-bold text-[#083D2D]" style={H}>Approvals</h2>
        <p className="mt-1 text-[14px] text-[#101412]/60">How often shoppers allow what KOI asks to save. A low allow rate is a card asking for the wrong thing.</p>
        <table className="mt-3 w-full text-left text-[14px]">
          <thead><tr className="text-[12px] uppercase tracking-[0.08em] text-[#083D2D]/60"><th className="py-2">Card</th><th>Allowed</th><th>Not now</th><th>Allow rate</th></tr></thead>
          <tbody>
            {s.approvals.map((a) => (
              <tr key={a.tool} className="border-t border-[#083D2D]/10">
                <td className="py-2 font-semibold">{a.tool}</td>
                <td>{a.allow}</td>
                <td>{a.decline}</td>
                <td>{pct(a.allow + a.decline ? a.allow / (a.allow + a.decline) : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
