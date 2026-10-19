"use client"

// The portal's topbar: search, KOI's pill (its dot, and where you are), the
// bell and the brand. Page titles live on the pages, in the display cut.

import React from 'react'
import { usePathname } from 'next/navigation'
import { Search, Bell } from 'lucide-react'

const WHERE = {
  '/dashboard': 'Your overview',
  '/dashboard/products': 'Your products',
  '/dashboard/products/new': 'Adding a product',
  '/dashboard/verification': 'Verification',
  '/dashboard/compliance': 'Compliance',
}

export default function DashboardTopbar() {
  const pathname = usePathname() ?? '/dashboard'
  const where = WHERE[pathname] ?? 'KOI for brands'

  return (
    <div className="flex h-[72px] w-full items-center gap-4">
      <label className="hidden h-11 w-full max-w-[460px] items-center gap-3 rounded-full border border-koi-forest/10 bg-white px-4 md:flex">
        <Search className="size-4 shrink-0 text-koi-muted" />
        <span className="sr-only">Search</span>
        <input type="text" autoComplete="off" placeholder="Search products, SKUs, documents..." className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-koi-muted" />
      </label>
      <span className="ml-auto flex h-11 items-center gap-2.5 rounded-full border border-koi-forest/10 bg-white px-4 text-[13px] font-semibold text-koi-forest">
        <span aria-hidden="true" className="size-[10px] shrink-0 rounded-full bg-koi-ember" />
        <span>{where}</span>
      </span>
      <button type="button" aria-label="Notifications" className="relative grid size-11 place-items-center rounded-full border border-koi-forest/10 bg-white text-koi-forest">
        <Bell className="size-[18px]" />
        <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-2 rounded-full bg-koi-red" />
      </button>
    </div>
  )
}
