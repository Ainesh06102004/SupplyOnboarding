import { getReviewer } from "@/lib/auth/reviewer";
import ReviewConsole from "@/components/staff/ReviewConsole";
import { StaffGate } from "@/components/staff/StaffChrome";

export const metadata = { title: "Label review · KOI staff" };

// Checked on the server, per request: a signed-out visitor or an account
// without the reviewer role gets this notice and nothing from the queue. The
// API behind the console repeats the same check on every call.
export default async function LabelReviewPage() {
  const reviewer = await getReviewer();

  if (!reviewer) return <StaffGate title="Label review is for KOI reviewers" grantHint />;

  return <ReviewConsole reviewerEmail={reviewer.email} />;
}
