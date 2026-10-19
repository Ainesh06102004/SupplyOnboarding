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
//
// WHY IT RENDERS THROUGH A PORTAL:
// The sheet is a `position: fixed` overlay, and a fixed element is positioned
// against the nearest ancestor with a transform, filter or backdrop-filter —
// not the viewport. The store header has a backdrop-filter, so a sheet opened
// from its "Sign in" button was 63 px tall and invisible. Rendering into the
// store root (or <body>) means no ancestor can trap it, wherever it is opened.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, ShieldCheck, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
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
  const [otpFocused, setOtpFocused] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // While open: the page behind does not scroll, the number field takes focus,
  // and focus goes back to whatever opened the sheet when it closes.
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panelRef.current?.querySelector("input")?.focus(), 40);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [open]);

  // The sheet arrives like a card dealt onto the table: the room dims, the
  // sheet rises (a bottom sheet on phones), and each step slides in.
  const layerRef = useRef(null);
  useGSAP(() => {
    const layer = layerRef.current;
    if (!open || !layer || prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(layer.querySelector("[data-backdrop]"), { autoAlpha: 0, duration: 0.3, ease: "power1.out" });
    gsap.from(layer.querySelector("[data-sheet]"), { y: 48, autoAlpha: 0, scale: 0.97, duration: 0.55, ease: E.reveal });
  }, { dependencies: [open] });
  useGSAP(() => {
    const el = layerRef.current?.querySelector("[data-step]");
    if (!open || !el || prefersReducedMotion()) return;
    setupMotion().from(el, { x: step === "OTP" ? 24 : -24, autoAlpha: 0, duration: 0.4, ease: E.reveal });
  }, { dependencies: [open, step] });

  if (!open || typeof document === "undefined") return null;

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
    setOtpFocused(false);
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
  const otpCells = Array.from({ length: 6 }, (_, i) => ({ d: code[i] ?? "", caret: otpFocused && i === Math.min(code.length, 5) && code.length < 6 }));

  return createPortal(
    <div
      ref={layerRef}
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 font-koi-sans text-koi-ink md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="koi-login-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !loading) {
          e.stopPropagation();
          dismiss();
        }
      }}
    >
      {/* A tap on the dimmed backdrop is a dismiss, except mid-checkout, where
          the explicit close button stays the only way out. */}
      <div data-backdrop aria-hidden="true" onClick={() => { if (!required && !loading) dismiss(); }} className="absolute inset-0 bg-koi-night/45 backdrop-blur-[3px]" />
      <div ref={panelRef} data-sheet className="relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-[32px] bg-koi-bg p-7 shadow-[0_50px_120px_-40px_rgba(4,20,15,.75)] md:max-w-[460px] md:rounded-[32px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {step === "OTP" && (
              <button
                type="button"
                onClick={() => { setStep("PHONE"); setCode(""); }}
                aria-label="Change number"
                className="-ml-2 grid size-11 place-items-center rounded-full text-koi-forest transition-colors hover:bg-white"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <h2 id="koi-login-title" className="koi-condensed m-0 font-koi-display text-[36px] font-extrabold leading-none tracking-[-0.02em] text-koi-forest">
              {title}<span aria-hidden="true" className="ml-[3px] inline-block size-[9px] rounded-full bg-koi-ember" />
            </h2>
          </div>
          <button type="button" onClick={dismiss} aria-label="Close" className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-koi-ink2 transition-colors hover:bg-white">
            <X className="size-5" />
          </button>
        </div>

        <div data-step className="flex flex-col">
          {step === "PHONE" && (
            <>
              <p className="m-0 mt-3 text-[15px] leading-relaxed text-koi-ink2">
                {required
                  ? "Checkout, orders and your saved details need an account. Your cart is waiting for you — nothing is lost."
                  : "Sign in to save addresses, keep your diet profile, and see past orders."}
              </p>

              <form onSubmit={handleSend} className="mt-6 flex flex-col gap-3">
                <label htmlFor="koi-phone" className="text-sm font-bold">Mobile number</label>
                <div className={`flex h-16 items-center gap-3 rounded-2xl border-2 bg-white px-4 transition-colors ${phone.length ? "border-koi-forest" : "border-koi-forest/15 focus-within:border-koi-forest"}`}>
                  <span className="font-koi-num text-[20px] font-semibold text-koi-muted">+91</span>
                  <span aria-hidden="true" className="h-7 w-px bg-koi-forest/15" />
                  <input
                    id="koi-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="Enter 10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="h-full min-w-0 flex-1 border-0 bg-transparent font-koi-num text-[22px] font-semibold tracking-[0.06em] text-koi-ink outline-none placeholder:font-koi-sans placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-koi-muted"
                  />
                  <span aria-hidden="true" className="font-koi-mono text-[11px] text-koi-muted">{phone.length}/10</span>
                </div>
                <button
                  type="submit"
                  disabled={loading || !isValidMobile(phone)}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-koi-forest text-base font-bold text-koi-lime transition-colors disabled:cursor-not-allowed disabled:bg-koi-track disabled:text-koi-muted"
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {loading ? "Sending code…" : "Send code"}
                </button>
              </form>

              {GOOGLE_ENABLED && (
                <>
                  <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-koi-forest/10" /><span className="font-koi-mono text-[11px] uppercase tracking-[0.16em] text-koi-muted">or</span><span className="h-px flex-1 bg-koi-forest/10" /></div>
                  <button type="button" onClick={handleGoogle} disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-koi-forest/15 bg-white text-[15px] font-semibold text-koi-ink transition-colors hover:border-koi-forest/40 disabled:opacity-50">
                    <GoogleIcon />
                    Continue with Google
                  </button>
                </>
              )}

              <p className="m-0 mt-5 flex items-start gap-2.5 text-[12.5px] leading-normal text-koi-muted">
                <ShieldCheck className="mt-px size-4 shrink-0 text-koi-primary" />
                We’ll text you a one-time code. By continuing you agree to our Terms of Service and Privacy Policy.
              </p>
            </>
          )}

          {step === "OTP" && (
            <>
              <p className="m-0 mt-3 text-[15px] leading-relaxed text-koi-ink2">
                We sent a 6-digit code to <span className="font-koi-num font-semibold text-koi-ink">{formatForDisplay(sentTo)}</span>.
              </p>
              <form onSubmit={handleVerify} className="mt-6 flex flex-col gap-3">
                <label htmlFor="koi-otp" className="text-sm font-bold">Verification code</label>
                {/* Six cells to read, one real input underneath (opacity 0) so
                    paste and the phone's one-time-code autofill both work. */}
                <div className="relative">
                  <div aria-hidden="true" className="grid grid-cols-6 gap-2">
                    {otpCells.map((c, i) => (
                      <span key={i} className={`grid h-16 place-items-center rounded-2xl border-2 bg-white font-koi-num text-[26px] font-semibold transition-colors ${c.d ? "border-koi-forest" : c.caret ? "border-koi-forest/60" : "border-koi-forest/15"}`}>
                        {c.d}{c.caret && <span className="h-7 w-[2px] animate-pulse rounded-full bg-koi-forest" />}
                      </span>
                    ))}
                  </div>
                  <input
                    id="koi-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-koi-forest text-base font-bold text-koi-lime transition-colors disabled:cursor-not-allowed disabled:bg-koi-track disabled:text-koi-muted"
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {loading ? "Verifying…" : "Verify and continue"}
                </button>
              </form>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="mt-2 h-11 w-full rounded-xl font-koi-num text-sm font-semibold text-koi-primary transition-colors hover:bg-white disabled:cursor-not-allowed disabled:text-koi-muted disabled:hover:bg-transparent"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </>
          )}

          {/* The guest path. Hidden when the shopper is mid-checkout, because
              there dismissing returns them to a page they cannot use — the
              close button in the header is still there for a genuine escape. */}
          {!required && (
            <button type="button" onClick={dismiss} className="mt-4 flex h-11 items-center justify-center gap-2 self-center rounded-full px-4 text-sm font-semibold text-koi-ink2 transition-colors hover:bg-white hover:text-koi-forest">
              Continue browsing as guest
              <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.querySelector(".koi-store") ?? document.body
  );
}
