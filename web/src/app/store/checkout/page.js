"use client";

import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Smartphone, 
  CreditCard, 
  Globe, 
  Banknote,
  ChevronRight,
  Sparkles,
  Lock,
  Plus
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";

// ─── MOCK DATA ───
const MOCK_ADDRESS = {
  type: "Home",
  line1: "Road No 12, Banjara Hills",
  line2: "Hyderabad, Telangana",
  phone: "+91 98765 43210"
};

const PAYMENT_OPTIONS = [
  { id: "upi", label: "UPI", icon: Smartphone },
  { id: "card", label: "Credit/Debit Card", icon: CreditCard },
  { id: "netbanking", label: "Net Banking", icon: Globe },
  { id: "cod", label: "Cash on Delivery", icon: Banknote },
];

export default function CheckoutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  // Local State
  const [hasAddress, setHasAddress] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState("upi");
  const [isProcessing, setIsProcessing] = useState(false);

  // Cart State
  const items = useCartStore(state => state.items);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // Hydration fix
  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true);
      // If empty cart somehow gets here, redirect back to shop
      if (items.length === 0) {
        router.push("/store/shop");
      }
    }, 0);
    return () => clearTimeout(t);
  }, [items.length, router]);

  if (!mounted || items.length === 0) return null;

  // ─── KOI INTELLIGENCE CALCS ───
  const averageKoiScore = Math.round(
    items.reduce((sum, item) => sum + (item.score || 0), 0) / (items.length || 1)
  );

  let cartQuality = "Good";
  let intelligenceMessage = "Your basket contains high-quality, verified products.";

  if (averageKoiScore >= 90) {
    cartQuality = "Excellent";
    intelligenceMessage = "Your basket is extremely clean, high in protein, and low in added sugar.";
  } else if (averageKoiScore >= 80) {
    cartQuality = "Great";
    intelligenceMessage = "A balanced basket passing the strict KOI quality standards.";
  }

  // ─── HANDLERS ───
  const handlePlaceOrder = () => {
    setIsProcessing(true);
    // Simulate network delay then route to success page (Success page handles cart clearing)
    setTimeout(() => {
      router.push("/store/orders");
    }, 800);
  };

  return (
    <div className="min-h-screen pb-32 md:pb-16 bg-[#F2F6EC]">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#F2F6EC]/85 border-b border-[#E2E8D8]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <button
               onClick={() => router.back()}
               className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60 border border-[#E2E8D8] hover:bg-white transition-colors"
             >
               <ArrowLeft className="w-5 h-5 text-[#0E4032]" />
             </button>
             <h1 className="text-lg md:text-xl font-bold text-[#0E4032] leading-tight" style={{ fontFamily: "var(--font-koi-heading)" }}>Checkout</h1>
          </div>
          
          <div className="hidden md:flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[#5A6B5A]">
             <span className="opacity-50">Cart</span>
             <ChevronRight className="w-3.5 h-3.5 opacity-50" />
             <span className="text-[#0E4032]">Checkout</span>
             <ChevronRight className="w-3.5 h-3.5 opacity-50" />
             <span className="opacity-50">Order</span>
          </div>
        </div>
      </header>

      {/* ── MAIN LAYOUT ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Checkout Flow */}
          <div className="lg:col-span-7 space-y-6">
             
             {/* Delivery Address */}
             <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
                <div className="flex items-center justify-between mb-5">
                   <h2 className="text-lg font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Deliver To</h2>
                   {hasAddress && (
                     <button className="text-[13px] font-bold text-[#2D7A5E] hover:text-[#0E4032] transition-colors">
                        Change
                     </button>
                   )}
                </div>

                {hasAddress ? (
                  <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E2E8D8] bg-[#F2F6EC]/50 relative group cursor-pointer hover:border-[#0E4032]/30 transition-colors">
                     <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0">
                        <MapPin className="w-5 h-5 text-[#0E4032]" />
                     </div>
                     <div>
                        <div className="flex items-center gap-2 mb-1">
                           <span className="text-[14px] font-bold text-[#0E4032]">{MOCK_ADDRESS.type}</span>
                           <span className="text-[10px] uppercase font-bold text-[#2D7A5E] bg-[#C8F23E]/30 px-2 py-0.5 rounded">Default</span>
                        </div>
                        <p className="text-[13px] text-[#5A6B5A] leading-relaxed mb-2">
                           {MOCK_ADDRESS.line1}<br/>
                           {MOCK_ADDRESS.line2}
                        </p>
                        <p className="text-[13px] font-semibold text-[#0E4032]">{MOCK_ADDRESS.phone}</p>
                     </div>
                     <div className="absolute top-4 right-4 w-4 h-4 rounded-full border-[5px] border-[#0E4032] bg-[#F2F6EC]" />
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-[#E2E8D8] rounded-xl bg-[#F2F6EC]/30">
                     <MapPin className="w-8 h-8 text-[#5A6B5A]/40 mx-auto mb-3" />
                     <p className="text-[14px] font-bold text-[#0E4032] mb-4">Add delivery address to continue</p>
                     <button 
                       onClick={() => setHasAddress(true)}
                       className="px-6 py-2.5 rounded-lg bg-[#0E4032] text-white text-[13px] font-bold hover:bg-[#0E4032]/90 transition-colors flex items-center gap-2 mx-auto"
                     >
                       <Plus className="w-4 h-4" /> Add New
                     </button>
                  </div>
                )}
             </section>

             {/* Delivery Details */}
             <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
                <h2 className="text-lg font-bold text-[#0E4032] mb-5" style={{ fontFamily: "var(--font-koi-heading)" }}>Delivery Details</h2>
                
                <div className="flex items-start gap-4">
                   <div className="w-10 h-10 rounded-full bg-[#F2F6EC] flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 text-[#0E4032]" />
                   </div>
                   <div>
                      <h4 className="text-[14px] font-bold text-[#0E4032] mb-1">Delivered fresh within 2–4 hours</h4>
                      <p className="text-[13px] text-[#5A6B5A] leading-relaxed">
                         We prioritize local makers and rapid, eco-friendly delivery routes to ensure your groceries don&apos;t just arrive fast, but arrive fresh.
                      </p>
                   </div>
                </div>
             </section>

             {/* Payment Method */}
             <section className="bg-white rounded-2xl border border-[#E2E8D8] p-5 md:p-6 shadow-[0_2px_10px_rgba(14,64,50,0.02)]">
                <h2 className="text-lg font-bold text-[#0E4032] mb-5" style={{ fontFamily: "var(--font-koi-heading)" }}>Payment Method</h2>
                
                <div className="space-y-3">
                   {PAYMENT_OPTIONS.map((method) => {
                     const Icon = method.icon;
                     const isSelected = selectedPayment === method.id;
                     return (
                       <label 
                         key={method.id}
                         className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                           isSelected 
                           ? "border-[#0E4032] bg-[#F2F6EC]/30" 
                           : "border-[#E2E8D8] bg-white hover:border-[#0E4032]/30"
                         }`}
                         onClick={() => setSelectedPayment(method.id)}
                       >
                         <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                           isSelected ? "border-[#0E4032]" : "border-[#E2E8D8]"
                         }`}>
                           {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#0E4032]" />}
                         </div>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isSelected ? "bg-[#0E4032]/5" : "bg-[#F2F6EC]"}`}>
                            <Icon className={`w-4 h-4 ${isSelected ? "text-[#0E4032]" : "text-[#5A6B5A]"}`} />
                         </div>
                         <span className={`text-[14px] font-bold ${isSelected ? "text-[#0E4032]" : "text-[#5A6B5A]"}`}>
                           {method.label}
                         </span>
                       </label>
                     );
                   })}
                </div>
             </section>

          </div>

          {/* RIGHT COLUMN: Order Summary & Review */}
          <div className="lg:col-span-5">
             <div className="sticky top-[100px] space-y-6">
                
                {/* KOI Order Summary (Intelligence) */}
                <div className="bg-[#0E4032] text-white rounded-2xl p-6 shadow-[0_8px_30px_rgba(14,64,50,0.15)] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                  
                  <div className="flex items-center gap-2.5 mb-6 relative z-10">
                     <Sparkles className="w-5 h-5 text-[#C8F23E]" />
                     <h3 className="text-[18px] font-bold text-white tracking-wide" style={{ fontFamily: "var(--font-koi-heading)" }}>KOI Order Summary</h3>
                  </div>
                  
                  <div className="flex items-center justify-between mb-5 relative z-10 border-b border-white/10 pb-5">
                     <div className="flex flex-col gap-1 text-center">
                        <span className="text-[28px] font-bold text-white leading-none" style={{ fontFamily: "var(--font-koi-heading)" }}>{totalItems}</span>
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Products</span>
                     </div>
                     <div className="w-px h-10 bg-white/10" />
                     <div className="flex flex-col gap-1 text-center">
                        <span className="text-[28px] font-bold text-[#C8F23E] leading-none" style={{ fontFamily: "var(--font-koi-heading)" }}>{averageKoiScore}</span>
                        <span className="text-[10px] font-bold text-[#C8F23E]/80 uppercase tracking-wider">Avg Score</span>
                     </div>
                     <div className="w-px h-10 bg-white/10" />
                     <div className="flex flex-col gap-1 text-center">
                        <span className="text-[18px] font-bold text-white leading-tight mt-1">{cartQuality}</span>
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Quality</span>
                     </div>
                  </div>
                  
                  <div className="bg-white/10 rounded-xl p-4 border border-white/5 relative z-10 flex items-start gap-3">
                     <ShieldCheck className="w-5 h-5 text-[#C8F23E] shrink-0 mt-0.5" />
                     <p className="text-[13px] text-white/90 leading-relaxed font-medium">
                        {intelligenceMessage}
                     </p>
                  </div>
                </div>

                {/* Final Order Review */}
                <div className="bg-white rounded-2xl border border-[#E2E8D8] p-6 shadow-[0_4px_20px_rgba(14,64,50,0.04)]">
                   <h3 className="text-[18px] font-bold text-[#0E4032] mb-5" style={{ fontFamily: "var(--font-koi-heading)" }}>Final Review</h3>
                   
                   <div className="space-y-4 mb-6">
                      <div className="flex justify-between items-center text-[14px]">
                         <span className="text-[#5A6B5A] font-semibold">Subtotal</span>
                         <span className="text-[#0E4032] font-bold">₹{subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-[14px]">
                         <span className="text-[#5A6B5A] font-semibold">Delivery Fee</span>
                         <span className="text-[#2D7A5E] font-bold uppercase text-[12px] tracking-wide bg-[#F2F6EC] px-2 py-0.5 rounded">Free</span>
                      </div>
                   </div>

                   <div className="border-t border-[#E2E8D8] pt-5 pb-2">
                      <div className="flex justify-between items-center">
                         <span className="text-[16px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Total</span>
                         <span className="text-[26px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>₹{subtotal.toLocaleString()}</span>
                      </div>
                   </div>

                   {/* Desktop CTA */}
                   <div className="hidden lg:block mt-8">
                     <button 
                       onClick={handlePlaceOrder}
                       disabled={!hasAddress || isProcessing}
                       className="w-full py-4 rounded-xl bg-[#0E4032] disabled:bg-[#5A6B5A]/40 text-white font-bold text-[15px] shadow-[0_4px_12px_rgba(14,64,50,0.2)] hover:bg-[#0E4032]/90 hover:shadow-[0_8px_20px_rgba(14,64,50,0.25)] disabled:hover:shadow-none transition-all flex items-center justify-center gap-2"
                     >
                       {isProcessing ? "Processing..." : "Place Order"}
                     </button>
                     <div className="flex items-center justify-center gap-1.5 mt-4">
                       <Lock className="w-3 h-3 text-[#5A6B5A]" />
                       <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wide">Secure payment powered by trusted partners</span>
                     </div>
                   </div>
                </div>

             </div>
          </div>
          
        </div>
      </main>

      {/* ─── MOBILE STICKY BOTTOM CHECKOUT ─── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8D8] shadow-[0_-8px_30px_rgba(14,64,50,0.06)] p-4 pb-safe animate-in slide-in-from-bottom duration-300 z-40">
        <div className="flex items-center justify-between gap-4 mb-3">
           <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider">Total</span>
              <span className="text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>₹{subtotal.toLocaleString()}</span>
           </div>
           
           <button 
             onClick={handlePlaceOrder}
             disabled={!hasAddress || isProcessing}
             className="flex-1 py-3.5 rounded-xl bg-[#0E4032] disabled:bg-[#5A6B5A]/40 text-white font-bold text-[14px] hover:bg-[#0E4032]/90 shadow-md active:scale-[0.98] transition-all flex items-center justify-center"
           >
             {isProcessing ? "Processing..." : "Place Order"}
           </button>
        </div>
        <div className="flex items-center justify-center gap-1.5">
           <Lock className="w-3 h-3 text-[#5A6B5A]/60" />
           <span className="text-[9px] font-bold text-[#5A6B5A]/80 uppercase tracking-widest">Secure payment guaranteed</span>
        </div>
      </div>

    </div>
  );
}
