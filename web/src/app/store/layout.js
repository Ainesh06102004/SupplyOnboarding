import { Bricolage_Grotesque, Hanken_Grotesk, Plus_Jakarta_Sans, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { AgentProvider } from "@/components/agent/AgentProvider";
import AgentDock from "@/components/agent/AgentDock";

// KOI Agent Mode's dock speaks the Plan page's type on every store page:
// Plus Jakarta Sans for words, Space Grotesk for figures, IBM Plex Mono for status.
const koiSans = Plus_Jakarta_Sans({ variable: "--koi-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const koiNum = Space_Grotesk({ variable: "--koi-num", subsets: ["latin"], weight: ["500", "600", "700"] });
const koiMono = IBM_Plex_Mono({ variable: "--koi-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const AGENT_MODE = process.env.NEXT_PUBLIC_KOI_AGENT_MODE === "1";

const bricolage = Bricolage_Grotesque({
  variable: "--font-koi-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const hanken = Hanken_Grotesk({
  variable: "--font-koi-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

import StoreNavigation from "./StoreNavigation";
import CartHydrator from "./CartHydrator";
import GoalProfileSync from "./GoalProfileSync";

export const metadata = {
  title: "KOI - The Better Choices Store",
  description:
    "Every product here earned its place. We decoded ingredients, labels and nutrition so you don't have to.",
};

export default function StoreLayout({ children }) {
  return (
    <div
      className={`${bricolage.variable} ${hanken.variable} ${AGENT_MODE ? `${koiSans.variable} ${koiNum.variable} ${koiMono.variable}` : ""} relative`}
      style={{ fontFamily: "var(--font-koi-body), sans-serif" }}
    >
      <CartHydrator />
      <GoalProfileSync />
      {AGENT_MODE ? (
        <AgentProvider>
          <StoreNavigation />
          {children}
          <AgentDock />
        </AgentProvider>
      ) : (
        <>
          <StoreNavigation />
          {children}
        </>
      )}
    </div>
  );
}
