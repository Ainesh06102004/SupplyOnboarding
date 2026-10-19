"use client"

// Brand portal overview (BrandDashboard board). Total Products is real (from
// getProductStats); every other figure still comes from mockDashboardData, so
// those cards say "Sample" until they are wired to the review tables.

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import StatsCard from '@/components/dashboard/StatsCard'
import AlertCard from '@/components/dashboard/AlertCard'
import VerificationPipeline from '@/components/dashboard/VerificationPipeline'
import RecentProductsTable from '@/components/dashboard/RecentProductsTable'
import TrustMetricsCard from '@/components/dashboard/TrustMetricsCard'
import PageTitle from '@/components/dashboard/PageTitle'
import { getProductStats } from '@/lib/dashboard/products'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

// Mock Data
import {
  DASHBOARD_STATS,
  DASHBOARD_ALERTS,
  VERIFICATION_PIPELINE,
  RECENT_PRODUCTS,
  TRUST_METRICS
} from '@/lib/mockDashboardData'

export default function DashboardOverviewPage() {
  const [realStats, setRealStats] = useState({ totalProducts: DASHBOARD_STATS.totalProducts })
  const root = useRef(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const stats = await getProductStats()
        setRealStats(prev => ({ ...prev, totalProducts: stats.totalProducts }))
      } catch (err) {
        console.error('Failed to fetch real product stats', err)
      }
    }
    fetchStats()
  }, [])

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    gsap.from(q('[data-kpi]'), { autoAlpha: 0, y: 24, duration: 0.7, stagger: 0.07, delay: 0.15, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
    gsap.from(q('[data-card]'), { autoAlpha: 0, y: 34, duration: 0.85, stagger: 0.08, delay: 0.35, ease: E.dolly, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  return (
    <div ref={root} className="flex flex-col gap-6">
      <PageTitle
        title="Welcome back"
        sub="Here’s your KOI brand health overview."
        badge={<span className="flex items-center gap-2 rounded-full bg-koi-tint px-3 py-1 text-[12.5px] font-bold text-koi-primary"><span aria-hidden="true" className="size-2 rounded-full bg-koi-green" />Verified Brand</span>}
        action={<Link href="/dashboard/products/new" className="flex h-12 items-center gap-2 rounded-2xl bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline"><Plus className="size-5" />Add Product</Link>}
      />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatsCard value={realStats.totalProducts} label="Total Products" styleType="neutral" />
        <StatsCard value={DASHBOARD_STATS.approved} label="Approved" styleType="success" sample />
        <StatsCard value={DASHBOARD_STATS.pendingReview} label="Pending Review" styleType="warning" sample />
        <StatsCard value={DASHBOARD_STATS.trustScore} suffix="/ 100" label="Trust Score" styleType="special" sample />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <AlertCard alerts={DASHBOARD_ALERTS} sample />
        <VerificationPipeline pipeline={VERIFICATION_PIPELINE} sample />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RecentProductsTable products={RECENT_PRODUCTS} sample />
        <TrustMetricsCard metrics={TRUST_METRICS} sample />
      </div>
    </div>
  )
}
