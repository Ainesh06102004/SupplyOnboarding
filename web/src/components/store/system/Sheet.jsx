"use client";

// ============================================================================
// KOI — Sheet
//
// One overlay for the store: a right-hand drawer on desktop, a bottom sheet on
// phones (the switch is CSS, app/store/koi.css). It traps focus while open,
// closes on Esc and on the backdrop, locks the page's scroll, and gives focus
// back to whatever opened it. The cart uses it; other drawers can move onto it
// as they are touched.
// ============================================================================

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.label the dialog's accessible name
 * @param {React.ReactNode} props.children
 */
export default function Sheet({ open, onClose, label, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    // Focus the panel itself first, so a screen reader announces the dialog
    // before its first control.
    panel?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="ks-sheet-root koi-store-portal">
      <button type="button" className="ks-sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={() => closeRef.current?.()} />
      <div ref={panelRef} className="ks-sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="ks-sheet-grip" aria-hidden="true"><span /></div>
        {children}
      </div>
    </div>,
    document.querySelector(".koi-store") ?? document.body
  );
}
