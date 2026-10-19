"use client"

// The night sidebar: the wordmark with KOI's dot, the portal's places, and the
// way out. Settings has no page yet, so it is shown as coming rather than as a
// link to nothing.

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOutUser } from '@/lib/auth/supabaseAuth'
import { useAuth } from '@/contexts/AuthContext'
import { LayoutDashboard, Package, ShieldCheck, FileText, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Products', href: '/dashboard/products', icon: Package },
  { label: 'Verification', href: '/dashboard/verification', icon: ShieldCheck },
  { label: 'Compliance', href: '/dashboard/compliance', icon: FileText },
  { label: 'Settings', href: null, icon: Settings },
]

export default function DashboardSidebar({ onClose }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const who = user?.email || user?.phone || null

  const handleLogout = async () => {
    try {
      await signOutUser()
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <aside aria-label="KOI for brands" className="flex h-full w-full flex-col gap-6 bg-koi-night px-4 py-6 font-koi-sans text-koi-bg">
      <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3 px-2 no-underline">
        <span className="flex items-end gap-[3px] text-koi-bg">
          <span className="font-koi-display text-[24px] font-extrabold leading-none tracking-[-0.02em]">KOI</span>
          <span aria-hidden="true" className="mb-[3px] size-[6px] rounded-full bg-koi-ember" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-bold text-koi-bg">KOI Health</span>
          <span className="font-koi-mono text-[9.5px] uppercase tracking-[0.14em] text-koi-bg/55">Health-first Commerce</span>
        </span>
      </Link>

      <nav aria-label="Portal">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {NAV_ITEMS.map((item) => {
            if (!item.href) {
              return (
                <li key={item.label} data-nav>
                  <span className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-koi-bg/40">
                    <item.icon className="size-[18px] shrink-0" />{item.label}
                    <span className="ml-auto font-koi-mono text-[9.5px] uppercase tracking-[0.12em]">Soon</span>
                  </span>
                </li>
              )
            }
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href)
            return (
              <li key={item.href} data-nav>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm no-underline transition-colors ${isActive ? 'bg-koi-bg/10 font-bold text-koi-lime' : 'font-semibold text-koi-bg/75 hover:bg-koi-bg/5 hover:text-koi-bg'}`}
                >
                  {isActive && <span aria-hidden="true" className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-koi-lime" />}
                  <item.icon className="size-[18px] shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {who && (
          <div className="flex items-center gap-3 rounded-2xl bg-koi-bg/5 p-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-koi-lime font-koi-display text-sm font-extrabold text-koi-forest">{String(who).replace(/^\+?\d{0,2}/, '').slice(0, 1).toUpperCase() || 'B'}</span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-bold">{who}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-koi-mint"><span aria-hidden="true" className="size-1.5 rounded-full bg-koi-mint" />Signed in</span>
            </span>
          </div>
        )}
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px] font-semibold text-koi-bg/60">
          <li><button type="button" className="flex h-9 w-full items-center rounded-lg px-2 text-left transition-colors hover:text-koi-bg">Help Center</button></li>
          <li><button type="button" className="flex h-9 w-full items-center rounded-lg px-2 text-left transition-colors hover:text-koi-bg">Documentation</button></li>
          <li><button type="button" onClick={handleLogout} className="flex h-9 w-full items-center rounded-lg px-2 text-left transition-colors hover:text-koi-bg">Logout</button></li>
        </ul>
      </div>
    </aside>
  )
}
