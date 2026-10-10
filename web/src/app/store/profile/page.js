"use client";

import React, { useEffect, useState } from "react";
import {
  User, Edit2, Target, Scale, CreditCard, ChevronRight, HelpCircle,
  MessageSquare, AlertTriangle, LogOut,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AddressManager from "@/components/store/AddressManager";
import ConnectSwiggy from "@/components/store/marketplace/ConnectSwiggy";
import { signOutUser } from "@/lib/auth/supabaseAuth";
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
      .getProfile(user.uid)
      .then((p) => { if (alive) setAccount(p); })
      .catch((err) => console.error("Could not load profile:", err));
    return () => { alive = false; };
  }, [user?.uid]);

  const displayName = account?.display_name || user?.displayName || null;
  const contact = account?.email || user?.email || account?.phone || user?.phone || null;
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
    <div>
      <main className="ks-page ks-page-wide">
        <h1 className="ks-h1" style={{ marginBottom: 20 }}>You</h1>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-7 space-y-6">
            {/* Everything that is the shopper's, in one place. On a phone the
                tab bar's "You" lands here, so Orders has to be reachable from it. */}
            <nav aria-label="Your KOI" className="ks-card grid grid-cols-2 sm:grid-cols-4" style={{ overflow: "hidden" }}>
              {[
                { href: "/store/orders", label: "Orders", hint: "Baskets you sent" },
                { href: "/store/plan", label: "Plan", hint: "This week" },
                { href: "/store/household", label: "Household", hint: "Everyone you shop for" },
                { href: "/store/profile/data", label: "What KOI keeps", hint: "See or delete it" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="flex flex-col gap-0.5 border-[rgba(20,22,15,.06)] p-4 transition-colors hover:bg-[#faf9f6] [&:not(:last-child)]:border-r">
                  <span className="text-[14px] font-bold text-[#1c1e17]">{l.label} →</span>
                  <span className="text-[12px] text-[#6b6f63]">{l.hint}</span>
                </Link>
              ))}
            </nav>
            
            {/* 1. Profile Header */}
            <section className="bg-white rounded-2xl border border-[#e7e5de] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)] flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#f6f5f1] flex items-center justify-center border border-[#e7e5de] shrink-0">
                     <User className="w-7 h-7 text-[#1c1e17]" />
                  </div>
                  <div>
                     <h2 className="text-[18px] md:text-xl font-bold text-[#1c1e17]">
                        {displayName || "Your account"}
                     </h2>
                     {contact && <p className="text-[13px] font-medium text-[#6b6f63] mt-0.5">{contact}</p>}
                     {memberSince && (
                       <p className="text-[11px] font-bold text-[#2f8050] uppercase tracking-wider mt-1.5 bg-[#f6f5f1] inline-block px-2 py-0.5 rounded">
                          KOI Member since {memberSince}
                       </p>
                     )}
                  </div>
               </div>
               <button className="w-10 h-10 rounded-xl bg-[#f6f5f1] hover:bg-[#e7e5de] flex items-center justify-center transition-colors shrink-0 border border-[#e7e5de]">
                  <Edit2 className="w-4 h-4 text-[#1c1e17]" />
               </button>
            </section>

            {/* 2. KOI Health Dashboard
                Read-only. The goal wizard on the shop is the single editor for
                this data - it collects the same fields, validates them against
                the engine's catalogs and derives the macro targets. A second
                editor here previously offered its OWN goal list ("Fat Loss /
                Muscle Gain / Body Recomposition") that matched neither
                GOAL_DEFS nor the database CHECK constraint. */}
            <section className="bg-[#0f3d2e] text-white rounded-[22px] p-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
               <div className="flex items-center gap-2.5 mb-6 relative z-10">
                  <Target className="w-5 h-5 text-[#9fe7c4]" />
                  <h3 className="text-[18px] font-bold text-white tracking-wide">KOI Health Dashboard</h3>
               </div>

               {activeGoal ? (
                 <div className="flex items-center justify-between relative z-10 bg-white/10 rounded-xl p-4 border border-white/5">
                    <div className="space-y-4">
                       <div>
                          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Active Goal</span>
                          <span className="text-[16px] font-bold text-[#9fe7c4]">{activeGoal}</span>
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
                         <span className="text-[28px] font-bold text-[#9fe7c4] leading-none">{weightDelta}</span>
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
                      className="mt-4 px-4 py-2.5 rounded-full bg-[#9fe7c4] text-[#1c1e17] text-[13px] font-bold transition-transform hover:-translate-y-0.5"
                    >
                       Set your goal
                    </button>
                 </div>
               )}
            </section>

            {/* 3. Goals & Preferences - a summary of what the wizard captured */}
            {profile && (
              <section className="bg-white rounded-2xl border border-[#e7e5de] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)] space-y-6">
                 <div className="flex items-center justify-between gap-4">
                    <h3 className="text-[15px] font-bold text-[#1c1e17] flex items-center gap-2">
                       <Scale className="w-4 h-4 text-[#2f8050]" /> Your preferences
                    </h3>
                    <button
                      onClick={() => router.push("/store/shop")}
                      className="text-[12px] font-bold text-[#2f8050] hover:text-[#1c1e17] transition-colors shrink-0"
                    >
                       Edit
                    </button>
                 </div>

                 {dietType && (
                   <div>
                      <span className="text-[11px] font-bold text-[#6b6f63] uppercase tracking-wider block mb-2">Diet</span>
                      <span className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#9fe7c4] text-[#1c1e17] inline-block">
                         {DIET_TYPES.find((d) => d.key === dietType)?.label || dietType}
                      </span>
                   </div>
                 )}

                 {avoided.length > 0 && (
                   <div>
                      <span className="text-[11px] font-bold text-[#6b6f63] uppercase tracking-wider block mb-2">Avoiding</span>
                      <div className="flex flex-wrap gap-2">
                         {avoided.map((key) => (
                           <span key={key} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#f6f5f1] text-[#6b6f63] border border-[#e7e5de]">
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
            <section className="bg-white rounded-2xl border border-[#e7e5de] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
               <AddressManager />
            </section>

            {/* 5. Connected accounts — the Swiggy link that makes availability
                 answerable and the hand-off possible at all. */}
            <ConnectSwiggy next="/store/profile" />

            {/* 6. Payment. This card used to list "•••• 4242 / Expires 12/28"
                and "anshuman@upi" for every visitor — invented payment methods
                for a store that takes no payment. KOI hands the basket to
                Swiggy; the shopper pays there. */}
            <section className="bg-white rounded-2xl border border-[#e7e5de] p-5 md:p-6">
               <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#f6f5f1] border border-[#e7e5de] flex items-center justify-center shrink-0">
                     <CreditCard className="w-4 h-4 text-[#6b6f63]" />
                  </div>
                  <div>
                     <h3 className="text-[16px] font-bold text-[#1c1e17]">Payment</h3>
                     <p className="text-[13px] text-[#6b6f63] leading-relaxed mt-0.5">You pay on Swiggy at hand-off. KOI never stores a card or UPI ID.</p>
                  </div>
               </div>
            </section>

            {/* 6. Settings */}
            <section className="bg-white rounded-2xl border border-[#e7e5de] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
               <h3 className="text-[16px] font-bold text-[#1c1e17] mb-4">Notifications</h3>
               <div className="space-y-4">
                  {[
                    { key: "orderUpdates", label: "Order Updates", desc: "Delivery status and tracking" },
                    { key: "priceDrops", label: "Price Drops", desc: "Alerts for saved products" },
                    { key: "newProducts", label: "New KOI Products", desc: "Products passing KOI standards" }
                  ].map(toggle => (
                    <div key={toggle.key} className="flex items-center justify-between">
                       <div>
                          <p className="text-[13px] font-bold text-[#1c1e17]">{toggle.label}</p>
                          <p className="text-[11px] text-[#6b6f63] font-medium">{toggle.desc}</p>
                       </div>
                       <button 
                         onClick={() => setToggles(p => ({ ...p, [toggle.key]: !p[toggle.key] }))}
                         className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${toggles[toggle.key] ? "bg-[#9fe7c4]" : "bg-[#e7e5de]"}`}
                       >
                          <span className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${toggles[toggle.key] ? "translate-x-5" : "translate-x-0"}`} />
                       </button>
                    </div>
                  ))}
               </div>
            </section>

            {/* 7. Support */}
            <section className="bg-white rounded-2xl border border-[#e7e5de] shadow-[0_2px_10px_rgba(14,64,50,0.02)] overflow-hidden">
               <div className="p-5 md:p-6 border-b border-[#e7e5de]">
                  <h3 className="text-[16px] font-bold text-[#1c1e17] mb-3">Support</h3>
                  <div className="space-y-1">
                     <button className="w-full flex items-center justify-between py-2 text-[#6b6f63] hover:text-[#1c1e17] group transition-colors">
                        <div className="flex items-center gap-3"><HelpCircle className="w-4 h-4 group-hover:text-[#2f8050]" /><span className="text-[14px] font-medium">Help Center & FAQs</span></div>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                     <button className="w-full flex items-center justify-between py-2 text-[#6b6f63] hover:text-[#1c1e17] group transition-colors">
                        <div className="flex items-center gap-3"><MessageSquare className="w-4 h-4 group-hover:text-[#2f8050]" /><span className="text-[14px] font-medium">Contact Support</span></div>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                     <button className="w-full flex items-center justify-between py-2 text-[#6b6f63] hover:text-[#1c1e17] group transition-colors">
                        <div className="flex items-center gap-3"><AlertTriangle className="w-4 h-4 group-hover:text-[#b84535]" /><span className="text-[14px] font-medium">Report an Issue</span></div>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                     </button>
                  </div>
               </div>
               <div className="p-2 bg-[#f6f5f1]/30">
                  <button 
                    onClick={handleLogout}
                    className="w-full py-3 flex items-center justify-center gap-2 text-[#b84535] hover:bg-[#b84535]/10 rounded-xl transition-colors font-bold text-[13px]"
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
