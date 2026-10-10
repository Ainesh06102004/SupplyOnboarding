import { Bricolage_Grotesque, Plus_Jakarta_Sans, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { AgentProvider } from "@/components/agent/AgentProvider";
import AgentDock from "@/components/agent/AgentDock";
import StoreChrome from "@/components/store/shell/StoreChrome";
import CartHydrator from "./CartHydrator";
import GoalProfileSync from "./GoalProfileSync";
import "./koi.css";

// One language for the whole store (components/store/system/tokens.js):
// Plus Jakarta Sans for words, Space Grotesk for every figure, IBM Plex Mono
// for labels, and Bricolage Grotesque for the editorial display moments only.
// Hanken Grotesk is retired; koi.css points --font-koi-body at Plus Jakarta so
// every older BODY reference follows.
const koiSans = Plus_Jakarta_Sans({ variable: "--koi-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const koiNum = Space_Grotesk({ variable: "--koi-num", subsets: ["latin"], weight: ["500", "600", "700"] });
const koiMono = IBM_Plex_Mono({ variable: "--koi-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-koi-heading", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const AGENT_MODE = process.env.NEXT_PUBLIC_KOI_AGENT_MODE === "1";

export const metadata = {
  title: "KOI - The Better Choices Store",
  description:
    "Every product here earned its place. We decoded ingredients, labels and nutrition so you don't have to.",
};

export default function StoreLayout({ children }) {
  return (
    <div
      className={`${koiSans.variable} ${koiNum.variable} ${koiMono.variable} ${bricolage.variable} koi-store relative`}
      data-agent={AGENT_MODE ? "on" : "off"}
    >
      <CartHydrator />
      <GoalProfileSync />
      {AGENT_MODE ? (
        <AgentProvider>
          <StoreChrome />
          {children}
          <AgentDock />
        </AgentProvider>
      ) : (
        <>
          <StoreChrome />
          {children}
        </>
      )}
    </div>
  );
}
