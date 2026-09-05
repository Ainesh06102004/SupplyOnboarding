"use client";

// ============================================================================
// KOI — Shopper sign-in
//
// Two steps: enter a mobile number, enter the six digits that arrive. There is
// no third step. The old OTPLoginModal asked for a name and email afterwards
// because it wrote customer_profiles by hand from the client; the profile row
// is now created by a database trigger the moment the auth user exists
// (migrations 00013/00014), so the sheet has nothing left to collect. A shopper
// who wants to add their name does it on the profile page, later, if ever.
//
// GUEST IS AN EQUAL OPTION, NOT A CONSOLATION:
// Browsing, searching and filling a cart need no account. The dismiss action is
// therefore a real, labelled choice rather than a grey "maybe later" — a
// shopper who has not decided to trust KOI with an account has not done
// anything wrong. Only checkout, orders and profile require signing in, and
// when the sheet opens for one of those it says which.
//
// WHY EVERY SEND IS GUARDED:
// Each code is a paid SMS. The number is validated client-side before the
// request leaves, the resend button holds a cooldown, and the send button
// disables while in flight. None of this is security — Supabase rate-limits
// server-side and that is the control that matters — it is there so an
// impatient shopper tapping a button four times costs one message, not four.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ShieldCheck, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import GoogleIcon from "@/components/auth/GoogleIcon";
import {
  toE164,
  isValidMobile,
  formatForDisplay,
  sendOtp,
  verifyOtp,
  getOtpErrorMessage,
} from "@/lib/auth/phoneAuth";

/** Seconds before a shopper may ask for another code. */
const RESEND_COOLDOWN = 30;

