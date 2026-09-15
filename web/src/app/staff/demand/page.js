import Link from "next/link";
import { getReviewer } from "@/lib/auth/reviewer";
import { listDemand } from "@/lib/demand/list";

export const metadata = { title: "Demand · KOI staff" };

const SECTIONS = [
  {
    kind: "not_stocked",
    title: "Not stocked",
    blurb: "Product words that matched nothing KOI sells. Candidates to onboard.",
    answered: "Now stocked",
  },
  {
    kind: "cannot_filter",
    title: "Can't filter",
    blurb: "Restrictions shoppers asked for that KOI has no way to enforce yet.",
    answered: "Now filterable",
  },
];

const day = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

// Checked on the server, per request, like /staff/review.
export default async function DemandPage() {
  const reviewer = await getReviewer();

  if (!reviewer) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24">
        <h1 className="text-[26px] font-extrabold text-[#083D2D]" style={{ fontFamily: "var(--font-koi-heading)" }}>
          Demand is for KOI staff
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#101412]/70">
          Sign in with a reviewer account. If you should have access, ask whoever holds the service key to run
          <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-[13px]">scripts/grantReviewer.mjs</code>
          for your email.
        </p>
        <Link href="/login" className="mt-6 inline-block rounded-full bg-[#083D2D] px-5 py-2.5 text-[14px] font-bold text-white">
          Sign in
        </Link>
      </main>
    );
  }

  const { publishAt, waiting, terms } = await listDemand();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header>
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/60">KOI staff</p>
        <h1 className="mt-1 text-[30px] font-extrabold text-[#083D2D]" style={{ fontFamily: "var(--font-koi-heading)" }}>
          What shoppers looked for
        </h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-[#101412]/70">
          Searches KOI couldn&apos;t answer, counted without the sentence or the shopper. A term appears here once
          {` ${publishAt} `}searches have used it
          {waiting ? `; ${waiting} more ${waiting === 1 ? "is" : "are"} below that.` : "."}
        </p>
      </header>

      {SECTIONS.map((section) => {
        const rows = terms.filter((t) => t.kind === section.kind);
        return (
          <section key={section.kind} className="mt-10">
            <h2 className="text-[18px] font-bold text-[#083D2D]" style={{ fontFamily: "var(--font-koi-heading)" }}>
              {section.title}
            </h2>
            <p className="mt-1 text-[14px] text-[#101412]/60">{section.blurb}</p>

            {rows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[#083D2D]/20 px-4 py-6 text-[14px] text-[#101412]/60">
                Nothing has reached {publishAt} searches yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl bg-white">
                <table className="w-full text-left text-[14px]">
                  <thead className="text-[12px] uppercase tracking-[0.08em] text-[#101412]/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Term</th>
                      <th className="px-4 py-3 text-right font-semibold">Searches</th>
                      <th className="px-4 py-3 font-semibold">First seen</th>
                      <th className="px-4 py-3 font-semibold">Last seen</th>
                      <th className="px-4 py-3" aria-label="Status" />
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((row) => (
                      <tr key={row.term} className="border-t border-[#083D2D]/10">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-[#101412]">{row.term}</span>
                          {row.makers?.length > 0 && (
                            <span className="mt-0.5 block text-[12px] text-[#101412]/60">
                              Made in India by {row.makers.map((m) => `${m.brand} (${m.products})`).join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{row.occurrences}</td>
                        <td className="px-4 py-3 text-[#101412]/70">{day(row.first_seen)}</td>
                        <td className="px-4 py-3 text-[#101412]/70">{day(row.last_seen)}</td>
                        <td className="px-4 py-3 text-right">
                          {row.answeredNow && (
                            <span className="rounded-full bg-[#E3F1DC] px-2.5 py-1 text-[12px] font-bold text-[#083D2D]">
                              {section.answered}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <p className="mt-10 text-[12px] text-[#101412]/50">
        Who makes a term comes from Open Food Facts (openfoodfacts.org), used under the Open Database Licence. It names
        brands to approach; nothing from it is shown to shoppers.
      </p>
    </main>
  );
}
