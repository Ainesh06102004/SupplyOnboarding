import { koiFontVars } from "@/lib/fonts/koiFonts";

// The brand application in the store's typefaces and koi-* tokens.
export default function OnboardingRootLayout({ children }) {
  return <div className={`${koiFontVars} min-h-screen bg-koi-bg font-koi-sans text-koi-ink antialiased`}>{children}</div>;
}
