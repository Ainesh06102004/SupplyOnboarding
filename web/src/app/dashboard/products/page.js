"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Package, CheckCircle, Clock, FileEdit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatsCard from '@/components/dashboard/StatsCard'
import { getProducts, getProductStats } from '@/lib/dashboard/products'
import ProductsTable from '@/components/dashboard/products/ProductsTable'
import ProductsToolbar from '@/components/dashboard/products/ProductsToolbar'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState({
    totalProducts: 0,
    liveProducts: 0,
    underReview: 0,
    riskAlerts: 0
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [productsData, statsData] = await Promise.all([
          getProducts({ search: searchQuery }),
          getProductStats()
        ])
        setProducts(productsData)
        setStats(statsData)
      } catch (err) {
        console.error('Failed to load products page data', err)
      } finally {
        setLoading(false)
      }
    }
    
    // Simple debounce for search
    const timer = setTimeout(() => {
      loadData()
    }, 300)
    
    return () => clearTimeout(timer)
  }, [searchQuery])

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* SECTION 1 - HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-[32px] md:text-[36px] font-display font-bold text-[#111827] tracking-tight leading-none mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Products
          </h2>
          <p className="text-[16px] text-[#6B7280]">
            Manage your catalog, SKUs, and track screening statuses.
          </p>
        </div>

        <Link href="/dashboard/products/new" passHref>
          <Button 
            className="bg-[#0E4032] hover:bg-[#0a2e24] text-white h-12 px-6 rounded-xl shadow-[0_4px_14px_rgba(79,56,99,0.3)] hover:shadow-[0_6px_20px_rgba(79,56,99,0.4)] transition-all duration-300 gap-2 font-semibold"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </Button>
        </Link>
      </div>

      {/* SECTION 2 - KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          icon={Package} 
          value={stats.totalProducts} 
          label="Total Products" 
          styleType="neutral" 
        />
        <StatsCard 
          icon={CheckCircle} 
          value={stats.liveProducts} 
          label="Live Products" 
          styleType="success" 
        />
        <StatsCard 
          icon={Clock} 
          value={stats.underReview} 
          label="Under Review" 
          styleType="warning" 
        />
        <StatsCard 
          icon={FileEdit} 
          value={stats.riskAlerts} 
          label="Risk Alerts" 
          styleType="special" 
        />
      </div>

      {/* SECTION 3 - TOOLBAR */}
      <ProductsToolbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      {/* SECTION 4 - PRODUCTS TABLE */}
      <ProductsTable loading={loading} products={products} />

    </div>
  )
}
