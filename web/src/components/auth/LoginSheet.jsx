"use client";

// ============================================================================
// KOI — Shopper sign-in
//
// Replaces OTPLoginModal, which was a three-step phone flow: send OTP, verify
// OTP, then ask for a name and email to build a profile. Google returns all
// three with the identity, so the sheet is one button and the profile row is
// created by a database trigger (migration 00013) rather than by a form.
//
// GUEST IS AN EQUAL OPTION, NOT A CONSOLATION:
// Browsing, searching and filling a cart need no account. The dismiss action is
// therefore a real, labelled choice rather than a grey "maybe later" — a
// shopper who has not decided to trust KOI with an account has not done
// anything wrong. Only checkout, orders and profile require signing in, and
// when the sheet opens for one of those it says which.
//
// WHAT WAS LOST WITH THE OTP FLOW:
// Phone sign-in. Indian shoppers reach for a number before an email, so this is
// a real narrowing — Supabase phone auth needs a paid SMS provider, and the
// brief was Google. The sheet is laid out so a second provider button can be
// added beside this one without redesigning it.
// ============================================================================

import { useState } from "react";
import { X, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import GoogleIcon from "@/components/auth/GoogleIcon";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {() => void} [props.onComplete] run when the shopper dismisses to keep
 *   browsing. Signing in never calls it — the page navigates to Google.
 * @param {string} [props.next] where to land after signing in; a same-origin
 *   path, re-validated in /auth/callback.
 * @param {boolean} [props.required] true when the shopper was sent here by the
 *   route gate rather than choosing to sign in.
 */
export default function LoginSheet({
  open,
  onOpenChange,
  onComplete,
  next,
  required = false,
}) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleGoogle = async () => {
    setLoading(true);
    try {
      // Navigates away; `loading` stays true so the button cannot be pressed
      // again while the browser is leaving.
      await signInWithGoogle(next);
    } catch (error) {
      console.error("Google sign-in failed:", error);
      toast.error("Could not reach Google. Please try again.");
      setLoading(false);
    }
  };

  const dismiss = () => {
    onOpenChange(false);
    onComplete?.();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-[#0E4032]/40 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="koi-login-title"
    >
      <div className="bg-white w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200">

        <div className="flex items-center justify-between p-5 border-b border-[#E2E8D8]">
          <h2
            id="koi-login-title"
            className="text-lg font-bold text-[#0E4032]"
            style={{ fontFamily: "var(--font-koi-heading)" }}
          >
            {required ? "Sign in to continue" : "Sign in to KOI"}
          </h2>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[#F2F6EC] flex items-center justify-center hover:bg-[#E2E8D8] transition-colors"
          >
            <X className="w-4 h-4 text-[#0E4032]" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <p className="text-[14px] text-[#5A6B5A] leading-relaxed font-medium">
            {required
              ? "Checkout, orders and your saved details need an account. Your cart is waiting for you — nothing is lost."
              : "Sign in to save addresses, keep your diet profile, and see past orders."}
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-[#E2E8D8] bg-white text-[#0E4032] h-12 rounded-xl font-bold hover:bg-[#EDF2E6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            {loading ? "Taking you to Google..." : "Continue with Google"}
          </button>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-[#EDF2E6] border border-[#E2E8D8]">
            <ShieldCheck className="w-5 h-5 text-[#2D7A5E] shrink-0" />
            <p className="text-[12px] text-[#5A6B5A] leading-relaxed font-medium">
              We only ever see your name, email and profile picture. By
              continuing you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>

          {/* The guest path. Hidden when the shopper is mid-checkout, because
              there dismissing returns them to a page they cannot use — the
              close button in the header is still there for a genuine escape. */}
          {!required && (
            <button
              type="button"
              onClick={dismiss}
              className="w-full flex items-center justify-center gap-2 text-[#5A6B5A] h-11 rounded-xl font-bold text-[14px] hover:text-[#0E4032] hover:bg-[#F2F6EC] transition-colors"
            >
              Continue browsing as guest
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
