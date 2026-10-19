"use client";

// ============================================================================
// KOI for brands — supplier sign-in (cinematic storefront, Oct 2026)
//
// The canvas's split: on the left, the night stage, where KOI reads a SAMPLE
// label (it says so) token by token — what happens to every pack a brand
// sends; on the right, the sign-in card. Email and password, creating an
// account (and saying so when the address needs confirming), Google, and the
// not-configured notice are unchanged.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import GoogleIcon from "@/components/auth/GoogleIcon";
import { getAuthErrorMessage, signInWithEmail, signUpWithEmail } from "@/lib/auth/supabaseAuth";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

const PROPS = [
  ["Secure supplier access", "Your brand data stays protected behind your own account."],
  ["One account for everything", "Use the same login for onboarding, dashboard, and store tools."],
  ["Pick up where you left off", "Your progress stays synced across sessions."],
];

/** The night stage: a sample label, read one token at a time. */
function Stage() {
  const ref = useRef(null);
  const [read, setRead] = useState(false);
  useGSAP(() => {
    const q = (s) => ref.current.querySelectorAll(s);
    if (prefersReducedMotion()) { setupMotion().set(q("[data-token]"), { backgroundColor: "rgba(221,242,71,.55)" }); return; }
    const gsap = setupMotion();
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(q("[data-line]"), { yPercent: 115, duration: 1, stagger: 0.1 }, 0.1);
    tl.from(q("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7 }, 0.3);
    tl.from(q("[data-label]"), { autoAlpha: 0, y: 40, rotation: -2, duration: 1, ease: E.dolly }, 0.4);
    tl.to(q("[data-token]"), { backgroundColor: "rgba(221,242,71,.55)", duration: 0.25, stagger: 0.18 }, 1.2);
    tl.call(() => setRead(true));
    tl.from(q("[data-prop]"), { autoAlpha: 0, y: 16, duration: 0.6, stagger: 0.08 }, 1.0);
  }, { scope: ref });
  const tok = "rounded px-0.5";
  return (
    <section ref={ref} aria-label="How KOI reads a label" className="relative flex flex-col gap-10 overflow-hidden bg-koi-night px-[clamp(24px,4vw,64px)] py-12 text-koi-bg">
      <Link href="/onboarding" className="flex items-center gap-3 no-underline">
        <span className="flex items-end gap-[3px] text-koi-bg"><span className="font-koi-display text-[28px] font-extrabold leading-none tracking-[-0.02em]">KOI</span><span aria-hidden="true" className="mb-[3px] size-[7px] rounded-full bg-koi-ember" /></span>
        <span className="rounded-full border border-koi-bg/25 px-2.5 py-1 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-koi-bg/80">For Brands</span>
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,4.6vw,72px)] font-extrabold leading-[0.92] tracking-[-0.03em]">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">KOI reads your labels.</span></span>
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block text-koi-lime">A person checks them.</span></span>
        </h1>
        <p data-rise className="m-0 max-w-[460px] text-base leading-relaxed text-koi-bg/70">Each photo is transcribed exactly as printed — ingredients, allergen statement and nutrition table. Nothing is published from the model alone.</p>
      </div>
      <figure data-label className="relative m-0 w-full max-w-[520px] self-start rounded-[26px] bg-koi-bg p-6 text-koi-ink shadow-[0_60px_120px_-50px_rgba(0,0,0,.8)]">
        <span className="absolute -top-3 right-6 rounded-full bg-koi-ember px-2.5 py-1 font-koi-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white">Sample label</span>
        <div className="flex items-baseline justify-between border-b-2 border-koi-ink pb-2"><span className="font-koi-display text-[22px] font-extrabold tracking-[-0.01em]">Your brand</span><span className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">Peanut butter</span></div>
        <p className="m-0 mt-3 text-[13.5px] leading-relaxed"><span className="font-bold">INGREDIENTS:</span> <span data-token className={tok}>Roasted Peanuts</span> (99%), <span data-token className={tok}>Salt</span>.</p>
        <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed"><span className="font-bold">ALLERGEN:</span> <span data-token className={tok}>Contains peanuts</span>. Made in a facility that also handles <span data-token className={tok}>tree nuts</span>.</p>
        <table className="mt-3 w-full border-collapse text-[12.5px]">
          <caption className="sr-only">Nutrition per 100 g, sample</caption>
          <tbody>
            {[["Energy", "612 kcal"], ["Protein", "26 g"], ["Total sugars", "5.1 g"], ["Sodium", "402 mg"]].map(([k, v], i, all) => (
              <tr key={k} className={`border-t border-koi-ink/20 ${i === all.length - 1 ? "border-b" : ""}`}><th scope="row" className="py-1.5 text-left font-semibold">{k}</th><td className="py-1.5 text-right font-koi-num"><span data-token className={tok}>{v}</span></td></tr>
            ))}
          </tbody>
        </table>
        <figcaption className="mt-4 flex items-center gap-2 font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted"><span aria-hidden="true" className="size-1.5 rounded-full bg-koi-green" />{read ? "Read · waiting for a person to check" : "Reading…"}</figcaption>
      </figure>
      <ul className="m-0 mt-auto grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
        {PROPS.map(([t, d]) => <li key={t} data-prop className="flex flex-col gap-1"><span className="text-[14px] font-bold">{t}</span><span className="text-[13px] leading-snug text-koi-bg/60">{d}</span></li>)}
      </ul>
    </section>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const card = useRef(null);

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [user, loading, router, redirectTo]);

  useGSAP(() => {
    if (!card.current || prefersReducedMotion()) return;
    setupMotion().from(card.current, { autoAlpha: 0, y: 30, duration: 0.8, ease: E.reveal, delay: 0.2 });
  }, { dependencies: [loading || Boolean(user)] });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        toast.success("Welcome back!");
        router.replace(redirectTo);
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          // The project does not auto-confirm, so there is no session yet and
          // redirecting would bounce straight back to this form. Say what
          // happened instead of looking broken.
          toast.success("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
          setPassword("");
        } else {
          toast.success("Account created successfully.");
          router.replace(redirectTo);
        }
      }
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    try {
      // Navigates to Google and comes back through /auth/callback, so there is
      // nothing to redirect to here and no success toast to show — this page is
      // being torn down. isSubmitting deliberately stays true so the button
      // cannot be pressed twice while the browser is leaving.
      await signInWithGoogle(redirectTo);
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  if (loading || user) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center bg-koi-bg">
        <p className="m-0 text-[15px] text-koi-muted">Loading…</p>
      </div>
    );
  }

  const field = "h-14 w-full rounded-2xl border border-koi-forest/15 bg-white px-4 text-base outline-none placeholder:text-koi-muted focus:border-koi-forest";

  return (
    <main className="grid min-h-screen grid-cols-1 bg-koi-bg font-koi-sans text-koi-ink lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <Stage />
      <section className="relative flex items-center justify-center px-6 py-12">
        <div ref={card} className="flex w-full max-w-[440px] flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="font-koi-mono text-xs font-semibold uppercase tracking-[0.18em] text-koi-green">KOI Health</span>
            <h2 className="koi-condensed m-0 font-koi-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.02em] text-koi-forest">
              {mode === "signin" ? "Sign in to your supplier account" : "Create your supplier account"}<span aria-hidden="true" className="ml-[3px] inline-block size-[9px] rounded-full bg-koi-ember" />
            </h2>
            <p className="m-0 text-[15px] leading-relaxed text-koi-ink2">
              {mode === "signin"
                ? "Access your dashboard, manage products, and track verification status in one secure place."
                : "Register to start managing your brand on KOI."}
            </p>
          </div>

          {!configured && (
            <div className="rounded-2xl border border-koi-amber-border bg-koi-amber-bg px-4 py-3 text-sm text-koi-amber-ink">
              Supabase is not configured yet. Copy <code className="rounded bg-white px-1.5 py-0.5 text-xs">.env.example</code> to <code className="rounded bg-white px-1.5 py-0.5 text-xs">.env.local</code> and add your project credentials.
            </div>
          )}

          <button type="button" disabled={isSubmitting || !configured} onClick={handleGoogleSignIn} className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-koi-forest/15 bg-white text-[15px] font-semibold transition-colors hover:border-koi-forest/40 disabled:opacity-50">
            <GoogleIcon />
            Continue with Google
          </button>
          <div className="flex items-center gap-3"><span className="h-px flex-1 bg-koi-forest/10" /><span className="font-koi-mono text-[11px] uppercase tracking-[0.16em] text-koi-muted">or use email</span><span className="h-px flex-1 bg-koi-forest/10" /></div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold">Email</span>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@brand.com" className={field} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold">Password</span>
              <span className="flex h-14 items-center rounded-2xl border border-koi-forest/15 bg-white pl-4 pr-2 transition-colors focus-within:border-koi-forest">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-koi-muted"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="grid size-10 place-items-center rounded-xl text-koi-ink2 hover:bg-koi-paper">
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </span>
            </label>
            <button type="submit" disabled={isSubmitting || !configured} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-koi-forest text-base font-bold text-koi-lime transition-opacity disabled:opacity-40">
              {mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight className="size-5" />
            </button>
          </form>

          <p className="m-0 text-center text-[14px] text-koi-ink2">
            {mode === "signin" ? "New to KOI?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => setMode((current) => (current === "signin" ? "signup" : "signin"))} className="font-bold text-koi-primary underline-offset-4 hover:underline">
              {mode === "signin" ? "Create an account" : "Sign in instead"}
            </button>
            {mode === "signin" && <> · <Link href="/onboarding" className="font-bold text-koi-primary underline-offset-4 hover:underline">Join the supplier network</Link></>}
          </p>
        </div>
      </section>
    </main>
  );
}
