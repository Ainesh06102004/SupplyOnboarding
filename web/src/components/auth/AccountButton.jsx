"use client";

// ============================================================================
// KOI — The sign-in affordance
//
// Until now the storefront had no way to sign in on purpose. The only routes to
// the login sheet were involuntary: hit a gated page and get bounced back with
// ?login=required, or open the address book at checkout. A shopper who simply
// wanted to sign in first had to guess.
//
// WHY IT LIVES IN TWO NAVS:
// /store and /store/shop render EditorialNav and suppress the shared navbar, so
// a button added to StoreNavigation alone would be invisible on exactly the two
// pages shoppers actually land on. Same component, two mount points, one
// `variant` for the two palettes.
//
// WHY THE PLACEHOLDER MATTERS:
// Auth resolves on the client, so the server always renders signed-out. Showing
// "Sign in" immediately would flash it at people who are already signed in, and
// swapping the node after hydration shifts the whole nav cluster sideways. The
// loading branch reserves the same box and renders nothing legible instead.
// ============================================================================

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, ChevronDown, Users, Settings, CalendarCheck, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LoginSheet from "@/components/auth/LoginSheet";
import { signOutUser } from "@/lib/auth/supabaseAuth";

/** Where the account menu goes. The household is the one shoppers ask for. */
const MENU = [
  { label: "My household", href: "/store/household", icon: Users, hint: "Everyone you shop for" },
  { label: "Plan", href: "/store/plan", icon: CalendarCheck, hint: null },
  { label: "Settings", href: "/store/profile", icon: Settings, hint: "Account, addresses, goal" },
  { label: "What KOI keeps", href: "/store/profile/data", icon: Shield, hint: "See or delete your data" },
];

const STYLES = {
  // Matches StoreNavigation's cart pill.
  store: {
    shell:
      "flex items-center gap-2.5 px-5 py-2.5 bg-white border border-[#E2E8D8] rounded-full shadow-[0_2px_10px_rgba(14,64,50,0.02)] hover:border-[#0E4032]/30 hover:bg-[#F2F6EC] transition-all",
    label: "text-[13px] font-bold text-[#0E4032] uppercase tracking-wider",
    icon: "w-4 h-4 text-[#0E4032]",
    ghost: "w-[104px] h-[42px] rounded-full bg-white/40 border border-[#E2E8D8]",
  },
  // Matches EditorialNav's location pill.
  editorial: {
    shell:
      "flex items-center gap-2 rounded-full border border-[#083D2D]/12 bg-white/60 px-3.5 py-2 text-[#083D2D] transition-colors hover:bg-white",
    label: "text-[12px] font-bold",
    icon: "h-4 w-4",
    ghost: "h-10 w-[92px] rounded-full border border-[#083D2D]/12 bg-white/40",
  },
};

/**
 * @param {object} props
 * @param {"store"|"editorial"} [props.variant] which palette to wear
 * @param {string} [props.className] extra classes, for responsive hiding
 */
export default function AccountButton({ variant = "store", className = "" }) {
  const { user, loading } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const s = STYLES[variant] ?? STYLES.store;

  // Same footprint, nothing to read. Prevents both the wrong-state flash and
  // the layout shift that replacing the element would cause.
  if (loading) {
    return <div className={`${s.ghost} ${className}`} aria-hidden="true" />;
  }

  if (user) {
    // A phone signup has no name and no email, so the icon is the honest
    // default and the label is the number it was created with.
    const label =
      user.displayName?.split(" ")[0] ||
      user.phone?.slice(-4) ||
      user.email?.split("@")[0] ||
      "Account";

    return <AccountMenu label={label} styles={s} className={className} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsLoginOpen(true)}
        aria-label="Sign in to KOI"
        className={`${s.shell} ${className}`}
      >
        <User className={s.icon} strokeWidth={2.2} />
        <span className={s.label}>Sign in</span>
      </button>

      {/* No `next`: the shopper chose to sign in from wherever they were, so
          there is nowhere else they were trying to get to. The sheet closes and
          leaves them on the page. */}
      <LoginSheet open={isLoginOpen} onOpenChange={setIsLoginOpen} />
    </>
  );
}

/**
 * The signed-in account, as a menu. It used to be a link straight to
 * /store/profile, which left the household and the planner reachable only by
 * typing a URL.
 *
 * @param {{ label: string, styles: object, className?: string }} props
 */
function AccountMenu({ label, styles, className = "" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef(null);
  const menuId = useId();

  // Close on Escape, and on a click anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onPointer = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await signOutUser();
      setOpen(false);
      router.push("/store/shop");
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Your account"
        className={styles.shell}
      >
        <User className={styles.icon} strokeWidth={2.2} />
        <span className={`${styles.label} max-w-[92px] truncate`}>{label}</span>
        <ChevronDown className={`${styles.icon} transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.2} />
      </button>

      {open && (
        <div id={menuId} role="menu" aria-label="Your account"
             className="absolute right-0 top-[calc(100%+8px)] z-[80] w-60 overflow-hidden rounded-2xl border border-[#083D2D]/12 bg-white shadow-[0_18px_50px_rgba(8,61,45,0.18)]">
          {MENU.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[#F2F6EC]">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#16A06E]" strokeWidth={2.2} />
                <span>
                  <span className="block text-[13px] font-bold text-[#0E4032]">{item.label}</span>
                  {item.hint && <span className="block text-[11px] text-[#5A6B5A]">{item.hint}</span>}
                </span>
              </Link>
            );
          })}
          <button type="button" role="menuitem" onClick={signOut} disabled={signingOut}
                  className="flex w-full items-center gap-2.5 border-t border-[#083D2D]/10 px-4 py-2.5 text-left transition-colors hover:bg-[#F2F6EC] disabled:opacity-50">
            <LogOut className="h-4 w-4 shrink-0 text-[#5A6B5A]" strokeWidth={2.2} />
            <span className="text-[13px] font-bold text-[#0E4032]">{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