/**
 * Google is built and working but stays hidden unless this is set, because the
 * button cannot function until someone completes the Google Cloud OAuth setup
 * and a button that always fails is worse than no button. Flipping this to
 * "true" is the whole of turning Google back on.
 */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {() => void} [props.onComplete] run when the shopper dismisses to keep
 *   browsing.
 * @param {string} [props.next] where to land after signing in; a same-origin
 *   path. Used directly by the OTP flow and re-validated in /auth/callback for
 *   the Google one.
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
  const router = useRouter();

  const [step, setStep] = useState("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // The number the code was actually sent to, kept separately from the input so
  // the OTP step reads back what was sent rather than whatever is in the box.
  const [sentTo, setSentTo] = useState(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!open) return null;

  /**
   * Every close path runs through here, which is also where state resets — an
   * effect keyed on `open` would do the same thing but re-render twice and trip
   * the set-state-in-effect lint. The sheet only closes by dismissing or by
   * signing in, so this is not a path that can be missed.
   */
  const reset = () => {
    setStep("PHONE");
    setPhone("");
    setCode("");
    setLoading(false);
    setCooldown(0);
    setSentTo(null);
  };

  const dismiss = () => {
    reset();
    onOpenChange(false);
    onComplete?.();
  };

  const handleSend = async (event) => {
    event?.preventDefault();
    if (!isValidMobile(phone)) {
      toast.error("Enter a valid 10-digit mobile number.");
      return;
    }

    const e164 = toE164(phone);
    setLoading(true);
    try {
      await sendOtp(e164);
      setSentTo(e164);
      setStep("OTP");
      setCode("");
      setCooldown(RESEND_COOLDOWN);
      toast.success("Code sent.");
    } catch (error) {
      console.error("Could not send OTP:", error);
      toast.error(getOtpErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading || !sentTo) return;
    setLoading(true);
    try {
      await sendOtp(sentTo);
      setCooldown(RESEND_COOLDOWN);
      toast.success("New code sent.");
    } catch (error) {
      console.error("Could not resend OTP:", error);
      toast.error(getOtpErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event) => {
    event?.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(sentTo, code);
      // The session is in cookies now, so a server render sees it too. Closing
      // before navigating keeps the sheet from flashing over the new page.
      toast.success("You're signed in.");
      reset();
      onOpenChange(false);
      // AuthContext picks the user up from onAuthStateChange; this only moves
      // the shopper to wherever the route gate wanted them.
      if (next) router.push(next);
    } catch (error) {
      console.error("Could not verify OTP:", error);
      toast.error(getOtpErrorMessage(error));
      setCode("");
      setLoading(false);
    }
  };

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

  const title =
    step === "OTP"
      ? "Enter the code"
      : required
        ? "Sign in to continue"
        : "Sign in to KOI";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-[#0E4032]/40 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="koi-login-title"
    >
      <div className="bg-white w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200">

        <div className="flex items-center justify-between p-5 border-b border-[#E2E8D8]">
          <div className="flex items-center gap-2">
            {step === "OTP" && (
              <button
                onClick={() => {
                  setStep("PHONE");
                  setCode("");
                }}
                aria-label="Change number"
                className="w-8 h-8 rounded-full bg-[#F2F6EC] flex items-center justify-center hover:bg-[#E2E8D8] transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-[#0E4032]" />
              </button>
            )}
            <h2
              id="koi-login-title"
              className="text-lg font-bold text-[#0E4032]"
              style={{ fontFamily: "var(--font-koi-heading)" }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[#F2F6EC] flex items-center justify-center hover:bg-[#E2E8D8] transition-colors"
          >
            <X className="w-4 h-4 text-[#0E4032]" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">

          {step === "PHONE" && (
            <>
              <p className="text-[14px] text-[#5A6B5A] leading-relaxed font-medium">
                {required
                  ? "Checkout, orders and your saved details need an account. Your cart is waiting for you — nothing is lost."
                  : "Sign in to save addresses, keep your diet profile, and see past orders."}
              </p>

              <form onSubmit={handleSend} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="koi-phone"
                    className="text-sm font-semibold text-[#0E4032]"
                  >
                    Mobile number
                  </label>
                  <div className="flex bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl overflow-hidden focus-within:border-[#0E4032]/40 focus-within:bg-white transition-colors">
                    <div className="px-4 py-3 border-r border-[#E2E8D8] text-[#5A6B5A] font-bold text-[15px] flex items-center bg-[#EDF2E6]">
                      +91
                    </div>
                    <input
                      id="koi-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      placeholder="Enter 10-digit number"
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      className="flex-1 bg-transparent px-4 py-3 text-[15px] font-bold text-[#0E4032] focus:outline-none placeholder:font-normal placeholder:text-[#5A6B5A]/60"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !isValidMobile(phone)}
                  className="w-full flex items-center justify-center gap-2 bg-[#0E4032] text-white h-12 rounded-xl font-bold hover:bg-[#155A47] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Sending code..." : "Send code"}
                </button>
              </form>

              {GOOGLE_ENABLED && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-[#E2E8D8]" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A6B5A]/70">
                      or
                    </span>
                    <span className="h-px flex-1 bg-[#E2E8D8]" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 border border-[#E2E8D8] bg-white text-[#0E4032] h-12 rounded-xl font-bold hover:bg-[#EDF2E6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>
                </>
              )}

              <div className="flex items-start gap-3 p-4 rounded-xl bg-[#EDF2E6] border border-[#E2E8D8]">
                <ShieldCheck className="w-5 h-5 text-[#2D7A5E] shrink-0" />
                <p className="text-[12px] text-[#5A6B5A] leading-relaxed font-medium">
                  We&apos;ll text you a one-time code. By continuing you agree to
                  our Terms of Service and Privacy Policy.
                </p>
              </div>
            </>
          )}

          {step === "OTP" && (
            <>
              <p className="text-[14px] text-[#5A6B5A] leading-relaxed font-medium">
                We sent a 6-digit code to{" "}
                <span className="font-bold text-[#0E4032]">
                  {formatForDisplay(sentTo)}
                </span>
                .
              </p>

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="koi-otp"
                    className="text-sm font-semibold text-[#0E4032]"
                  >
                    Verification code
                  </label>
                  <input
                    id="koi-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="w-full bg-[#F2F6EC] border border-[#E2E8D8] rounded-xl px-4 py-3 text-[22px] font-bold text-[#0E4032] tracking-[0.5em] text-center focus:outline-none focus:border-[#0E4032]/40 focus:bg-white transition-colors placeholder:text-[#5A6B5A]/30 placeholder:tracking-[0.5em]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-[#0E4032] text-white h-12 rounded-xl font-bold hover:bg-[#155A47] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Verifying..." : "Verify and continue"}
                </button>
              </form>

              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="w-full text-[13px] font-bold text-[#0E4032] h-10 rounded-xl hover:bg-[#F2F6EC] transition-colors disabled:text-[#5A6B5A]/60 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </>
          )}

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
