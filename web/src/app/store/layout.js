import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";

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

export const metadata = {
  title: "KOI - The Better Choices Store",
  description:
    "Every product here earned its place. We decoded ingredients, labels and nutrition so you don't have to.",
};

export default function StoreLayout({ children }) {
  return (
    <div
      className={`${bricolage.variable} ${hanken.variable} relative`}
      style={{ fontFamily: "var(--font-koi-body), sans-serif" }}
    >
      <StoreNavigation />
      {children}
    </div>
  );
}
