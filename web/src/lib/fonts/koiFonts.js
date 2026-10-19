// ============================================================================
// KOI's typefaces, declared once (next/font) for every surface that wants the
// store's look outside the store: the brand portal, onboarding, sign-in, staff.
//
// The variables match what app/store/layout.js sets, so the koi-* Tailwind
// tokens (globals.css, @theme inline) resolve the same everywhere:
//   --koi-sans  Plus Jakarta Sans   words
//   --koi-num   Space Grotesk       every figure
//   --koi-mono  IBM Plex Mono       labels
//   --font-koi-heading  Bricolage Grotesque (variable, opsz + wdth) display
// ============================================================================

import { Bricolage_Grotesque, Plus_Jakarta_Sans, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

const koiSans = Plus_Jakarta_Sans({ variable: "--koi-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const koiNum = Space_Grotesk({ variable: "--koi-num", subsets: ["latin"], weight: ["500", "600", "700"] });
const koiMono = IBM_Plex_Mono({ variable: "--koi-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const koiDisplay = Bricolage_Grotesque({ variable: "--font-koi-heading", subsets: ["latin"], axes: ["opsz", "wdth"] });

/** Put on a surface's root element: all four font variables. */
export const koiFontVars = `${koiSans.variable} ${koiNum.variable} ${koiMono.variable} ${koiDisplay.variable}`;
