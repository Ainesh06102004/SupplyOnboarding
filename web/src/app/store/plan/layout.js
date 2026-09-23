import { Plus_Jakarta_Sans, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./plan.css";

// The founder's Nutrition Planner design sets its own three families: Plus
// Jakarta Sans for words, Space Grotesk for figures, IBM Plex Mono for labels.
const sans = Plus_Jakarta_Sans({ variable: "--koi-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const num = Space_Grotesk({ variable: "--koi-num", subsets: ["latin"], weight: ["500", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--koi-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata = {
  title: "Plan — KOI",
  description: "Plan what enters your home for the people eating it, with every figure from the label.",
};

export default function PlanLayout({ children }) {
  return <div className={`${sans.variable} ${num.variable} ${mono.variable} koi-plan`}>{children}</div>;
}
