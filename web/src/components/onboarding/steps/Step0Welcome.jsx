"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, FileText, TrendingUp, Clock, Cloud, Info, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OnboardingShell from '../layout/OnboardingShell';
import BenefitCard from '../common/BenefitCard';
import DocumentChecklist from '../common/DocumentChecklist';
import { useOnboardingStore } from '@/store/onboardingStore';

// ─── STORE DESIGN TOKENS ───
const C = {
  green: "#0E4032",
  lime: "#C8F23E",
  bg: "#F2F6EC",
  card: "#FFFFFF",
  text: "#0E4032",
  muted: "#5A6B5A",
  border: "#E2E8D8",
  light: "#EDF2E6",
};

export default function Step0Welcome() {
  const router = useRouter();
  const nextStep = useOnboardingStore((state) => state.nextStep);

  const handleStart = () => {
    nextStep();
    router.push('/onboarding/step-1');
  };

  const leftPanel = (
    <motion.div 
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45 }}
      className="flex flex-col h-full"
    >
      <div className="flex items-center gap-2.5 mb-10">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-[15px] tracking-tight text-white"
          style={{ background: C.green, fontFamily: "var(--font-koi-heading)" }}
        >
          K
        </div>
        <span
          className="text-xl font-bold tracking-tight"
          style={{ color: C.green, fontFamily: "var(--font-koi-heading)" }}
        >
          KOI
        </span>
      </div>

      <div className="mb-8">
        <h1
          className="text-[36px] lg:text-[40px] leading-[1.08] font-bold mb-4 tracking-tight"
          style={{ color: C.green, fontFamily: "var(--font-koi-heading)" }}
        >
          Join KOI Supplier Network
        </h1>
        <p className="text-lg max-w-[90%] leading-relaxed" style={{ color: C.muted }}>
          Get your products listed on India&apos;s most trusted health-first quick commerce platform.
        </p>
      </div>

      <div className="mt-4 max-w-[480px]">
        <BenefitCard 
          icon={ShieldCheck}
          title="Trusted Health Verification"
          description="AI + expert review ensures only quality products get approved."
          delay={0.1}
        />
        <BenefitCard 
          icon={FileText}
          title="Smart Label Extraction"
          description="Upload packaging once. KOI auto-fills product data."
          delay={0.2}
        />
        <BenefitCard 
          icon={TrendingUp}
          title="Reach High-Intent Buyers"
          description="Sell to health-conscious consumers seeking better alternatives."
          delay={0.3}
        />
      </div>
    </motion.div>
  );

  const rightPanel = (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="bg-white rounded-2xl border p-6 md:p-8 w-full flex flex-col"
      style={{ borderColor: C.border, boxShadow: "0 8px 30px rgba(14,64,50,0.06)" }}
    >
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Badge variant="secondary" className="flex items-center gap-1.5 py-1.5 px-3 rounded-full font-medium border-0" style={{ background: C.light, color: C.green }}>
          <Clock className="w-3.5 h-3.5" />
          10–15 mins
        </Badge>
        <Badge variant="secondary" className="flex items-center gap-1.5 py-1.5 px-3 rounded-full font-medium border-0" style={{ background: C.light, color: C.green }}>
          <Cloud className="w-3.5 h-3.5" />
          Auto-save enabled
        </Badge>
      </div>

      <h2
        className="text-[32px] md:text-[40px] leading-[1.1] font-bold mb-1.5 tracking-tight"
        style={{ color: C.green, fontFamily: "var(--font-koi-heading)" }}
      >
        Before you begin
      </h2>
      <p className="text-[17px] mb-6" style={{ color: C.muted }}>
        Keep these details ready for a smooth onboarding process.
      </p>

      <div className="flex flex-col sm:flex-row gap-6 mb-6">
        <div className="flex-1">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-5" style={{ color: C.muted }}>Required Documents</h3>
          <DocumentChecklist 
            type="required"
            items={[
              { label: "GST certificate" },
              { label: "FSSAI license" },
              { label: "Product packaging images" },
              { label: "Ingredient & Nutrition labels" }
            ]}
          />
        </div>

        {/* Separator */}
        <div className="hidden sm:block w-0 border-l-[2px] border-dotted" style={{ borderColor: C.border }} />

        <div className="flex-1 pt-6 sm:pt-0 border-t-[2px] border-dotted sm:border-0" style={{ borderColor: C.border }}>
          <h3 className="text-xs font-bold uppercase tracking-wider mb-5" style={{ color: C.muted }}>Optional</h3>
          <DocumentChecklist 
            type="optional"
            items={[
              { label: "Lab certifications", hint: "(increases trust score)" },
              { label: "Brand assets / story" }
            ]}
          />
        </div>
      </div>

      <Button
        onClick={handleStart}
        size="lg"
        className="w-full text-white h-[56px] text-[17px] font-semibold rounded-[14px] group relative overflow-hidden transition-all hover:shadow-[0_8px_24px_rgba(14,64,50,0.25)] hover:-translate-y-0.5 mt-2"
        style={{ background: C.green, fontFamily: "var(--font-koi-body)" }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          Start onboarding
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </span>
      </Button>

      <div className="flex items-center justify-center gap-2 mt-6 text-sm text-center" style={{ color: C.muted }}>
        <Info className="w-4 h-4 shrink-0" />
        <p>You can save progress and continue anytime.</p>
      </div>
    </motion.div>
  );

  return (
    <OnboardingShell leftPanel={leftPanel} rightPanel={rightPanel} />
  );
}
