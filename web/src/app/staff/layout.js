import { koiFontVars } from "@/lib/fonts/koiFonts";

// KOI's internal tools. Separate from /dashboard, which is the brands' side
// and has no server-side gate; every page here checks the reviewer role on the
// server before rendering anything. They wear the "editing suite" look from
// the StaffReview / StaffDemand / StaffAgent boards: KOI night, store type.
export const metadata = {
  title: "KOI staff",
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }) {
  return (
    <div className={`${koiFontVars} relative min-h-screen overflow-x-clip bg-koi-night font-koi-sans text-koi-bg antialiased`}>
      {children}
    </div>
  );
}
