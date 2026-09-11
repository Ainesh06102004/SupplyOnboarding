import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";

// KOI's internal tools. Separate from /dashboard, which is the brands' side
// and has no server-side gate; every page here checks the reviewer role on the
// server before rendering anything.
const bricolage = Bricolage_Grotesque({ variable: "--font-koi-heading", subsets: ["latin"], weight: ["500", "700", "800"] });
const hanken = Hanken_Grotesk({ variable: "--font-koi-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata = {
  title: "KOI staff",
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }) {
  return (
    <div
      className={`${bricolage.variable} ${hanken.variable} min-h-screen`}
      style={{ fontFamily: "var(--font-koi-body), sans-serif", background: "#F2F6EC", color: "#101412" }}
    >
      {children}
    </div>
  );
}
