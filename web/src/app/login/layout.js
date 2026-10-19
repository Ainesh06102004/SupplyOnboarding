import { koiFontVars } from "@/lib/fonts/koiFonts";

export const metadata = {
  title: 'Sign In | KOI Health',
  description: 'Sign in to your KOI supplier account',
};

// The supplier sign-in in the store's typefaces and koi-* tokens.
export default function LoginLayout({ children }) {
  return <div className={`${koiFontVars} min-h-screen bg-koi-bg font-koi-sans text-koi-ink antialiased`}>{children}</div>;
}
