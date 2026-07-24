"use client";

import { useState, useEffect, useRef } from "react";
import { X, ArrowRight, ShieldCheck, User as UserIcon } from "lucide-react";
import { setupRecaptcha, signInWithPhone, clearRecaptcha } from "@/lib/firebase/auth";
import { profileService } from "@/lib/supabase/profileService";
import { toast } from "sonner";

const ABUSE_KEY = "koi_otp_requests";
const MAX_ATTEMPTS = 3;
const TIME_WINDOW = 10 * 60 * 1000; // 10 minutes

export default function OTPLoginModal({ open, onOpenChange, onComplete }) {
  const [step, setStep] = useState("PHONE"); // PHONE, OTP, PROFILE
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [verifiedUid, setVerifiedUid] = useState(null);

  const recaptchaVerifierRef = useRef(null);

  useEffect(() => {
    if (open) {
      try {
        recaptchaVerifierRef.current = setupRecaptcha("recaptcha-container");
      } catch (e) {
        console.error("Failed to setup recaptcha:", e);
      }
    }

    return () => {
      clearRecaptcha();
      recaptchaVerifierRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const checkAbuseLimit = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(ABUSE_KEY) || "[]");
      const now = Date.now();
      const recent = stored.filter(time => now - time < TIME_WINDOW);
      
      if (recent.length >= MAX_ATTEMPTS) {
        return false;
      }
      
      recent.push(now);
      localStorage.setItem(ABUSE_KEY, JSON.stringify(recent));
      return true;
    } catch (e) {
      return true;
    }
  };

  const handleSendOTP = async (e) => {
    if (e) e.preventDefault();
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    if (!checkAbuseLimit()) {
      toast.error("Too many requests. Please try again after 10 minutes.");
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = `+91${phone}`;
      const verifier = recaptchaVerifierRef.current;
      const result = await signInWithPhone(formattedPhone, verifier);
      setConfirmationResult(result);
      setStep("OTP");
      setCooldown(30);
      toast.success("OTP sent successfully");
    } catch (error) {
      console.error("Error sending OTP:", error);
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const credential = await confirmationResult.confirm(otp);
      const user = credential.user;
      
      // Check if user exists in Supabase
      const existingProfile = await profileService.getProfileByFirebaseUid(user.uid);
      
      if (existingProfile) {
        toast.success("Welcome back!");
        onComplete?.(user);
        onOpenChange(false);
      } else {
        setVerifiedUid(user.uid);
        setStep("PROFILE");
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      toast.error("Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setLoading(true);
    try {
      await profileService.upsertProfile({
        firebase_uid: verifiedUid,
        phone: `+91${phone}`,
        name: name.trim(),
        email: email.trim() || null,
      });
      
      toast.success("Account created successfully!");
      onComplete?.({ uid: verifiedUid });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-[#0E4032]/40 backdrop-blur-sm transition-opacity">
      <div className="bg-white w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E2E8D8]">
          <h2 className="text-lg font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
            {step === "PHONE" ? "Login or Signup" : step === "OTP" ? "Verify Phone" : "Complete Profile"}
          </h2>
          <button 
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full bg-[#F2F6EC] flex items-center justify-center hover:bg-[#E2E8D8] transition-colors"
          >
            <X className="w-4 h-4 text-[#0E4032]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {step === "PHONE" && (
            <form onSubmit={handleSendOTP} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#0E4032]">Mobile Number</label>
                <div className="flex bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl overflow-hidden focus-within:border-[#0E4032]/40 focus-within:bg-white transition-colors">
                  <div className="px-4 py-3 border-r border-[#E2E8D8] text-[#5A6B5A] font-bold text-[15px] flex items-center bg-[#EDF2E6]">
                    +91
                  </div>
                  <input
                    type="tel"
                    maxLength="10"
                    placeholder="Enter 10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 bg-transparent px-4 py-3 text-[15px] font-bold text-[#0E4032] focus:outline-none placeholder:font-normal placeholder:text-[#5A6B5A]/60"
                  />
                </div>
              </div>
              
              <div id="recaptcha-container"></div>

              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#EDF2E6] border border-[#E2E8D8]">
                <ShieldCheck className="w-5 h-5 text-[#2D7A5E] shrink-0" />
                <p className="text-[12px] text-[#5A6B5A] leading-relaxed font-medium">
                  By continuing, you agree to our Terms of Service and Privacy Policy. We&apos;ll send you a secure OTP.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full flex items-center justify-center gap-2 bg-[#0E4032] text-white h-12 rounded-xl font-bold hover:bg-[#155A47] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Get OTP"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {step === "OTP" && (
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-sm text-[#5A6B5A] font-medium mb-1">Enter the 6-digit code sent to</p>
                <p className="text-base font-bold text-[#0E4032]">+91 {phone}</p>
              </div>

              <div className="space-y-2">
                <div className="flex bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl overflow-hidden focus-within:border-[#0E4032]/40 focus-within:bg-white transition-colors">
                  <input
                    type="text"
                    maxLength="6"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center tracking-[0.5em] bg-transparent px-4 py-4 text-xl font-bold text-[#0E4032] focus:outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-[#5A6B5A]/40"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-[#0E4032] text-white h-12 rounded-xl font-bold hover:bg-[#155A47] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify & Continue"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  disabled={cooldown > 0 || loading}
                  onClick={handleSendOTP}
                  className="text-sm font-bold text-[#2D7A5E] hover:text-[#0E4032] transition-colors disabled:text-[#5A6B5A]/50"
                >
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                </button>
              </div>
            </form>
          )}

          {step === "PROFILE" && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#F2F6EC] border border-[#E2E8D8] rounded-full flex items-center justify-center mx-auto mb-3">
                  <UserIcon className="w-7 h-7 text-[#0E4032]" />
                </div>
                <h3 className="text-lg font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Just one last step</h3>
                <p className="text-[13px] text-[#5A6B5A] font-medium mt-1">Tell us a bit about yourself</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#5A6B5A] uppercase tracking-wider ml-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Anshuman Das"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl px-4 py-3 text-[15px] font-bold text-[#0E4032] focus:outline-none focus:border-[#0E4032]/40 focus:bg-white transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#5A6B5A] uppercase tracking-wider ml-1">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. anshuman@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl px-4 py-3 text-[15px] font-bold text-[#0E4032] focus:outline-none focus:border-[#0E4032]/40 focus:bg-white transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full flex items-center justify-center gap-2 bg-[#0E4032] text-white h-12 rounded-xl font-bold hover:bg-[#155A47] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {loading ? "Saving..." : "Create Account"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
