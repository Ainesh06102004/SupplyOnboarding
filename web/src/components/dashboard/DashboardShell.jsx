"use client"

// The brand portal's frame: the night sidebar (a drawer on phones), the
// topbar, and the page. Pages animate their own entrance; the shell only
// slides the sidebar in once.

import React, { useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import DashboardSidebar from './DashboardSidebar'
import DashboardTopbar from './DashboardTopbar'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

export default function DashboardShell({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const root = useRef(null)

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    gsap.from(root.current.querySelectorAll('[data-nav]'), { autoAlpha: 0, x: -14, duration: 0.6, stagger: 0.05, ease: E.reveal, delay: 0.1, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  return (
    <div ref={root} className="flex h-screen overflow-hidden bg-koi-bg text-koi-ink">
      {/* Desktop sidebar */}
      <div className="hidden h-full w-[248px] shrink-0 md:block">
        <DashboardSidebar />
      </div>

      {/* Mobile sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-koi-night/45 backdrop-blur-[3px]" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative z-50 h-full w-[260px] shadow-xl">
            <DashboardSidebar onClose={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex w-full shrink-0 items-center border-b border-koi-forest/10 bg-koi-bg/90 px-4 backdrop-blur md:px-8">
          <button type="button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu" className="mr-2 grid size-11 place-items-center rounded-full text-koi-ink2 hover:bg-white md:hidden">
            <Menu className="size-5" />
          </button>
          <div className="flex-1">
            <DashboardTopbar />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto px-4 pb-12 pt-8 md:px-8">
          <div className="mx-auto w-full max-w-[1200px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
