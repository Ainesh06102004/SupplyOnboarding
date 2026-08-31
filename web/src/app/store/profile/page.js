"use client";

import React, { useEffect, useState } from "react";
import { 
  User, Edit2, Target, Scale, MapPin, 
  Plus, CreditCard, ChevronRight, HelpCircle, 
  MessageSquare, AlertTriangle, LogOut, Bell, 
  Trash2, Wallet
} from "lucide-react";
import { useRouter } from "next/navigation";
import AddressManager from "@/components/store/AddressManager";
import { signOutUser } from "@/lib/firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalStore, GOAL_DEFS } from "@/store/goalStore";
import { profileService } from "@/lib/supabase/profileService";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";

export default function ProfilePage() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOutUser();
      router.push("/store/shop");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  // ── Real identity and goal profile ──
  // This page used to display a hardcoded "Anshuman Das", a 65→72 kg goal and
  // a 42% progress ring for every visitor, none of it connected to the signed-in
  // user or to goalStore, which already holds exactly this data.
  const { user } = useAuth();
  const profile = useGoalStore((s) => s.profile);
  const hydrateGoal = useGoalStore((s) => s.hydrate);
  const [account, setAccount] = useState(null);

  useEffect(() => { hydrateGoal(); }, [hydrateGoal]);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    profileService
      .getProfileByFirebaseUid(user.uid)
      .then((p) => { if (alive) setAccount(p); })
      .catch((err) => console.error("Could not load profile:", err));
    return () => { alive = false; };
  }, [user?.uid]);

  const displayName = account?.display_name || user?.displayName || null;
  const contact = account?.email || user?.email || account?.phone || user?.phoneNumber || null;
  const memberSince = account?.created_at
    ? new Date(account.created_at).getFullYear()
    : null;

  const activeGoal = profile?.goal ? (GOAL_DEFS[profile.goal]?.label ?? profile.goal) : null;
  const currentWeight = profile?.weightNow ?? null;
  const goalWeight = profile?.weightTarget ?? null;
  // How far there is still to go. A percentage would need a starting weight,
  // which is not recorded — so the remaining delta is the honest number.
  const weightDelta =
    currentWeight !== null && goalWeight !== null
      ? Math.abs(Number(goalWeight) - Number(currentWeight))
      : null;

  const dietType = profile?.dietType || null;
  const avoided = profile?.foodsAvoid || [];

  const [toggles, setToggles] = useState({
    orderUpdates: true,
    priceDrops: false,
    newProducts: true
  });


  return (
    <div className="min-h-screen pb-32 md:pb-16 bg-[#F2F6EC]">
      
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F2F6EC]/85 border-b border-[#E2E8D8]/60 pt-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-4 pb-4">
          <h1 className="text-xl font-bold text-[#0E4032] leading-tight" style={{ fontFamily: "var(--font-koi-heading)" }}>Profile</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          
          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* 1. Profile Header */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)] flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#F2F6EC] flex items-center justify-center border border-[#E2E8D8] shrink-0">
                     <User className="w-7 h-7 text-[#0E4032]" />
                  </div>
                  <div>
                     <h2 className="text-[18px] md:text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
                        {displayName || "Your account"}
                     </h2>
                     {contact && <p className="text-[13px] font-medium text-[#5A6B5A] mt-0.5">{contact}</p>}
                     {memberSince && (
                       <p className="text-[11px] font-bold text-[#2D7A5E] uppercase tracking-wider mt-1.5 bg-[#F2F6EC] inline-block px-2 py-0.5 rounded">
                          KOI Member since {memberSince}
                       </p>
                     )}
                  </div>
               </div>
               <button className="w-10 h-10 rounded-xl bg-[#F2F6EC] hover:bg-[#E2E8D8] flex items-center justify-center transition-colors shrink-0 border border-[#E2E8D8]">
                  <Edit2 className="w-4 h-4 text-[#0E4032]" />
               </button>
            </section>

            {/* 2. KOI Health Dashboard
                Read-only. The goal wizard on the shop is the single editor for
                this data - it collects the same fields, validates them against
                the engine's catalogs and derives the macro targets. A second
                editor here previously offered its OWN goal list ("Fat Loss /
                Muscle Gain / Body Recomposition") that matched neither
                GOAL_DEFS nor the database CHECK constraint. */}
            <section className="bg-[#0E4032] text-white rounded-2xl p-6 shadow-[0_8px_30px_rgba(14,64,50,0.15)] relative overflow-hidden">
               <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
               <div className="flex items-center gap-2.5 mb-6 relative z-10">
                  <Target className="w-5 h-5 text-[#C8F23E]" />
                  <h3 className="text-[18px] font-bold text-white tracking-wide" style={{ fontFamily: "var(--font-koi-heading)" }}>KOI Health Dashboard</h3>
               </div>

               {activeGoal ? (
                 <div className="flex items-center justify-between relative z-10 bg-white/10 rounded-xl p-4 border border-white/5">
                    <div className="space-y-4">
                       <div>
                          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Active Goal</span>
                          <span className="text-[16px] font-bold text-[#C8F23E]">{activeGoal}</span>
                       </div>
                       {(currentWeight !== null || goalWeight !== null) && (
                         <div className="flex gap-6">
                            {currentWeight !== null && (
                              <div>
                                 <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Current</span>
                                 <span className="text-[16px] font-bold text-white">{currentWeight} kg</span>
                              </div>
                            )}
                            {goalWeight !== null && (
                              <div>
                                 <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Target</span>
                                 <span className="text-[16px] font-bold text-white">{goalWeight} kg</span>
                              </div>
                            )}
                         </div>
                       )}
                       {profile?.targets?.kcal && (
                         <div className="flex gap-6">
                            <div>
                               <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Daily target</span>
                               <span className="text-[16px] font-bold text-white">{profile.targets.kcal} kcal</span>
                            </div>
                            {profile.targets.protein ? (
                              <div>
                                 <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Protein</span>
                                 <span className="text-[16px] font-bold text-white">{profile.targets.protein} g</span>
                              </div>
                            ) : null}
                         </div>
                       )}
                    </div>

                    {/* No percentage: progress toward a goal weight needs a
                        starting weight, which is not recorded. The remaining
                        delta is the number KOI can actually stand behind. */}
                    {weightDelta !== null && weightDelta > 0 && (
                      <div className="shrink-0 mr-2 text-right">
                         <span className="text-[28px] font-bold text-[#C8F23E] leading-none" style={{ fontFamily: "var(--font-koi-heading)" }}>{weightDelta}</span>
                         <span className="block text-[10px] font-bold text-white/60 uppercase tracking-wider mt-1">kg to go</span>
                      </div>
                    )}
                 </div>
               ) : (
                 <div className="relative z-10 bg-white/10 rounded-xl p-5 border border-white/5">
                    <p className="text-[14px] text-white/80 leading-relaxed">
                       You haven&apos;t set a goal yet. Tell KOI what you&apos;re optimising for and every shelf re-ranks around it.
                    </p>
                    <button
                      onClick={() => router.push("/store/shop")}
                      className="mt-4 px-4 py-2.5 rounded-full bg-[#C8F23E] text-[#0E4032] text-[13px] font-bold transition-transform hover:-translate-y-0.5"
                    >
                       Set your goal
                    </button>
                 </div>
               )}
            </section>

            {/* 3. Goals & Preferences - a summary of what the wizard captured */}
            {profile && (
              <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)] space-y-6">
                 <div className="flex items-center justify-between gap-4">
                    <h3 className="text-[15px] font-bold text-[#0E4032] flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
                       <Scale className="w-4 h-4 text-[#2D7A5E]" /> Your preferences
                    </h3>
                    <button
                      onClick={() => router.push("/store/shop")}
                      className="text-[12px] font-bold text-[#2D7A5E] hover:text-[#0E4032] transition-colors shrink-0"
                    >
                       Edit
                    </button>
                 </div>

                 {dietType && (
                   <div>
                      <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider block mb-2">Diet</span>
                      <span className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#C8F23E] text-[#0E4032] inline-block">
                         {DIET_TYPES.find((d) => d.key === dietType)?.label || dietType}
                      </span>
                   </div>
                 )}

                 {avoided.length > 0 && (
                   <div>
                      <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider block mb-2">Avoiding</span>
                      <div className="flex flex-wrap gap-2">
                         {avoided.map((key) => (
                           <span key={key} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#F2F6EC] text-[#5A6B5A] border border-[#E2E8D8]">
                              {FOODS_AVOID.find((a) => a.key === key)?.label || key}
                           </span>
                         ))}
                      </div>
                   </div>
                 )}
              </section>
            )}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 4. Addresses */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
               <AddressManager />
            </section>

            {/* 5. Payment Methods */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
               <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[16px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Payment Methods</h3>
                  <button className="text-[12px] font-bold text-[#2D7A5E] flex items-center gap-1 hover:text-[#0E4032] transition-colors">
                     <Plus className="w-3.5 h-3.5" /> Add
                  </button>
               </div>
               <div className="space-y-3">
                  <div className="flex items-center justify-between border border-[#0E4032]/20 rounded-xl p-3.5 bg-[#F2F6EC]/50">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-white border border-[#E2E8D8] flex items-center justify-center shrink-0">
                           <CreditCard className="w-4 h-4 text-[#0E4032]" />
                        </div>
                        <div>
                           <p className="text-[13px] font-bold text-[#0E4032]">•••• 4242</p>
                           <p className="text-[11px] text-[#5A6B5A] font-medium">Expires 12/28</p>
                        </div>
                     </div>
                     <span className="text-[9px] font-bold bg-[#0E4032] text-white px-1.5 py-0.5 rounded uppercase tracking-wider">Default</span>
                  </div>
                  <div className="flex items-center justify-between border border-[#E2E8D8] rounded-xl p-3.5 bg-white">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-white border border-[#E2E8D8] flex items-center justify-center shrink-0">
                           <Wallet className="w-4 h-4 text-[#5A6B5A]" />
                        </div>
                        <div>
                           <p className="text-[13px] font-bold text-[#0E4032]">UPI</p>
                           <p className="text-[11px] text-[#5A6B5A] font-medium">anshuman@upi</p>
                        </div>
                     </div>
                     <button className="text-[12px] text-[#5A6B5A] hover:text-[#C94B40] transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
               </div>
            </section>

            {/* 6. Settings */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
               <h3 className="text-[16px] font-bold text-[#0E4032] mb-4" style={{ fontFamily: "var(--font-koi-heading)" }}>Notifications</h3>
               <div className="space-y-4">
                  {[
                    { key: "orderUpdates", label: "Order Updates", desc: "Delivery status and tracking" },
                    { key: "priceDrops", label: "Price Drops", desc: "Alerts for saved products" },
                    { key: "newProducts", label: "New KOI Products", desc: "Products passing KOI standards" }
                  ].map(toggle => (
                    <div key={toggle.key} className="flex items-center justify-between">
                       <div>
                          <p className="text-[13px] font-bold text-[#0E4032]">{toggle.label}</p>
                          <p className="text-[11px] text-[#5A6B5A] font-medium">{toggle.desc}</p>
                       </div>
                       <button 
                         onClick={() => setToggles(p => ({ ...p, [toggle.key]: !p[toggle.key] }))}
                         className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${toggles[toggle.key] ? "bg-[#C8F23E]" : "bg-[#E2E8D8]"}`}
                       >
                          <span className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${toggles[toggle.key] ? "translate-x-5" : "translate-x-0"}`} />
                       </button>
                    </div>
                  ))}
               </div>
            </section>

            {/* 7. Support */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] shadow-[0_2px_10px_rgba(14,64,50,0.02)] overflow-hidden">
               <div className="p-5 md:p-6 border-b border-[#E2E8D8]">
                  <h3 className="text-[16px] font-bold text-[#0E4032] mb-3" style={{ fontFamily: "var(--font-koi-heading)" }}>Support</h3>
                  <div className="space-y-1">
                     <button className="w-full flex items-center justify-between py-2 text-[#5A6B5A] hover:text-[#0E4032] group transition-colors">
                        <div className="flex items-center gap-3"><HelpCircle className="w-4 h-4 group-hover:text-[#2D7A5E]" /><span className="text-[14px] font-medium">Help Center & FAQs</span></div>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                     <button className="w-full flex items-center justify-between py-2 text-[#5A6B5A] hover:text-[#0E4032] group transition-colors">
                        <div className="flex items-center gap-3"><MessageSquare className="w-4 h-4 group-hover:text-[#2D7A5E]" /><span className="text-[14px] font-medium">Contact Support</span></div>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                     <button className="w-full flex items-center justify-between py-2 text-[#5A6B5A] hover:text-[#0E4032] group transition-colors">
                        <div className="flex items-center gap-3"><AlertTriangle className="w-4 h-4 group-hover:text-[#C94B40]" /><span className="text-[14px] font-medium">Report an Issue</span></div>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                  </div>
               </div>
               <div className="p-2 bg-[#F2F6EC]/30">
                  <button 
                    onClick={handleLogout}
                    className="w-full py-3 flex items-center justify-center gap-2 text-[#C94B40] hover:bg-[#C94B40]/10 rounded-xl transition-colors font-bold text-[13px]"
                  >
                     <LogOut className="w-4 h-4" /> Log Out
                  </button>
               </div>
            </section>

          </div>
        </div>
      </main>

    </div>
  );
}
