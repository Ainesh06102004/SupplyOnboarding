import "../plan/plan.css";

// The Calendar shares the Plan's page frame (.koi-page) and layout classes.

export const metadata = {
  title: "Calendar — KOI",
  description: "Meals out, training, travel and batch-cooking days: KOI plans each week around them.",
};

export default function CalendarLayout({ children }) {
  return <div className="koi-plan">{children}</div>;
}
