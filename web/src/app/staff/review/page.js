import Link from "next/link";
import { getReviewer } from "@/lib/auth/reviewer";
import ReviewConsole from "@/components/staff/ReviewConsole";

export const metadata = { title: "Label review · KOI staff" };

// Checked on the server, per request: a signed-out visitor or an account
// without the reviewer role gets this notice and nothing from the queue. The
// API behind the console repeats the same check on every call.
export default async function LabelReviewPage() {
  const reviewer = await getReviewer();

  if (!reviewer) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24">
        <h1 className="text-[26px] font-extrabold text-[#083D2D]" style={{ fontFamily: "var(--font-koi-heading)" }}>
          Label review is for KOI reviewers
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

  return <ReviewConsole reviewerEmail={reviewer.email} />;
}
