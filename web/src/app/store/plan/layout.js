import "./plan.css";

// The Plan's fonts and keyframes are the whole store's now (app/store/layout.js
// and koi.css); this layout keeps only the Plan's own layout classes.

export const metadata = {
  title: "Plan — KOI",
  description: "Plan what enters your home for the people eating it, with every figure from the label.",
};

export default function PlanLayout({ children }) {
  return <div className="koi-plan">{children}</div>;
}
