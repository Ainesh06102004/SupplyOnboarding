import { getReviewer } from "@/lib/auth/reviewer";
import { listDemand } from "@/lib/demand/list";
import { StaffGate, StaffHeader, StaffStage, StaffTitle } from "@/components/staff/StaffChrome";
import DemandBoard from "@/components/staff/DemandBoard";

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

  if (!reviewer) return <StaffGate title="Demand is for KOI staff" grantHint />;

  const { publishAt, waiting, terms } = await listDemand();
  // Dates are formatted here so the client never re-formats them differently.
  const rows = terms.map((t) => ({ ...t, firstLabel: day(t.first_seen), lastLabel: day(t.last_seen) }));

  return (
    <StaffStage>
      <StaffHeader who={reviewer.email} />
      <StaffTitle title="What shoppers looked for">
        Searches KOI couldn&apos;t answer, counted without the sentence or the shopper. A term appears here once
        {` ${publishAt} `}searches have used it
        {waiting ? `; ${waiting} more ${waiting === 1 ? "is" : "are"} below that.` : "."}
      </StaffTitle>

      <DemandBoard sections={SECTIONS} terms={rows} publishAt={publishAt} />

      <p data-rise className="relative z-10 m-0 px-5 pb-10 text-[12.5px] leading-relaxed text-koi-bg/55 md:px-8">
        Who makes a term comes from Open Food Facts (openfoodfacts.org), used under the Open Database Licence. It names
        brands to approach; nothing from it is shown to shoppers.
      </p>
    </StaffStage>
  );
}
