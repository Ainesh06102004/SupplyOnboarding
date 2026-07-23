"use client";

import React, { useState } from "react";
import { 
  User, Edit2, Target, Scale, MapPin, 
  Plus, CreditCard, ChevronRight, HelpCircle, 
  MessageSquare, AlertTriangle, LogOut, Bell, 
  Trash2, Wallet
} from "lucide-react";
import { useRouter } from "next/navigation";
import AddressManager from "@/components/store/AddressManager";
import { signOutUser } from "@/lib/firebase/auth";

// ─── KOI SCORE RING REUSED FOR PROGRESS ───
function ProgressRing({ progress, size = 64 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <div className="relative flex items-center justify-center bg-white rounded-full shadow-sm" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8D8" strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#C8F23E" strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="text-[12px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
        {progress}%
      </span>
    </div>
  );
}

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

  // State
  const [activeGoal, setActiveGoal] = useState("Muscle Gain");
  const [currentWeight, setCurrentWeight] = useState("65");
  const [goalWeight, setGoalWeight] = useState("72");
  
  const [dietary, setDietary] = useState(["Vegetarian", "Gluten Free"]);
  const toggleDietary = (item) => {
    setDietary(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  const [toggles, setToggles] = useState({
    orderUpdates: true,
    priceDrops: false,
    newProducts: true
  });

  const GOALS = ["Fat Loss", "Muscle Gain", "Body Recomposition"];
  const DIETARY_OPTIONS = [
    "Vegetarian", "Non Vegetarian", "Vegan", "Eggetarian", 
    "Jain", "Gluten Free", "Lactose Intolerant", "Keto"
  ];

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
                     <h2 className="text-[18px] md:text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Anshuman Das</h2>
                     <p className="text-[13px] font-medium text-[#5A6B5A] mt-0.5">anshuman@example.com</p>
                     <p className="text-[11px] font-bold text-[#2D7A5E] uppercase tracking-wider mt-1.5 bg-[#F2F6EC] inline-block px-2 py-0.5 rounded">KOI Member since 2026</p>
                  </div>
               </div>
               <button className="w-10 h-10 rounded-xl bg-[#F2F6EC] hover:bg-[#E2E8D8] flex items-center justify-center transition-colors shrink-0 border border-[#E2E8D8]">
                  <Edit2 className="w-4 h-4 text-[#0E4032]" />
               </button>
            </section>

            {/* 2. KOI Health Dashboard */}
            <section className="bg-[#0E4032] text-white rounded-2xl p-6 shadow-[0_8px_30px_rgba(14,64,50,0.15)] relative overflow-hidden">
               <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
               <div className="flex items-center gap-2.5 mb-6 relative z-10">
                  <Target className="w-5 h-5 text-[#C8F23E]" />
                  <h3 className="text-[18px] font-bold text-white tracking-wide" style={{ fontFamily: "var(--font-koi-heading)" }}>KOI Health Dashboard</h3>
               </div>
               
               <div className="flex items-center justify-between relative z-10 bg-white/10 rounded-xl p-4 border border-white/5">
                  <div className="space-y-4">
                     <div>
                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Active Goal</span>
                        <span className="text-[16px] font-bold text-[#C8F23E]">{activeGoal}</span>
                     </div>
                     <div className="flex gap-6">
                        <div>
                           <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Current</span>
                           <span className="text-[16px] font-bold text-white">{currentWeight} kg</span>
                        </div>
                        <div>
                           <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block mb-1">Target</span>
                           <span className="text-[16px] font-bold text-white">{goalWeight} kg</span>
                        </div>
                     </div>
                  </div>
                  
                  {/* Subtle Progress Visualization */}
                  <div className="shrink-0 mr-2">
                     <ProgressRing progress={42} size={72} />
                  </div>
               </div>
            </section>

            {/* 3. Goals & Preferences */}
            <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)] space-y-8">
               {/* Health Goal */}
               <div>
                  <h3 className="text-[15px] font-bold text-[#0E4032] mb-3" style={{ fontFamily: "var(--font-koi-heading)" }}>Health Goal</h3>
                  <div className="flex flex-wrap gap-2">
                     {GOALS.map(goal => (
                        <button
                          key={goal}
                          onClick={() => setActiveGoal(goal)}
                          className={`px-4 py-2 rounded-full text-[13px] font-bold transition-all border ${
                            activeGoal === goal 
                              ? "bg-[#0E4032] text-white border-[#0E4032] shadow-md" 
                              : "bg-[#F2F6EC] text-[#5A6B5A] border-[#E2E8D8] hover:border-[#0E4032]/30"
                          }`}
                        >
                          {goal}
                        </button>
                     ))}
                  </div>
               </div>

               {/* Body Metrics */}
               <div>
                  <h3 className="text-[15px] font-bold text-[#0E4032] mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
                     <Scale className="w-4 h-4 text-[#2D7A5E]" /> Body Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider ml-1">Current Weight (kg)</label>
                        <input 
                          type="number" 
                          value={currentWeight}
                          onChange={(e) => setCurrentWeight(e.target.value)}
                          className="w-full px-4 py-2.5 bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl text-[14px] font-bold text-[#0E4032] focus:outline-none focus:border-[#0E4032]/40 focus:bg-white transition-colors"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider ml-1">Goal Weight (kg)</label>
                        <input 
                          type="number" 
                          value={goalWeight}
                          onChange={(e) => setGoalWeight(e.target.value)}
                          className="w-full px-4 py-2.5 bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl text-[14px] font-bold text-[#0E4032] focus:outline-none focus:border-[#0E4032]/40 focus:bg-white transition-colors"
                        />
                     </div>
                  </div>
               </div>

               {/* Dietary Preferences */}
               <div>
                  <h3 className="text-[15px] font-bold text-[#0E4032] mb-3" style={{ fontFamily: "var(--font-koi-heading)" }}>Dietary Preferences</h3>
                  <div className="flex flex-wrap gap-2">
                     {DIETARY_OPTIONS.map(opt => {
                        const isActive = dietary.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleDietary(opt)}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all border ${
                              isActive 
                                ? "bg-[#C8F23E] text-[#0E4032] border-[#C8F23E] shadow-sm" 
                                : "bg-white text-[#5A6B5A] border-[#E2E8D8] hover:bg-[#F2F6EC]"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                     })}
                  </div>
               </div>
            </section>
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
