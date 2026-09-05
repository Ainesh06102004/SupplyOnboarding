"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { signOutUser } from '@/lib/auth/supabaseAuth'
import { 
  LayoutDashboard, 
  Package, 
  ShieldCheck, 
  FileText, 
  Settings, 
  HelpCircle, 
  BookOpen, 
  LogOut 
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Products', href: '/dashboard/products', icon: Package },
  { label: 'Verification', href: '/dashboard/verification', icon: ShieldCheck },
  { label: 'Compliance', href: '/dashboard/compliance', icon: FileText },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardSidebar({ onClose }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await signOutUser()
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <div className="h-full w-full bg-[#F2F6EC] border-r border-[#E5E7EB] flex flex-col">
      {/* Brand Header */}
      <div className="h-[72px] px-6 flex items-center shrink-0">
        <div className="flex flex-col">
          <Link href="/dashboard" className="text-xl font-bold text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
            KOI Health
          </Link>
          <span className="text-[11px] font-medium text-[#6B7280] tracking-wide uppercase">
            Health-first Commerce
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200 relative group",
                isActive 
                  ? "bg-[#F2F6EC] text-[#0E4032]" 
                  : "text-[#6B7280] hover:bg-black/5 hover:text-[#111827]"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#0E4032] rounded-r-full" />
              )}
              <item.icon className={cn("w-[18px] h-[18px]", isActive ? "text-[#0E4032]" : "text-[#6B7280] group-hover:text-[#111827]")} />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Bottom Pinned Utilities */}
      <div className="p-4 border-t border-[#E5E7EB]/50 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] font-medium text-[#6B7280] hover:bg-black/5 hover:text-[#111827] transition-all duration-200">
          <HelpCircle className="w-[18px] h-[18px]" />
          Help Center
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] font-medium text-[#6B7280] hover:bg-black/5 hover:text-[#111827] transition-all duration-200">
          <BookOpen className="w-[18px] h-[18px]" />
          Documentation
        </button>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] font-medium text-red-600/80 hover:bg-red-50 hover:text-red-700 transition-all duration-200 mt-2"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Logout
        </button>
      </div>
    </div>
  )
}
