import "../plan/plan.css";

// Track left the Plan's steps (20 Oct 2026) but kept its page frame (.koi-page)
// and layout classes, which live with the Plan's stylesheet. Without this, a
// Track opened directly (not from the Plan) had no page padding.

export const metadata = {
  title: "Track — KOI",
  description: "Your meals and weigh-ins against the plan: tick off meals, tell KOI what you had instead, and see the week's Take 2.",
};

export default function TrackLayout({ children }) {
  return <div className="koi-plan">{children}</div>;
}
