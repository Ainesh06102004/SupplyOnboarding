"use client";

import { useEffect } from "react";
import { useOnboardingStore } from "@/store/onboardingStore";
import Step0Welcome from "@/components/onboarding/steps/Step0Welcome";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const loadDraft = useOnboardingStore((state) => state.loadDraft);

  // Silently prefill any saved draft so a returning applicant keeps their data.
  // We intentionally do NOT auto-redirect — the welcome screen is the entry
  // point, and "Start onboarding" advances to the first step.
  useEffect(() => {
    let alive = true;
    (async () => {
      const draftId = typeof window !== "undefined" ? localStorage.getItem("koi_onboarding_draft_id") : null;
      if (!draftId) return;
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from("onboarding_submissions")
          .select("*")
          .eq("id", draftId)
          .single();
        if (alive && !error && data) loadDraft(data);
      } catch (err) {
        console.error("Failed to load draft:", err);
      }
    })();
    return () => { alive = false; };
  }, [loadDraft]);

  return <Step0Welcome />;
}
