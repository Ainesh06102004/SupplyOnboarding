"use client"

import React, { useState, useEffect } from 'react'
import { Plus, Package, CheckCircle, Clock3, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatsCard from '@/components/dashboard/StatsCard'
import AlertCard from '@/components/dashboard/AlertCard'
import VerificationPipeline from '@/components/dashboard/VerificationPipeline'
import RecentProductsTable from '@/components/dashboard/RecentProductsTable'
import TrustMetricsCard from '@/components/dashboard/TrustMetricsCard'
import { getProductStats } from '@/lib/dashboard/products'

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* SECTION 1 - HERO HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[32px] md:text-[36px] font-display font-bold text-[#111827] tracking-tight leading-none mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Welcome back, Brand 👋
          </h2>
          <p className="text-[16px] text-[#6B7280] mb-4">
            Here’s your KOI brand health overview.
          </p>
          <div className="inline-flex items-center gap-1.5 bg-green-100/50 text-green-700 px-3 py-1.5 rounded-full text-sm font-semibold border border-green-200">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Verified Brand
          </div>
        </div>

        <Button 
          className="bg-[#0E4032] hover:bg-[#0a2e24] text-white h-12 px-6 rounded-xl shadow-[0_4px_14px_rgba(79,56,99,0.3)] hover:shadow-[0_6px_20px_rgba(79,56,99,0.4)] transition-all duration-300 gap-2 font-semibold"
        >
          <Plus className="w-5 h-5" />
          Add Product
        </Button>
      </div>

      {/* SECTION 2 - KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          icon={Package} 
          value={realStats.totalProducts} 
          label="Total Products" 
          styleType="neutral" 
        />
        <StatsCard 
          icon={CheckCircle} 
          value={DASHBOARD_STATS.approved} 
          label="Approved" 
          styleType="success" 
        />
        <StatsCard 
          icon={Clock3} 
          value={DASHBOARD_STATS.pendingReview} 
          label="Pending Review" 
          styleType="warning" 
        />
        <StatsCard 
          icon={ShieldCheck} 
          value={`${DASHBOARD_STATS.trustScore} / 100`} 
          label="Trust Score" 
          styleType="special" 
        />
      </div>

      {/* SECTION 3 - TWO COLUMN GRID (Alerts & Pipeline) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertCard alerts={DASHBOARD_ALERTS} />
        <VerificationPipeline pipeline={VERIFICATION_PIPELINE} />
      </div>

      {/* SECTION 4 - TWO COLUMN GRID (Recent Products & Trust Metrics) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div className="overflow-hidden">
          <RecentProductsTable products={RECENT_PRODUCTS} />
        </div>
        <div className="overflow-hidden">
          <TrustMetricsCard metrics={TRUST_METRICS} />
        </div>
      </div>

    </div>
  )
}
