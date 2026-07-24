"use client";

import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  Leaf, 
  Sparkles, 
  Info,
  ShieldCheck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";

// ─── KOI SCORE RING ───
function KoiScore({ score, size = 32 }) {
  if (score === undefined || score === null) return null;
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? "#0E4032" : score >= 80 ? "#2D7A5E" : "#B8860B";
  return (
    <div
      className="relative flex items-center justify-center bg-white rounded-full shadow-sm"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8D8" strokeWidth="2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span
        className="text-[9px] font-bold"
        style={{ color, fontFamily: "var(--font-koi-heading)" }}
      >
        {score}
      </span>
    </div>
  );
}

// ─── CART ITEM CARD ───
function CartItemCard({ item }) {
  const increaseQty = useCartStore(state => state.increaseQty);
  const decreaseQty = useCartStore(state => state.decreaseQty);
  const removeFromCart = useCartStore(state => state.removeFromCart);
  
  return (
    <div className="flex gap-3 md:gap-5 p-3 md:p-5 bg-white rounded-2xl border border-[#E2E8D8] shadow-[0_2px_10px_rgba(14,64,50,0.02)] relative group animate-in slide-in-from-bottom-2 duration-300">
       {/* thumbnail */}
       <div className="w-20 h-20 md:w-28 md:h-28 bg-gradient-to-br from-[#F2F6EC] to-[#E8EFE0] rounded-xl flex items-center justify-center shrink-0 border border-[#E2E8D8] relative">
          <Leaf className="w-8 h-8 md:w-10 md:h-10 text-[#0E4032]/30" />
          {item.score && (
             <div className="absolute top-1 left-1 md:top-2 md:left-2 scale-90 md:scale-100">
                <KoiScore score={item.score} size={28} />
             </div>
          )}
       </div>

       <div className="flex-1 flex flex-col justify-between py-1">
          <div className="pr-8 md:pr-10">
             <p className="text-[9px] md:text-[10px] tracking-[0.08em] uppercase font-bold text-[#5A6B5A] mb-1">{item.brand}</p>
             <h4 className="text-[14px] md:text-[16px] font-bold text-[#0E4032] leading-snug line-clamp-2" style={{ fontFamily: "var(--font-koi-heading)" }}>{item.name}</h4>
             <span className="text-[11px] md:text-[12px] text-[#5A6B5A] font-medium block mt-1">{item.weight}</span>
          </div>
          
          <div className="flex items-end justify-between mt-3">
             <span className="text-lg md:text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>₹{item.price}</span>
             
             {/* Quantity Stepper */}
             <div className="flex items-center gap-3 bg-[#F2F6EC] text-[#0E4032] rounded-full px-1.5 py-1 border border-[#E2E8D8]">
                <button 
                  onClick={() => decreaseQty(item.id)}
                  className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white hover:bg-white flex items-center justify-center transition-colors shrink-0 shadow-sm border border-[#E2E8D8]/50"
                >
                  <Minus className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </button>
                <span className="text-[13px] md:text-[14px] font-bold w-4 text-center">{item.quantity}</span>
                <button 
                  onClick={() => increaseQty(item.id)}
                  className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white hover:bg-white flex items-center justify-center transition-colors shrink-0 shadow-sm border border-[#E2E8D8]/50"
                >
                  <Plus className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </button>
             </div>
          </div>
       </div>

       {/* Remove Button */}
       <button 
         onClick={() => removeFromCart(item.id)}
         className="absolute top-2 right-2 md:top-4 md:right-4 p-2 text-[#5A6B5A]/40 hover:text-[#C94B40] hover:bg-[#C94B40]/10 rounded-lg transition-colors"
       >
         <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
       </button>
    </div>
  )
}

// ─── KOI CART INSIGHTS ───
function CartInsights() {
  return (
    <div className="bg-[#0E4032] text-white rounded-2xl p-5 shadow-[0_8px_30px_rgba(14,64,50,0.15)] relative overflow-hidden my-6">
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
      
      <div className="flex items-center gap-2.5 mb-5 relative z-10">
         <Sparkles className="w-5 h-5 text-[#C8F23E]" />
         <h3 className="text-[17px] font-bold text-white tracking-wide" style={{ fontFamily: "var(--font-koi-heading)" }}>KOI Cart Insights</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3 relative z-10">
         <div className="flex flex-col bg-white/10 rounded-xl p-3 border border-white/5">
            <span className="text-[12px] font-medium text-white/70 uppercase tracking-wider mb-1">Total Protein</span>
            <span className="text-[16px] font-bold text-[#C8F23E]">58g</span>
         </div>
         <div className="flex flex-col bg-white/10 rounded-xl p-3 border border-white/5">
            <span className="text-[12px] font-medium text-white/70 uppercase tracking-wider mb-1">Sugar Profile</span>
            <span className="text-[16px] font-bold text-[#C8F23E]">Excellent</span>
         </div>
      </div>
      
      <div className="mt-4 p-3 rounded-xl bg-[#B8860B]/20 border border-[#B8860B]/30 flex gap-2.5 items-start relative z-10">
         <Info className="w-4 h-4 text-[#C8F23E] shrink-0 mt-0.5" />
         <p className="text-[12px] text-white/90 leading-relaxed font-medium">
            <span className="text-[#C8F23E] font-bold">Watchout:</span> 2 items contain artificial sweeteners.
         </p>
      </div>
    </div>
  )
}

// ─── RECOMMENDED ADD-ONS ───
const RECOMMENDED_ADDONS = [
  {
    id: 101,
    brand: "THE WHOLE TRUTH",
    name: "Dark Chocolate Peanut Butter",
    price: 349,
    weight: "350g",
    score: 89,
  },
  {
    id: 102,
    brand: "YOGABAR",
    name: "Oats & Seeds Crunch",
    price: 199,
    weight: "400g",
    score: 91,
  },
  {
    id: 103,
    brand: "BORÉCHA",
    name: "Kombucha - Mixed Berry",
    price: 180,
    weight: "330ml",
    score: 88,
  }
];

function RecommendedAddons() {
  const addToCart = useCartStore(state => state.addToCart);

  return (
    <div className="mb-8">
       <div className="mb-4">
          <h3 className="text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Complete Your Basket</h3>
          <p className="text-[13px] font-medium text-[#5A6B5A]">Pairs well with your selected products</p>
       </div>
       
       <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-4 -mx-4 px-4 md:mx-0 md:px-0">
          {RECOMMENDED_ADDONS.map(product => (
             <div key={product.id} className="w-[160px] md:w-[180px] shrink-0 bg-white border border-[#E2E8D8] rounded-2xl overflow-hidden flex flex-col p-3 shadow-sm hover:shadow-md transition-shadow group">
                <div className="w-full aspect-square bg-gradient-to-br from-[#F2F6EC] to-[#E8EFE0] rounded-xl flex items-center justify-center mb-3 relative overflow-hidden">
                   <Leaf className="w-8 h-8 text-[#0E4032]/20" />
                   <div className="absolute top-2 left-2 scale-90">
                     <KoiScore score={product.score} size={28} />
                   </div>
                </div>
                <p className="text-[9px] uppercase tracking-wider font-bold text-[#5A6B5A] mb-1">{product.brand}</p>
                <h4 className="text-[12px] font-bold text-[#0E4032] leading-tight mb-3 line-clamp-2" style={{ fontFamily: "var(--font-koi-heading)" }}>{product.name}</h4>
                
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-[#E2E8D8]">
                   <span className="text-[14px] font-bold text-[#0E4032]">₹{product.price}</span>
                   <button 
                     onClick={() => addToCart({ ...product, quantity: 1, tags: [], dietary: [] })}
                     className="w-7 h-7 rounded-full bg-[#F2F6EC] hover:bg-[#0E4032] hover:text-white text-[#0E4032] flex items-center justify-center transition-colors border border-[#E2E8D8] group-hover:border-[#0E4032]"
                   >
                     <Plus className="w-3.5 h-3.5" />
                   </button>
                </div>
             </div>
          ))}
       </div>
    </div>
  )
}

// ─── ORDER SUMMARY (DESKTOP) ───
function OrderSummary({ subtotal, router }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8D8] p-6 shadow-[0_8px_30px_rgba(14,64,50,0.06)] sticky top-[100px]">
       <h3 className="text-[19px] font-bold text-[#0E4032] mb-5" style={{ fontFamily: "var(--font-koi-heading)" }}>Order Summary</h3>
       
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

       <div className="border-t border-[#E2E8D8] pt-5 mb-6">
          <div className="flex justify-between items-center">
             <span className="text-[16px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Total</span>
             <span className="text-[24px] font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>₹{subtotal.toLocaleString()}</span>
          </div>
       </div>

       <div className="flex gap-2 items-center justify-center py-3 bg-[#F2F6EC] rounded-xl border border-[#E2E8D8] mb-5">
          <ShieldCheck className="w-4 h-4 text-[#0E4032]" />
          <span className="text-[12px] font-bold text-[#0E4032]">All items meet KOI standards</span>
       </div>
       
       <button 
         onClick={() => router.push("/store/checkout")}
         className="w-full py-4 rounded-xl bg-[#0E4032] text-white font-bold text-[15px] shadow-[0_4px_12px_rgba(14,64,50,0.2)] hover:bg-[#0E4032]/90 hover:shadow-[0_8px_20px_rgba(14,64,50,0.25)] transition-all hover:-translate-y-0.5"
       >
         Proceed to Checkout
       </button>
    </div>
  )
}

// ─── MAIN CART PAGE ───
export default function CartPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  // Hydration fix for Zustand
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const items = useCartStore(state => state.items);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  if (!mounted) return null;

  // ─── EMPTY STATE ───
  if (totalItems === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F2F6EC]">
        <div className="pt-6" />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-6 border border-[#E2E8D8]">
            <ShoppingBag className="w-10 h-10 text-[#0E4032]/30" />
          </div>
          <h2 className="text-2xl font-bold text-[#0E4032] mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>Your cart is empty</h2>
          <p className="text-[#5A6B5A] font-medium mb-8 max-w-md">
            Discover products that earned their place through independent testing.
          </p>
          <button
            onClick={() => router.push("/store/shop")}
            className="px-8 py-3.5 rounded-xl font-bold text-white bg-[#0E4032] hover:bg-[#0E4032]/90 hover:shadow-lg transition-all"
          >
            Continue Shopping
          </button>
        </main>
      </div>
    );
  }

  // ─── POPULATED CART STATE ───
  return (
    <div className="min-h-screen pb-32 md:pb-16 bg-[#F2F6EC]">
      {/* Main Layout Spacer */}
      <div className="pt-2 md:pt-4" />

      {/* Main Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Items & Insights */}
          <div className="lg:col-span-8">
             <div className="space-y-4">
               {items.map(item => (
                 <CartItemCard key={item.id} item={item} />
               ))}
             </div>

             <CartInsights />
             
             <RecommendedAddons />
          </div>

          {/* RIGHT COLUMN: Desktop Summary */}
          <div className="hidden lg:block lg:col-span-4 relative">
             <OrderSummary subtotal={subtotal} router={router} />
          </div>
          
        </div>
      </main>

      {/* ─── MOBILE STICKY BOTTOM CHECKOUT ─── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#E2E8D8] shadow-[0_-8px_30px_rgba(14,64,50,0.06)] p-4 pb-safe animate-in slide-in-from-bottom duration-300 z-40">
        <div className="flex gap-2 items-center justify-center py-2 bg-[#F2F6EC] rounded-lg border border-[#E2E8D8] mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0E4032]" />
          <span className="text-[11px] font-bold text-[#0E4032] uppercase tracking-wide">All items meet KOI standards</span>
        </div>
        
        <div className="flex items-center justify-between gap-4">
           <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#5A6B5A] uppercase tracking-wider">Total</span>
              <span className="text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>₹{subtotal.toLocaleString()}</span>
           </div>
           
           <button 
             onClick={() => router.push("/store/checkout")}
             className="flex-1 py-3.5 rounded-xl bg-[#0E4032] text-white font-bold text-[14px] hover:bg-[#0E4032]/90 shadow-md active:scale-[0.98] transition-all"
           >
             Proceed to Checkout
           </button>
        </div>
      </div>

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom);
        }
      `}</style>
    </div>
  );
}
