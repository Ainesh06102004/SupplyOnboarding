"use client";

// ============================================================================
// KOI STORE - Editorial Landing
// A magazine-grade, trust-first home for the KOI marketplace.
// Composed from modular sections in components/store/landing/*.
// Business logic preserved: cart, location and search all wired to real state.
// ============================================================================

import EditorialNav from "@/components/store/landing/EditorialNav";
import HeroEditorial from "@/components/store/landing/HeroEditorial";
import { FeaturedCollection, BestRated } from "@/components/store/landing/ProductSections";
import { WhyKoi, TrustFramework, ScienceBacked } from "@/components/store/landing/TrustSections";
import { IngredientExplorer, TrendingCategories } from "@/components/store/landing/DiscoverySections";
import { CommunityVoices, NewsletterEditorial, FooterEditorial } from "@/components/store/landing/CommunityFooter";
import ForBrands from "@/components/store/landing/ForBrands";

export default function StoreHomePage() {
  return (
    <div className="koi-landing relative w-full overflow-x-clip" style={{ background: "#F9F8F4" }}>
      <EditorialNav />

      <main>
        <HeroEditorial />
        <FeaturedCollection />
        <WhyKoi />
        <BestRated />
        <TrustFramework />
        <IngredientExplorer />
        <TrendingCategories />
        <ScienceBacked />
        <CommunityVoices />
        <ForBrands />
        <NewsletterEditorial />
      </main>

      <FooterEditorial />

      {/* Shared, GPU-accelerated keyframes + motion preferences */}
      <style jsx global>{`
        @keyframes koi-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes koi-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -14px, 0); }
        }
        @keyframes koi-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .koi-landing [data-pause="1"]:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .koi-landing *,
          .koi-landing *::before,
          .koi-landing *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </div>
  );
}
